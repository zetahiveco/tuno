import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/mailer/api/services/database";
import { requireUser } from "@/general/api/services/require-user";
import {
  MailerSendError,
  sendCampaign,
  sendTestEmail,
} from "@/mailer/api/services/mailer-service";
import { MailerSmtpError, encryptSecret, resolveSmtp, smtpStatus } from "@/mailer/api/services/smtp-service";
import { parseTemplateBlocks } from "@/mailer/shared/template-blocks";

const router = Router();
router.use(requireUser);

const MAX_NAME = 200;
const MAX_SUBJECT = 300;
const MAX_BLOCKS = 500;
const MAX_PROPS_BYTES = 16_000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validateUuid(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function parseProps(value: string): { ok: true; json: string } | { ok: false } {
  if (!value.trim()) return { ok: true, json: "{}" };
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false };
    const flat: Record<string, string> = {};
    for (const [key, entry] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof entry !== "string" && typeof entry !== "number" && typeof entry !== "boolean") return { ok: false };
      flat[key] = String(entry);
    }
    const json = JSON.stringify(flat);
    if (json.length > MAX_PROPS_BYTES) return { ok: false };
    return { ok: true, json };
  } catch {
    return { ok: false };
  }
}

function serializeContact(contact: { id: string; email: string; name: string; props: string; subscribed: boolean; createdAt: Date; updatedAt: Date }) {
  let props: Record<string, string> = {};
  try {
    props = JSON.parse(contact.props) as Record<string, string>;
  } catch {
    props = {};
  }
  return { ...contact, props };
}

/* --------------------------------- Contacts -------------------------------- */

const contactSchema = z.object({
  email: z.string().max(320).transform((value) => value.trim().toLowerCase()),
  name: z.string().max(MAX_NAME).transform((value) => value.trim()).optional(),
  props: z.string().max(MAX_PROPS_BYTES).optional(),
  subscribed: z.boolean().optional(),
});

router.get("/contacts", async (request, response) => {
  const search = typeof request.query.q === "string" ? request.query.q.trim() : "";
  const contacts = await prisma.contact.findMany({
    where: {
      userId: request.user!.id,
      ...(search
        ? { OR: [{ email: { contains: search, mode: "insensitive" } }, { name: { contains: search, mode: "insensitive" } }] }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 5_000,
  });
  response.json({ contacts: contacts.map(serializeContact) });
});

router.post("/contacts", async (request, response) => {
  const parsed = contactSchema.safeParse(request.body ?? {});
  if (!parsed.success || !EMAIL_PATTERN.test(parsed.data.email)) {
    response.status(400).json({ error: "A valid email address is required." });
    return;
  }
  const props = parseProps(parsed.data.props ?? "");
  if (!props.ok) {
    response.status(400).json({ error: "Custom properties must be a flat JSON object." });
    return;
  }

  try {
    const contact = await prisma.contact.create({
      data: {
        userId: request.user!.id,
        email: parsed.data.email,
        name: parsed.data.name ?? "",
        props: props.json,
        subscribed: parsed.data.subscribed ?? true,
      },
    });
    response.status(201).json({ contact: serializeContact(contact) });
  } catch {
    response.status(409).json({ error: "A contact with that email already exists." });
  }
});

router.post("/contacts/import", async (request, response) => {
  const parsed = z.object({ text: z.string().max(1_000_000) }).safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Provide the contacts to import." });
    return;
  }

  // Accepts CSV lines: "email" or "email,name" (header line optional).
  const seen = new Set<string>();
  const rows: { email: string; name: string }[] = [];
  for (const rawLine of parsed.data.text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const [emailField, nameField] = line.split(/[,;]/).map((part) => part.trim());
    const email = (emailField ?? "").toLowerCase();
    if (!EMAIL_PATTERN.test(email) || seen.has(email)) continue;
    seen.add(email);
    rows.push({ email, name: nameField ?? "" });
  }
  if (rows.length === 0) {
    response.status(400).json({ error: "No valid email addresses were found." });
    return;
  }

  let imported = 0;
  for (const row of rows) {
    const result = await prisma.contact.upsert({
      where: { userId_email: { userId: request.user!.id, email: row.email } },
      create: { userId: request.user!.id, email: row.email, name: row.name },
      update: { name: row.name || undefined },
      select: { id: true },
    });
    if (result) imported += 1;
  }
  response.status(201).json({ imported });
});

router.patch("/contacts/:contactId", async (request, response) => {
  const contactId = validateUuid(request.params.contactId);
  if (!contactId) {
    response.status(400).json({ error: "Invalid contact id." });
    return;
  }
  const parsed = contactSchema.partial().safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid contact data." });
    return;
  }
  const data: Record<string, unknown> = {};
  if (parsed.data.email !== undefined) {
    if (!EMAIL_PATTERN.test(parsed.data.email)) {
      response.status(400).json({ error: "A valid email address is required." });
      return;
    }
    data.email = parsed.data.email;
  }
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.subscribed !== undefined) data.subscribed = parsed.data.subscribed;
  if (parsed.data.props !== undefined) {
    const props = parseProps(parsed.data.props);
    if (!props.ok) {
      response.status(400).json({ error: "Custom properties must be a flat JSON object." });
      return;
    }
    data.props = props.json;
  }
  if (Object.keys(data).length === 0) {
    response.status(400).json({ error: "Nothing to update." });
    return;
  }

  const contact = await prisma.contact.updateMany({
    where: { id: contactId, userId: request.user!.id },
    data,
  });
  if (contact.count === 0) {
    response.status(404).json({ error: "Contact not found." });
    return;
  }
  const updated = await prisma.contact.findUnique({ where: { id: contactId } });
  response.json({ contact: updated ? serializeContact(updated) : null });
});

