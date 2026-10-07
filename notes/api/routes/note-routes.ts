import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma as generalPrisma } from "@/general/api/services/database";
import { requireUser } from "@/general/api/services/require-user";
import { prisma } from "@/notes/api/services/database";

const router = Router();

const MAX_TITLE_LENGTH = 300;
const MAX_CONTENT_LENGTH = 2_000_000;

const pageSummarySelect = {
  id: true,
  title: true,
  icon: true,
  favorite: true,
  createdById: true,
  sharedAll: true,
  publicSlug: true,
  _count: { select: { shares: true } },
  createdAt: true,
  updatedAt: true,
} as const;

const iconSchema = z.string().max(16).transform((icon) => icon.trim());
const titleSchema = z.string().max(MAX_TITLE_LENGTH).transform((title) => title.trim());
const contentSchema = z
  .array(z.record(z.string(), z.unknown()))
  .max(5_000)
  .transform((blocks) => JSON.stringify(blocks));

const createPageSchema = z.object({
  title: titleSchema.optional(),
  icon: iconSchema.optional(),
  content: contentSchema.optional(),
});

const updatePageSchema = z
  .object({
    title: titleSchema,
    icon: iconSchema,
    content: contentSchema,
    favorite: z.boolean(),
  })
  .partial();

function validateUuid(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

router.use(requireUser);

/* --------------------------------- Pages ---------------------------------- */

router.get("/pages", async (request, response) => {
  const userId = request.user!.id;
  const scope = request.query.scope;

  if (scope === "shared") {
    const sharedPages = await prisma.notePage.findMany({
      where: {
        createdById: { not: userId },
        OR: [
          { sharedAll: true },
          { shares: { some: { userId } } },
          { publicSlug: { not: null } },
        ],
      },
      select: pageSummarySelect,
      orderBy: { updatedAt: "desc" },
    });
    response.json({ pages: sharedPages });
    return;
  }

  const pages = await prisma.notePage.findMany({
    where: { createdById: userId },
    select: pageSummarySelect,
    orderBy: { updatedAt: "desc" },
  });
  response.json({ pages });
});

router.post("/pages", async (request, response) => {
  const parsed = createPageSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid page data." });
    return;
  }

  const page = await prisma.notePage.create({
    data: {
      title: parsed.data.title ?? "",
      icon: parsed.data.icon ?? "📄",
      content: parsed.data.content ?? "[]",
      createdById: request.user!.id,
    },
    select: pageSummarySelect,
  });
  response.status(201).json({ page });
});

router.get("/teammates", async (request, response) => {
  const users = await generalPrisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  response.json({ users });
});

router.get("/pages/:pageId", async (request, response) => {
  const pageId = validateUuid(request.params.pageId);
  if (!pageId) {
    response.status(400).json({ error: "Invalid page id." });
    return;
  }

  const userId = request.user!.id;
  const page = await prisma.notePage.findFirst({
    where: {
      id: pageId,
      OR: [
        { createdById: userId },
        { sharedAll: true },
        { shares: { some: { userId } } },
      ],
    },
  });
  if (!page) {
    response.status(404).json({ error: "Page not found." });
    return;
  }
  response.json({ page });
});

router.patch("/pages/:pageId", async (request, response) => {
  const pageId = validateUuid(request.params.pageId);
  if (!pageId) {
    response.status(400).json({ error: "Invalid page id." });
    return;
  }

  const parsed = updatePageSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid page data." });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Nothing to update." });
    return;
  }

  const existing = await prisma.notePage.findFirst({
    where: { id: pageId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Page not found." });
    return;
  }

  const page = await prisma.notePage.update({
    where: { id: pageId },
    data: parsed.data,
    select: pageSummarySelect,
  });
  response.json({ page });
});

