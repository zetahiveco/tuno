import { Router } from "express";
import { prisma } from "@/documents/api/services/database";

const router = Router();

/** Read-only view of a publicly shared folder. */
router.get("/folders/:slug", async (request, response) => {
  const slug = String(request.params.slug ?? "");
  if (!slug || slug.length > 64) {
    response.status(400).json({ error: "Invalid folder link." });
    return;
  }
  const folder = await prisma.folder.findUnique({
    where: { publicSlug: slug },
    select: {
      id: true,
      name: true,
      subfolders: { select: { id: true, name: true }, orderBy: { name: "asc" } },
      files: {
        select: { id: true, name: true, size: true, mimeType: true, createdAt: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!folder) {
    response.status(404).json({ error: "Folder not found." });
    return;
  }
  response.json({ folder });
});

/** Public download for files inside a publicly shared folder. */
router.get("/files/:fileId/download", async (request, response) => {
  const fileId = String(request.params.fileId ?? "");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fileId)) {
    response.status(400).json({ error: "Invalid file id." });
    return;
  }
  const file = await prisma.docFile.findUnique({
    where: { id: fileId },
    select: { key: true, folder: { select: { publicSlug: true } } },
  });
  if (!file || !file.folder?.publicSlug) {
    response.status(404).json({ error: "File not found." });
    return;
  }
  const { getPresignedUrlForGet } = await import("@/lib/file");
  try {
    const download = await getPresignedUrlForGet(file.key);
    response.json({ download });
  } catch {
    response.status(500).json({ error: "Storage is not configured." });
  }
});

export { router as publicDocumentsRouter };