router.delete("/contacts/:contactId", async (request, response) => {
  const contactId = validateUuid(request.params.contactId);
  if (!contactId) {
    response.status(400).json({ error: "Invalid contact id." });
    return;
  }
  const deleted = await prisma.contact.deleteMany({ where: { id: contactId, userId: request.user!.id } });
  if (deleted.count === 0) {
    response.status(404).json({ error: "Contact not found." });
    return;
  }
  response.status(204).end();
});

/* -------------------------------- Templates -------------------------------- */

const blocksSchema = z
  .array(z.record(z.string(), z.unknown()))
  .max(MAX_BLOCKS)
  .transform((blocks) => JSON.stringify(blocks));

const templateSchema = z.object({
  name: z.string().max(MAX_NAME).transform((value) => value.trim()).optional(),
  subject: z.string().max(MAX_SUBJECT).transform((value) => value.trim()).optional(),
  blocks: blocksSchema.optional(),
});

const templateSummarySelect = {
  id: true,
  name: true,
  subject: true,
  createdAt: true,
  updatedAt: true,
} as const;

router.get("/templates", async (request, response) => {
  const templates = await prisma.template.findMany({
    where: { userId: request.user!.id },
    select: templateSummarySelect,
    orderBy: { updatedAt: "desc" },
  });
  response.json({ templates });
});

router.post("/templates", async (request, response) => {
  const parsed = templateSchema.safeParse(request.body ?? {});
  const template = await prisma.template.create({
    data: {
      userId: request.user!.id,
      name: "Untitled template",
      subject: parsed.data?.subject ?? "",
      blocks: parsed.data?.blocks ?? JSON.stringify([]),
    },
    select: templateSummarySelect,
  });
  response.status(201).json({ template });
});

router.get("/templates/:templateId", async (request, response) => {
  const templateId = validateUuid(request.params.templateId);
  if (!templateId) {
    response.status(400).json({ error: "Invalid template id." });
    return;
  }
  const template = await prisma.template.findFirst({
    where: { id: templateId, userId: request.user!.id },
  });
  if (!template) {
    response.status(404).json({ error: "Template not found." });
    return;
  }
  response.json({ template: { ...template, blockList: parseTemplateBlocks(template.blocks) } });
});

