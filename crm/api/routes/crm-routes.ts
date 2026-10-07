import { Router } from "express";
import { z } from "zod";
import { prisma as generalPrisma } from "@/general/api/services/database";
import { requireUser } from "@/general/api/services/require-user";
import { prisma } from "@/crm/api/services/database";

const router = Router();

router.use(requireUser);

const MAX_TEXT_LENGTH = 300;
const MAX_BODY_LENGTH = 20_000;

function validateUuid(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

const fieldTypes = ["TEXT", "NUMBER", "DATE", "SELECT", "CHECKBOX"] as const;
const fieldEntities = ["ACCOUNT", "CONTACT", "TASK"] as const;

type FieldType = (typeof fieldTypes)[number];

const trimmed = (max: number) => z.string().max(max).transform((value) => value.trim());

const STAGE_COLORS = ["#8c838f", "#3b63a8", "#b98a2f", "#4e8a68", "#b05f5f", "#755984", "#2f7d6d"] as const;
const DEFAULT_STAGES = [
  { name: "Lead", color: "#8c838f" },
  { name: "Contacted", color: "#3b63a8" },
  { name: "Deal", color: "#b98a2f" },
  { name: "Closed", color: "#4e8a68" },
  { name: "Lost", color: "#b05f5f" },
] as const;

const accountCreateSchema = z.object({
  name: z.string().min(1).max(MAX_TEXT_LENGTH).transform((value) => value.trim()),
  email: z.string().max(200).optional(),
  phone: z.string().max(60).optional(),
  source: trimmed(MAX_TEXT_LENGTH).optional(),
  value: z.number().min(0).optional(),
  stageId: z.string().uuid().optional(),
});

const accountUpdateSchema = accountCreateSchema.partial().extend({
  name: trimmed(MAX_TEXT_LENGTH).optional(),
});

const contactCreateSchema = z.object({
  name: z.string().min(1).max(MAX_TEXT_LENGTH).transform((value) => value.trim()),
  email: z.string().max(200).optional(),
  phone: z.string().max(60).optional(),
  role: trimmed(MAX_TEXT_LENGTH).optional(),
  accountId: z.string().uuid(),
});

const contactUpdateSchema = contactCreateSchema.partial().extend({
  name: trimmed(MAX_TEXT_LENGTH).optional(),
});

const taskCreateSchema = z.object({
  title: z.string().min(1).max(MAX_TEXT_LENGTH).transform((value) => value.trim()),
  status: z.enum(["TODO", "IN_PROGRESS", "DONE"]).optional(),
  dueDate: z.string().datetime().nullish(),
  accountId: z.string().uuid().nullish(),
  contactId: z.string().uuid().nullish(),
});

const taskUpdateSchema = taskCreateSchema.partial().extend({
  title: trimmed(MAX_TEXT_LENGTH).optional(),
  dueDate: z.string().datetime().nullish(),
});

const noteCreateSchema = z.object({
  body: z.string().max(MAX_BODY_LENGTH).transform((body) => body.trim()).refine((body) => body.length > 0, "Note body is required."),
  accountId: z.string().uuid().nullish(),
  contactId: z.string().uuid().nullish(),
});

const noteUpdateSchema = z.object({
  body: z.string().max(MAX_BODY_LENGTH).transform((body) => body.trim()).refine((body) => body.length > 0, "Note body is required."),
});

const stageCreateSchema = z.object({
  name: z.string().min(1).max(MAX_TEXT_LENGTH).transform((value) => value.trim()),
  color: z.string().max(32).optional(),
});

const stageUpdateSchema = z.object({
  name: trimmed(MAX_TEXT_LENGTH),
  color: z.string().max(32).optional(),
  position: z.number().int().min(0).optional(),
});

const fieldCreateSchema = z.object({
  name: z.string().min(1).max(MAX_TEXT_LENGTH).transform((value) => value.trim()),
  type: z.enum(fieldTypes),
  options: z.array(z.string().max(200)).max(50).optional(),
  appliesTo: z.enum(fieldEntities),
});

const fieldUpdateSchema = z.object({
  name: trimmed(MAX_TEXT_LENGTH),
  options: z.array(z.string().max(200)).max(50).optional(),
});

const valuesSchema = z.object({
  entityType: z.enum(fieldEntities),
  entityId: z.string().uuid(),
  values: z.record(z.string().uuid(), z.string().max(2_000)),
});

/* ------------------------------ Custom values ----------------------------- */

async function loadValuesMap(entityType: string, entityIds: string[]) {
  if (entityIds.length === 0) return {} as Record<string, Record<string, string>>;
  const rows = await prisma.customFieldValue.findMany({
    where: { entityType, entityId: { in: entityIds } },
    select: { fieldId: true, entityId: true, value: true },
  });
  const map: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    const entry = map[row.entityId] ?? {};
    entry[row.fieldId] = row.value;
    map[row.entityId] = entry;
  }
  return map;
}