router.delete("/pages/:pageId", async (request, response) => {
  const pageId = validateUuid(request.params.pageId);
  if (!pageId) {
    response.status(400).json({ error: "Invalid page id." });
    return;
  }

  const existing = await prisma.notePage.findFirst({
    where: { id: pageId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Page not found." });
    return;
  }

  await prisma.notePage.delete({ where: { id: pageId } });
  response.status(204).end();
});

/* --------------------------------- Sharing -------------------------------- */

const OWNER_ONLY_ERROR = { error: "Only the page owner can manage sharing." } as const;

async function loadOwnedPage(pageId: string, userId: string) {
  return prisma.notePage.findFirst({
    where: { id: pageId, createdById: userId },
    select: { id: true },
  });
}

router.get("/pages/:pageId/shares", async (request, response) => {
  const pageId = validateUuid(request.params.pageId);
  if (!pageId) {
    response.status(400).json({ error: "Invalid page id." });
    return;
  }

  const page = await prisma.notePage.findFirst({
    where: { id: pageId, createdById: request.user!.id },
    select: { sharedAll: true, publicSlug: true, shares: { select: { userId: true } } },
  });
  if (!page) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }

  const userIds = page.shares.map((share) => share.userId);
  const users = userIds.length
    ? await generalPrisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];

  response.json({ sharing: { sharedAll: page.sharedAll, publicSlug: page.publicSlug, users } });
});

router.patch("/pages/:pageId/shares", async (request, response) => {
  const pageId = validateUuid(request.params.pageId);
  if (!pageId) {
    response.status(400).json({ error: "Invalid page id." });
    return;
  }

  const parsed = z.object({ sharedAll: z.boolean() }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "sharedAll must be a boolean." });
    return;
  }

  if (!(await loadOwnedPage(pageId, request.user!.id))) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }

  await prisma.notePage.update({ where: { id: pageId }, data: { sharedAll: parsed.data.sharedAll } });
  response.json({ sharing: { sharedAll: parsed.data.sharedAll } });
});

router.post("/pages/:pageId/shares/public", async (request, response) => {
  const pageId = validateUuid(request.params.pageId);
  if (!pageId) {
    response.status(400).json({ error: "Invalid page id." });
    return;
  }

  if (!(await loadOwnedPage(pageId, request.user!.id))) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }

  let publicSlug = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    publicSlug = randomBytes(9).toString("base64url");
    const clash = await prisma.notePage.findFirst({ where: { publicSlug }, select: { id: true } });
    if (!clash) break;
    publicSlug = "";
  }
  if (!publicSlug) {
    response.status(500).json({ error: "Could not generate a public link. Try again." });
    return;
  }

  await prisma.notePage.update({ where: { id: pageId }, data: { publicSlug } });
  response.status(201).json({ sharing: { publicSlug } });
});

router.delete("/pages/:pageId/shares/public", async (request, response) => {
  const pageId = validateUuid(request.params.pageId);
  if (!pageId) {
    response.status(400).json({ error: "Invalid page id." });
    return;
  }

  if (!(await loadOwnedPage(pageId, request.user!.id))) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }

  await prisma.notePage.update({ where: { id: pageId }, data: { publicSlug: null } });
  response.json({ sharing: { publicSlug: null } });
});

router.post("/pages/:pageId/shares", async (request, response) => {
  const pageId = validateUuid(request.params.pageId);
  if (!pageId) {
    response.status(400).json({ error: "Invalid page id." });
    return;
  }

  const parsed = z.object({ userId: z.string().uuid() }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "A valid userId is required." });
    return;
  }

  if (!(await loadOwnedPage(pageId, request.user!.id))) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }

  const targetUser = await generalPrisma.user.findUnique({
    where: { id: parsed.data.userId },
    select: { id: true },
  });
  if (!targetUser) {
    response.status(404).json({ error: "That teammate does not exist." });
    return;
  }

  const existingShare = await prisma.notePageShare.findUnique({
    where: { pageId_userId: { pageId, userId: parsed.data.userId } },
    select: { id: true },
  });
  if (existingShare) {
    response.status(409).json({ error: "This page is already shared with that person." });
    return;
  }

  await prisma.notePageShare.create({ data: { pageId, userId: parsed.data.userId } });
  response.status(201).json({ message: "Page shared." });
});

router.delete("/pages/:pageId/shares/:userId", async (request, response) => {
  const pageId = validateUuid(request.params.pageId);
  const userId = validateUuid(request.params.userId);
  if (!pageId || !userId) {
    response.status(400).json({ error: "Invalid page or user id." });
    return;
  }

  if (!(await loadOwnedPage(pageId, request.user!.id))) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }

  await prisma.notePageShare.deleteMany({ where: { pageId, userId } });
  response.status(204).end();
});

export { router as notesRouter };