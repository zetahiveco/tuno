import { createHash, randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { Prisma } from "@/general/generated/client/client";
import { prisma } from "@/general/api/services/database";

const SESSION_COOKIE = "tuno_session";
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const router = Router();

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function setSessionCookie(response: Response, token: string): void {
  response.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION_MS,
  });
}

async function createSession(userId: string, response: Response): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + SESSION_DURATION_MS),
    },
  });
  setSessionCookie(response, token);
}

function readCredentials(request: Request): { email: string; password: string } | null {
  const body: unknown = request.body;
  if (!body || typeof body !== "object") return null;
  const values = body as Record<string, unknown>;
  if (typeof values.email !== "string" || typeof values.password !== "string") return null;

  const email = values.email.trim().toLowerCase();
  const password = values.password;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (password.length < 8 || password.length > 128) return null;
  return { email, password };
}

router.get("/registration-status", async (_request, response) => {
  const count = await prisma.user.count();
  response.json({ registrationOpen: count === 0 });
});

router.get("/invitations/:token", async (request, response) => {
  const token = request.params.token;
  if (!token || token.length > 128) {
    response.status(404).json({ error: "This invitation is invalid or has expired." });
    return;
  }

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { email: true, expiresAt: true, acceptedAt: true },
  });
  if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
    response.status(404).json({ error: "This invitation is invalid or has expired." });
    return;
  }
  response.json({ email: invitation.email });
});

router.post("/invitations/accept", async (request, response) => {
  const body: unknown = request.body;
  if (!body || typeof body !== "object") {
    response.status(400).json({ error: "Invitation details are required." });
    return;
  }
  const values = body as Record<string, unknown>;
  if (typeof values.token !== "string" || values.token.length > 128 || typeof values.password !== "string" || values.password.length < 8 || values.password.length > 128) {
    response.status(400).json({ error: "Enter a valid invitation and a password of 8–128 characters." });
    return;
  }

  const tokenHash = hashToken(values.token);
  let user;
  try {
    user = await prisma.$transaction(async (transaction) => {
      const invitation = await transaction.invitation.findUnique({ where: { tokenHash } });
      if (!invitation || invitation.acceptedAt || invitation.expiresAt <= new Date()) return null;

      const createdUser = await transaction.user.create({
        data: {
          email: invitation.email,
          passwordHash: await Bun.password.hash(values.password as string, { algorithm: "argon2id" }),
          role: "MANAGER",
        },
      });
      const accepted = await transaction.invitation.updateMany({
        where: { id: invitation.id, acceptedAt: null, expiresAt: { gt: new Date() } },
        data: { acceptedAt: new Date() },
      });
      if (accepted.count !== 1) throw new Error("This invitation has already been used or expired.");
      return createdUser;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      response.status(409).json({ error: "An account with this email already exists." });
      return;
    }
    if (error instanceof Error && error.message === "This invitation has already been used or expired.") {
      response.status(409).json({ error: error.message });
      return;
    }
    throw error;
  }

  if (!user) {
    response.status(404).json({ error: "This invitation is invalid or has expired." });
    return;
  }

  await createSession(user.id, response);
  response.status(201).json({ user: { id: user.id, email: user.email, role: user.role } });
});

router.post("/signup", async (request, response) => {
  const credentials = readCredentials(request);
  if (!credentials) {
    response.status(400).json({ error: "Enter a valid email and a password of 8–128 characters." });
    return;
  }

  let user;
  try {
    user = await prisma.$transaction(async (transaction) => {
      if (await transaction.user.count() > 0) return null;

      const createdUser = await transaction.user.create({
        data: {
          email: credentials.email,
          passwordHash: await Bun.password.hash(credentials.password, { algorithm: "argon2id" }),
          role: "ADMIN",
        },
      });
      await transaction.bootstrapState.create({
        data: { id: "bootstrap", userId: createdUser.id },
      });
      return createdUser;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      response.status(409).json({ error: "An account already exists. Please sign in." });
      return;
    }
    if (await prisma.user.count() > 0) {
      response.status(409).json({ error: "Registration is closed. Please sign in." });
      return;
    }
    throw error;
  }

  if (!user) {
    response.status(409).json({ error: "Registration is closed. Please sign in." });
    return;
  }

  await createSession(user.id, response);
  response.status(201).json({
    user: { id: user.id, email: user.email, role: user.role },
  });
});

router.post("/login", async (request, response) => {
  const credentials = readCredentials(request);
  if (!credentials) {
    response.status(400).json({ error: "Enter a valid email and password." });
    return;
  }

  const user = await prisma.user.findUnique({ where: { email: credentials.email } });
  const passwordMatches = user
    ? await Bun.password.verify(credentials.password, user.passwordHash)
    : false;
  if (!user || !passwordMatches) {
    response.status(401).json({ error: "Email or password is incorrect." });
    return;
  }

  await createSession(user.id, response);
  response.json({ user: { id: user.id, email: user.email, role: user.role } });
});

router.post("/logout", async (request, response) => {
  const token = request.cookies[SESSION_COOKIE] as string | undefined;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  response.clearCookie(SESSION_COOKIE, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
  response.status(204).end();
});

router.get("/me", async (request, response) => {
  const token = request.cookies[SESSION_COOKIE] as string | undefined;
  if (!token) {
    response.status(401).json({ error: "Not signed in." });
    return;
  }

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.session.delete({ where: { tokenHash: session.tokenHash } });
    }
    response.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    });
    response.status(401).json({ error: "Your session has expired. Please sign in again." });
    return;
  }

  response.json({
    user: { id: session.user.id, email: session.user.email, role: session.user.role },
  });
});

export { router as authRouter };
