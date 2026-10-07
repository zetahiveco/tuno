import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { Router } from "express";
import { z } from "zod";
import type { UIMessage } from "ai";
import { requireUser } from "@/general/api/services/require-user";
import { prisma } from "@/websites/api/services/database";
import {
  DEFAULT_MODEL_ID,
  WEBSITE_MODELS,
  loadWebsiteMessages,
  resolveModelId,
  streamWebsiteChat,
} from "@/websites/api/services/ai-service";
import {
  commitWebsiteVersion,
  getCommitFiles,
  getCommitManifest,
  getCommitPage,
  listWebsiteCommits,
  renderSiteDocument,
} from "@/websites/api/services/site-store";
import { uploadFileToS3Key } from "@/lib/file";

const router = Router();

const websiteSelect = {
  id: true,
  name: true,
  slug: true,
  description: true,
  activeCommitSha: true,
  publishedAt: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

function validateUuid(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

router.use(requireUser);

/* --------------------------------- Websites -------------------------------- */

router.get("/models", (_request, response) => {
  response.json({ models: WEBSITE_MODELS, defaultModelId: DEFAULT_MODEL_ID });
});

router.get("/", async (request, response) => {
  const websites = await prisma.website.findMany({
    where: { createdById: request.user!.id },
    select: websiteSelect,
    orderBy: { updatedAt: "desc" },
  });
  response.json({ websites });
});

const createWebsiteSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  description: z.string().trim().max(500).optional(),
});

router.post("/", async (request, response) => {
  const parsed = createWebsiteSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Give the website a name." });
    return;
  }
  const website = await prisma.website.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description ?? "",
      createdById: request.user!.id,
    },
    select: websiteSelect,
  });
  response.status(201).json({ website });
});

async function loadOwnedWebsite(websiteId: string | null, userId: string) {
  if (!websiteId) return null;
  return prisma.website.findFirst({ where: { id: websiteId, createdById: userId }, select: websiteSelect });
}

router.get("/:websiteId", async (request, response) => {
  const website = await loadOwnedWebsite(validateUuid(request.params.websiteId), request.user!.id);
  if (!website) {
    response.status(404).json({ error: "Website not found." });
    return;
  }
  response.json({ website });
});

const updateWebsiteSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500),
  })
  .partial();

router.patch("/:websiteId", async (request, response) => {
  const website = await loadOwnedWebsite(validateUuid(request.params.websiteId), request.user!.id);
  if (!website) {
    response.status(404).json({ error: "Website not found." });
    return;
  }
  const parsed = updateWebsiteSchema.safeParse(request.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Invalid website data." });
    return;
  }
  const updated = await prisma.website.update({
    where: { id: website.id },
    data: parsed.data,
    select: websiteSelect,
  });
  response.json({ website: updated });
});

router.delete("/:websiteId", async (request, response) => {
  const website = await loadOwnedWebsite(validateUuid(request.params.websiteId), request.user!.id);
  if (!website) {
    response.status(404).json({ error: "Website not found." });
    return;
  }
  await prisma.website.delete({ where: { id: website.id } });
  response.status(204).end();
});

/* --------------------------------- Messages -------------------------------- */

router.get("/:websiteId/messages", async (request, response) => {
  const website = await loadOwnedWebsite(validateUuid(request.params.websiteId), request.user!.id);
  if (!website) {
    response.status(404).json({ error: "Website not found." });
    return;
  }
  const messages = await loadWebsiteMessages(website.id);
  response.json({ messages });
});

const chatSchema = z.object({
  messages: z.array(z.object({
    id: z.string().min(1).max(200),
    role: z.enum(["user", "assistant"]),
    parts: z.array(z.object({ type: z.string(), text: z.string().optional() })).min(1),
  })).min(1).max(200),
  modelId: z.string().max(80).optional(),
});

