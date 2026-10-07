import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma as generalPrisma } from "@/general/api/services/database";
import { requireUser } from "@/general/api/services/require-user";
import { getPresignedUrlForGet, getPresignedUrlForUpload } from "@/lib/file";
import { prisma } from "@/documents/api/services/database";

const router = Router();

router.use(requireUser);

const MAX_NAME_LENGTH = 255;

function validateUuid(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

const nameSchema = z.string().max(MAX_NAME_LENGTH).transform((name) => name.trim());

type FolderRole = "owner" | "edit";

/** Resolve the caller's access to a folder: owner, edit (shared), or null. */
async function folderAccess(folderId: string, userId: string): Promise<{ folderId: string; role: FolderRole } | null> {
  const folder = await prisma.folder.findFirst({
    where: { id: folderId },
    select: { id: true, createdById: true, sharedAll: true, shares: { select: { userId: true } } },
  });
  if (!folder) return null;
  if (folder.createdById === userId) return { folderId, role: "owner" };
  if (folder.sharedAll || folder.shares.some((share) => share.userId === userId)) return { folderId, role: "edit" };
  return null;
}

/* --------------------------------- Folders --------------------------------- */

const folderSelect = {
  id: true,
  name: true,
  parentId: true,
  createdById: true,
  sharedAll: true,
  publicSlug: true,
  _count: { select: { shares: true, files: true, subfolders: true } },
  createdAt: true,
  updatedAt: true,
} as const;

router.get("/folders", async (request, response) => {
  const userId = request.user!.id;
  const parentId = validateUuid(String(request.query.parentId ?? "")) ?? null;
  const scope = request.query.scope;

  if (scope === "shared") {
    const sharedFolders = await prisma.folder.findMany({
      where: {
        parentId,
        createdById: { not: userId },
        OR: [{ sharedAll: true }, { shares: { some: { userId } } }],
      },
      select: folderSelect,
      orderBy: { name: "asc" },
    });
    response.json({ folders: sharedFolders.map((folder) => ({ ...folder, role: "edit" })) });
    return;
  }

  const folders = await prisma.folder.findMany({
    where: { parentId, createdById: userId },
    select: folderSelect,
    orderBy: { name: "asc" },
  });
  response.json({ folders: folders.map((folder) => ({ ...folder, role: "owner" })) });
});

router.post("/folders", async (request, response) => {
  const parsed = z.object({ name: nameSchema, parentId: z.string().uuid().nullish() }).safeParse(request.body ?? {});
  if (!parsed.success || !parsed.data.name) {
    response.status(400).json({ error: "A folder name is required." });
    return;
  }
  if (parsed.data.parentId) {
    const access = await folderAccess(parsed.data.parentId, request.user!.id);
    if (!access) {
      response.status(404).json({ error: "Parent folder not found." });
      return;
    }
  }
  const folder = await prisma.folder.create({
    data: { name: parsed.data.name, parentId: parsed.data.parentId || null, createdById: request.user!.id },
    select: folderSelect,
  });
  response.status(201).json({ folder: { ...folder, role: "owner" } });
});

/** Breadcrumb trail from the root to a folder. */
router.get("/folders/:folderId/path", async (request, response) => {
  const folderId = validateUuid(request.params.folderId);
  if (!folderId) {
    response.status(400).json({ error: "Invalid folder id." });
    return;
  }
  const access = await folderAccess(folderId, request.user!.id);
  if (!access) {
    response.status(404).json({ error: "Folder not found." });
    return;
  }
  const path: { id: string; name: string }[] = [];
  let currentId: string | null = folderId;
  while (currentId) {
    const folder: { id: string; name: string; parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: currentId },
      select: { id: true, name: true, parentId: true },
    });
    if (!folder) break;
    path.unshift({ id: folder.id, name: folder.name });
    currentId = folder.parentId;
  }
  response.json({ path });
});

