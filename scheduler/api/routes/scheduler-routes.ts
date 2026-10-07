import { Router } from "express";
import { z } from "zod";
import { prisma as generalPrisma } from "@/general/api/services/database";
import { requireUser } from "@/general/api/services/require-user";
import { prisma } from "@/scheduler/api/services/database";
import { DEFAULT_AVAILABILITY, timeToMinutes, minutesToTime } from "@/scheduler/shared/slots";

const router = Router();

const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 2_000;
const DURATIONS = [15, 30, 45, 60, 90, 120] as const;
const WEEKDAYS = 7;

const titleSchema = z.string().max(MAX_TITLE_LENGTH).transform((title) => title.trim());
const descriptionSchema = z.string().max(MAX_DESCRIPTION_LENGTH).transform((value) => value.trim());
const slugSchema = z
  .string()
  .min(3)
  .max(48)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Use lowercase letters, numbers, and dashes.");
const durationSchema = z.number().int().refine((value) => (DURATIONS as readonly number[]).includes(value), "Unsupported duration.");
const colorSchema = z.string().regex(/^#[0-9a-f]{6}$/i, "Pick a color.");
const locationSchema = z.string().max(120).transform((value) => value.trim());

const createEventTypeSchema = z.object({
  title: titleSchema.optional(),
  description: descriptionSchema.optional(),
  slug: slugSchema.optional(),
  durationMinutes: durationSchema.optional(),
  location: locationSchema.optional(),
  color: colorSchema.optional(),
});

const updateEventTypeSchema = z
  .object({
    title: titleSchema,
    description: descriptionSchema,
    slug: slugSchema,
    durationMinutes: durationSchema,
    location: locationSchema,
    color: colorSchema,
    active: z.boolean(),
  })
  .partial();

const availabilityDaySchema = z.object({
  weekday: z.number().int().min(0).max(6),
  enabled: z.boolean(),
  start: z.string(),
  end: z.string(),
});

const availabilitySchema = z.object({
  days: z.array(availabilityDaySchema).length(WEEKDAYS),
});

function validateUuid(value: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

function slugifyTitle(title: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return base.length >= 3 ? base : "meeting";
}

async function uniqueSlug(candidate: string, ignoreId?: string): Promise<string | null> {
  let slug = candidate;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const clash = await prisma.eventType.findFirst({ where: { slug, ...(ignoreId ? { id: { not: ignoreId } } : {}) }, select: { id: true } });
    if (!clash) return slug;
    slug = `${candidate}-${Math.random().toString(36).slice(2, 6)}`;
  }
  return null;
}

router.use(requireUser);

/* -------------------------------- Who am I -------------------------------- */

// Used by the booking page header and the event type link builder.
router.get("/me", async (request, response) => {
  response.json({ user: { name: request.user!.name, email: request.user!.email } });
});

/* ------------------------------- Event types ------------------------------ */

const eventTypeSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  durationMinutes: true,
  location: true,
  color: true,
  active: true,
  createdAt: true,
  updatedAt: true,
  _count: { select: { bookings: true } },
} as const;

router.get("/event-types", async (request, response) => {
  const eventTypes = await prisma.eventType.findMany({
    where: { userId: request.user!.id },
    select: eventTypeSelect,
    orderBy: { createdAt: "asc" },
  });
  response.json({ eventTypes });
});

router.post("/event-types", async (request, response) => {
  const parsed = createEventTypeSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid event type data." });
    return;
  }

  const title = parsed.data.title || "New meeting";
  const slug = await uniqueSlug(parsed.data.slug ?? slugifyTitle(title));
  if (!slug) {
    response.status(409).json({ error: "Could not find a free link. Try a different one." });
    return;
  }

  const eventType = await prisma.eventType.create({
    data: {
      title,
      slug,
      description: parsed.data.description ?? "",
      durationMinutes: parsed.data.durationMinutes ?? 30,
      location: parsed.data.location ?? "Google Meet",
      color: parsed.data.color ?? "#292927",
      userId: request.user!.id,
    },
    select: eventTypeSelect,
  });
  response.status(201).json({ eventType });
});

