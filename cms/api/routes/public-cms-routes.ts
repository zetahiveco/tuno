import { Router } from "express";
import { z } from "zod";
import { requireApiKey } from "@/general/api/services/require-api-key";
import { prisma } from "@/cms/api/services/database";

const router = Router();

/**
 * Standalone CMS content API.
 *
 * Authenticated (API key via `Authorization: Bearer` or `X-API-Key`):
 *   GET    /api/public/cms/collections
 *   GET    /api/public/cms/collections/:apiId
 *   GET    /api/public/cms/collections/:apiId/entries        (?scope=all for drafts)
 *   POST   /api/public/cms/collections/:apiId/entries
 *   PATCH  /api/public/cms/entries/:entryId
 *   DELETE /api/public/cms/entries/:entryId
 *
 * Public (no auth, published entries only):
 *   GET    /api/public/cms/content/:apiId
 *   GET    /api/public/cms/content/:apiId/:entryId
 */

const MAX_BODY_ENTRIES = 200;

function parseEntryData(data: string): unknown {
  try {
    return JSON.parse(data);
  } catch {
    return {};
  }
}

const createEntrySchema = z.object({
  data: z.record(z.string(), z.unknown()).optional(),
  published: z.boolean().optional(),
});

const updateEntrySchema = z
  .object({
    data: z.record(z.string(), z.unknown()),
    published: z.boolean(),
  })
  .partial();

async function findCollectionByApiId(apiId: string) {
  return prisma.collection.findUnique({
    where: { apiId },
    select: { id: true, name: true, apiId: true, description: true },
  });
}

/* ------------------------- API-key authenticated --------------------------- */

router.use("/collections", requireApiKey);

router.get("/collections", async (_request, response) => {
  const collections = await prisma.collection.findMany({
    select: {
      id: true,
      name: true,
      apiId: true,
      description: true,
      updatedAt: true,
      fields: { orderBy: { position: "asc" }, select: { name: true, apiId: true, type: true, required: true, options: true } },
      _count: { select: { entries: true } },
    },
    orderBy: { name: "asc" },
  });
  response.json({ collections });
});

router.get("/collections/:apiId", async (request, response) => {
  const collection = await findCollectionByApiId(String(request.params.apiId ?? ""));
  if (!collection) {
    response.status(404).json({ error: "Collection not found." });
    return;
  }
  const fields = await prisma.field.findMany({
    where: { collectionId: collection.id },
    orderBy: { position: "asc" },
    select: { name: true, apiId: true, type: true, required: true, options: true },
  });
  response.json({ collection: { ...collection, fields } });
});

router.get("/collections/:apiId/entries", async (request, response) => {
  const collection = await findCollectionByApiId(String(request.params.apiId ?? ""));
  if (!collection) {
    response.status(404).json({ error: "Collection not found." });
    return;
  }
  const scope = request.query.scope === "all" ? "all" : "published";
  const take = Math.min(Number(request.query.limit) || 100, MAX_BODY_ENTRIES);
  const entries = await prisma.entry.findMany({
    where: { collectionId: collection.id, ...(scope === "published" ? { published: true } : {}) },
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true, data: true, published: true, createdAt: true, updatedAt: true },
  });
  response.json({
    collection: collection.apiId,
    scope,
    count: entries.length,
    entries: entries.map((entry) => ({ ...entry, data: parseEntryData(entry.data) })),
  });
});

router.post("/collections/:apiId/entries", async (request, response) => {
  const collection = await findCollectionByApiId(String(request.params.apiId ?? ""));
  if (!collection) {
    response.status(404).json({ error: "Collection not found." });
    return;
  }
  const parsed = createEntrySchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid entry payload. Expected { data: object, published?: boolean }." });
    return;
  }
  const entry = await prisma.entry.create({
    data: {
      collectionId: collection.id,
      data: JSON.stringify(parsed.data.data ?? {}),
      published: parsed.data.published ?? false,
      createdById: request.user!.id,
    },
    select: { id: true, data: true, published: true, createdAt: true, updatedAt: true },
  });
  response.status(201).json({ entry: { ...entry, data: parseEntryData(entry.data) } });
});

router.patch("/entries/:entryId", async (request, response) => {
  const entryId = String(request.params.entryId ?? "");
  const parsed = updateEntrySchema.safeParse(request.body ?? {});
  if (!/^[0-9a-f-]{36}$/i.test(entryId) || !parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Invalid request." });
    return;
  }
  const existing = await prisma.entry.findUnique({ where: { id: entryId }, select: { id: true } });
  if (!existing) {
    response.status(404).json({ error: "Entry not found." });
    return;
  }
  const entry = await prisma.entry.update({
    where: { id: entryId },
    data: {
      ...(parsed.data.data !== undefined ? { data: JSON.stringify(parsed.data.data) } : {}),
      ...(parsed.data.published !== undefined ? { published: parsed.data.published } : {}),
    },
    select: { id: true, data: true, published: true, createdAt: true, updatedAt: true },
  });
  response.json({ entry: { ...entry, data: parseEntryData(entry.data) } });
});

router.delete("/entries/:entryId", async (request, response) => {
  const entryId = String(request.params.entryId ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(entryId)) {
    response.status(400).json({ error: "Invalid entry id." });
    return;
  }
  const existing = await prisma.entry.findUnique({ where: { id: entryId }, select: { id: true } });
  if (!existing) {
    response.status(404).json({ error: "Entry not found." });
    return;
  }
  await prisma.entry.delete({ where: { id: entryId } });
  response.status(204).end();
});

/* ------------------------------ Public content ----------------------------- */

router.get("/content/:apiId", async (request, response) => {
  const collection = await findCollectionByApiId(String(request.params.apiId ?? ""));
  if (!collection) {
    response.status(404).json({ error: "Collection not found." });
    return;
  }
  const take = Math.min(Number(request.query.limit) || 50, MAX_BODY_ENTRIES);
  const entries = await prisma.entry.findMany({
    where: { collectionId: collection.id, published: true },
    orderBy: { updatedAt: "desc" },
    take,
    select: { id: true, data: true, updatedAt: true },
  });
  response.json({
    collection: collection.apiId,
    count: entries.length,
    entries: entries.map((entry) => ({ ...entry, data: parseEntryData(entry.data) })),
  });
});

router.get("/content/:apiId/:entryId", async (request, response) => {
  const collection = await findCollectionByApiId(String(request.params.apiId ?? ""));
  const entryId = String(request.params.entryId ?? "");
  if (!collection || !/^[0-9a-f-]{36}$/i.test(entryId)) {
    response.status(404).json({ error: "Not found." });
    return;
  }
  const entry = await prisma.entry.findFirst({
    where: { id: entryId, collectionId: collection.id, published: true },
    select: { id: true, data: true, updatedAt: true },
  });
  if (!entry) {
    response.status(404).json({ error: "Entry not found." });
    return;
  }
  response.json({ entry: { ...entry, data: parseEntryData(entry.data) } });
});

export { router as publicCmsRouter };
