import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma as generalPrisma } from "@/general/api/services/database";
import { requireUser } from "@/general/api/services/require-user";
import { getPresignedUrlForGet } from "@/lib/file";
import { prisma } from "@/forms/api/services/database";
import { formBlocksSchema, parseFormBlocks, serializeFormBlocks } from "@/forms/shared/form-blocks";

const router = Router();

const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 2_000;

const formSummarySelect = {
  id: true,
  title: true,
  description: true,
  icon: true,
  status: true,
  publicSlug: true,
  createdById: true,
  _count: { select: { submissions: true } },
  createdAt: true,
  updatedAt: true,
} as const;

const iconSchema = z.string().max(16).transform((icon) => icon.trim());
const titleSchema = z.string().max(MAX_TITLE_LENGTH).transform((title) => title.trim());
const descriptionSchema = z
  .string()
  .max(MAX_DESCRIPTION_LENGTH)
  .transform((description) => description.trim());

const createFormSchema = z.object({
  title: titleSchema.optional(),
  description: descriptionSchema.optional(),
  icon: iconSchema.optional(),
  blocks: formBlocksSchema.optional(),
});

const updateFormSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema,
    icon: iconSchema,
    blocks: formBlocksSchema,
  })
  .partial();

function validateUuid(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

router.use(requireUser);

/* ---------------------------------- Forms --------------------------------- */

router.get("/forms", async (request, response) => {
  const forms = await prisma.form.findMany({
    where: { createdById: request.user!.id },
    select: formSummarySelect,
    orderBy: { updatedAt: "desc" },
  });
  response.json({ forms });
});

router.post("/forms", async (request, response) => {
  const parsed = createFormSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid form data." });
    return;
  }

  const form = await prisma.form.create({
    data: {
      title: parsed.data.title ?? "",
      description: parsed.data.description ?? "",
      icon: parsed.data.icon ?? "🧾",
      blocks: parsed.data.blocks ? serializeFormBlocks(parsed.data.blocks) : "[]",
      createdById: request.user!.id,
    },
    select: formSummarySelect,
  });
  response.status(201).json({ form });
});

router.get("/forms/:formId", async (request, response) => {
  const formId = validateUuid(request.params.formId);
  if (!formId) {
    response.status(400).json({ error: "Invalid form id." });
    return;
  }

  const form = await prisma.form.findFirst({
    where: { id: formId, createdById: request.user!.id },
  });
  if (!form) {
    response.status(404).json({ error: "Form not found." });
    return;
  }
  response.json({ form });
});

router.patch("/forms/:formId", async (request, response) => {
  const formId = validateUuid(request.params.formId);
  if (!formId) {
    response.status(400).json({ error: "Invalid form id." });
    return;
  }

  const parsed = updateFormSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid form data." });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Nothing to update." });
    return;
  }

  const { blocks: parsedBlocks, ...rest } = parsed.data;
  const data = {
    ...rest,
    ...(parsedBlocks ? { blocks: serializeFormBlocks(parsedBlocks) } : {}),
  };

  const existing = await prisma.form.findFirst({
    where: { id: formId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Form not found." });
    return;
  }

  const form = await prisma.form.update({
    where: { id: formId },
    data,
    select: formSummarySelect,
  });
  response.json({ form });
});

