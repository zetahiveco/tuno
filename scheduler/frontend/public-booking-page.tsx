import { useCallback, useEffect, useMemo, useState } from "react";
import { FiArrowLeft, FiCheckCircle, FiClock, FiLoader, FiUser, FiVideo } from "react-icons/fi";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";

type PublicEventType = {
  title: string;
  description: string;
  durationMinutes: number;
  location: string;
  color: string;
  hostName: string;
};

type Confirmation = { start: string; guestName: string };

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatSlotTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

function formatFullTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

function viewerTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "";
  }
}

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
}

export function PublicBookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [eventType, setEventType] = useState<PublicEventType | null>(null);
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);

  const [month, setMonth] = useState(() => new Date());
  const [slotsByDay, setSlotsByDay] = useState<Record<string, string[]>>({});
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<string>("");
  const [selectedSlot, setSelectedSlot] = useState<string>("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);

  useEffect(() => {
    let active = true;
    setLoadError("");
    api<{ eventType: PublicEventType }>(`/api/public/scheduler/pages/${slug}`)
      .then((result) => {
        if (active) setEventType(result.eventType);
      })
      .catch((loadError) => {
        if (active) setLoadError(loadError instanceof Error ? loadError.message : "Could not open this booking page.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [slug]);

  const loadSlots = useCallback(async (forMonth: Date) => {
    setSlotsLoading(true);
    try {
      // Fetch exactly the displayed month; the server clamps slot starts to the
      // future, so past days come back empty and render disabled.
      const from = new Date(Date.UTC(forMonth.getFullYear(), forMonth.getMonth(), 1));
      const to = new Date(Date.UTC(forMonth.getFullYear(), forMonth.getMonth() + 1, 1));
      const params = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() });
      const result = await api<{ slots: string[] }>(`/api/public/scheduler/pages/${slug}/slots?${params}`);
      const grouped: Record<string, string[]> = {};
      for (const slot of result.slots) {
        const key = dayKey(new Date(slot));
        (grouped[key] ??= []).push(slot);
      }
      setSlotsByDay(grouped);
    } catch {
      setSlotsByDay({});
    } finally {
      setSlotsLoading(false);
    }
  }, [slug]);

  useEffect(() => {
    if (eventType) void loadSlots(month);
  }, [eventType, month, loadSlots]);

  const daySlots = useMemo(() => slotsByDay[selectedDay] ?? [], [slotsByDay, selectedDay]);

  async function submit() {
    if (!selectedSlot) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await api(`/api/public/scheduler/pages/${slug}/bookings`, {
        method: "POST",
        body: JSON.stringify({ start: selectedSlot, name, email, notes, timezone: viewerTimezone() }),
      });
      setConfirmation({ start: selectedSlot, guestName: name });
    } catch (submitError) {
      setSubmitError(submitError instanceof Error ? submitError.message : "Could not confirm the booking.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-white text-xs text-[#928995]">Loading booking page…</main>;
  }

  if (loadError || !eventType) {
    return (
      <main className="grid min-h-screen place-items-center bg-white p-6">
        <div className="text-center">
          <p className="text-lg font-semibold tracking-[-0.03em]">Page not available</p>
          <p className="mt-2 text-sm text-[#8c838f]">{loadError || "This booking link does not exist."}</p>
        </div>
      </main>
    );
  }

  if (confirmation) {
    return (
      <main className="grid min-h-screen place-items-center bg-white px-4">
        <div className="w-full max-w-md text-center">
          <FiCheckCircle className="mx-auto size-12 text-[#3aa76d]" />
          <h1 className="mt-5 text-2xl font-semibold tracking-[-0.04em]">Booked.</h1>
          <p className="mt-2 text-sm text-[#5c5561]">
            {confirmation.guestName}, your meeting with {eventType.hostName} is scheduled for
          </p>
          <p className="mt-1 text-sm font-medium">{formatFullTime(confirmation.start)}</p>
          <p className="mt-1 text-xs text-[#8c838f]">
            {new Intl.DateTimeFormat(undefined, { timeZoneName: "long" }).format(new Date(confirmation.start)).match(/\S+$/)?.[0] ?? viewerTimezone()} · {eventType.durationMinutes} minutes · {eventType.location}
          </p>
        </div>
      </main>
    );
  }

  const availableDaySet = new Set(Object.keys(slotsByDay));

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto grid max-w-4xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1fr_1.2fr]">
        {/* Left: event details */}
        <section>
          <div className="grid size-12 place-items-center rounded-full bg-[#f0edf4] text-sm font-semibold text-[#5c5561]">
            {initials(eventType.hostName) || <FiUser className="size-5" />}
          </div>
          <p className="mt-4 text-xs font-medium text-[#8c838f]">{eventType.hostName}</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-[-0.04em]">{eventType.title}</h1>
          {eventType.description ? <p className="mt-3 max-w-sm whitespace-pre-wrap text-sm leading-6 text-[#5c5561]">{eventType.description}</p> : null}
          <div className="mt-6 space-y-2.5 text-sm text-[#5c5561]">
            <p className="flex items-center gap-2.5"><FiClock className="size-4 text-[#8c838f]" /> {eventType.durationMinutes} minutes</p>
            <p className="flex items-center gap-2.5"><FiVideo className="size-4 text-[#8c838f]" /> {eventType.location || "Details shared after booking"}</p>
          </div>
          {selectedSlot ? (
            <div className="mt-8 border-t border-[#f0edf2] pt-5 text-sm">
              <p className="text-xs text-[#8c838f]">Your selection</p>
              <p className="mt-1 font-medium">{formatFullTime(selectedSlot)}</p>
            </div>
          ) : null}
        </section>

        {/* Right: calendar + slots */}
        <section>
          {selectedSlot ? (
            <div className="max-w-md">
              <Button
                className="mb-5 h-8 border-[#e9e6ed] bg-white px-2.5 text-xs text-[#5c5561] hover:bg-[#f7f5f8]"
                onClick={() => setSelectedSlot("")}
                type="button"
                variant="outline"
              >
                <FiArrowLeft className="size-3.5" /> Back
              </Button>
              <h2 className="text-sm font-semibold tracking-[-0.02em]">Enter your details</h2>
              <div className="mt-4 space-y-3">
                <Input className="h-10 border-[#e9e6ed]" maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Your name" value={name} />
                <Input className="h-10 border-[#e9e6ed]" maxLength={200} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" type="email" value={email} />
                <Textarea className="min-h-[72px] border-[#e9e6ed]" maxLength={2000} onChange={(event) => setNotes(event.target.value)} placeholder="Anything the host should know? (optional)" value={notes} />
                {submitError ? <p className="text-xs text-[#b05f5f]">{submitError}</p> : null}
                <Button
                  className="h-10 w-full bg-[#292927] text-xs hover:bg-[#47464f]"
                  disabled={submitting || name.trim().length === 0 || email.trim().length === 0}
                  onClick={() => void submit()}
                  type="button"
                >
                  {submitting ? <FiLoader className="size-4 animate-spin" /> : null} Confirm booking
                </Button>
              </div>
            </div>
          ) : (
            <div className="max-w-md">
              <h2 className="text-sm font-semibold tracking-[-0.02em]">Pick a date</h2>
              <p className="mt-1 text-xs text-[#8c838f]">Times are shown in your time zone ({viewerTimezone() || "local"}).</p>
              <div className="mt-4 rounded-lg border border-[#eeeaf1] p-4">
                <Calendar
                  mode="single"
                  month={month}
                  onMonthChange={(nextMonth) => {
                    setMonth(nextMonth);
                    setSelectedDay("");
                  }}
                  onSelect={(date) => {
                    if (!date) return;
                    const key = dayKey(date);
                    setSelectedDay(key === selectedDay ? "" : key);
                  }}
                  selected={selectedDay ? new Date(`${selectedDay}T00:00:00`) : undefined}
                  disabled={(date) => !availableDaySet.has(dayKey(date))}
                  showOutsideDays={false}
                />
                {slotsLoading ? <p className="px-1 pb-1 pt-3 text-[11px] text-[#a198a5]">Checking open times…</p> : null}
              </div>

              {selectedDay ? (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold tracking-[-0.02em]">
                    {new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date(`${selectedDay}T00:00:00`))}
                  </h3>
                  {daySlots.length === 0 ? (
                    <p className="mt-3 text-xs text-[#8c838f]">No open times on this day.</p>
                  ) : (
                    <div className="mt-3 grid max-h-[320px] grid-cols-2 gap-2 overflow-y-auto pr-1 sm:grid-cols-3">
                      {daySlots.map((slot) => (
                        <Button
                          className="h-9 border-[#292927] bg-white text-xs font-medium text-[#292927] hover:bg-[#292927] hover:text-white"
                          key={slot}
                          onClick={() => setSelectedSlot(slot)}
                          type="button"
                          variant="outline"
                        >
                          {formatSlotTime(slot)}
                        </Button>
                      ))}
                    </div>
                  )}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