router.patch("/templates/:templateId", async (request, response) => {
  const templateId = validateUuid(request.params.templateId);
  if (!templateId) {
    response.status(400).json({ error: "Invalid template id." });
    return;
  }
  const parsed = templateSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid template data." });
    return;
  }
  const existing = await prisma.template.findFirst({
    where: { id: templateId, userId: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Template not found." });
    return;
  }
  const template = await prisma.template.update({
    where: { id: templateId },
    data: parsed.data,
    select: templateSummarySelect,
  });
  response.json({ template });
});

router.post("/templates/:templateId/test", async (request, response) => {
  const templateId = validateUuid(request.params.templateId);
  if (!templateId) {
    response.status(400).json({ error: "Invalid template id." });
    return;
  }
  const parsed = z.object({ to: z.string().max(320) }).safeParse(request.body ?? {});
  if (!parsed.success || !EMAIL_PATTERN.test(parsed.data.to.trim().toLowerCase())) {
    response.status(400).json({ error: "A valid email address is required." });
    return;
  }
  try {
    await sendTestEmail(request.user!.id, templateId, parsed.data.to.trim().toLowerCase(), {});
    response.json({ ok: true });
  } catch (error) {
    const message = error instanceof MailerSendError || error instanceof MailerSmtpError ? error.message : "The test email could not be sent.";
    response.status(400).json({ error: message });
  }
});

router.delete("/templates/:templateId", async (request, response) => {
  const templateId = validateUuid(request.params.templateId);
  if (!templateId) {
    response.status(400).json({ error: "Invalid template id." });
    return;
  }
  // Detach campaigns instead of cascading deletes; they keep a templateId
  // reference but already snapshot nothing — they simply lose the link.
  await prisma.campaign.updateMany({ where: { templateId, userId: request.user!.id }, data: { templateId: null } });
  const deleted = await prisma.template.deleteMany({ where: { id: templateId, userId: request.user!.id } });
  if (deleted.count === 0) {
    response.status(404).json({ error: "Template not found." });
    return;
  }
  response.status(204).end();
});

/* -------------------------------- Campaigns -------------------------------- */

const campaignSchema = z.object({
  name: z.string().max(MAX_NAME).transform((value) => value.trim()).optional(),
  subject: z.string().max(MAX_SUBJECT).transform((value) => value.trim()).optional(),
  templateId: z.string().uuid().nullish(),
  payload: z.string().max(MAX_PROPS_BYTES).optional(),
});

const campaignSummarySelect = {
  id: true,
  name: true,
  subject: true,
  templateId: true,
  status: true,
  recipientCount: true,
  sentAt: true,
  createdAt: true,
} as const;

router.get("/campaigns", async (request, response) => {
  const campaigns = await prisma.campaign.findMany({
    where: { userId: request.user!.id },
    select: { ...campaignSummarySelect, _count: { select: { events: true } } },
    orderBy: { createdAt: "desc" },
  });
  response.json({ campaigns });
});

router.post("/campaigns", async (request, response) => {
  const parsed = campaignSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid campaign data." });
    return;
  }
  if (parsed.data.templateId) {
    const template = await prisma.template.findFirst({
      where: { id: parsed.data.templateId, userId: request.user!.id },
      select: { id: true },
    });
    if (!template) {
      response.status(400).json({ error: "The selected template does not exist." });
      return;
    }
  }
  const payload = parseProps(parsed.data.payload ?? "");
  if (!payload.ok) {
    response.status(400).json({ error: "The custom payload must be a flat JSON object." });
    return;
  }
  const campaign = await prisma.campaign.create({
    data: {
      userId: request.user!.id,
      name: parsed.data.name ?? "Untitled campaign",
      subject: parsed.data.subject ?? "",
      templateId: parsed.data.templateId ?? null,
      payload: payload.json,
    },
    select: campaignSummarySelect,
  });
  response.status(201).json({ campaign });
});

router.patch("/campaigns/:campaignId", async (request, response) => {
  const campaignId = validateUuid(request.params.campaignId);
  if (!campaignId) {
    response.status(400).json({ error: "Invalid campaign id." });
    return;
  }
  const parsed = campaignSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid campaign data." });
    return;
  }
  const existing = await prisma.campaign.findFirst({
    where: { id: campaignId, userId: request.user!.id },
    select: { id: true, status: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Campaign not found." });
    return;
  }
  if (existing.status !== "DRAFT") {
    response.status(409).json({ error: "Sent campaigns can no longer be edited." });
    return;
  }
  const payload = parseProps(parsed.data.payload ?? "{}");
  if (!payload.ok) {
    response.status(400).json({ error: "The custom payload must be a flat JSON object." });
    return;
  }
  const campaign = await prisma.campaign.update({
    where: { id: campaignId },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.subject !== undefined ? { subject: parsed.data.subject } : {}),
      ...(parsed.data.templateId !== undefined ? { templateId: parsed.data.templateId ?? null } : {}),
      ...(parsed.data.payload !== undefined ? { payload: payload.json } : {}),
    },
    select: campaignSummarySelect,
  });
  response.json({ campaign });
});

router.delete("/campaigns/:campaignId", async (request, response) => {
  const campaignId = validateUuid(request.params.campaignId);
  if (!campaignId) {
    response.status(400).json({ error: "Invalid campaign id." });
    return;
  }
  const deleted = await prisma.campaign.deleteMany({ where: { id: campaignId, userId: request.user!.id } });
  if (deleted.count === 0) {
    response.status(404).json({ error: "Campaign not found." });
    return;
  }
  response.status(204).end();
});

