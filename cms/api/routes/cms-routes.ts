import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { requireUser } from "@/general/api/services/require-user";
import { prisma } from "@/cms/api/services/database";

const router = Router();

const FIELD_TYPES = ["text", "longtext", "richtext", "number", "boolean", "date", "select"] as const;
type FieldType = (typeof FIELD_TYPES)[number];

const MAX_TEXT_LENGTH = 10_000;
const MAX_RICHTEXT_LENGTH = 500_000;

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

function validateUuid(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

async function uniqueApiId(base: string, exists: (apiId: string) => Promise<boolean>): Promise<string> {
  const clean = slugify(base) || "item";
  if (!(await exists(clean))) return clean;
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${clean}_${randomBytes(3).toString("hex")}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error("Could not generate a unique API identifier.");
}

const collectionSelect = {
  id: true,
  name: true,
  apiId: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { entries: true } },
} as const;

const fieldSelect = {
  id: true,
  collectionId: true,
  name: true,
  apiId: true,
  type: true,
  options: true,
  required: true,
  position: true,
} as const;

const entrySelect = {
  id: true,
  collectionId: true,
  data: true,
  published: true,
  createdAt: true,
  updatedAt: true,
} as const;

/* ------------------------------- Collections ------------------------------- */

const createCollectionSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(120),
  description: z.string().trim().max(500).optional(),
});

const updateCollectionSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500),
  })
  .partial();

router.use(requireUser);

router.get("/collections", async (_request, response) => {
  const collections = await prisma.collection.findMany({
    select: collectionSelect,
    orderBy: { updatedAt: "desc" },
  });
  response.json({ collections });
});

router.post("/collections", async (request, response) => {
  const parsed = createCollectionSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "A collection name is required." });
    return;
  }

  try {
    const apiId = await uniqueApiId(parsed.data.name, (candidate) =>
      prisma.collection.findFirst({ where: { apiId: candidate }, select: { id: true } }).then((hit) => Boolean(hit)),
    );
    const collection = await prisma.collection.create({
      data: {
        name: parsed.data.name,
        apiId,
        description: parsed.data.description ?? "",
        createdById: request.user!.id,
      },
      select: collectionSelect,
    });
    response.status(201).json({ collection });
  } catch {
    response.status(500).json({ error: "Could not create the collection. Try again." });
  }
});

router.get("/collections/:collectionId", async (request, response) => {
  const collectionId = validateUuid(request.params.collectionId);
  if (!collectionId) {
    response.status(400).json({ error: "Invalid collection id." });
    return;
  }
  const collection = await prisma.collection.findUnique({
    where: { id: collectionId },
    select: collectionSelect,
  });
  if (!collection) {
    response.status(404).json({ error: "Collection not found." });
    return;
  }
  response.json({ collection });
});

router.patch("/collections/:collectionId", async (request, response) => {
  const collectionId = validateUuid(request.params.collectionId);
  if (!collectionId) {
    response.status(400).json({ error: "Invalid collection id." });
    return;
  }
  const parsed = updateCollectionSchema.safeParse(request.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Invalid collection data." });
    return;
  }
  const existing = await prisma.collection.findUnique({ where: { id: collectionId }, select: { id: true } });
  if (!existing) {
    response.status(404).json({ error: "Collection not found." });
    return;
  }
  const collection = await prisma.collection.update({
    where: { id: collectionId },
    data: parsed.data,
    select: collectionSelect,
  });
  response.json({ collection });
});

router.delete("/collections/:collectionId", async (request, response) => {
  const collectionId = validateUuid(request.params.collectionId);
  if (!collectionId) {
    response.status(400).json({ error: "Invalid collection id." });
    return;
  }
  const existing = await prisma.collection.findUnique({ where: { id: collectionId }, select: { id: true } });
  if (!existing) {
    response.status(404).json({ error: "Collection not found." });
    return;
  }
  await prisma.collection.delete({ where: { id: collectionId } });
  response.status(204).end();
});

/* ---------------------------------- Fields --------------------------------- */

const createFieldSchema = z.object({
  name: z.string().trim().min(1, "Field name is required.").max(80),
  type: z.enum(FIELD_TYPES),
  required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1).max(120)).max(50).optional(),
});

const updateFieldSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    required: z.boolean(),
    options: z.array(z.string().trim().min(1).max(120)).max(50),
  })
  .partial();

