import nodemailer from "nodemailer";

type InvitationEmail = {
  email: string;
  inviteUrl: string;
};

export class EmailConfigurationError extends Error {}

export async function sendInvitationEmail({ email, inviteUrl }: InvitationEmail): Promise<void> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 465);
  const user = process.env.SMTP_USER;
  const password = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user;

  if (!host || !Number.isInteger(port) || port < 1 || port > 65535 || !user || !password || !from) {
    throw new EmailConfigurationError("Email is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, and SMTP_FROM.");
  }

  const safeEmail = email.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  })[character] ?? character);

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass: password },
  });

  await transporter.sendMail({
    from,
    to: email,
    subject: "You're invited to join Tuno",
    text: `You've been invited to join a Tuno workspace. Accept your invitation within 48 hours: ${inviteUrl}`,
    html: `<p>You've been invited to join a Tuno workspace as a member.</p><p><a href="${inviteUrl}">Accept your invitation</a></p><p>This link expires in 48 hours and can only be used once.</p><p>If you weren't expecting this email, you can ignore it.</p><p>Invitation sent to ${safeEmail}.</p>`,
  });
}
