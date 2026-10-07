import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/general/api/services/database";
import { requireUser } from "@/general/api/services/require-user";

const router = Router();
const nameSchema = z.string().trim().min(1, "Name is required.").max(80, "Name must be 80 characters or fewer.");

router.get("/me", requireUser, (request, response) => {
  response.json({ user: request.user });
});

router.patch("/me", requireUser, async (request, response) => {
  const body: unknown = request.body;
  const name = body && typeof body === "object" ? (body as Record<string, unknown>).name : undefined;
  const parsed = nameSchema.safeParse(name);
  if (!parsed.success) {
    response.status(400).json({ error: "Provide a name of 1–80 characters." });
    return;
  }

  const user = await prisma.user.update({
    where: { id: request.user!.id },
    data: { name: parsed.data },
    select: { id: true, name: true, email: true, role: true },
  });
  response.json({ user });
});

export { router as userRouter };