async function loadCollection(collectionId: string | null) {
  if (!collectionId) return null;
  return prisma.collection.findUnique({ where: { id: collectionId }, select: { id: true, apiId: true } });
}

router.get("/collections/:collectionId/fields", async (request, response) => {
  const collection = await loadCollection(validateUuid(request.params.collectionId));
  if (!collection) {
    response.status(404).json({ error: "Collection not found." });
    return;
  }
  const fields = await prisma.field.findMany({
    where: { collectionId: collection.id },
    select: fieldSelect,
    orderBy: { position: "asc" },
  });
  response.json({ fields });
});

router.post("/collections/:collectionId/fields", async (request, response) => {
  const collection = await loadCollection(validateUuid(request.params.collectionId));
  if (!collection) {
    response.status(404).json({ error: "Collection not found." });
    return;
  }
  const parsed = createFieldSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Provide a field name and a valid type." });
    return;
  }

  const count = await prisma.field.count({ where: { collectionId: collection.id } });
  if (count >= 40) {
    response.status(400).json({ error: "A collection can have at most 40 fields." });
    return;
  }

  try {
    const apiId = await uniqueApiId(parsed.data.name, (candidate) =>
      prisma.field.findFirst({ where: { collectionId: collection.id, apiId: candidate }, select: { id: true } }).then((hit) => Boolean(hit)),
    );
    const field = await prisma.field.create({
      data: {
        collectionId: collection.id,
        name: parsed.data.name,
        apiId,
        type: parsed.data.type,
        required: parsed.data.required ?? false,
        options: JSON.stringify(parsed.data.options ?? []),
        position: count,
      },
      select: fieldSelect,
    });
    response.status(201).json({ field });
  } catch {
    response.status(500).json({ error: "Could not create the field. Try again." });
  }
});

router.patch("/fields/:fieldId", async (request, response) => {
  const fieldId = validateUuid(request.params.fieldId);
  if (!fieldId) {
    response.status(400).json({ error: "Invalid field id." });
    return;
  }
  const parsed = updateFieldSchema.safeParse(request.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Invalid field data." });
    return;
  }
  const existing = await prisma.field.findUnique({ where: { id: fieldId }, select: { id: true } });
  if (!existing) {
    response.status(404).json({ error: "Field not found." });
    return;
  }
  const field = await prisma.field.update({
    where: { id: fieldId },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.required !== undefined ? { required: parsed.data.required } : {}),
      ...(parsed.data.options !== undefined ? { options: JSON.stringify(parsed.data.options) } : {}),
    },
    select: fieldSelect,
  });
  response.json({ field });
});

router.delete("/fields/:fieldId", async (request, response) => {
  const fieldId = validateUuid(request.params.fieldId);
  if (!fieldId) {
    response.status(400).json({ error: "Invalid field id." });
    return;
  }
  const existing = await prisma.field.findUnique({ where: { id: fieldId }, select: { id: true } });
  if (!existing) {
    response.status(404).json({ error: "Field not found." });
    return;
  }
  await prisma.field.delete({ where: { id: fieldId } });
  response.status(204).end();
});

/* ---------------------------------- Entries -------------------------------- */

function coerceValue(type: FieldType, raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  if (raw === undefined || raw === null || raw === "") {
    return { ok: true, value: type === "boolean" ? false : type === "number" ? null : type === "richtext" ? "[]" : "" };
  }
  switch (type) {
    case "text":
    case "longtext":
      if (typeof raw !== "string" || raw.length > MAX_TEXT_LENGTH) return { ok: false, error: "Text is too long." };
      return { ok: true, value: raw };
    case "richtext": {
      const blocks = typeof raw === "string" ? safeParseArray(raw) : raw;
      if (!Array.isArray(blocks) || blocks.length > 5_000) return { ok: false, error: "Invalid rich text document." };
      return { ok: true, value: JSON.stringify(blocks) };
    }
    case "number": {
      const numeric = typeof raw === "number" ? raw : Number(raw);
      if (typeof raw === "boolean" || !Number.isFinite(numeric)) return { ok: false, error: "Enter a valid number." };
      return { ok: true, value: numeric };
    }
    case "boolean":
      return { ok: true, value: Boolean(raw) };
    case "date": {
      const date = new Date(String(raw));
      if (Number.isNaN(date.getTime())) return { ok: false, error: "Enter a valid date." };
      return { ok: true, value: date.toISOString() };
    }
    case "select": {
      const value = String(raw).slice(0, 120);
      return { ok: true, value };
    }
    default:
      return { ok: false, error: "Unknown field type." };
  }
}