router.delete("/forms/:formId", async (request, response) => {
  const formId = validateUuid(request.params.formId);
  if (!formId) {
    response.status(400).json({ error: "Invalid form id." });
    return;
  }

  const existing = await prisma.form.findFirst({
    where: { id: formId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Form not found." });
    return;
  }

  await prisma.form.delete({ where: { id: formId } });
  response.status(204).end();
});

/* ------------------------------ Publish / Draft ---------------------------- */

router.post("/forms/:formId/publish", async (request, response) => {
  const formId = validateUuid(request.params.formId);
  if (!formId) {
    response.status(400).json({ error: "Invalid form id." });
    return;
  }

  const form = await prisma.form.findFirst({
    where: { id: formId, createdById: request.user!.id },
    select: { id: true, publicSlug: true, blocks: true },
  });
  if (!form) {
    response.status(404).json({ error: "Form not found." });
    return;
  }

  // Only publish forms with at least one answerable block.
  const hasQuestion = parseFormBlocks(form.blocks).some((block) => block.type !== "paragraph");
  if (!hasQuestion) {
    response.status(400).json({ error: "Add at least one question before publishing." });
    return;
  }

  let publicSlug = form.publicSlug ?? "";
  if (!publicSlug) {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      publicSlug = randomBytes(9).toString("base64url");
      const clash = await prisma.form.findFirst({ where: { publicSlug }, select: { id: true } });
      if (!clash) break;
      publicSlug = "";
    }
    if (!publicSlug) {
      response.status(500).json({ error: "Could not generate a public link. Try again." });
      return;
    }
  }

  await prisma.form.update({
    where: { id: formId },
    data: { status: "PUBLISHED", publicSlug },
  });
  response.json({ status: "PUBLISHED", publicSlug });
});

router.delete("/forms/:formId/publish", async (request, response) => {
  const formId = validateUuid(request.params.formId);
  if (!formId) {
    response.status(400).json({ error: "Invalid form id." });
    return;
  }

  const existing = await prisma.form.findFirst({
    where: { id: formId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Form not found." });
    return;
  }

  await prisma.form.update({ where: { id: formId }, data: { status: "DRAFT" } });
  response.json({ status: "DRAFT" });
});

/* ------------------------------- Submissions ------------------------------- */

router.get("/forms/:formId/submissions", async (request, response) => {
  const formId = validateUuid(request.params.formId);
  if (!formId) {
    response.status(400).json({ error: "Invalid form id." });
    return;
  }

  const form = await prisma.form.findFirst({
    where: { id: formId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!form) {
    response.status(404).json({ error: "Form not found." });
    return;
  }

  const submissions = await prisma.formSubmission.findMany({
    where: { formId },
    orderBy: { createdAt: "desc" },
  });
  response.json({ submissions });
});

router.delete("/forms/:formId/submissions/:submissionId", async (request, response) => {
  const formId = validateUuid(request.params.formId);
  const submissionId = validateUuid(request.params.submissionId);
  if (!formId || !submissionId) {
    response.status(400).json({ error: "Invalid form or submission id." });
    return;
  }

  const form = await prisma.form.findFirst({
    where: { id: formId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!form) {
    response.status(404).json({ error: "Form not found." });
    return;
  }

  await prisma.formSubmission.deleteMany({ where: { id: submissionId, formId } });
  response.status(204).end();
});

/* ------------------------------- File access ------------------------------- */

// Presigned GET link for a file a respondent uploaded. Ownership is verified by
// checking the filename actually appears in one of the user's form submissions.
router.get("/files/:filename/url", async (request, response) => {
  const filename = request.params.filename;
  if (!/^[a-z0-9][a-z0-9._-]{0,299}$/.test(filename)) {
    response.status(400).json({ error: "Invalid file name." });
    return;
  }

  const ownedForms = await prisma.form.findMany({
    where: { createdById: request.user!.id },
    select: { id: true },
  });
  if (ownedForms.length === 0) {
    response.status(404).json({ error: "File not found." });
    return;
  }

  const submission = await prisma.formSubmission.findFirst({
    where: { formId: { in: ownedForms.map((form) => form.id) }, answers: { contains: filename } },
    select: { id: true },
  });
  if (!submission) {
    response.status(404).json({ error: "File not found." });
    return;
  }

  try {
    const { url } = await getPresignedUrlForGet(filename);
    response.json({ url });
  } catch {
    response.status(500).json({ error: "Could not create a download link for this file." });
  }
});

/* ------------------------------ Collaborators ------------------------------ */

router.get("/teammates", async (_request, response) => {
  const users = await generalPrisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  response.json({ users });
});

export { router as formsRouter };