import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/general/api/services/database";
import { requireApiKey } from "@/general/api/services/require-api-key";
import { requireUser } from "@/general/api/services/require-user";

const router = Router();
const defaults = {
  workspaceName: "Tuno workspace",
  timezone: "UTC",
} as const;

// Info about the API key making the request.
router.get("/me", requireApiKey, (request, response) => {
  response.json({
    key: { name: request.apiKey!.name },
    user: request.user,
  });
});

// Read-only workspace snapshot, safe to expose to integrations holding a key.
router.get("/workspace", requireApiKey, async (_request, response) => {
  const [rows, memberCount] = await Promise.all([
    prisma.setting.findMany(),
    prisma.user.count(),
  ]);
  const saved = Object.fromEntries(rows.map(({ key, value }) => [key, value]));
  response.json({
    workspace: {
      name: saved.workspaceName ?? defaults.workspaceName,
      timezone: saved.timezone ?? defaults.timezone,
      memberCount,
    },
  });
});

export { router as publicRouter };