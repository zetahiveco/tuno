// Temporary e2e smoke test for the Scheduler app. Creates a short-lived session
// for the first user, exercises the API (including the public API-key endpoints
// and the no-auth booking page), then removes the session. Safe to delete.
import { createHash, randomBytes } from "node:crypto";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL not set");

const base = process.env.TEST_BASE ?? "http://localhost:8080";
const token = randomBytes(32).toString("hex");
const tokenHash = createHash("sha256").update(token).digest("hex");

const sql = new Bun.SQL(databaseUrl);
const cleanup = async () => {
  await sql`DELETE FROM general."Session" WHERE "tokenHash" = ${tokenHash}`;
  await sql.close();
};

const cookie = `tuno_session=${token}`;
let failures = 0;

function check(name: string, condition: boolean, extra = "") {
  if (condition) {
    console.log(`✓ ${name}`);
  } else {
    failures += 1;
    console.error(`✗ ${name} ${extra}`);
  }
}

async function call(path: string, init?: RequestInit) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { Cookie: cookie, ...(init?.body ? { "Content-Type": "application/json" } : {}), ...init?.headers },
  });
  let body: unknown = null;
  if (response.status !== 204) {
    try {
      body = await response.json();
    } catch {
      body = null;
    }
  }
  return { status: response.status, body } as { status: number; body: any };
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

