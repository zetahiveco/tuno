import { randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma as generalPrisma } from "@/general/api/services/database";
import { requireUser } from "@/general/api/services/require-user";
import { prisma } from "@/tasks/api/services/database";

const router = Router();

router.use(requireUser);

const MAX_NAME_LENGTH = 120;
const MAX_TITLE_LENGTH = 300;
const MAX_DESCRIPTION_LENGTH = 10_000;

function validateUuid(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function parseDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

type BoardRole = "owner" | "edit";

/** Resolve the caller's access to a board: owner, edit (shared), or null. */
async function boardAccess(boardId: string, userId: string): Promise<{ boardId: string; role: BoardRole } | null> {
  const board = await prisma.board.findFirst({
    where: { id: boardId },
    select: { id: true, createdById: true, sharedAll: true, shares: { select: { userId: true } } },
  });
  if (!board) return null;
  if (board.createdById === userId) return { boardId, role: "owner" };
  if (board.sharedAll || board.shares.some((share) => share.userId === userId)) return { boardId, role: "edit" };
  return null;
}

const nameSchema = z.string().max(MAX_NAME_LENGTH).transform((name) => name.trim());
const titleSchema = z.string().max(MAX_TITLE_LENGTH).transform((title) => title.trim());
const descriptionSchema = z.string().max(MAX_DESCRIPTION_LENGTH);

/* ---------------------------------- Boards --------------------------------- */

const boardSelect = {
  id: true,
  name: true,
  color: true,
  createdById: true,
  sharedAll: true,
  publicSlug: true,
  _count: { select: { shares: true, cards: true } },
  createdAt: true,
  updatedAt: true,
} as const;

router.get("/boards", async (request, response) => {
  const userId = request.user!.id;
  const boards = await prisma.board.findMany({
    where: {
      OR: [
        { createdById: userId },
        { sharedAll: true },
        { shares: { some: { userId } } },
      ],
    },
    select: boardSelect,
    orderBy: { updatedAt: "desc" },
  });
  response.json({ boards: boards.map((board) => ({ ...board, role: board.createdById === userId ? "owner" : "edit" })) });
});

router.post("/boards", async (request, response) => {
  const parsed = z.object({ name: nameSchema, color: z.string().max(32).optional() }).safeParse(request.body ?? {});
  if (!parsed.success || !parsed.data.name) {
    response.status(400).json({ error: "A board name is required." });
    return;
  }
  const board = await prisma.board.create({
    data: { name: parsed.data.name, color: parsed.data.color ?? "#755984", createdById: request.user!.id },
    select: boardSelect,
  });
  const columnNames = ["To do", "In progress", "Done"];
  await prisma.boardColumn.createMany({
    data: columnNames.map((name, index) => ({ boardId: board.id, name, position: index })),
  });
  response.status(201).json({ board: { ...board, role: "owner" } });
});

router.get("/boards/:boardId", async (request, response) => {
  const boardId = validateUuid(request.params.boardId);
  if (!boardId) {
    response.status(400).json({ error: "Invalid board id." });
    return;
  }
  const access = await boardAccess(boardId, request.user!.id);
  if (!access) {
    response.status(404).json({ error: "Board not found." });
    return;
  }
  const board = await prisma.board.findUnique({
    where: { id: boardId },
    include: {
      columns: { orderBy: { position: "asc" } },
      cards: {
        where: { parentId: null },
        orderBy: { position: "asc" },
        include: { subtasks: { orderBy: { position: "asc" } } },
      },
    },
  });
  if (!board) {
    response.status(404).json({ error: "Board not found." });
    return;
  }
  // Assignable users: the owner plus everyone the board is shared with.
  const board2 = await prisma.board.findUnique({
    where: { id: boardId },
    select: { createdById: true, sharedAll: true, shares: { select: { userId: true } } },
  });
  let assignees: { id: string; name: string; email: string }[] = [];
  if (board2) {
    const sharedIds = [...new Set([board2.createdById, ...board2.shares.map((share) => share.userId)])];
    assignees = await generalPrisma.user.findMany({
      where: board2.sharedAll ? {} : { id: { in: sharedIds } },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
  }
  response.json({ board: { ...board, role: access.role, assignees } });
});

router.patch("/boards/:boardId", async (request, response) => {
  const boardId = validateUuid(request.params.boardId);
  if (!boardId) {
    response.status(400).json({ error: "Invalid board id." });
    return;
  }
  const parsed = z.object({ name: nameSchema, color: z.string().max(32) }).partial().safeParse(request.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Invalid board data." });
    return;
  }
  const existing = await prisma.board.findFirst({
    where: { id: boardId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Only the board owner can edit it." });
    return;
  }
  const board = await prisma.board.update({ where: { id: boardId }, data: parsed.data, select: boardSelect });
  response.json({ board });
});

router.delete("/boards/:boardId", async (request, response) => {
  const boardId = validateUuid(request.params.boardId);
  if (!boardId) {
    response.status(400).json({ error: "Invalid board id." });
    return;
  }
  const existing = await prisma.board.findFirst({
    where: { id: boardId, createdById: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Only the board owner can delete it." });
    return;
  }
  await prisma.board.delete({ where: { id: boardId } });
  response.status(204).end();
});

/* ---------------------------------- Columns -------------------------------- */

router.post("/boards/:boardId/columns", async (request, response) => {
  const boardId = validateUuid(request.params.boardId);
  if (!boardId) {
    response.status(400).json({ error: "Invalid board id." });
    return;
  }
  const parsed = z.object({ name: nameSchema }).safeParse(request.body ?? {});
  if (!parsed.success || !parsed.data.name) {
    response.status(400).json({ error: "A column name is required." });
    return;
  }
  const access = await boardAccess(boardId, request.user!.id);
  if (!access || access.role !== "owner") {
    response.status(404).json({ error: "Only the board owner can add columns." });
    return;
  }
  const count = await prisma.boardColumn.count({ where: { boardId } });
  const column = await prisma.boardColumn.create({
    data: { boardId, name: parsed.data.name, position: count },
  });
  response.status(201).json({ column });
});

router.patch("/columns/:columnId", async (request, response) => {
  const columnId = validateUuid(request.params.columnId);
  if (!columnId) {
    response.status(400).json({ error: "Invalid column id." });
    return;
  }
  const parsed = z.object({ name: nameSchema, position: z.number().int().min(0) }).partial().safeParse(request.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Invalid column data." });
    return;
  }
  const column = await prisma.boardColumn.findUnique({ where: { id: columnId }, select: { boardId: true } });
  if (!column) {
    response.status(404).json({ error: "Column not found." });
    return;
  }
  const access = await boardAccess(column.boardId, request.user!.id);
  if (!access || access.role !== "owner") {
    response.status(404).json({ error: "Only the board owner can edit columns." });
    return;
  }
  const updated = await prisma.boardColumn.update({ where: { id: columnId }, data: parsed.data });
  response.json({ column: updated });
});

router.delete("/columns/:columnId", async (request, response) => {
  const columnId = validateUuid(request.params.columnId);
  if (!columnId) {
    response.status(400).json({ error: "Invalid column id." });
    return;
  }
  const column = await prisma.boardColumn.findUnique({ where: { id: columnId }, select: { boardId: true } });
  if (!column) {
    response.status(404).json({ error: "Column not found." });
    return;
  }
  const access = await boardAccess(column.boardId, request.user!.id);
  if (!access || access.role !== "owner") {
    response.status(404).json({ error: "Only the board owner can delete columns." });
    return;
  }
  await prisma.boardColumn.delete({ where: { id: columnId } });
  response.status(204).end();
});

/* ----------------------------------- Cards --------------------------------- */

const cardInclude = {
  subtasks: { orderBy: { position: "asc" } },
} as const;

router.post("/boards/:boardId/cards", async (request, response) => {
  const boardId = validateUuid(request.params.boardId);
  if (!boardId) {
    response.status(400).json({ error: "Invalid board id." });
    return;
  }
  const parsed = z.object({
    columnId: z.string().uuid(),
    title: titleSchema,
    description: descriptionSchema.optional(),
    assigneeId: z.string().uuid().nullish(),
    dueDate: z.string().datetime().nullish(),
    parentId: z.string().uuid().nullish(),
  }).safeParse(request.body ?? {});
  if (!parsed.success || !parsed.data.title) {
    response.status(400).json({ error: "A card title is required." });
    return;
  }
  const access = await boardAccess(boardId, request.user!.id);
  if (!access) {
    response.status(404).json({ error: "Board not found." });
    return;
  }
  const column = await prisma.boardColumn.findFirst({ where: { id: parsed.data.columnId, boardId }, select: { id: true } });
  if (!column) {
    response.status(400).json({ error: "That column does not belong to this board." });
    return;
  }
  const count = await prisma.card.count({ where: { columnId: column.id } });
  const card = await prisma.card.create({
    data: {
      boardId,
      columnId: column.id,
      title: parsed.data.title,
      description: parsed.data.description ?? "",
      assigneeId: parsed.data.assigneeId || null,
      dueDate: parseDate(parsed.data.dueDate ?? undefined),
      parentId: parsed.data.parentId || null,
      position: count,
    },
    include: cardInclude,
  });
  response.status(201).json({ card });
});

router.patch("/cards/:cardId", async (request, response) => {
  const cardId = validateUuid(request.params.cardId);
  if (!cardId) {
    response.status(400).json({ error: "Invalid card id." });
    return;
  }
  const parsed = z.object({
    columnId: z.string().uuid().optional(),
    title: titleSchema.optional(),
    description: descriptionSchema.optional(),
    assigneeId: z.string().uuid().nullish(),
    dueDate: z.string().datetime().nullish(),
    position: z.number().int().min(0).optional(),
  }).safeParse(request.body);
  if (!parsed.success || Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Invalid card data." });
    return;
  }
  const card = await prisma.card.findUnique({ where: { id: cardId }, select: { boardId: true } });
  if (!card) {
    response.status(404).json({ error: "Card not found." });
    return;
  }
  const access = await boardAccess(card.boardId, request.user!.id);
  if (!access) {
    response.status(404).json({ error: "Card not found." });
    return;
  }
  const { dueDate, assigneeId, ...rest } = parsed.data;
  const data: Record<string, unknown> = { ...rest };
  if (assigneeId !== undefined) data.assigneeId = assigneeId || null;
  if (dueDate !== undefined) data.dueDate = parseDate(dueDate);
  if (parsed.data.columnId) {
    const column = await prisma.boardColumn.findFirst({
      where: { id: parsed.data.columnId, boardId: card.boardId },
      select: { id: true },
    });
    if (!column) {
      response.status(400).json({ error: "That column does not belong to this board." });
      return;
    }
  }
  const updated = await prisma.card.update({ where: { id: cardId }, data, include: cardInclude });
  response.json({ card: updated });
});

router.delete("/cards/:cardId", async (request, response) => {
  const cardId = validateUuid(request.params.cardId);
  if (!cardId) {
    response.status(400).json({ error: "Invalid card id." });
    return;
  }
  const card = await prisma.card.findUnique({ where: { id: cardId }, select: { boardId: true } });
  if (!card) {
    response.status(404).json({ error: "Card not found." });
    return;
  }
  const access = await boardAccess(card.boardId, request.user!.id);
  if (!access) {
    response.status(404).json({ error: "Card not found." });
    return;
  }
  await prisma.card.delete({ where: { id: cardId } });
  response.status(204).end();
});

/* ---------------------------------- Planner --------------------------------- */

router.get("/planner", async (request, response) => {
  const userId = request.user!.id;
  const accessible = await prisma.board.findMany({
    where: {
      OR: [{ createdById: userId }, { sharedAll: true }, { shares: { some: { userId } } }],
    },
    select: { id: true, name: true },
  });
  if (accessible.length === 0) {
    response.json({ cards: [] });
    return;
  }
  const cards = await prisma.card.findMany({
    where: { boardId: { in: accessible.map((board) => board.id) }, dueDate: { not: null } },
    select: {
      id: true,
      title: true,
      dueDate: true,
      boardId: true,
      assigneeId: true,
    },
  });
  const boardNames = new Map(accessible.map((board) => [board.id, board.name]));
  response.json({
    cards: cards.map((card) => ({ ...card, boardName: boardNames.get(card.boardId) ?? "" })),
  });
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

const OWNER_ONLY_ERROR = { error: "Only the board owner can manage sharing." } as const;

async function loadOwnedBoard(boardId: string, userId: string) {
  return prisma.board.findFirst({
    where: { id: boardId, createdById: userId },
    select: { id: true },
  });
}

router.get("/boards/:boardId/shares", async (request, response) => {
  const boardId = validateUuid(request.params.boardId);
  if (!boardId) {
    response.status(400).json({ error: "Invalid board id." });
    return;
  }
  const board = await prisma.board.findFirst({
    where: { id: boardId, createdById: request.user!.id },
    select: { sharedAll: true, publicSlug: true, shares: { select: { userId: true } } },
  });
  if (!board) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }
  const userIds = board.shares.map((share) => share.userId);
  const users = userIds.length
    ? await generalPrisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, name: true, email: true },
        orderBy: { name: "asc" },
      })
    : [];
  response.json({ sharing: { sharedAll: board.sharedAll, publicSlug: board.publicSlug, users } });
});

router.patch("/boards/:boardId/shares", async (request, response) => {
  const boardId = validateUuid(request.params.boardId);
  if (!boardId) {
    response.status(400).json({ error: "Invalid board id." });
    return;
  }
  const parsed = z.object({ sharedAll: z.boolean() }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "sharedAll must be a boolean." });
    return;
  }
  if (!(await loadOwnedBoard(boardId, request.user!.id))) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }
  await prisma.board.update({ where: { id: boardId }, data: { sharedAll: parsed.data.sharedAll } });
  response.json({ sharing: { sharedAll: parsed.data.sharedAll } });
});

router.post("/boards/:boardId/shares/public", async (request, response) => {
  const boardId = validateUuid(request.params.boardId);
  if (!boardId) {
    response.status(400).json({ error: "Invalid board id." });
    return;
  }
  if (!(await loadOwnedBoard(boardId, request.user!.id))) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }
  let publicSlug = "";
  for (let attempt = 0; attempt < 5; attempt += 1) {
    publicSlug = randomBytes(9).toString("base64url");
    const clash = await prisma.board.findFirst({ where: { publicSlug }, select: { id: true } });
    if (!clash) break;
    publicSlug = "";
  }
  if (!publicSlug) {
    response.status(500).json({ error: "Could not generate a public link. Try again." });
    return;
  }
  await prisma.board.update({ where: { id: boardId }, data: { publicSlug } });
  response.status(201).json({ sharing: { publicSlug } });
});

router.delete("/boards/:boardId/shares/public", async (request, response) => {
  const boardId = validateUuid(request.params.boardId);
  if (!boardId) {
    response.status(400).json({ error: "Invalid board id." });
    return;
  }
  if (!(await loadOwnedBoard(boardId, request.user!.id))) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }
  await prisma.board.update({ where: { id: boardId }, data: { publicSlug: null } });
  response.json({ sharing: { publicSlug: null } });
});

