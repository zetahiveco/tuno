import { Router } from "express";
import { prisma } from "@/mailer/api/services/database";

// Public endpoints used by delivered emails: an invisible open-tracking pixel
// and a click redirect. Both are keyed by the SENT event id embedded in the
// message at send time — no session required.

const router = Router();

const TRANSPARENT_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

function validateUuid(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

/** Record a single engagement event (first time only per sent event). */
async function recordOnce(sourceId: string, type: "OPENED" | "CLICKED", meta: Record<string, string> = {}) {
  const source = await prisma.emailEvent.findUnique({ where: { id: sourceId } });
  if (!source || source.type !== "SENT") return null;

  const existing = await prisma.emailEvent.findFirst({
    where: { sourceId, type },
    select: { id: true },
  });
  if (existing) return source;

  await prisma.emailEvent.create({
    data: {
      campaignId: source.campaignId,
      email: source.email,
      type,
      sourceId,
      meta: JSON.stringify(meta),
    },
  });
  return source;
}

router.get("/open/:eventId.gif", async (request, response) => {
  const eventId = validateUuid(request.params.eventId);
  if (eventId) {
    await recordOnce(eventId, "OPENED").catch(() => undefined);
  }
  response.status(200).contentType("image/gif").send(TRANSPARENT_GIF);
});

router.get("/click/:eventId", async (request, response) => {
  const eventId = validateUuid(request.params.eventId);
  const target = typeof request.query.u === "string" ? request.query.u : "";
  if (!eventId || !/^https?:\/\//i.test(target)) {
    response.status(400).send("Invalid link.");
    return;
  }
  await recordOnce(eventId, "CLICKED", { url: target }).catch(() => undefined);
  response.redirect(302, target);
});

export { router as publicMailerRouter };