router.post("/:websiteId/chat", async (request, response) => {
  const website = await loadOwnedWebsite(validateUuid(request.params.websiteId), request.user!.id);
  if (!website) {
    response.status(404).json({ error: "Website not found." });
    return;
  }
  if (!process.env.OPENAI_API_KEY) {
    response.status(500).json({ error: "OPENAI_API_KEY is not configured on the server." });
    return;
  }

  const parsed = chatSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid chat payload." });
    return;
  }

  const modelId = resolveModelId(parsed.data.modelId);
  const messages = parsed.data.messages as UIMessage[];

  // Persist the newest user message (the client only sends it once).
  const lastUser = [...messages].reverse().find((message) => message.role === "user");
  if (lastUser) {
    const text = lastUser.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n")
      .trim();
    if (text) {
      const recent = await prisma.chatMessage.findFirst({
        where: { websiteId: website.id, role: "user", content: text },
        select: { id: true },
        orderBy: { createdAt: "desc" },
      });
      if (!recent) {
        await prisma.chatMessage.create({
          data: { websiteId: website.id, role: "user", content: text.slice(0, 100_000), model: modelId },
        });
      }
    }
  }

  const currentCode = website.activeCommitSha ? await getCommitPage(website.id, website.activeCommitSha) : null;

  const result = await streamWebsiteChat({
    websiteId: website.id,
    websiteName: website.name,
    messages,
    modelId,
    currentCode,
    onFinish: async (outcome) => {
      await prisma.chatMessage.create({
        data: { websiteId: website.id, role: "assistant", content: outcome.assistantText.slice(0, 500_000), model: outcome.modelId },
      });
      if (outcome.pageCode) {
        const manifest = await commitWebsiteVersion({
          websiteId: website.id,
          files: { "src/app/page.tsx": outcome.pageCode },
          message: outcome.assistantText.split("\n")[0]?.replace(/```[\s\S]*$/, "").slice(0, 200) || "Update site",
          model: outcome.modelId,
          authorId: request.user!.id,
          parent: website.activeCommitSha,
        });
        await prisma.website.update({ where: { id: website.id }, data: { activeCommitSha: manifest.sha } });
      }
    },
    onError: (error) => {
      console.error("[websites] chat stream error", error);
    },
  });

  const streamResponse = result.toUIMessageStreamResponse();
  response.status(streamResponse.status);
  response.setHeader("Content-Type", streamResponse.headers.get("content-type") ?? "text/event-stream");
  response.setHeader("Cache-Control", "no-cache, no-transform");
  response.setHeader("Connection", "keep-alive");
  if (streamResponse.body) {
    Readable.fromWeb(streamResponse.body as unknown as import("node:stream/web").ReadableStream).pipe(response);
  } else {
    response.end();
  }
});

/* -------------------------- Commits (S3 remote git) ------------------------ */

router.get("/:websiteId/commits", async (request, response) => {
  const website = await loadOwnedWebsite(validateUuid(request.params.websiteId), request.user!.id);
  if (!website) {
    response.status(404).json({ error: "Website not found." });
    return;
  }
  try {
    const commits = await listWebsiteCommits(website.id);
    response.json({ commits });
  } catch {
    response.status(500).json({ error: "Could not read the version history." });
  }
});

router.get("/:websiteId/commits/:sha", async (request, response) => {
  const website = await loadOwnedWebsite(validateUuid(request.params.websiteId), request.user!.id);
  if (!website) {
    response.status(404).json({ error: "Website not found." });
    return;
  }
  const manifest = await getCommitManifest(website.id, String(request.params.sha ?? ""));
  if (!manifest) {
    response.status(404).json({ error: "Commit not found." });
    return;
  }
  const files = await getCommitFiles(website.id, manifest.sha);
  response.json({ commit: manifest, files });
});

const saveFilesSchema = z.object({
  code: z.string().min(1).max(400_000),
  message: z.string().trim().max(200).optional(),
});

/** Manual source edit from the code tab — commits a new revision. */
router.post("/:websiteId/commits", async (request, response) => {
  const website = await loadOwnedWebsite(validateUuid(request.params.websiteId), request.user!.id);
  if (!website) {
    response.status(404).json({ error: "Website not found." });
    return;
  }
  const parsed = saveFilesSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Provide the full page source in `code`." });
    return;
  }
  if (!/export\s+default/i.test(parsed.data.code)) {
    response.status(400).json({ error: "The page source must include a default export." });
    return;
  }
  try {
    const manifest = await commitWebsiteVersion({
      websiteId: website.id,
      files: { "src/app/page.tsx": parsed.data.code },
      message: parsed.data.message || "Manual edit",
      model: "manual",
      authorId: request.user!.id,
      parent: website.activeCommitSha,
    });
    await prisma.website.update({ where: { id: website.id }, data: { activeCommitSha: manifest.sha } });
    response.status(201).json({ commit: manifest });
  } catch {
    response.status(500).json({ error: "Could not commit the change." });
  }
});

const revertSchema = z.object({ sha: z.string().min(6).max(40) });

router.post("/:websiteId/revert", async (request, response) => {
  const website = await loadOwnedWebsite(validateUuid(request.params.websiteId), request.user!.id);
  if (!website) {
    response.status(404).json({ error: "Website not found." });
    return;
  }
  const parsed = revertSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "A commit sha is required." });
    return;
  }
  const manifest = await getCommitManifest(website.id, parsed.data.sha);
  if (!manifest) {
    response.status(404).json({ error: "Commit not found." });
    return;
  }
  const updated = await prisma.website.update({
    where: { id: website.id },
    data: { activeCommitSha: manifest.sha },
    select: websiteSelect,
  });
  response.json({ website: updated });
});

/* ---------------------------------- Preview -------------------------------- */

router.get("/:websiteId/preview", async (request, response) => {
  const website = await loadOwnedWebsite(validateUuid(request.params.websiteId), request.user!.id);
  if (!website) {
    response.status(404).send("Website not found.");
    return;
  }
  const sha = typeof request.query.v === "string" && request.query.v ? request.query.v : website.activeCommitSha;
  if (!sha) {
    response.status(404).send(emptyPreviewDocument("This site has no build yet. Describe it in the chat to get started."));
    return;
  }
  const code = await getCommitPage(website.id, sha);
  if (!code) {
    response.status(404).send(emptyPreviewDocument("Could not load the site source."));
    return;
  }
  try {
    const html = await renderSiteDocument(code, website.name);
    response.type("html").send(html);
  } catch (error) {
    console.error("[websites] preview render failed", error);
    response.status(500).send(emptyPreviewDocument("Rendering the preview failed. Check the code tab for errors."));
  }
});

function emptyPreviewDocument(message: string): string {
  return `<!doctype html><html><body style="display:grid;place-items:center;min-height:100vh;background:#f8f7fa;color:#928995;font-family:ui-sans-serif,system-ui;text-align:center;padding:2rem;"><p style="max-width:320px;">${message}</p></body></html>`;
}

/* ---------------------------------- Publish -------------------------------- */

router.post("/:websiteId/publish", async (request, response) => {
  const website = await loadOwnedWebsite(validateUuid(request.params.websiteId), request.user!.id);
  if (!website) {
    response.status(404).json({ error: "Website not found." });
    return;
  }
  if (!website.activeCommitSha) {
    response.status(400).json({ error: "Build the site first — there is nothing to publish yet." });
    return;
  }

  const code = await getCommitPage(website.id, website.activeCommitSha);
  if (!code) {
    response.status(400).json({ error: "The active revision could not be loaded." });
    return;
  }

  let slug = website.slug;
  if (!slug) {
    const base = slugify(website.name) || "site";
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const candidate = `${base}-${randomBytes(3).toString("hex")}`;
      const clash = await prisma.website.findFirst({ where: { slug: candidate }, select: { id: true } });
      if (!clash) {
        slug = candidate;
        break;
      }
    }
  }
  if (!slug) {
    response.status(500).json({ error: "Could not allocate a publish slug. Try again." });
    return;
  }

  try {
    const html = await renderSiteDocument(code, website.name);
    await uploadFileToS3Key(Buffer.from(html, "utf8"), `published/${slug}/index.html`);
    const updated = await prisma.website.update({
      where: { id: website.id },
      data: { slug, publishedAt: new Date() },
      select: websiteSelect,
    });
    const appUrl = process.env.APP_URL?.replace(/\/+$/, "") ?? "";
    response.json({ website: updated, url: `${appUrl}/p/${slug}` });
  } catch (error) {
    console.error("[websites] publish failed", error);
    response.status(500).json({ error: "Publishing failed. Try again." });
  }
});

router.delete("/:websiteId/publish", async (request, response) => {
  const website = await loadOwnedWebsite(validateUuid(request.params.websiteId), request.user!.id);
  if (!website) {
    response.status(404).json({ error: "Website not found." });
    return;
  }
  const updated = await prisma.website.update({
    where: { id: website.id },
    data: { publishedAt: null },
    select: websiteSelect,
  });
  response.json({ website: updated });
});

export { router as websitesRouter };
