import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/general/api/services/database";
import { requireApiKey } from "@/general/api/services/require-api-key";
import { requireUser } from "@/general/api/services/require-user";
import { prisma as notesPrisma } from "@/notes/api/services/database";

const router = Router();
const defaults = {
  workspaceName: "Tuno workspace",
  timezone: "UTC",
} as const;

// Info about the API key making the request.
router.get("/me", requireApiKey, (request, response) => {
  response.json({
    key: { name: request.apiKey!.name },
    user: request.user,
  });
});

// Read-only workspace snapshot, safe to expose to integrations holding a key.
router.get("/workspace", requireApiKey, async (_request, response) => {
  const [rows, memberCount] = await Promise.all([
    prisma.setting.findMany(),
    prisma.user.count(),
  ]);
  const saved = Object.fromEntries(rows.map(({ key, value }) => [key, value]));
  response.json({
    workspace: {
      name: saved.workspaceName ?? defaults.workspaceName,
      timezone: saved.timezone ?? defaults.timezone,
      memberCount,
    },
  });
});

// Read a publicly shared notes page by its slug. No auth — the link is the key.
router.get("/notes/:slug", async (request, response) => {
  const slug = request.params.slug;
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(slug)) {
    response.status(400).json({ error: "Invalid public link." });
    return;
  }

  const page = await notesPrisma.notePage.findFirst({
    where: { publicSlug: slug },
    select: { title: true, icon: true, content: true, updatedAt: true },
  });
  if (!page) {
    response.status(404).json({ error: "This page is not shared publicly." });
    return;
  }
  response.json({ page });
});

export { router as publicRouter };