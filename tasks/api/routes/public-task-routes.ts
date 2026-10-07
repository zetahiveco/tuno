import { Router } from "express";
import { prisma as generalPrisma } from "@/general/api/services/database";
import { prisma } from "@/tasks/api/services/database";

const router = Router();

/** Read-only view of a publicly shared board. */
router.get("/boards/:slug", async (request, response) => {
  const slug = String(request.params.slug ?? "");
  if (!slug || slug.length > 64) {
    response.status(400).json({ error: "Invalid board link." });
    return;
  }
  const board = await prisma.board.findUnique({
    where: { publicSlug: slug },
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

  const assigneeIds = [
    ...new Set(
      board.cards
        .flatMap((card) => [card.assigneeId, ...card.subtasks.map((subtask) => subtask.assigneeId)])
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const users = assigneeIds.length
    ? await generalPrisma.user.findMany({
        where: { id: { in: assigneeIds } },
        select: { id: true, name: true },
      })
    : [];

  response.json({
    board: {
      name: board.name,
      color: board.color,
      columns: board.columns,
      cards: board.cards,
      assignees: users,
    },
  });
});

export { router as publicTasksRouter };
