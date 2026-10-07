import { Router } from "express";
import { z } from "zod";
import { requireApiKey } from "@/general/api/services/require-api-key";
import { prisma as generalPrisma } from "@/general/api/services/database";
import { prisma } from "@/scheduler/api/services/database";
import { availableSlots } from "@/scheduler/shared/slots";

const router = Router();

const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,47}$/;

const bookingSelect = {
  id: true,
  start: true,
  guestName: true,
  guestEmail: true,
  guestTimezone: true,
  notes: true,
  status: true,
  createdAt: true,
  eventType: { select: { id: true, title: true, durationMinutes: true, slug: true } },
} as const;

/* ------------------- Public booking pages (no auth needed) ------------------ */
/* The slug in the link is the key — same model as public forms and notes.      */

async function findPublicEventType(slug: string) {
  return prisma.eventType.findFirst({
    where: { slug, active: true },
    select: {
      id: true,
      title: true,
      description: true,
      durationMinutes: true,
      location: true,
      color: true,
      userId: true,
    },
  });
}

router.get("/pages/:slug", async (request, response) => {
  const slug = request.params.slug;
  if (!SLUG_PATTERN.test(slug)) {
    response.status(400).json({ error: "Invalid booking link." });
    return;
  }

  const eventType = await findPublicEventType(slug);
  if (!eventType) {
    response.status(404).json({ error: "This booking page is not available." });
    return;
  }

  const host = await generalPrisma.user.findUnique({
    where: { id: eventType.userId },
    select: { name: true },
  });

  response.json({
    eventType: {
      title: eventType.title,
      description: eventType.description,
      durationMinutes: eventType.durationMinutes,
      location: eventType.location,
      color: eventType.color,
      hostName: host?.name ?? "Host",
    },
  });
});

// Available start times. Pass ?date=YYYY-MM-DD for a single day, or
// ?from=ISO&to=ISO (max 31 days apart) for a custom UTC window.
router.get("/pages/:slug/slots", async (request, response) => {
  const slug = request.params.slug;
  if (!SLUG_PATTERN.test(slug)) {
    response.status(400).json({ error: "Invalid booking link." });
    return;
  }

  const eventType = await findPublicEventType(slug);
  if (!eventType) {
    response.status(404).json({ error: "This booking page is not available." });
    return;
  }

  const parsed = z
    .object({
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
    })
    .safeParse(request.query);
  if (!parsed.success) {
    response.status(400).json({ error: "Invalid date." });
    return;
  }

  const MAX_WINDOW_MS = 31 * 24 * 60 * 60_000;
  let fromUtc: Date;
  let toUtc: Date;
  if (parsed.data.date) {
    const [year, month, day] = parsed.data.date.split("-").map(Number) as [number, number, number];
    fromUtc = new Date(Date.UTC(year, month - 1, day));
    toUtc = new Date(fromUtc.getTime() + 24 * 60 * 60_000);
  } else if (parsed.data.from && parsed.data.to) {
    fromUtc = new Date(parsed.data.from);
    toUtc = new Date(parsed.data.to);
    if (Number.isNaN(fromUtc.getTime()) || Number.isNaN(toUtc.getTime()) || toUtc <= fromUtc) {
      response.status(400).json({ error: "Invalid date range." });
      return;
    }
    if (toUtc.getTime() - fromUtc.getTime() > MAX_WINDOW_MS) {
      toUtc = new Date(fromUtc.getTime() + MAX_WINDOW_MS);
    }
  } else {
    fromUtc = new Date();
    toUtc = new Date(fromUtc.getTime() + 7 * 24 * 60 * 60_000);
  }

  const [availability, busy] = await Promise.all([
    prisma.availability.findMany({ where: { userId: eventType.userId } }),
    prisma.booking.findMany({
      where: { userId: eventType.userId, status: { in: ["PENDING", "ACCEPTED"] }, start: { gte: fromUtc, lt: toUtc } },
      select: { start: true, eventType: { select: { durationMinutes: true } } },
    }),
  ]);

  const slots = availableSlots({
    availability,
    busy: busy.map((booking) => ({ start: booking.start.toISOString(), durationMinutes: booking.eventType.durationMinutes })),
    durationMinutes: eventType.durationMinutes,
    fromUtc,
    toUtc,
  });
  response.json({ slots });
});

