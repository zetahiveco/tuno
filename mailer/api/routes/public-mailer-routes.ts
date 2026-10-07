import { Router } from "express";
import { prisma } from "@/mailer/api/services/database";
import { unsubscribeByToken } from "@/mailer/api/services/unsubscribe-service";

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

const UNSUBSCRIBE_PAGE_STYLE =
  'margin:0;padding:48px 16px;background:#f1eef4;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;display:grid;place-items:center;min-height:100vh;';

router.get("/unsubscribe/:token", async (request, response) => {
  const token = typeof request.params.token === "string" ? request.params.token.slice(0, 200) : "";
  const unsubscribed = token ? await unsubscribeByToken(token).catch(() => false) : false;

  response.status(200).contentType("html").send(`<!doctype html>
<html>
  <head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>Unsubscribe</title></head>
  <body style="${UNSUBSCRIBE_PAGE_STYLE}">
    <div style="max-width:420px;width:100%;background:#ffffff;border:1px solid #e8e4ee;border-radius:12px;padding:32px;text-align:center;color:#3a3440;">
      <div style="font-size:28px;">${unsubscribed ? "✅" : "⚠️"}</div>
      <h1 style="margin:12px 0 6px;font-size:18px;">${unsubscribed ? "You're unsubscribed" : "This link is no longer valid"}</h1>
      <p style="margin:0;font-size:13px;line-height:1.6;color:#847b89;">${
        unsubscribed
          ? "You won't receive any further campaigns from this workspace. Sorry to see you go!"
          : "The unsubscribe link is invalid or has already been used. If you keep receiving emails, contact the sender directly."
      }</p>
    </div>
  </body>
</html>`);
});

export { router as publicMailerRouter };
