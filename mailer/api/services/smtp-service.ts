import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { prisma } from "@/mailer/api/services/database";

export class MailerSmtpError extends Error {}

/* ------------------------------ Encryption ------------------------------ */

function encryptionKey(): Buffer {
  const secret = process.env.MAILER_SECRET || process.env.DATABASE_URL || "tuno-mailer-fallback";
  return scryptSync(secret, "tuno-mailer-smtp", 32);
}

export function encryptSecret(value: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
}

export function decryptSecret(value: string): string {
  const [ivHex, tagHex, dataHex] = value.split(":");
  if (!ivHex || !tagHex || !dataHex) throw new MailerSmtpError("Stored SMTP credentials are malformed.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

/* ------------------------------ Resolution ------------------------------ */

export type ResolvedSmtp = {
  transport: Transporter;
  from: string;
  source: "user" | "app";
};

function appSmtpFromEnv(): { host: string; port: number; user: string; pass: string; from: string } | null {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  // Fall back to the username only when it is itself a valid email; a bare
  // service username (e.g. "resend") is not a sendable `from` address and
  // gets rejected by providers with "550 Invalid from field".
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const from = process.env.SMTP_FROM ?? (user && EMAIL_PATTERN.test(user) ? user : "");
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !pass || !from) return null;
  return { host, port, user, pass, from };
}

/**
 * Resolve the SMTP transport for a user: their own configured server when
 * present, otherwise the app-wide SMTP_* environment variables.
 */
export async function resolveSmtp(userId: string): Promise<ResolvedSmtp | null> {
  const config = await prisma.smtpConfig.findUnique({ where: { userId } });
  if (config) {
    try {
      const password = decryptSecret(config.password);
      return {
        source: "user",
        from: config.fromEmail,
        transport: nodemailer.createTransport({
          host: config.host,
          port: config.port,
          secure: config.secure,
          auth: { user: config.username, pass: password },
        }),
      };
    } catch {
      throw new MailerSmtpError("Your SMTP credentials could not be read. Please re-enter your password.");
    }
  }

  const app = appSmtpFromEnv();
  if (!app) return null;
  return {
    source: "app",
    from: app.from,
    transport: nodemailer.createTransport({
      host: app.host,
      port: app.port,
      secure: app.port === 465,
      auth: { user: app.user, pass: app.pass },
    }),
  };
}

/** Whether the user has their own SMTP server configured. */
export async function smtpStatus(userId: string) {
  const config = await prisma.smtpConfig.findUnique({ where: { userId }, select: { id: true, host: true, port: true, secure: true, username: true, fromName: true, fromEmail: true, updatedAt: true } });
  return {
    hasCustomSmtp: Boolean(config),
    appFallbackAvailable: Boolean(appSmtpFromEnv()),
    config: config ?? null,
  };
}