function attachValues<T extends { id: string }>(entities: T[], values: Record<string, Record<string, string>>) {
  return entities.map((entity) => ({ ...entity, customValues: values[entity.id] ?? {} }));
}

async function saveValues(
  userId: string,
  entityType: string,
  entityId: string,
  values: Record<string, string>,
) {
  const fieldIds = Object.keys(values);
  if (fieldIds.length === 0) return;

  const fields = await prisma.customField.findMany({
    where: { id: { in: fieldIds }, appliesTo: entityType as never },
    select: { id: true, type: true },
  });
  if (fields.length === 0) return;

  for (const field of fields) {
    const raw = values[field.id] ?? "";
    const value = normalizeValue(field.type as FieldType, raw);
    const key = { fieldId_entityType_entityId: { fieldId: field.id, entityType, entityId } };
    if (value === "") {
      await prisma.customFieldValue.deleteMany({ where: { fieldId: field.id, entityType, entityId } });
    } else {
      await prisma.customFieldValue.upsert({
        where: { fieldId_entityType_entityId: key.fieldId_entityType_entityId },
        create: { fieldId: field.id, entityType, entityId, value },
        update: { value },
      });
    }
  }
}

function normalizeValue(type: FieldType, raw: string): string {
  if (raw === "") return "";
  switch (type) {
    case "NUMBER": {
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? String(parsed) : "";
    }
    case "DATE": {
      const date = new Date(raw);
      return Number.isNaN(date.getTime()) ? "" : date.toISOString();
    }
    case "CHECKBOX":
      return raw === "true" ? "true" : "false";
    default:
      return raw;
  }
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/* --------------------------------- Stages --------------------------------- */

/** List the caller's pipeline stages, seeding the default set on first use. */
router.get("/stages", async (request, response) => {
  const userId = request.user!.id;
  let stages = await prisma.pipelineStage.findMany({
    where: { createdById: userId },
    orderBy: { position: "asc" },
  });
  if (stages.length === 0) {
    await prisma.pipelineStage.createMany({
      data: DEFAULT_STAGES.map((stage, index) => ({ ...stage, position: index, createdById: userId })),
    });
    stages = await prisma.pipelineStage.findMany({
      where: { createdById: userId },
      orderBy: { position: "asc" },
    });
  }
  const counts = await prisma.account.groupBy({
    by: ["stageId"],
    where: { createdById: userId },
    _count: { _all: true },
  });
  const countByStage = new Map(counts.map((entry) => [entry.stageId, entry._count._all]));
  response.json({
    stages: stages.map((stage) => ({ ...stage, accountCount: countByStage.get(stage.id) ?? 0 })),
  });
});

router.post("/stages", async (request, response) => {
  const parsed = stageCreateSchema.safeParse(request.body ?? {});
  if (!parsed.success || !parsed.data.name) {
    response.status(400).json({ error: "A stage name is required." });
    return;
  }
  const count = await prisma.pipelineStage.count({ where: { createdById: request.user!.id } });
  const stage = await prisma.pipelineStage.create({
    data: {
      name: parsed.data.name,
      color: parsed.data.color ?? STAGE_COLORS[count % STAGE_COLORS.length],
      position: count,
      createdById: request.user!.id,
    },
  });
  response.status(201).json({ stage: { ...stage, accountCount: 0 } });
});

router.patch("/stages/:stageId", async (request, response) => {
  const stageId = validateUuid(request.params.stageId);
  if (!stageId) {
    response.status(400).json({ error: "Invalid stage id." });
    return;
  }
  const parsed = stageUpdateSchema.safeParse(request.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Invalid stage data." });
    return;
  }
  const existing = await prisma.pipelineStage.findFirst({
    where: { id: stageId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Stage not found." });
    return;
  }
  const stage = await prisma.pipelineStage.update({ where: { id: stageId }, data: parsed.data });
  response.json({ stage });
});

router.delete("/stages/:stageId", async (request, response) => {
  const stageId = validateUuid(request.params.stageId);
  if (!stageId) {
    response.status(400).json({ error: "Invalid stage id." });
    return;
  }
  const existing = await prisma.pipelineStage.findFirst({
    where: { id: stageId, createdById: request.user!.id },
    select: { id: true, _count: { select: { accounts: true } } },
  });
  if (!existing) {
    response.status(404).json({ error: "Stage not found." });
    return;
  }
  if (existing._count.accounts > 0) {
    response.status(409).json({ error: "Move the accounts out of this stage before deleting it." });
    return;
  }
  await prisma.pipelineStage.delete({ where: { id: stageId } });
  response.status(204).end();
});

/* --------------------------------- Accounts -------------------------------- */

router.get("/accounts", async (request, response) => {
  const accounts = await prisma.account.findMany({
    where: { createdById: request.user!.id },
    include: { stage: { select: { id: true, name: true, color: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const values = await loadValuesMap("ACCOUNT", accounts.map((account) => account.id));
  response.json({ accounts: attachValues(accounts, values) });
});

router.post("/accounts", async (request, response) => {
  const parsed = accountCreateSchema.safeParse(request.body ?? {});
  if (!parsed.success || !parsed.data.name) {
    response.status(400).json({ error: "An account name is required." });
    return;
  }
  const userId = request.user!.id;
  let stageId = parsed.data.stageId;
  if (stageId) {
    const stage = await prisma.pipelineStage.findFirst({
      where: { id: stageId, createdById: userId },
      select: { id: true },
    });
    if (!stage) {
      response.status(400).json({ error: "That stage does not exist." });
      return;
    }
  } else {
    const firstStage = await prisma.pipelineStage.findFirst({
      where: { createdById: userId },
      orderBy: { position: "asc" },
      select: { id: true },
    });
    if (!firstStage) {
      response.status(400).json({ error: "No pipeline stages exist yet." });
      return;
    }
    stageId = firstStage.id;
  }
  const account = await prisma.account.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email ?? "",
      phone: parsed.data.phone ?? "",
      source: parsed.data.source ?? "",
      value: parsed.data.value ?? 0,
      stageId,
      createdById: userId,
    },
    include: { stage: { select: { id: true, name: true, color: true } } },
  });
  response.status(201).json({ account: { ...account, customValues: {} } });
});

router.patch("/accounts/:accountId", async (request, response) => {
  const accountId = validateUuid(request.params.accountId);
  if (!accountId) {
    response.status(400).json({ error: "Invalid account id." });
    return;
  }
  const parsed = accountUpdateSchema.safeParse(request.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Invalid account data." });
    return;
  }
  const existing = await prisma.account.findFirst({
    where: { id: accountId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Account not found." });
    return;
  }
  if (parsed.data.stageId) {
    const stage = await prisma.pipelineStage.findFirst({
      where: { id: parsed.data.stageId, createdById: request.user!.id },
      select: { id: true },
    });
    if (!stage) {
      response.status(400).json({ error: "That stage does not exist." });
      return;
    }
  }
  const account = await prisma.account.update({
    where: { id: accountId },
    data: parsed.data,
    include: { stage: { select: { id: true, name: true, color: true } } },
  });
  response.json({ account });
});

router.delete("/accounts/:accountId", async (request, response) => {
  const accountId = validateUuid(request.params.accountId);
  if (!accountId) {
    response.status(400).json({ error: "Invalid account id." });
    return;
  }
  const existing = await prisma.account.findFirst({
    where: { id: accountId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Account not found." });
    return;
  }
  await prisma.account.delete({ where: { id: accountId } });
  response.status(204).end();
});

/* -------------------------------- Contacts -------------------------------- */

router.get("/contacts", async (request, response) => {
  const contacts = await prisma.contact.findMany({
    where: { createdById: request.user!.id },
    include: { account: { select: { id: true, name: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const values = await loadValuesMap("CONTACT", contacts.map((contact) => contact.id));
  response.json({ contacts: attachValues(contacts, values) });
});

router.post("/contacts", async (request, response) => {
  const parsed = contactCreateSchema.safeParse(request.body ?? {});
  if (!parsed.success || !parsed.data.name) {
    response.status(400).json({ error: "A contact name and account are required." });
    return;
  }
  const account = await prisma.account.findFirst({
    where: { id: parsed.data.accountId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!account) {
    response.status(400).json({ error: "That account does not exist." });
    return;
  }
  const contact = await prisma.contact.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email ?? "",
      phone: parsed.data.phone ?? "",
      role: parsed.data.role ?? "",
      accountId: parsed.data.accountId,
      createdById: request.user!.id,
    },
    include: { account: { select: { id: true, name: true } } },
  });
  response.status(201).json({ contact: { ...contact, customValues: {} } });
});

router.patch("/contacts/:contactId", async (request, response) => {
  const contactId = validateUuid(request.params.contactId);
  if (!contactId) {
    response.status(400).json({ error: "Invalid contact id." });
    return;
  }
  const parsed = contactUpdateSchema.safeParse(request.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Invalid contact data." });
    return;
  }
  const existing = await prisma.contact.findFirst({
    where: { id: contactId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Contact not found." });
    return;
  }
  if (parsed.data.accountId) {
    const account = await prisma.account.findFirst({
      where: { id: parsed.data.accountId, createdById: request.user!.id },
      select: { id: true },
    });
    if (!account) {
      response.status(400).json({ error: "That account does not exist." });
      return;
    }
  }
  const contact = await prisma.contact.update({
    where: { id: contactId },
    data: parsed.data,
    include: { account: { select: { id: true, name: true } } },
  });
  response.json({ contact });
});

router.delete("/contacts/:contactId", async (request, response) => {
  const contactId = validateUuid(request.params.contactId);
  if (!contactId) {
    response.status(400).json({ error: "Invalid contact id." });
    return;
  }
  const existing = await prisma.contact.findFirst({
    where: { id: contactId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Contact not found." });
    return;
  }
  await prisma.contact.delete({ where: { id: contactId } });
  response.status(204).end();
});

/* ---------------------------------- Tasks --------------------------------- */

router.get("/tasks", async (request, response) => {
  const tasks = await prisma.crmTask.findMany({
    where: { createdById: request.user!.id },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }, { updatedAt: "desc" }],
  });
  const values = await loadValuesMap("TASK", tasks.map((task) => task.id));
  response.json({ tasks: attachValues(tasks, values) });
});

router.post("/tasks", async (request, response) => {
  const parsed = taskCreateSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "A task title is required." });
    return;
  }
  const { dueDate, ...rest } = parsed.data;
  const task = await prisma.crmTask.create({
    data: {
      ...rest,
      dueDate: parseDate(dueDate ?? undefined),
      createdById: request.user!.id,
    },
  });
  response.status(201).json({ task: { ...task, customValues: {} } });
});

router.patch("/tasks/:taskId", async (request, response) => {
  const taskId = validateUuid(request.params.taskId);
  if (!taskId) {
    response.status(400).json({ error: "Invalid task id." });
    return;
  }
  const parsed = taskUpdateSchema.safeParse(request.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Invalid task data." });
    return;
  }
  const existing = await prisma.crmTask.findFirst({
    where: { id: taskId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Task not found." });
    return;
  }
  const { dueDate, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (dueDate !== undefined) data.dueDate = parseDate(dueDate);
  const task = await prisma.crmTask.update({ where: { id: taskId }, data });
  response.json({ task });
});

router.delete("/tasks/:taskId", async (request, response) => {
  const taskId = validateUuid(request.params.taskId);
  if (!taskId) {
    response.status(400).json({ error: "Invalid task id." });
    return;
  }
  const existing = await prisma.crmTask.findFirst({
    where: { id: taskId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Task not found." });
    return;
  }
  await prisma.crmTask.delete({ where: { id: taskId } });
  response.status(204).end();
});

/* ---------------------------------- Notes --------------------------------- */

router.get("/notes", async (request, response) => {
  const accountId = validateUuid(String(request.query.accountId ?? ""));
  const contactId = validateUuid(String(request.query.contactId ?? ""));
  const notes = await prisma.crmNote.findMany({
    where: {
      createdById: request.user!.id,
      ...(accountId ? { accountId } : {}),
      ...(contactId ? { contactId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  response.json({ notes });
});

router.post("/notes", async (request, response) => {
  const parsed = noteCreateSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "A note body is required." });
    return;
  }
  const note = await prisma.crmNote.create({
    data: {
      body: parsed.data.body,
      accountId: parsed.data.accountId ?? null,
      contactId: parsed.data.contactId ?? null,
      createdById: request.user!.id,
    },
  });
  response.status(201).json({ note });
});

router.patch("/notes/:noteId", async (request, response) => {
  const noteId = validateUuid(request.params.noteId);
  if (!noteId) {
    response.status(400).json({ error: "Invalid note id." });
    return;
  }
  const parsed = noteUpdateSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid note data." });
    return;
  }
  const existing = await prisma.crmNote.findFirst({
    where: { id: noteId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Note not found." });
    return;
  }
  const note = await prisma.crmNote.update({ where: { id: noteId }, data: parsed.data });
  response.json({ note });
});

router.delete("/notes/:noteId", async (request, response) => {
  const noteId = validateUuid(request.params.noteId);
  if (!noteId) {
    response.status(400).json({ error: "Invalid note id." });
    return;
  }
  const existing = await prisma.crmNote.findFirst({
    where: { id: noteId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Note not found." });
    return;
  }
  await prisma.crmNote.delete({ where: { id: noteId } });
  response.status(204).end();
});

/* ------------------------------ Custom fields ----------------------------- */

router.get("/fields", async (request, response) => {
  const fields = await prisma.customField.findMany({
    orderBy: { createdAt: "asc" },
  });
  response.json({ fields });
});

router.post("/fields", async (request, response) => {
  const parsed = fieldCreateSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "A field name, type, and entity are required." });
    return;
  }
  const field = await prisma.customField.create({
    data: {
      name: parsed.data.name,
      type: parsed.data.type,
      appliesTo: parsed.data.appliesTo,
      options: JSON.stringify(parsed.data.options ?? []),
      createdById: request.user!.id,
    },
  });
  response.status(201).json({ field });
});

router.patch("/fields/:fieldId", async (request, response) => {
  const fieldId = validateUuid(request.params.fieldId);
  if (!fieldId) {
    response.status(400).json({ error: "Invalid field id." });
    return;
  }
  const parsed = fieldUpdateSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid field data." });
    return;
  }
  const existing = await prisma.customField.findUnique({ where: { id: fieldId }, select: { id: true } });
  if (!existing) {
    response.status(404).json({ error: "Field not found." });
    return;
  }
  const field = await prisma.customField.update({
    where: { id: fieldId },
    data: {
      name: parsed.data.name,
      ...(parsed.data.options ? { options: JSON.stringify(parsed.data.options) } : {}),
    },
  });
  response.json({ field });
});

router.delete("/fields/:fieldId", async (request, response) => {
  const fieldId = validateUuid(request.params.fieldId);
  if (!fieldId) {
    response.status(400).json({ error: "Invalid field id." });
    return;
  }
  const existing = await prisma.customField.findUnique({ where: { id: fieldId }, select: { id: true } });
  if (!existing) {
    response.status(404).json({ error: "Field not found." });
    return;
  }
  await prisma.customField.delete({ where: { id: fieldId } });
  response.status(204).end();
});

/* ----------------------------- Custom values ------------------------------ */

router.put("/values", async (request, response) => {
  const parsed = valuesSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid custom field values." });
    return;
  }
  const { entityType, entityId, values } = parsed.data;
  const owned = await findOwnedEntity(entityType, entityId, request.user!.id);
  if (!owned) {
    response.status(404).json({ error: "Record not found." });
    return;
  }
  await saveValues(request.user!.id, entityType, entityId, values);
  const stored = await loadValuesMap(entityType, [entityId]);
  response.json({ customValues: stored[entityId] ?? {} });
});

async function findOwnedEntity(entityType: string, entityId: string, userId: string) {
  switch (entityType) {
    case "ACCOUNT":
      return prisma.account.findFirst({ where: { id: entityId, createdById: userId }, select: { id: true } });
    case "CONTACT":
      return prisma.contact.findFirst({ where: { id: entityId, createdById: userId }, select: { id: true } });
    case "TASK":
      return prisma.crmTask.findFirst({ where: { id: entityId, createdById: userId }, select: { id: true } });
    default:
      return null;
  }
}

/* -------------------------------- Teammates -------------------------------- */

router.get("/teammates", async (_request, response) => {
  const users = await generalPrisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  response.json({ users });
});

export { router as crmRouter };
