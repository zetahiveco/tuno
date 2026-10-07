import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/general/api/services/database";
import { requireUser } from "@/general/api/services/require-user";

const router = Router();
const MAX_KEYS_PER_USER = 50;

const createKeySchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(100, "Name must be 100 characters or fewer."),
  expiresAt: z.iso.datetime({ offset: true }).nullish(),
});

router.get("/", requireUser, async (request, response) => {
  const userId = request.user!.id;
  const keys = await prisma.apiKey.findMany({
    where: { createdById: userId },
    orderBy: { createdAt: "desc" },
  });
  response.json({ keys });
});

router.post("/", requireUser, async (request, response) => {
  const parsed = createKeySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Provide a name (1–100 characters) and an optional ISO 8601 expiry date." });
    return;
  }

  const userId = request.user!.id;
  const count = await prisma.apiKey.count({ where: { createdById: userId } });
  if (count >= MAX_KEYS_PER_USER) {
    response.status(409).json({ error: `You can create at most ${MAX_KEYS_PER_USER} API keys.` });
    return;
  }

  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    response.status(400).json({ error: "The expiry date must be in the future." });
    return;
  }

  const apiKey = await prisma.apiKey.create({
    data: {
      name: parsed.data.name,
      expiresAt,
      createdById: userId,
    },
  });
  response.status(201).json({ key: apiKey });
});

router.delete("/:key", requireUser, async (request, response) => {
  const param = request.params.key;
  const key = Array.isArray(param) ? (param[0] ?? undefined) : param;
  if (typeof key !== "string" || key.length > 128) {
    response.status(404).json({ error: "This API key does not exist." });
    return;
  }

  const deleted = await prisma.apiKey.deleteMany({
    where: { key, createdById: request.user!.id },
  });
  if (deleted.count === 0) {
    response.status(404).json({ error: "This API key does not exist." });
    return;
  }
  response.status(204).end();
});

export { router as keyRouter };