router.post("/campaigns/:campaignId/send", async (request, response) => {
  const campaignId = validateUuid(request.params.campaignId);
  if (!campaignId) {
    response.status(400).json({ error: "Invalid campaign id." });
    return;
  }
  const parsed = z.object({ testEmail: z.string().max(320).optional() }).safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid send request." });
    return;
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId: request.user!.id },
  });
  if (!campaign) {
    response.status(404).json({ error: "Campaign not found." });
    return;
  }
  if (campaign.status !== "DRAFT" && campaign.status !== "FAILED") {
    response.status(409).json({ error: "This campaign has already been sent." });
    return;
  }

  const template = campaign.templateId
    ? await prisma.template.findFirst({ where: { id: campaign.templateId, userId: request.user!.id } })
    : null;
  if (!template) {
    response.status(400).json({ error: "Pick a template before sending." });
    return;
  }
  if (!campaign.subject.trim()) {
    response.status(400).json({ error: "Add a subject line before sending." });
    return;
  }

  // Test send to a single address.
  if (parsed.data.testEmail) {
    const testEmail = parsed.data.testEmail.trim().toLowerCase();
    if (!EMAIL_PATTERN.test(testEmail)) {
      response.status(400).json({ error: "A valid email address is required for the test send." });
      return;
    }
    try {
      const payload = JSON.parse(campaign.payload) as Record<string, unknown>;
      await sendTestEmail(request.user!.id, template.id, testEmail, payload, campaign.subject);
      response.json({ test: true });
    } catch (error) {
      const message = error instanceof MailerSendError || error instanceof MailerSmtpError ? error.message : "The test email could not be sent.";
      response.status(400).json({ error: message });
    }
    return;
  }

  const audienceCount = await prisma.contact.count({ where: { userId: request.user!.id, subscribed: true } });
  if (audienceCount === 0) {
    response.status(400).json({ error: "Your audience is empty. Add subscribed contacts first." });
    return;
  }

  try {
    const result = await sendCampaign(campaign.id);
    response.json({ sent: result.sent, failed: result.failed });
  } catch (error) {
    await prisma.campaign.update({ where: { id: campaign.id }, data: { status: "FAILED" } }).catch(() => undefined);
    const message = error instanceof MailerSendError || error instanceof MailerSmtpError ? error.message : "The campaign could not be sent.";
    response.status(400).json({ error: message });
  }
});

router.get("/campaigns/:campaignId/events", async (request, response) => {
  const campaignId = validateUuid(request.params.campaignId);
  if (!campaignId) {
    response.status(400).json({ error: "Invalid campaign id." });
    return;
  }
  const campaign = await prisma.campaign.findFirst({
    where: { id: campaignId, userId: request.user!.id },
    select: { id: true },
  });
  if (!campaign) {
    response.status(404).json({ error: "Campaign not found." });
    return;
  }
  const events = await prisma.emailEvent.findMany({
    where: { campaignId },
    orderBy: { createdAt: "desc" },
    take: 1_000,
  });
  response.json({ events });
});

/* --------------------------------- Analytics -------------------------------- */

router.get("/analytics", async (request, response) => {
  const userId = request.user!.id;
  const since = new Date();
  since.setDate(since.getDate() - 29);
  since.setHours(0, 0, 0, 0);

  const campaignIds = (
    await prisma.campaign.findMany({ where: { userId }, select: { id: true } })
  ).map((campaign) => campaign.id);

  const events = campaignIds.length
    ? await prisma.emailEvent.findMany({
        where: { campaignId: { in: campaignIds }, createdAt: { gte: since } },
        select: { type: true, createdAt: true },
      })
    : [];

  const dayKey = (date: Date) => date.toISOString().slice(0, 10);
  const seriesMap = new Map<string, { date: string; sent: number; opened: number; clicked: number }>();
  for (let index = 29; index >= 0; index -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - index);
    const key = dayKey(date);
    seriesMap.set(key, { date: key, sent: 0, opened: 0, clicked: 0 });
  }
  for (const event of events) {
    const entry = seriesMap.get(dayKey(event.createdAt));
    if (!entry) continue;
    if (event.type === "SENT" || event.type === "FAILED") entry.sent += 1;
    if (event.type === "OPENED") entry.opened += 1;
    if (event.type === "CLICKED") entry.clicked += 1;
  }

  const [totalSent, totalOpened, totalClicked, totalFailed, contacts, subscribedContacts, templates] = await Promise.all([
    campaignIds.length ? prisma.emailEvent.count({ where: { campaignId: { in: campaignIds }, type: "SENT" } }) : 0,
    campaignIds.length ? prisma.emailEvent.count({ where: { campaignId: { in: campaignIds }, type: "OPENED" } }) : 0,
    campaignIds.length ? prisma.emailEvent.count({ where: { campaignId: { in: campaignIds }, type: "CLICKED" } }) : 0,
    campaignIds.length ? prisma.emailEvent.count({ where: { campaignId: { in: campaignIds }, type: "FAILED" } }) : 0,
    prisma.contact.count({ where: { userId } }),
    prisma.contact.count({ where: { userId, subscribed: true } }),
    prisma.template.count({ where: { userId } }),
  ]);

  response.json({
    analytics: {
      series: [...seriesMap.values()],
      totals: {
        sent: totalSent,
        opened: totalOpened,
        clicked: totalClicked,
        failed: totalFailed,
        openRate: totalSent > 0 ? Math.round((totalOpened / totalSent) * 1000) / 10 : 0,
        clickRate: totalSent > 0 ? Math.round((totalClicked / totalSent) * 1000) / 10 : 0,
        contacts,
        subscribedContacts,
        templates,
      },
    },
  });
});

