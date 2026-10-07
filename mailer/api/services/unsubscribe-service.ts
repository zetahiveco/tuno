import { createHmac, timingSafeEqual } from "node:crypto";
import { prisma } from "@/mailer/api/services/database";

// Stateless, signed unsubscribe links. A link embeds the contact id plus an
// HMAC signature, so no extra database rows are needed and links cannot be
// forged for arbitrary contacts.

function mailerSecret(): string {
  return process.env.MAILER_SECRET || process.env.DATABASE_URL || "tuno-mailer-fallback";
}

function sign(contactId: string): string {
  return createHmac("sha256", mailerSecret()).update(contactId).digest("base64url");
}

export function unsubscribeToken(contactId: string): string {
  return `${contactId}.${sign(contactId)}`;
}

/** Marks the contact unsubscribed. Returns false for invalid/expired tokens. */
export async function unsubscribeByToken(token: string): Promise<boolean> {
  const separator = token.indexOf(".");
  if (separator <= 0) return false;
  const contactId = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expected = Buffer.from(sign(contactId));
  const provided = Buffer.from(signature);
  if (expected.length !== provided.length || !timingSafeEqual(expected, provided)) return false;
  if (!/^[0-9a-f-]{36}$/i.test(contactId)) return false;

  const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { id: true } });
  if (!contact) return false;
  await prisma.contact.update({ where: { id: contactId }, data: { subscribed: false } });
  return true;
}

/** The footer text configured for the workspace (empty string when unset). */
export async function getFooterText(userId: string): Promise<string> {
  const settings = await prisma.settings.findUnique({ where: { userId }, select: { footerText: true } });
  return settings?.footerText ?? "";
}