router.patch("/folders/:folderId", async (request, response) => {
  const folderId = validateUuid(request.params.folderId);
  if (!folderId) {
    response.status(400).json({ error: "Invalid folder id." });
    return;
  }
  const parsed = z.object({ name: nameSchema }).safeParse(request.body);
  if (!parsed.success || !parsed.data.name) {
    response.status(400).json({ error: "A folder name is required." });
    return;
  }
  const existing = await prisma.folder.findFirst({
    where: { id: folderId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Only the folder owner can rename it." });
    return;
  }
  const folder = await prisma.folder.update({ where: { id: folderId }, data: { name: parsed.data.name }, select: folderSelect });
  response.json({ folder });
});

router.delete("/folders/:folderId", async (request, response) => {
  const folderId = validateUuid(request.params.folderId);
  if (!folderId) {
    response.status(400).json({ error: "Invalid folder id." });
    return;
  }
  const existing = await prisma.folder.findFirst({
    where: { id: folderId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Only the folder owner can delete it." });
    return;
  }
  // Collect the folder and every descendant so their files are removed too.
  const folderIds: string[] = [];
  const queue = [folderId];
  while (queue.length > 0) {
    const current = queue.pop()!;
    folderIds.push(current);
    const children = await prisma.folder.findMany({ where: { parentId: current }, select: { id: true } });
    queue.push(...children.map((child) => child.id));
  }
  await prisma.docFile.deleteMany({ where: { folderId: { in: folderIds } } });
  await prisma.folder.deleteMany({ where: { id: { in: folderIds } } });
  response.status(204).end();
});

/* ---------------------------------- Files ---------------------------------- */

const fileSelect = {
  id: true,
  folderId: true,
  name: true,
  key: true,
  size: true,
  mimeType: true,
  createdAt: true,
  updatedAt: true,
} as const;

/** List files in a folder (or at the root). */
router.get("/files", async (request, response) => {
  const userId = request.user!.id;
  const parentId = validateUuid(String(request.query.parentId ?? ""));

  if (!parentId) {
    // Root: files the user owns and files inside folders shared with them.
    const ownFiles = await prisma.docFile.findMany({
      where: { folderId: null, createdById: userId },
      select: fileSelect,
      orderBy: { name: "asc" },
    });
    const sharedFiles = await prisma.docFile.findMany({
      where: {
        folderId: { not: null },
        createdById: { not: userId },
        OR: [
          { folder: { sharedAll: true } },
          { folder: { shares: { some: { userId } } } },
        ],
      },
      select: fileSelect,
      orderBy: { name: "asc" },
    });
    response.json({ files: [...ownFiles, ...sharedFiles] });
    return;
  }

  const access = await folderAccess(parentId, userId);
  if (!access) {
    response.status(404).json({ error: "Folder not found." });
    return;
  }
  const files = await prisma.docFile.findMany({
    where: { folderId: parentId },
    select: fileSelect,
    orderBy: { name: "asc" },
  });
  response.json({ files });
});

/** Step 1 of an upload: get a presigned URL the browser can PUT the file to. */
router.post("/uploads", async (request, response) => {
  const parsed = z.object({ name: nameSchema }).safeParse(request.body ?? {});
  if (!parsed.success || !parsed.data.name) {
    response.status(400).json({ error: "A file name is required." });
    return;
  }
  try {
    const upload = await getPresignedUrlForUpload(parsed.data.name);
    response.status(201).json({ upload });
  } catch {
    response.status(500).json({ error: "Storage is not configured. Set the AWS_S3_* environment variables." });
  }
});

/** Step 2 of an upload: register the stored object as a document file. */
router.post("/files", async (request, response) => {
  const parsed = z.object({
    folderId: z.string().uuid().nullish(),
    name: nameSchema,
    key: z.string().min(1).max(1_024),
    size: z.number().int().min(0).max(5_242_880_000).optional(),
    mimeType: z.string().max(255).optional(),
  }).safeParse(request.body ?? {});
  if (!parsed.success || !parsed.data.name || !parsed.data.key) {
    response.status(400).json({ error: "A file name and storage key are required." });
    return;
  }
  if (parsed.data.folderId) {
    const access = await folderAccess(parsed.data.folderId, request.user!.id);
    if (!access) {
      response.status(404).json({ error: "Folder not found." });
      return;
    }
  }
  const file = await prisma.docFile.create({
    data: {
      folderId: parsed.data.folderId || null,
      name: parsed.data.name,
      key: parsed.data.key,
      size: parsed.data.size ?? 0,
      mimeType: parsed.data.mimeType ?? "application/octet-stream",
      createdById: request.user!.id,
    },
    select: fileSelect,
  });
  response.status(201).json({ file });
});

router.get("/files/:fileId/download", async (request, response) => {
  const fileId = validateUuid(request.params.fileId);
  if (!fileId) {
    response.status(400).json({ error: "Invalid file id." });
    return;
  }
  const file = await prisma.docFile.findUnique({ where: { id: fileId }, select: { key: true, folderId: true, createdById: true } });
  if (!file) {
    response.status(404).json({ error: "File not found." });
    return;
  }
  const hasAccess = file.createdById === request.user!.id
    || (file.folderId ? (await folderAccess(file.folderId, request.user!.id)) !== null : false)
    || (await prisma.folder.findFirst({
        where: { id: file.folderId ?? "", sharedAll: true },
        select: { id: true },
      })) !== null;
  if (!hasAccess) {
    response.status(404).json({ error: "File not found." });
    return;
  }
  try {
    const download = await getPresignedUrlForGet(file.key);
    response.json({ download });
  } catch {
    response.status(500).json({ error: "Storage is not configured. Set the AWS_S3_* environment variables." });
  }
});

router.delete("/files/:fileId", async (request, response) => {
  const fileId = validateUuid(request.params.fileId);
  if (!fileId) {
    response.status(400).json({ error: "Invalid file id." });
    return;
  }
  const file = await prisma.docFile.findUnique({ where: { id: fileId }, select: { id: true, createdById: true, folderId: true } });
  if (!file) {
    response.status(404).json({ error: "File not found." });
    return;
  }
  const isOwner = file.createdById === request.user!.id
    || (file.folderId ? (await folderAccess(file.folderId, request.user!.id))?.role === "owner" : false);
  if (!isOwner) {
    response.status(404).json({ error: "File not found." });
    return;
  }
  await prisma.docFile.delete({ where: { id: fileId } });
  response.status(204).end();
});

/* --------------------------------- Teammates -------------------------------- */

router.get("/teammates", async (_request, response) => {
  const users = await generalPrisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  response.json({ users });
});

/* ---------------------------------- Sharing --------------------------------- */

const OWNER_ONLY_ERROR = { error: "Only the folder owner can manage sharing." } as const;

async function loadOwnedFolder(folderId: string, userId: string) {
  return prisma.folder.findFirst({
    where: { id: folderId, createdById: userId },
    select: { id: true },
  });
}

router.get("/folders/:folderId/shares", async (request, response) => {
  const folderId = validateUuid(request.params.folderId);
  if (!folderId) {
    response.status(400).json({ error: "Invalid folder id." });
    return;
  }
  const folder = await prisma.folder.findFirst({
    where: { id: folderId, createdById: request.user!.id },
    select: { sharedAll: true, publicSlug: true, shares: { select: { userId: true } } },
  });
  if (!folder) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }
  const userIds = folder.shares.map((share) => share.userId);
  const users = userIds.length
    ? await generalPrisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];
  response.json({ sharing: { sharedAll: folder.sharedAll, publicSlug: folder.publicSlug, users } });
});

router.patch("/folders/:folderId/shares", async (request, response) => {
  const folderId = validateUuid(request.params.folderId);
  if (!folderId) {
    response.status(400).json({ error: "Invalid folder id." });
    return;
  }
  const parsed = z.object({ sharedAll: z.boolean() }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "sharedAll must be a boolean." });
    return;
  }
  if (!(await loadOwnedFolder(folderId, request.user!.id))) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }
  await prisma.folder.update({ where: { id: folderId }, data: { sharedAll: parsed.data.sharedAll } });
  response.json({ sharing: { sharedAll: parsed.data.sharedAll } });
});

