import { Router } from "express";
import { requireUser } from "@/general/api/services/require-user";

const router = Router();

router.get("/me", requireUser, (request, response) => {
  response.json({ user: request.user });
});

export { router as userRouter };