router.patch("/event-types/:eventTypeId", async (request, response) => {
  const eventTypeId = validateUuid(request.params.eventTypeId);
  if (!eventTypeId) {
    response.status(400).json({ error: "Invalid event type id." });
    return;
  }

  const parsed = updateEventTypeSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid event type data." });
    return;
  }
  if (Object.keys(parsed.data).length === 0) {
    response.status(400).json({ error: "Nothing to update." });
    return;
  }

  const existing = await prisma.eventType.findFirst({
    where: { id: eventTypeId, userId: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Event type not found." });
    return;
  }

  let slug = parsed.data.slug;
  if (slug !== undefined) {
    const free = await uniqueSlug(slug, eventTypeId);
    if (!free) {
      response.status(409).json({ error: "That link is already taken." });
      return;
    }
    slug = free;
  }

  const eventType = await prisma.eventType.update({
    where: { id: eventTypeId },
    data: { ...parsed.data, ...(slug !== undefined ? { slug } : {}) },
    select: eventTypeSelect,
  });
  response.json({ eventType });
});

router.delete("/event-types/:eventTypeId", async (request, response) => {
  const eventTypeId = validateUuid(request.params.eventTypeId);
  if (!eventTypeId) {
    response.status(400).json({ error: "Invalid event type id." });
    return;
  }

  const existing = await prisma.eventType.findFirst({
    where: { id: eventTypeId, userId: request.user!.id },
    select: { id: true },
  });
  if (!existing) {
    response.status(404).json({ error: "Event type not found." });
    return;
  }

  await prisma.eventType.delete({ where: { id: eventTypeId } });
  response.status(204).end();
});

/* ------------------------------- Availability ------------------------------ */

function toDays(rules: { weekday: number; startMinute: number; endMinute: number }[]) {
  return Array.from({ length: WEEKDAYS }, (_, weekday) => {
    const rule = rules.find((row) => row.weekday === weekday);
    return {
      weekday,
      enabled: Boolean(rule),
      start: minutesToTime(rule?.startMinute ?? DEFAULT_AVAILABILITY[0]!.startMinute),
      end: minutesToTime(rule?.endMinute ?? DEFAULT_AVAILABILITY[0]!.endMinute),
    };
  });
}

router.get("/availability", async (request, response) => {
  const rules = await prisma.availability.findMany({
    where: { userId: request.user!.id },
    orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
  });
  response.json({ days: toDays(rules) });
});

router.put("/availability", async (request, response) => {
  const parsed = availabilitySchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid availability data." });
    return;
  }

  const rows: { weekday: number; startMinute: number; endMinute: number }[] = [];
  for (const day of parsed.data.days) {
    if (!day.enabled) continue;
    const startMinute = timeToMinutes(day.start);
    const endMinute = timeToMinutes(day.end);
    if (startMinute === null || endMinute === null || startMinute >= endMinute) {
      response.status(400).json({ error: "Each enabled day needs a start time before its end time." });
      return;
    }
    rows.push({ weekday: day.weekday, startMinute, endMinute });
  }

  await prisma.$transaction([
    prisma.availability.deleteMany({ where: { userId: request.user!.id } }),
    ...(rows.length > 0
      ? [prisma.availability.createMany({ data: rows.map((row) => ({ ...row, userId: request.user!.id })) })]
      : []),
  ]);

  const rules = await prisma.availability.findMany({
    where: { userId: request.user!.id },
    orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
  });
  response.json({ days: toDays(rules) });
});

/* --------------------------------- Bookings -------------------------------- */

const bookingSelect = {
  id: true,
  start: true,
  guestName: true,
  guestEmail: true,
  guestTimezone: true,
  notes: true,
  status: true,
  createdAt: true,
  eventType: { select: { id: true, title: true, durationMinutes: true, color: true } },
} as const;

router.get("/bookings", async (request, response) => {
  const statusFilter = z.enum(["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"]).safeParse(request.query.status);
  const bookings = await prisma.booking.findMany({
    where: {
      userId: request.user!.id,
      ...(statusFilter.success ? { status: statusFilter.data } : {}),
    },
    select: bookingSelect,
    orderBy: { start: "desc" },
  });
  response.json({ bookings });
});

router.post("/bookings/:bookingId/accept", async (request, response) => {
  const bookingId = validateUuid(request.params.bookingId);
  if (!bookingId) {
    response.status(400).json({ error: "Invalid booking id." });
    return;
  }
  const booking = await prisma.booking.updateMany({
    where: { id: bookingId, userId: request.user!.id, status: "PENDING" },
    data: { status: "ACCEPTED" },
  });
  if (booking.count === 0) {
    response.status(404).json({ error: "Booking not found or already handled." });
    return;
  }
  response.json({ status: "ACCEPTED" });
});

router.post("/bookings/:bookingId/reject", async (request, response) => {
  const bookingId = validateUuid(request.params.bookingId);
  if (!bookingId) {
    response.status(400).json({ error: "Invalid booking id." });
    return;
  }
  const booking = await prisma.booking.updateMany({
    where: { id: bookingId, userId: request.user!.id, status: "PENDING" },
    data: { status: "REJECTED" },
  });
  if (booking.count === 0) {
    response.status(404).json({ error: "Booking not found or already handled." });
    return;
  }
  response.json({ status: "REJECTED" });
});

router.post("/bookings/:bookingId/cancel", async (request, response) => {
  const bookingId = validateUuid(request.params.bookingId);
  if (!bookingId) {
    response.status(400).json({ error: "Invalid booking id." });
    return;
  }
  const booking = await prisma.booking.updateMany({
    where: { id: bookingId, userId: request.user!.id, status: { in: ["PENDING", "ACCEPTED"] } },
    data: { status: "CANCELLED" },
  });
  if (booking.count === 0) {
    response.status(404).json({ error: "Booking not found or already cancelled." });
    return;
  }
  response.json({ status: "CANCELLED" });
});

/* -------------------------------- Teammates -------------------------------- */

router.get("/teammates", async (_request, response) => {
  const users = await generalPrisma.user.findMany({
    select: { id: true, name: true, email: true },
    orderBy: { name: "asc" },
  });
  response.json({ users });
});

export { router as schedulerRouter };
