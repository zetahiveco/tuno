import type { NextFunction, Request, Response } from "express";
import { prisma } from "@/general/api/services/database";

declare global {
  namespace Express {
    interface Request {
      apiKey?: { id: string; name: string };
    }
  }
}

function extractApiKey(request: Request): string | null {
  const authorization = request.get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    const token = authorization.slice("bearer ".length).trim();
    if (token) return token;
  }

  const customHeader = request.get("x-api-key");
  const trimmed = customHeader?.trim();
  return trimmed ? trimmed : null;
}

export async function requireApiKey(
  request: Request,
  response: Response,
  next: NextFunction,
): Promise<void> {
  const key = extractApiKey(request);
  if (!key || key.length > 128) {
    response.status(401).json({
      error: "A valid API key is required. Pass it via the Authorization: Bearer header or the X-API-Key header.",
    });
    return;
  }

  const apiKey = await prisma.apiKey.findUnique({
    where: { key },
    include: { createdBy: true },
  });
  if (!apiKey) {
    response.status(401).json({ error: "This API key is invalid." });
    return;
  }
  if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) {
    response.status(401).json({ error: "This API key has expired." });
    return;
  }

  request.user = {
    id: apiKey.createdBy.id,
    name: apiKey.createdBy.name,
    email: apiKey.createdBy.email,
    role: apiKey.createdBy.role,
  };
  request.apiKey = { id: apiKey.key, name: apiKey.name };
  next();
}