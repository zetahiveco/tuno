import { Router } from "express";
import { prisma } from "@/general/api/services/database";
import { requireUser } from "@/general/api/services/require-user";
import { isSupportedTimezone } from "@/lib/timezones";

const router = Router();
const defaults = {
  workspaceName: "Tuno workspace",
  timezone: "UTC",
} as const;

router.get("/", requireUser, async (_request, response) => {
  const rows = await prisma.setting.findMany();
  const saved = Object.fromEntries(rows.map(({ key, value }) => [key, value]));
  response.json({ settings: { ...defaults, ...saved } });
});

router.put("/", requireUser, async (request, response) => {
  const body: unknown = request.body;
  if (!body || typeof body !== "object" || !("settings" in body)) {
    response.status(400).json({ error: "Provide a settings object." });
    return;
  }

  const input = body.settings;
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    response.status(400).json({ error: "Provide a settings object." });
    return;
  }

  const settingsInput = input as Record<string, unknown>;
  const entries: [string, string][] = [];
  const allowed = new Set(Object.keys(defaults));
  for (const [key, value] of Object.entries(settingsInput)) {
    if (!allowed.has(key) || typeof value !== "string" || value.length > 120) {
      response.status(400).json({ error: "One or more settings are invalid." });
      return;
    }
    if (key === "timezone" && !isSupportedTimezone(value.trim())) {
      response.status(400).json({ error: "Choose a valid time zone." });
      return;
    }
    entries.push([key, key === "timezone" ? value.trim() : value]);
  }
  if (entries.length === 0) {
    response.status(400).json({ error: "One or more settings are invalid." });
    return;
  }

  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      }),
    ),
  );
  const rows = await prisma.setting.findMany();
  response.json({
    settings: {
      ...defaults,
      ...Object.fromEntries(rows.map(({ key, value }) => [key, value])),
    },
  });
});

export { router as settingsRouter };