router.post("/pages/:slug/bookings", async (request, response) => {
  const slug = request.params.slug;
  if (!SLUG_PATTERN.test(slug)) {
    response.status(400).json({ error: "Invalid booking link." });
    return;
  }

  const eventType = await findPublicEventType(slug);
  if (!eventType) {
    response.status(404).json({ error: "This booking page is not accepting bookings." });
    return;
  }

  const parsed = z
    .object({
      start: z.string().datetime(),
      name: z.string().min(1).max(120).transform((value) => value.trim()),
      email: z.email().max(200),
      timezone: z.string().max(80).optional(),
      notes: z.string().max(2_000).optional(),
    })
    .safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Provide a valid time slot, your name, and email." });
    return;
  }

  const requestedStart = new Date(parsed.data.start);
  if (requestedStart.getTime() < Date.now()) {
    response.status(400).json({ error: "That time has already passed." });
    return;
  }

  // The requested start must be one of the computed bookable slots.
  const [availability, busy] = await Promise.all([
    prisma.availability.findMany({ where: { userId: eventType.userId } }),
    prisma.booking.findMany({
      where: {
        userId: eventType.userId,
        status: { in: ["PENDING", "ACCEPTED"] },
        start: { gte: new Date(requestedStart.getTime() - 24 * 60 * 60_000), lt: new Date(requestedStart.getTime() + 24 * 60 * 60_000) },
      },
      select: { start: true, eventType: { select: { durationMinutes: true } } },
    }),
  ]);

  const slots = availableSlots({
    availability,
    busy: busy.map((booking) => ({ start: booking.start.toISOString(), durationMinutes: booking.eventType.durationMinutes })),
    durationMinutes: eventType.durationMinutes,
    fromUtc: new Date(requestedStart.getTime() - 60_000),
    toUtc: new Date(requestedStart.getTime() + 60_000),
  });
  if (!slots.includes(requestedStart.toISOString())) {
    response.status(409).json({ error: "That time is no longer available. Pick another slot." });
    return;
  }

  const booking = await prisma.booking.create({
    data: {
      eventTypeId: eventType.id,
      userId: eventType.userId,
      start: requestedStart,
      guestName: parsed.data.name,
      guestEmail: parsed.data.email,
      guestTimezone: parsed.data.timezone ?? "",
      notes: parsed.data.notes ?? "",
    },
    select: { id: true, start: true, status: true },
  });
  response.status(201).json({ booking });
});

/* ---------------------- Public API (API key required) ---------------------- */
/* Key passes via `Authorization: Bearer` or `X-API-Key`. Integrations can     */
/* read event types and availability, list bookings, and create bookings.      */

const apiEventTypeSelect = {
  id: true,
  title: true,
  slug: true,
  description: true,
  durationMinutes: true,
  location: true,
  color: true,
  active: true,
  createdAt: true,
} as const;

router.get("/event-types", requireApiKey, async (request, response) => {
  const eventTypes = await prisma.eventType.findMany({
    where: { userId: request.user!.id },
    select: apiEventTypeSelect,
    orderBy: { createdAt: "asc" },
  });
  response.json({ eventTypes });
});

router.get("/availability", requireApiKey, async (request, response) => {
  const availability = await prisma.availability.findMany({
    where: { userId: request.user!.id },
    orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
  });
  response.json({ availability });
});

router.get("/bookings", requireApiKey, async (request, response) => {
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

const apiCreateBookingSchema = z.object({
  eventTypeId: z.string().uuid(),
  start: z.string().datetime(),
  name: z.string().min(1).max(120).transform((value) => value.trim()),
  email: z.email().max(200),
  timezone: z.string().max(80).optional(),
  notes: z.string().max(2_000).optional(),
});

router.post("/bookings", requireApiKey, async (request, response) => {
  const parsed = apiCreateBookingSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Provide an event type id, a valid start time, and guest details." });
    return;
  }

  const eventType = await prisma.eventType.findFirst({
    where: { id: parsed.data.eventTypeId, userId: request.user!.id },
    select: { id: true, durationMinutes: true, active: true, userId: true },
  });
  if (!eventType || !eventType.active) {
    response.status(404).json({ error: "Event type not found or inactive." });
    return;
  }

  const requestedStart = new Date(parsed.data.start);
  if (requestedStart.getTime() < Date.now()) {
    response.status(400).json({ error: "That time has already passed." });
    return;
  }

  const [availability, busy] = await Promise.all([
    prisma.availability.findMany({ where: { userId: eventType.userId } }),
    prisma.booking.findMany({
      where: {
        userId: eventType.userId,
        status: { in: ["PENDING", "ACCEPTED"] },
        start: { gte: new Date(requestedStart.getTime() - 24 * 60 * 60_000), lt: new Date(requestedStart.getTime() + 24 * 60 * 60_000) },
      },
      select: { start: true, eventType: { select: { durationMinutes: true } } },
    }),
  ]);

  const slots = availableSlots({
    availability,
    busy: busy.map((booking) => ({ start: booking.start.toISOString(), durationMinutes: booking.eventType.durationMinutes })),
    durationMinutes: eventType.durationMinutes,
    fromUtc: new Date(requestedStart.getTime() - 60_000),
    toUtc: new Date(requestedStart.getTime() + 60_000),
  });
  if (!slots.includes(requestedStart.toISOString())) {
    response.status(409).json({ error: "That time is outside the available schedule or already booked." });
    return;
  }

  const booking = await prisma.booking.create({
    data: {
      eventTypeId: eventType.id,
      userId: eventType.userId,
      start: requestedStart,
      guestName: parsed.data.name,
      guestEmail: parsed.data.email,
      guestTimezone: parsed.data.timezone ?? "",
      notes: parsed.data.notes ?? "",
      status: "ACCEPTED",
    },
    select: bookingSelect,
  });
  response.status(201).json({ booking });
});

export { router as publicSchedulerRouter };
