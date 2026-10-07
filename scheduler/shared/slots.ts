// Slot math shared by the API and the public booking page.
// Availability is stored as minutes-since-midnight UTC; slots are returned as
// ISO timestamps and rendered in the viewer's local time zone.

export type AvailabilityRule = {
  weekday: number; // 0 = Sunday … 6 = Saturday
  startMinute: number;
  endMinute: number;
};

export type BusyBlock = {
  start: string; // ISO timestamp
  durationMinutes: number;
};

const SLOT_STEP_MINUTES = 15;

export function minuteOfDay(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

export function weekdayOf(date: Date): number {
  return date.getUTCDay();
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

// Compute bookable slot start times (as Dates) for a half-open UTC window
// [fromUtc, toUtc). Busy blocks (existing bookings) are subtracted.
export function availableSlots({
  availability,
  busy,
  durationMinutes,
  fromUtc,
  toUtc,
}: {
  availability: AvailabilityRule[];
  busy: BusyBlock[];
  durationMinutes: number;
  fromUtc: Date;
  toUtc: Date;
}): string[] {
  const slots: string[] = [];
  if (durationMinutes <= 0 || availability.length === 0) return slots;

  const busyMinutes = busy.map(({ start, durationMinutes: busyDuration }) => ({
    startMs: new Date(start).getTime(),
    endMs: new Date(start).getTime() + busyDuration * 60_000,
  }));

  // Walk day by day across the window.
  const day = new Date(Date.UTC(fromUtc.getUTCFullYear(), fromUtc.getUTCMonth(), fromUtc.getUTCDate()));
  const now = Date.now();

  while (day < toUtc) {
    const weekday = day.getUTCDay();
    const dayRules = availability.filter((rule) => rule.weekday === weekday);
    for (const rule of dayRules) {
      for (let startMinute = rule.startMinute; startMinute + durationMinutes <= rule.endMinute; startMinute += SLOT_STEP_MINUTES) {
        const slotStartMs = day.getTime() + startMinute * 60_000;
        const slotEndMs = slotStartMs + durationMinutes * 60_000;
        if (slotStartMs < Math.max(fromUtc.getTime(), now)) continue;
        if (slotStartMs >= toUtc.getTime()) break;
        const clash = busyMinutes.some((block) => overlaps(slotStartMs, slotEndMs, block.startMs, block.endMs));
        if (!clash) slots.push(new Date(slotStartMs).toISOString());
      }
    }
    day.setUTCDate(day.getUTCDate() + 1);
  }

  return slots;
}

// Turn "09:30"-style inputs into minutes since midnight, and back.
export function minutesToTime(minutes: number): string {
  const clamped = Math.min(Math.max(minutes, 0), 24 * 60 - 1);
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function timeToMinutes(time: string): number | null {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export const DEFAULT_AVAILABILITY: AvailabilityRule[] = [1, 2, 3, 4, 5].map((weekday) => ({
  weekday,
  startMinute: 9 * 60,
  endMinute: 17 * 60,
}));