try {
  // Create a session for an existing user.
  const users = await sql`SELECT id FROM general."User" ORDER BY "createdAt" LIMIT 1`;
  if (users.length === 0) throw new Error("No users in database");
  await sql`INSERT INTO general."Session" ("tokenHash", "userId", "expiresAt") VALUES (${tokenHash}, ${users[0].id}, ${new Date(Date.now() + 3600_000)})`;

  // 1. Create an event type.
  const created = await call("/api/scheduler/event-types", {
    method: "POST",
    body: JSON.stringify({ title: "E2E Sync", slug: "e2e-sync", durationMinutes: 30, location: "Google Meet", color: "#0ea5e9" }),
  });
  check("create event type", created.status === 201 && created.body?.eventType?.slug === "e2e-sync", `status ${created.status}`);
  const eventTypeId = created.body?.eventType?.id as string;

  // 2. Update the event type.
  const patched = await call(`/api/scheduler/event-types/${eventTypeId}`, {
    method: "PATCH",
    body: JSON.stringify({ description: "A meeting for testing." }),
  });
  check("edit event type", patched.status === 200 && patched.body?.eventType?.description === "A meeting for testing.", `status ${patched.status}`);

  // 3. Save weekly availability (Mon–Fri 09:00–17:00 UTC).
  const days = [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    enabled: weekday >= 1 && weekday <= 5,
    start: "09:00",
    end: "17:00",
  }));
  const savedAvailability = await call("/api/scheduler/availability", { method: "PUT", body: JSON.stringify({ days }) });
  check("save availability", savedAvailability.status === 200 && savedAvailability.body?.days?.filter((day: any) => day.enabled).length === 5, `status ${savedAvailability.status}`);

  // 4. Public booking page is readable without auth.
  const publicPage = await call(`/api/public/scheduler/pages/e2e-sync`);
  check("public page fetch", publicPage.status === 200 && publicPage.body?.eventType?.title === "E2E Sync", `status ${publicPage.status}`);

  // 5. Slots are computed from availability.
  const slots = await call(`/api/public/scheduler/pages/e2e-sync/slots`);
  const slotList = (slots.body?.slots ?? []) as string[];
  check("slots computed", slots.status === 200 && slotList.length > 0, `status ${slots.status} count ${slotList.length}`);

  // 6. Booking on a real slot succeeds and starts as PENDING.
  const targetSlot = (slotList.find((slot) => new Date(slot).getTime() > Date.now() + 60 * 60_000) ?? slotList[0])!;
  if (!targetSlot) throw new Error("No future slot available");
  const booked = await call(`/api/public/scheduler/pages/e2e-sync/bookings`, {
    method: "POST",
    body: JSON.stringify({ start: targetSlot, name: "E2E Guest", email: "guest@example.com", timezone: "Europe/Berlin", notes: "Looking forward to it." }),
  });
  check("public booking created", booked.status === 201 && booked.body?.booking?.status === "PENDING", `status ${booked.status} ${JSON.stringify(booked.body)}`);

  // 7. Double-booking the same slot is rejected.
  const doubleBooked = await call(`/api/public/scheduler/pages/e2e-sync/bookings`, {
    method: "POST",
    body: JSON.stringify({ start: targetSlot, name: "Second Guest", email: "second@example.com" }),
  });
  check("double booking rejected", doubleBooked.status === 409, `status ${doubleBooked.status}`);

  // 8. Booking outside availability is rejected.
  const startMs = new Date(targetSlot).getTime();
  const offSchedule = await call(`/api/public/scheduler/pages/e2e-sync/bookings`, {
    method: "POST",
    body: JSON.stringify({ start: new Date(startMs + 10 * 60_000).toISOString(), name: "Off Slot", email: "off@example.com" }),
  });
  check("off-schedule booking rejected", offSchedule.status === 409, `status ${offSchedule.status}`);

  // 9. The owner sees the pending booking and accepts it.
  const ownerBookings = await call("/api/scheduler/bookings?status=PENDING");
  const pending = ownerBookings.body?.bookings?.find((booking: any) => booking.guestName === "E2E Guest");
  check("owner sees pending booking", ownerBookings.status === 200 && Boolean(pending), `status ${ownerBookings.status}`);
  const accepted = await call(`/api/scheduler/bookings/${pending.id}/accept`, { method: "POST" });
  check("accept booking", accepted.status === 200 && accepted.body?.status === "ACCEPTED", `status ${accepted.status}`);

  // 10. Public API with an API key: create a key, then read event types and book.
  const keyCreated = await call("/api/keys", { method: "POST", body: JSON.stringify({ name: "E2E Scheduler Key" }) });
  const apiKey = keyCreated.body?.key?.key as string;
  check("api key created", keyCreated.status === 201 && typeof apiKey === "string", `status ${keyCreated.status}`);

  const apiEventTypes = await call("/api/public/scheduler/event-types", { headers: { Authorization: `Bearer ${apiKey}` } });
  check("api key lists event types", apiEventTypes.status === 200 && apiEventTypes.body?.eventTypes?.some((row: any) => row.id === eventTypeId), `status ${apiEventTypes.status}`);

  const apiSlots = await call(`/api/public/scheduler/pages/e2e-sync/slots`);
  const apiSlot = (apiSlots.body?.slots ?? []).find((slot: string) => new Date(slot).getTime() > startMs + 24 * 60 * 60_000);
  if (!apiSlot) throw new Error("No API slot available beyond tomorrow");
  const apiBooking = await call("/api/public/scheduler/bookings", {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: JSON.stringify({ eventTypeId, start: apiSlot, name: "API Guest", email: "api@example.com" }),
  });
  check("api key creates booking", apiBooking.status === 201 && apiBooking.body?.booking?.status === "ACCEPTED", `status ${apiBooking.status} ${JSON.stringify(apiBooking.body)}`);

  const apiBookings = await call("/api/public/scheduler/bookings", { headers: { Authorization: `Bearer ${apiKey}` } });
  check("api key lists bookings", apiBookings.status === 200 && Array.isArray(apiBookings.body?.bookings), `status ${apiBookings.status}`);

  const noKey = await call("/api/public/scheduler/event-types");
  check("api without key rejected", noKey.status === 401, `status ${noKey.status}`);

  // 11. Cleanup: remove the key, event type, and availability.
  await call(`/api/keys/${encodeURIComponent(apiKey)}`, { method: "DELETE" });
  const removed = await call(`/api/scheduler/event-types/${eventTypeId}`, { method: "DELETE" });
  check("delete event type", removed.status === 204, `status ${removed.status}`);
  await call("/api/scheduler/availability", { method: "PUT", body: JSON.stringify({ days: days.map((day) => ({ ...day, enabled: false })) }) });

  console.log(`\nCreated bookings for ${WEEKDAY_NAMES[new Date(targetSlot).getUTCDay()]} — cleaned up.`);
} catch (error) {
  failures += 1;
  console.error("Unexpected failure:", error);
} finally {
  await cleanup();
}

console.log(failures === 0 ? "\nAll e2e checks passed." : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
