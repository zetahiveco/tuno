import { Router } from "express";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { prisma } from "@/forms/api/services/database";
import { getPresignedUrlForUpload } from "@/lib/file";
import { parseFormBlocks, validateSubmission } from "@/forms/shared/form-blocks";

const router = Router();

/* Public endpoints for respondents. No auth — the form link is the key. */

router.get("/:slug", async (request, response) => {
  const slug = request.params.slug;
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(slug)) {
    response.status(400).json({ error: "Invalid form link." });
    return;
  }

  const form = await prisma.form.findFirst({
    where: { publicSlug: slug, status: "PUBLISHED" },
    select: { title: true, description: true, icon: true, blocks: true, updatedAt: true },
  });
  if (!form) {
    response.status(404).json({ error: "This form is not available." });
    return;
  }

  response.json({ form: { ...form, blocks: parseFormBlocks(form.blocks) } });
});

router.post("/:slug/submissions", async (request, response) => {
  const slug = request.params.slug;
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(slug)) {
    response.status(400).json({ error: "Invalid form link." });
    return;
  }

  const form = await prisma.form.findFirst({
    where: { publicSlug: slug, status: "PUBLISHED" },
    select: { id: true, blocks: true },
  });
  if (!form) {
    response.status(404).json({ error: "This form is not accepting responses." });
    return;
  }

  const blocks = parseFormBlocks(form.blocks);
  const result = validateSubmission(blocks, request.body?.answers);
  if (!result.ok) {
    response.status(400).json({ error: result.error });
    return;
  }

  const submission = await prisma.formSubmission.create({
    data: {
      formId: form.id,
      answers: JSON.stringify(result.answers),
    },
    select: { id: true, createdAt: true },
  });
  response.status(201).json({ submission });
});

/* File upload: hand respondents a presigned S3 PUT url (shared lib/file.ts). */
router.post("/upload-url", async (request, response) => {
  const parsed = z.object({ filename: z.string().min(1).max(255) }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "A file name is required." });
    return;
  }

  try {
    const upload = await getPresignedUrlForUpload(parsed.data.filename);
    response.json({ filename: upload.filename, url: upload.url });
  } catch (error) {
    logger.error("[forms] Presigned upload url failed", error);
    response.status(500).json({ error: "Could not prepare the file upload. Try again." });
  }
});

export { router as publicFormsRouter };