/* --------------------------------- SMTP --------------------------------- */

const smtpSchema = z.object({
  host: z.string().min(1).max(255).transform((value) => value.trim()),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().min(1).max(255).transform((value) => value.trim()),
  // Optional when updating: an empty password keeps the stored one.
  password: z.string().max(500).optional(),
  fromName: z.string().max(MAX_NAME).transform((value) => value.trim()).optional(),
  fromEmail: z.string().max(320).transform((value) => value.trim()).optional(),
});

router.get("/smtp", async (request, response) => {
  const status = await smtpStatus(request.user!.id);
  response.json(status);
});

router.put("/smtp", async (request, response) => {
  const parsed = smtpSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "SMTP host, port, username and password are required." });
    return;
  }
  const fromEmail = parsed.data.fromEmail || parsed.data.username;
  if (!EMAIL_PATTERN.test(fromEmail)) {
    response.status(400).json({ error: "The from address must be a valid email." });
    return;
  }

  const existing = await prisma.smtpConfig.findUnique({ where: { userId: request.user!.id }, select: { id: true } });
  if (!existing && !parsed.data.password) {
    response.status(400).json({ error: "An SMTP password is required." });
    return;
  }

  const select = { id: true, host: true, port: true, secure: true, username: true, fromName: true, fromEmail: true, updatedAt: true } as const;

  if (existing) {
    const data = {
      host: parsed.data.host,
      port: parsed.data.port,
      secure: parsed.data.secure,
      username: parsed.data.username,
      ...(parsed.data.password ? { password: encryptSecret(parsed.data.password) } : {}),
      fromName: parsed.data.fromName ?? "",
      fromEmail,
    };
    const config = await prisma.smtpConfig.update({ where: { id: existing.id }, data, select });
    response.json({ config });
    return;
  }

  const config = await prisma.smtpConfig.create({
    data: {
      userId: request.user!.id,
      host: parsed.data.host,
      port: parsed.data.port,
      secure: parsed.data.secure,
      username: parsed.data.username,
      password: encryptSecret(parsed.data.password as string),
      fromName: parsed.data.fromName ?? "",
      fromEmail,
    },
    select,
  });
  response.json({ config });
});

router.delete("/smtp", async (request, response) => {
  await prisma.smtpConfig.deleteMany({ where: { userId: request.user!.id } });
  response.status(204).end();
});

router.post("/smtp/test", async (request, response) => {
  const parsed = z.object({ to: z.string().max(320) }).safeParse(request.body ?? {});
  if (!parsed.success || !EMAIL_PATTERN.test(parsed.data.to.trim().toLowerCase())) {
    response.status(400).json({ error: "A valid email address is required." });
    return;
  }
  const resolved = await resolveSmtp(request.user!.id);
  if (!resolved) {
    response.status(400).json({ error: "No SMTP server is available. Configure one below, or set the app's SMTP_* environment variables." });
    return;
  }
  try {
    await resolved.transport.sendMail({
      from: resolved.from,
      to: parsed.data.to.trim().toLowerCase(),
      subject: "Tuno Mailer — SMTP test",
      text: "Your SMTP configuration works. This is a test email from Tuno Mailer.",
      html: '<p style="font-family:sans-serif;">Your SMTP configuration works. This is a test email from Tuno Mailer.</p>',
    });
    response.json({ ok: true, source: resolved.source });
  } catch (error) {
    response.status(400).json({ error: `SMTP test failed: ${error instanceof Error ? error.message : "unknown error"}` });
  }
});

export { router as mailerRouter };