function safeParseArray(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function buildEntryData(
  fields: Array<{ apiId: string; type: string; required: boolean; options: string }>,
  input: Record<string, unknown>,
): { ok: true; data: string } | { ok: false; error: string } {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const type = field.type as FieldType;
    const raw = input[field.apiId];
    if (raw === undefined || raw === null || raw === "") {
      if (field.required && type !== "boolean") {
        return { ok: false, error: `The field "${field.apiId}" is required.` };
      }
      const empty = coerceValue(type, null);
      result[field.apiId] = empty.ok ? empty.value : null;
      continue;
    }
    const coerced = coerceValue(type, raw);
    if (!coerced.ok) return { ok: false, error: coerced.error };
    if (type === "select") {
      const choices = safeParseArray(field.options) ?? [];
      if (Array.isArray(choices) && choices.length > 0 && !choices.includes(coerced.value)) {
        return { ok: false, error: `"${String(coerced.value)}" is not one of the allowed options.` };
      }
    }
    result[field.apiId] = coerced.value;
  }
  return { ok: true, data: JSON.stringify(result) };
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

router.get("/collections/:collectionId/entries", async (request, response) => {
  const collection = await loadCollection(validateUuid(request.params.collectionId));
  if (!collection) {
    response.status(404).json({ error: "Collection not found." });
    return;
  }
  const entries = await prisma.entry.findMany({
    where: { collectionId: collection.id },
    select: entrySelect,
    orderBy: { updatedAt: "desc" },
    take: 500,
  });
  response.json({ entries });
});

router.post("/collections/:collectionId/entries", async (request, response) => {
  const collection = await loadCollection(validateUuid(request.params.collectionId));
  if (!collection) {
    response.status(404).json({ error: "Collection not found." });
    return;
  }
  const parsed = createEntrySchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid entry data." });
    return;
  }
  const fields = await prisma.field.findMany({
    where: { collectionId: collection.id },
    select: { apiId: true, type: true, required: true, options: true },
    orderBy: { position: "asc" },
  });
  const built = buildEntryData(fields, parsed.data.data ?? {});
  if (!built.ok) {
    response.status(400).json({ error: built.error });
    return;
  }
  const entry = await prisma.entry.create({
    data: {
      collectionId: collection.id,
      data: built.data,
      published: parsed.data.published ?? false,
      createdById: request.user!.id,
    },
    select: entrySelect,
  });
  response.status(201).json({ entry });
});

async function loadEntry(entryId: string | null) {
  if (!entryId) return null;
  return prisma.entry.findUnique({ where: { id: entryId }, select: { id: true, collectionId: true } });
}

router.get("/entries/:entryId", async (request, response) => {
  const entry = await loadEntry(validateUuid(request.params.entryId));
  if (!entry) {
    response.status(404).json({ error: "Entry not found." });
    return;
  }
  const full = await prisma.entry.findUnique({ where: { id: entry.id }, select: entrySelect });
  response.json({ entry: full });
});

router.patch("/entries/:entryId", async (request, response) => {
  const entry = await loadEntry(validateUuid(request.params.entryId));
  if (!entry) {
    response.status(404).json({ error: "Entry not found." });
    return;
  }
  const parsed = updateEntrySchema.safeParse(request.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Invalid entry data." });
    return;
  }
  const update: { data?: string; published?: boolean } = {};
  if (parsed.data.data !== undefined) {
    const fields = await prisma.field.findMany({
      where: { collectionId: entry.collectionId },
      select: { apiId: true, type: true, required: true, options: true },
      orderBy: { position: "asc" },
    });
    const built = buildEntryData(fields, parsed.data.data);
    if (!built.ok) {
      response.status(400).json({ error: built.error });
      return;
    }
    update.data = built.data;
  }
  if (parsed.data.published !== undefined) {
    update.published = parsed.data.published;
  }
  const saved = await prisma.entry.update({ where: { id: entry.id }, data: update, select: entrySelect });
  response.json({ entry: saved });
});

router.delete("/entries/:entryId", async (request, response) => {
  const entry = await loadEntry(validateUuid(request.params.entryId));
  if (!entry) {
    response.status(404).json({ error: "Entry not found." });
    return;
  }
  await prisma.entry.delete({ where: { id: entry.id } });
  response.status(204).end();
});

export { router as cmsRouter };
