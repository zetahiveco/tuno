import { prisma } from "@/mailer/api/services/database";
import { MailerSmtpError, resolveSmtp } from "@/mailer/api/services/smtp-service";
import {
  parseTemplateBlocks,
  renderEmailHtml,
  renderBlocksText,
  type InterpolationValues,
} from "@/mailer/shared/template-blocks";

const SEND_CONCURRENCY = 4;

export class MailerSendError extends Error {}

type Recipient = {
  id: string;
  email: string;
  name: string;
  props: string;
};

function parseJson(value: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function buildValues(recipient: Recipient | null, email: string, payload: Record<string, unknown>): InterpolationValues {
  const values: Record<string, string> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    values[key] = typeof value === "string" ? value : JSON.stringify(value);
  }
  if (recipient) {
    for (const [key, value] of Object.entries(parseJson(recipient.props))) {
      if (value === null || value === undefined) continue;
      if (values[key] === undefined) values[key] = typeof value === "string" ? value : JSON.stringify(value);
    }
  }
  values.email ??= email;
  values.name = values.name ?? recipient?.name ?? "";
  return values;
}

/** Send one rendered email. Returns the error message on failure. */
async function deliver(
  transport: import("nodemailer").Transporter,
  from: string,
  to: string,
  subject: string,
  html: string,
  text: string,
): Promise<string | null> {
  try {
    await transport.sendMail({ from, to, subject, html, text });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "The message could not be delivered.";
  }
}

export type SendCampaignResult = { sent: number; failed: number };

/** Fan a campaign out to every subscribed contact of the workspace owner. */
export async function sendCampaign(campaignId: string): Promise<SendCampaignResult> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new MailerSendError("Campaign not found.");
  if (campaign.status === "SENDING" || campaign.status === "SENT") throw new MailerSendError("This campaign has already been sent.");

  // Retrying a failed send starts from a clean slate.
  if (campaign.status === "FAILED") {
    await prisma.emailEvent.deleteMany({ where: { campaignId: campaign.id } });
  }

  const template = campaign.templateId
    ? await prisma.template.findFirst({ where: { id: campaign.templateId, userId: campaign.userId } })
    : null;
  if (!template) throw new MailerSendError("The template for this campaign no longer exists.");

  const resolved = await resolveSmtp(campaign.userId);
  if (!resolved) {
    throw new MailerSendError(
      "No SMTP server is available. Configure your own SMTP under Mailer → Overview, or set SMTP_HOST/SMTP_PORT/SMTP_USER/SMTP_PASS/SMTP_FROM for the app.",
    );
  }

  const transport = resolved.transport;
  const fromAddress = resolved.from;
  const campaignRecord = campaign;

  const blocks = parseTemplateBlocks(template.blocks);
  const payload = parseJson(campaign.payload);
  const recipients = await prisma.contact.findMany({
    where: { userId: campaign.userId, subscribed: true },
    select: { id: true, email: true, name: true, props: true },
    orderBy: { createdAt: "asc" },
  });

  await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "SENDING" } });

  // Create a SENT event per recipient up-front so tracking URLs are stable.
  const sentEvents = await prisma.emailEvent.createManyAndReturn({
    data: recipients.map((recipient) => ({
      campaignId: campaign.id,
      email: recipient.email,
      type: "SENT" as const,
    })),
    select: { id: true, email: true },
  });
  const eventIdByEmail = new Map(sentEvents.map((event) => [event.email, event.id]));
  const appUrl = process.env.APP_URL ?? "http://localhost:5000";
  const clickUrlBase = `${appUrl}/api/public/mailer/click`;

  let sent = 0;
  let failed = 0;
  const queue = [...recipients];

  async function worker() {
    for (;;) {
      const recipient = queue.shift();
      if (!recipient) return;

      const eventId = eventIdByEmail.get(recipient.email)!;
      const values = buildValues(recipient, recipient.email, payload);
      const subject = interpolateSubject(campaignRecord.subject, values);
      const html = renderEmailHtml({
        blocks,
        values,
        tracking: {
          clickUrlBase,
          openUrl: `${appUrl}/api/public/mailer/open/${eventId}.gif`,
        },
      });
      const text = renderBlocksText(blocks, values);

      const error = await deliver(transport, fromAddress, recipient.email, subject, html, text);
      if (error) {
        failed += 1;
        await prisma.emailEvent.update({
          where: { id: eventId },
          data: { type: "FAILED", meta: JSON.stringify({ error }) },
        });
      } else {
        sent += 1;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(SEND_CONCURRENCY, recipients.length || 1) }, () => worker()));

  const totalFailed = await prisma.emailEvent.count({ where: { campaignId: campaign.id, type: "FAILED" } });
  await prisma.campaign.update({
    where: { id: campaign.id },
    data: {
      status: "SENT",
      recipientCount: recipients.length,
      sentAt: new Date(),
    },
  });
  if (totalFailed === recipients.length && recipients.length > 0) {
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "FAILED" } });
  }

  return { sent, failed };
}

export function interpolateSubject(subject: string, values: InterpolationValues): string {
  return subject.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (_match, key: string) => values[key] ?? "");
}

/** Send a single test email for a template with the given sample values. */
export async function sendTestEmail(userId: string, templateId: string, to: string, payload: Record<string, unknown>, subjectOverride?: string): Promise<void> {
  const template = await prisma.template.findFirst({ where: { id: templateId, userId } });
  if (!template) throw new MailerSendError("Template not found.");

  const resolved = await resolveSmtp(userId);
  if (!resolved) throw new MailerSendError("No SMTP server is available. Configure SMTP first.");

  const values = buildValues(null, to, payload);
  const blocks = parseTemplateBlocks(template.blocks);
  const subject = interpolateSubject(subjectOverride || template.subject || template.name, values);
  const html = renderEmailHtml({ blocks, values });
  const error = await deliver(resolved.transport, resolved.from, to, subject, html, renderBlocksText(blocks, values));
  if (error) throw new MailerSendError(`Test email failed: ${error}`);
}