router.post("/boards/:boardId/shares", async (request, response) => {
  const boardId = validateUuid(request.params.boardId);
  if (!boardId) {
    response.status(400).json({ error: "Invalid board id." });
    return;
  }
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "A valid userId is required." });
    return;
  }
  if (!(await loadOwnedBoard(boardId, request.user!.id))) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }
  const targetUser = await generalPrisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true } });
  if (!targetUser) {
    response.status(404).json({ error: "That teammate does not exist." });
    return;
  }
  const existingShare = await prisma.boardShare.findUnique({
    where: { boardId_userId: { boardId, userId: parsed.data.userId } },
    select: { id: true },
  });
  if (existingShare) {
    response.status(409).json({ error: "This board is already shared with that person." });
    return;
  }
  await prisma.boardShare.create({ data: { boardId, userId: parsed.data.userId } });
  response.status(201).json({ message: "Board shared." });
});

router.delete("/boards/:boardId/shares/:userId", async (request, response) => {
  const boardId = validateUuid(request.params.boardId);
  const userId = validateUuid(request.params.userId);
  if (!boardId || !userId) {
    response.status(400).json({ error: "Invalid board or user id." });
    return;
  }
  if (!(await loadOwnedBoard(boardId, request.user!.id))) {
    response.status(404).json(OWNER_ONLY_ERROR);
    return;
  }
  await prisma.boardShare.deleteMany({ where: { boardId, userId } });
  response.status(204).end();
});

export { router as tasksRouter };
