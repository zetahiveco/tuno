import { createHash } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "@/general/api/services/database";

const SESSION_COOKIE = "tuno_session";

declare global {
  namespace Express {
    interface UserIdentity {
      id: string;
      name: string;
      email: string;
      role: "ADMIN" | "MANAGER";
    }

    interface Request {
      user?: UserIdentity;
    }
  }
}

export async function requireUser(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const token = request.cookies[SESSION_COOKIE] as string | undefined;
  if (!token) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const session = await prisma.session.findUnique({
    where: { tokenHash },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.session.delete({ where: { tokenHash: session.tokenHash } });
    }
    response.status(401).json({ error: "Your session has expired. Please sign in again." });
    return;
  }

  request.user = {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
  };
  next();
}

export function requireAdmin(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  if (!request.user) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }
  if (request.user.role !== "ADMIN") {
    response.status(403).json({ error: "Only workspace admins can manage members." });
    return;
  }
  next();
}
