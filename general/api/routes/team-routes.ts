import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/general/api/services/database";
import { EmailConfigurationError, sendInvitationEmail } from "@/general/api/services/email-service";
import { requireAdmin, requireUser } from "@/general/api/services/require-user";

const router = Router();
const invitationSchema = z.object({
  email: z.email().max(254).transform((email) => email.trim().toLowerCase()),
});
const INVITATION_DURATION_MS = 48 * 60 * 60 * 1000;

function getPublicOrigin(request: import("express").Request): string {
  const configuredUrl = process.env.APP_URL;
  if (!configuredUrl && process.env.NODE_ENV === "production") {
    throw new EmailConfigurationError("Set APP_URL to the public HTTPS origin before sending invitations.");
  }

  const host = request.get("host");
  if (!configuredUrl && !host) {
    throw new EmailConfigurationError("Could not determine the app URL. Set APP_URL before sending invitations.");
  }
  const url = new URL(configuredUrl ?? `${request.protocol}://${host}`);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    (process.env.NODE_ENV === "production" && url.protocol !== "https:")
  ) {
    throw new EmailConfigurationError("APP_URL must be a valid HTTP or HTTPS origin.");
  }
  return url.origin;
}

router.get("/members", requireUser, requireAdmin, async (_request, response) => {
  const [members, pendingInvitations] = await Promise.all([
    prisma.user.findMany({
      select: { id: true, email: true, role: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.invitation.findMany({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, email: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  response.json({ members, pendingInvitations });
});

router.post("/invitations", requireUser, requireAdmin, async (request, response) => {
  const parsed = invitationSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  const { email } = parsed.data;
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    response.status(409).json({ error: "A member with this email already exists." });
    return;
  }

  const pendingInvite = await prisma.invitation.findFirst({
    where: { email, acceptedAt: null, expiresAt: { gt: new Date() } },
    select: { id: true },
  });
  if (pendingInvite) {
    response.status(409).json({ error: "There is already an active invitation for this email." });
    return;
  }

  const inviterId = request.user?.id;
  if (!inviterId) {
    response.status(401).json({ error: "Authentication required." });
    return;
  }

  const token = randomBytes(32).toString("base64url");
  const invitation = await prisma.invitation.create({
    data: {
      email,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      invitedById: inviterId,
      expiresAt: new Date(Date.now() + INVITATION_DURATION_MS),
    },
  });

  try {
    const origin = getPublicOrigin(request);
    await sendInvitationEmail({
      email,
      inviteUrl: `${origin}/auth/signup?invite=${encodeURIComponent(token)}`,
    });
  } catch (error) {
    await prisma.invitation.delete({ where: { id: invitation.id } });
    console.error("Failed to send a member invitation email.", error);
    response.status(503).json({
      error: error instanceof EmailConfigurationError
        ? error.message
        : "The invitation email could not be delivered. Check the SMTP settings and try again.",
    });
    return;
  }

  response.status(201).json({
    invitation: { email, expiresAt: invitation.expiresAt },
    message: "Invitation email sent.",
  });
});

export { router as teamRouter };