router.post("/folders/:folderId/shares/public", async (request, response) => {
  const folderId = validateUuid(request.params.folderId);
  if (!folderId) {
    response.status(400).json({ error: "Invalid folder id." });
    return;
  }
  if (!(await loadOwnedFolder(folderId, request.user!.id))) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }
  let publicSlug = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    publicSlug = randomBytes(9).toString("base64url");
    const clash = await prisma.folder.findFirst({ where: { publicSlug }, select: { id: true } });
    if (!clash) break;
    publicSlug = "";
  }
  if (!publicSlug) {
    response.status(500).json({ error: "Could not generate a public link. Try again." });
    return;
  }
  await prisma.folder.update({ where: { id: folderId }, data: { publicSlug } });
  response.status(201).json({ sharing: { publicSlug } });
});

router.delete("/folders/:folderId/shares/public", async (request, response) => {
  const folderId = validateUuid(request.params.folderId);
  if (!folderId) {
    response.status(400).json({ error: "Invalid folder id." });
    return;
  }
  if (!(await loadOwnedFolder(folderId, request.user!.id))) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }
  await prisma.folder.update({ where: { id: folderId }, data: { publicSlug: null } });
  response.json({ sharing: { publicSlug: null } });
});

router.post("/folders/:folderId/shares", async (request, response) => {
  const folderId = validateUuid(request.params.folderId);
  if (!folderId) {
    response.status(400).json({ error: "Invalid folder id." });
    return;
  }
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "A valid userId is required." });
    return;
  }
  if (!(await loadOwnedFolder(folderId, request.user!.id))) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }
  const targetUser = await generalPrisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
  if (!targetUser) {
    response.status(404).json({ error: "That teammate does not exist." });
    return;
  }
  const existingShare = await prisma.folderShare.findUnique({
    where: { folderId_userId: { folderId, userId: parsed.data.userId } },
    select: { id: true },
  });
  if (existingShare) {
    response.status(409).json({ error: "This folder is already shared with that person." });
    return;
  }
  await prisma.folderShare.create({ data: { folderId, userId: parsed.data.userId } });
  response.status(201).json({ message: "Folder shared." });
});

router.delete("/folders/:folderId/shares/:userId", async (request, response) => {
  const folderId = validateUuid(request.params.folderId);
  const userId = validateUuid(request.params.userId);
  if (!folderId || !userId) {
    response.status(400).json({ error: "Invalid folder or user id." });
    return;
  }
  if (!(await loadOwnedFolder(folderId, request.user!.id))) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }
  await prisma.folderShare.deleteMany({ where: { folderId, userId } });
  response.status(204).end();
});

export { router as documentsRouter };
