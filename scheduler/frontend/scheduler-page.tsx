import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiCalendar,
  FiCheck,
  FiClock,
  FiCopy,
  FiEdit2,
  FiExternalLink,
  FiLink,
  FiLoader,
  FiPlus,
  FiTrash2,
  FiVideo,
  FiX,
} from "react-icons/fi";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { AppPageFrame, AppShell } from "@/general/frontend/app-shell";
import { api } from "@/lib/api-client";

export type EventTypeSummary = {
  id: string;
  title: string;
  slug: string;
  description: string;
  durationMinutes: number;
  location: string;
  color: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  _count: { bookings: number };
};

export type BookingRecord = {
  id: string;
  start: string;
  guestName: string;
  guestEmail: string;
  guestTimezone: string;
  notes: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED" | "CANCELLED";
  createdAt: string;
  eventType: { id: string; title: string; durationMinutes: number; color: string };
};

type AvailabilityDay = { weekday: number; enabled: boolean; start: string; end: string };

const DURATIONS = [15, 30, 45, 60, 90, 120];
const COLOR_PALETTE = ["#292927", "#0ea5e9", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const schedulerPages = [
  { end: true, icon: FiLink, label: "Event Types", to: "/scheduler" },
  { icon: FiCalendar, label: "Bookings", to: "/scheduler/bookings" },
  { icon: FiClock, label: "Availability", to: "/scheduler/availability" },
];

export function SchedulerLayout() {
  return (
    <AppShell
      accent="bg-[#e8eefb] text-[#3b63a8]"
      appName="Scheduler"
      icon={FiCalendar}
      pages={schedulerPages}
    />
  );
}

function useEventTypes() {
  const [eventTypes, setEventTypes] = useState<EventTypeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    try {
      const result = await api<{ eventTypes: EventTypeSummary[] }>("/api/scheduler/event-types");
      setEventTypes(result.eventTypes);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load event types.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { eventTypes, loading, error, reload };
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

function bookingLink(slug: string): string {
  return `${window.location.origin}/s/${slug}`;
}

/* -------------------------------- Event types ------------------------------- */

function EventTypeDialog({
  eventType,
  onClose,
  onSaved,
}: {
  eventType: EventTypeSummary | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(eventType?.title ?? "");
  const [description, setDescription] = useState(eventType?.description ?? "");
  const [slug, setSlug] = useState(eventType?.slug ?? "");
  const [durationMinutes, setDurationMinutes] = useState(String(eventType?.durationMinutes ?? 30));
  const [location, setLocation] = useState(eventType?.location ?? "Google Meet");
  const [color, setColor] = useState(eventType?.color ?? COLOR_PALETTE[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      const body = {
        title,
        description,
        slug,
        durationMinutes: Number(durationMinutes),
        location,
        color,
      };
      if (eventType) {
        await api(`/api/scheduler/event-types/${eventType.id}`, { method: "PATCH", body: JSON.stringify(body) });
      } else {
        await api("/api/scheduler/event-types", { method: "POST", body: JSON.stringify(body) });
      }
      onSaved();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the event type.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={(open) => { if (!open) onClose(); }} open>
      <DialogContent className="max-w-md border-[#eeeaf1] bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base">{eventType ? "Edit event type" : "New event type"}</DialogTitle>
          <DialogDescription className="text-xs">
            {eventType ? "Update the details of this meeting." : "Create a bookable meeting type."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block space-y-1.5 text-xs font-medium">
            Title
            <Input className="h-9 border-[#e9e6ed]" maxLength={200} onChange={(event) => setTitle(event.target.value)} placeholder="Quick chat" value={title} />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            Description
            <Textarea className="min-h-[64px] border-[#e9e6ed]" maxLength={2000} onChange={(event) => setDescription(event.target.value)} placeholder="What is this meeting about?" value={description} />
          </label>
          <label className="block space-y-1.5 text-xs font-medium">
            Booking link
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[11px] text-[#928995]">{window.location.origin}/s/</span>
              <Input className="h-9 border-[#e9e6ed]" maxLength={48} onChange={(event) => setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))} placeholder="quick-chat" value={slug} />
            </div>
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block space-y-1.5 text-xs font-medium">
              Duration
              <Select onValueChange={setDurationMinutes} value={durationMinutes}>
                <SelectTrigger className="h-9 w-full border-[#e9e6ed] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DURATIONS.map((duration) => (
                    <SelectItem key={duration} value={String(duration)}>{formatDuration(duration)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="block space-y-1.5 text-xs font-medium">
              Location
              <Input className="h-9 border-[#e9e6ed]" maxLength={120} onChange={(event) => setLocation(event.target.value)} placeholder="Google Meet" value={location} />
            </label>
          </div>
          <div className="space-y-1.5">
            <span className="block text-xs font-medium">Color</span>
            <div className="flex gap-2">
              {COLOR_PALETTE.map((paletteColor) => (
                <button
                  aria-label={`Color ${paletteColor}`}
                  className={`grid size-7 place-items-center rounded-full border-2 transition ${color === paletteColor ? "border-[#3b63a8]" : "border-transparent"}`}
                  key={paletteColor}
                  onClick={() => setColor(paletteColor)}
                  style={{ backgroundColor: paletteColor }}
                  type="button"
                >
                  {color === paletteColor ? <FiCheck className="size-3.5 text-white" /> : null}
                </button>
              ))}
            </div>
          </div>
          {error ? <p className="text-xs text-[#b05f5f]">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button className="h-9 border-[#e9e6ed] bg-white text-xs text-[#5c5561] hover:bg-[#f7f5f8]" onClick={onClose} type="button" variant="outline">Cancel</Button>
          <Button className="h-9 bg-[#292927] px-4 text-xs hover:bg-[#47464f]" disabled={saving || slug.length < 3} onClick={() => void save()} type="button">
            {saving ? <FiLoader className="size-3.5 animate-spin" /> : null}
            {eventType ? "Save changes" : "Create event type"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EventTypeRow({
  eventType,
  onDelete,
  onEdit,
  onToggle,
}: {
  eventType: EventTypeSummary;
  onDelete: (eventType: EventTypeSummary) => void;
  onEdit: () => void;
  onToggle: (active: boolean) => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(bookingLink(eventType.slug));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1_500);
    } catch {
      // Clipboard unavailable — the link is still visible in the row.
    }
  }

  return (
    <div className={`flex items-start gap-4 border-b border-[#f0edf2] px-5 py-4 last:border-b-0 ${eventType.active ? "" : "opacity-55"}`}>
      <span className="mt-1.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: eventType.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h3 className="truncate text-sm font-semibold tracking-[-0.02em]">{eventType.title || "Untitled event"}</h3>
          {!eventType.active ? <Badge className="bg-[#f5f3f6] px-2 py-0.5 text-[10px] font-medium text-[#8c838f]" variant="secondary">Hidden</Badge> : null}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#8c838f]">
          <span className="font-mono">/{eventType.slug}</span>
          <span className="flex items-center gap-1"><FiClock className="size-3" /> {formatDuration(eventType.durationMinutes)}</span>
          <span className="flex items-center gap-1"><FiVideo className="size-3" /> {eventType.location || "No location"}</span>
          <span>{eventType._count.bookings} bookings</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Switch aria-label={eventType.active ? "Hide event type" : "Show event type"} checked={eventType.active} onCheckedChange={onToggle} />
        <button aria-label="Copy booking link" className="grid size-8 place-items-center rounded-md text-[#8c838f] transition hover:bg-[#f7f5f8] hover:text-[#3e3543]" onClick={() => void copyLink()} title="Copy booking link" type="button">
          {copied ? <FiCheck className="size-4 text-[#47755b]" /> : <FiCopy className="size-4" />}
        </button>
        <a aria-label="Open booking page" className="grid size-8 place-items-center rounded-md text-[#8c838f] transition hover:bg-[#f7f5f8] hover:text-[#3e3543]" href={`/s/${eventType.slug}`} onClick={(event) => event.preventDefault()} rel="noreferrer" target="_blank" title="Open booking page">
          <FiExternalLink className="size-4" />
        </a>
        <button aria-label="Edit event type" className="grid size-8 place-items-center rounded-md text-[#8c838f] transition hover:bg-[#f7f5f8] hover:text-[#3e3543]" onClick={onEdit} type="button">
          <FiEdit2 className="size-4" />
        </button>
        <button aria-label="Delete event type" className="grid size-8 place-items-center rounded-md text-[#8c838f] transition hover:bg-[#fdf0f0] hover:text-[#b05f5f]" onClick={() => onDelete(eventType)} type="button">
          <FiTrash2 className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function SchedulerEventTypesPage() {
  const { eventTypes, loading, error, reload } = useEventTypes();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<EventTypeSummary | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EventTypeSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function toggleActive(eventType: EventTypeSummary, active: boolean) {
    try {
      await api(`/api/scheduler/event-types/${eventType.id}`, { method: "PATCH", body: JSON.stringify({ active }) });
      await reload();
    } catch {
      await reload();
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/api/scheduler/event-types/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      await reload();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppPageFrame
      action={(
        <Button
          className="h-9 bg-[#292927] px-4 text-xs hover:bg-[#47464f]"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
          type="button"
        >
          <FiPlus className="size-4" /> New event type
        </Button>
      )}
      description="Create bookable meeting types and share your links."
      title="Event Types"
    >
      <div className="mx-auto w-full max-w-4xl">
        <p className="mb-4 text-xs text-[#8c838f]">{eventTypes.length} event type{eventTypes.length === 1 ? "" : "s"}</p>

        {error ? <p className="mb-3 text-xs text-[#b05f5f]">{error}</p> : null}

        <Card className="border-[#eeeaf1] bg-white shadow-none">
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2].map((index) => <div className="h-10 animate-pulse rounded-md bg-[#f1edf4]" key={index} />)}
              </div>
            ) : eventTypes.length === 0 ? (
              <div className="p-10 text-center">
                <FiCalendar className="mx-auto size-7 text-[#c9c2ce]" />
                <p className="mt-3 text-sm font-medium">Create your first event type</p>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#8c838f]">
                  Event types are templates for meetings people can book — set a duration, a link, and your weekly availability.
                </p>
                <Button
                  className="mt-5 h-9 bg-[#292927] px-4 text-xs hover:bg-[#47464f]"
                  onClick={() => {
                    setEditing(null);
                    setDialogOpen(true);
                  }}
                  type="button"
                >
                  <FiPlus className="size-4" /> New event type
                </Button>
              </div>
            ) : (
              eventTypes.map((eventType) => (
                <EventTypeRow
                  eventType={eventType}
                  key={eventType.id}
                  onDelete={setDeleteTarget}
                  onEdit={() => {
                    setEditing(eventType);
                    setDialogOpen(true);
                  }}
                  onToggle={(active) => void toggleActive(eventType, active)}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {dialogOpen ? (
        <EventTypeDialog
          eventType={editing}
          onClose={() => setDialogOpen(false)}
          onSaved={() => void reload()}
        />
      ) : null}

      <Dialog onOpenChange={(open) => { if (!open) setDeleteTarget(null); }} open={Boolean(deleteTarget)}>
        <DialogContent className="max-w-sm border-[#eeeaf1] bg-white">
          <DialogHeader>
            <DialogTitle className="text-base">Delete event type?</DialogTitle>
            <DialogDescription className="text-xs">
              This permanently removes “{deleteTarget?.title}” and all of its bookings.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button className="h-9 border-[#e9e6ed] bg-white text-xs text-[#5c5561] hover:bg-[#f7f5f8]" onClick={() => setDeleteTarget(null)} type="button" variant="outline">Cancel</Button>
            <Button className="h-9 bg-[#b05f5f] px-4 text-xs hover:bg-[#9d4f4f]" disabled={deleting} onClick={() => void confirmDelete()} type="button">
              {deleting ? <FiLoader className="size-3.5 animate-spin" /> : null} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppPageFrame>
  );
}

/* --------------------------------- Bookings -------------------------------- */

const STATUS_STYLES: Record<BookingRecord["status"], string> = {
  PENDING: "bg-[#fdf6e7] text-[#9a7429]",
  ACCEPTED: "bg-[#e7f2eb] text-[#47755b]",
  REJECTED: "bg-[#f7e9e9] text-[#a15454]",
  CANCELLED: "bg-[#f5f3f6] text-[#8c838f]",
};

function formatBookingTime(start: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(start));
}

function BookingRow({ booking, onChanged }: { booking: BookingRecord; onChanged: () => void }) {
  const [busyAction, setBusyAction] = useState("");

  async function act(action: "accept" | "reject" | "cancel") {
    setBusyAction(action);
    try {
      await api(`/api/scheduler/bookings/${booking.id}/${action}`, { method: "POST" });
      onChanged();
    } finally {
      setBusyAction("");
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#f0edf2] px-5 py-4 last:border-b-0">
      <span className="mt-0.5 size-2.5 shrink-0 rounded-full" style={{ backgroundColor: booking.eventType.color }} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium">{booking.guestName}</span>
          <Badge className={`px-2 py-0.5 text-[10px] font-medium ${STATUS_STYLES[booking.status]}`} variant="secondary">
            {booking.status.toLowerCase()}
          </Badge>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[#8c838f]">
          <span>{booking.eventType.title}</span>
          <span>{formatBookingTime(booking.start)} · {formatDuration(booking.eventType.durationMinutes)}</span>
          <span className="truncate">{booking.guestEmail}</span>
        </div>
        {booking.notes ? <p className="mt-1.5 max-w-xl truncate text-[11px] italic text-[#a198a5]">“{booking.notes}”</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {booking.status === "PENDING" ? (
          <>
            <Button className="h-8 bg-[#292927] px-3 text-[11px] hover:bg-[#47464f]" disabled={busyAction !== ""} onClick={() => void act("accept")} type="button">
              {busyAction === "accept" ? <FiLoader className="size-3 animate-spin" /> : <FiCheck className="size-3.5" />} Accept
            </Button>
            <Button className="h-8 border-[#e9e6ed] bg-white px-3 text-[11px] text-[#5c5561] hover:bg-[#f7f5f8]" disabled={busyAction !== ""} onClick={() => void act("reject")} type="button" variant="outline">
              <FiX className="size-3.5" /> Reject
            </Button>
          </>
        ) : null}
        {booking.status === "PENDING" || booking.status === "ACCEPTED" ? (
          <Button className="h-8 border-[#e9e6ed] bg-white px-3 text-[11px] text-[#8c838f] hover:bg-[#f7f5f8]" disabled={busyAction !== ""} onClick={() => void act("cancel")} type="button" variant="outline">
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function SchedulerBookingsPage() {
  const [filter, setFilter] = useState<"ALL" | BookingRecord["status"]>("ALL");
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await api<{ bookings: BookingRecord[] }>("/api/scheduler/bookings");
      setBookings(result.bookings);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const now = Date.now();
    return bookings
      .filter((booking) => {
        if (filter === "ALL") return true;
        if (filter === "ACCEPTED") return booking.status === "ACCEPTED" && new Date(booking.start).getTime() >= now;
        if (filter === "PENDING") return booking.status === "PENDING";
        if (filter === "CANCELLED") return booking.status === "CANCELLED" || booking.status === "REJECTED";
        return true;
      })
      .sort((a, b) => {
        const aUpcoming = new Date(a.start).getTime() >= now && a.status !== "CANCELLED" && a.status !== "REJECTED";
        const bUpcoming = new Date(b.start).getTime() >= now && b.status !== "CANCELLED" && b.status !== "REJECTED";
        if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
        return aUpcoming
          ? new Date(a.start).getTime() - new Date(b.start).getTime()
          : new Date(b.start).getTime() - new Date(a.start).getTime();
      });
  }, [bookings, filter]);

  const tabs: { key: typeof filter; label: string }[] = [
    { key: "ALL", label: "All" },
    { key: "PENDING", label: "Pending" },
    { key: "ACCEPTED", label: "Upcoming" },
    { key: "CANCELLED", label: "Past & cancelled" },
  ];

  return (
    <AppPageFrame description="Meeting requests and confirmed bookings from your pages." title="Bookings">
      <div className="mx-auto w-full max-w-4xl">
        <div className="mb-4 flex gap-1.5">
          {tabs.map((tab) => (
            <button
              className={`h-8 rounded-full px-3.5 text-[11px] font-medium transition ${filter === tab.key ? "bg-[#292927] text-white" : "bg-white text-[#716b76] ring-1 ring-[#eeeaf1] ring-inset hover:bg-[#f7f5f8]"}`}
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {error ? <p className="mb-3 text-xs text-[#b05f5f]">{error}</p> : null}

        <Card className="border-[#eeeaf1] bg-white shadow-none">
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-5">
                {[0, 1, 2].map((index) => <div className="h-10 animate-pulse rounded-md bg-[#f1edf4]" key={index} />)}
              </div>
            ) : visible.length === 0 ? (
              <p className="p-10 text-center text-xs text-[#8c838f]">No bookings here yet.</p>
            ) : (
              visible.map((booking) => <BookingRow booking={booking} key={booking.id} onChanged={() => void load()} />)
            )}
          </CardContent>
        </Card>
      </div>
    </AppPageFrame>
  );
}

/* -------------------------------- Availability ------------------------------ */

export function SchedulerAvailabilityPage() {
  const [days, setDays] = useState<AvailabilityDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api<{ days: AvailabilityDay[] }>("/api/scheduler/availability")
      .then((result) => {
        if (active) setDays(result.days);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load availability.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  function updateDay(weekday: number, patch: Partial<AvailabilityDay>) {
    setSaved(false);
    setDays(days.map((day) => (day.weekday === weekday ? { ...day, ...patch } : day)));
  }

  async function save() {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const result = await api<{ days: AvailabilityDay[] }>("/api/scheduler/availability", {
        method: "PUT",
        body: JSON.stringify({ days: days.map(({ weekday, enabled, start, end }) => ({ weekday, enabled, start, end })) }),
      });
      setDays(result.days);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save availability.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppPageFrame description="Set the hours you are available for meetings." title="Availability">
      <div className="mx-auto w-full max-w-3xl">
        <Card className="border-[#eeeaf1] bg-white shadow-none">
          <CardContent className="px-5 py-2 sm:px-6">
            {loading ? (
              <div className="space-y-3 py-5">
                {[0, 1, 2, 3, 4, 5, 6].map((index) => <div className="h-9 animate-pulse rounded-md bg-[#f1edf4]" key={index} />)}
              </div>
            ) : (
              days.map((day) => (
                <div className="flex items-center gap-4 border-b border-[#f0edf2] py-3.5 last:border-b-0" key={day.weekday}>
                  <Switch
                    aria-label={`${WEEKDAY_NAMES[day.weekday]} availability`}
                    checked={day.enabled}
                    onCheckedChange={(enabled) => updateDay(day.weekday, { enabled })}
                  />
                  <span className={`w-24 text-[13px] font-medium ${day.enabled ? "" : "text-[#b6aebc]"}`}>
                    {WEEKDAY_NAMES[day.weekday]}
                  </span>
                  {day.enabled ? (
                    <div className="flex items-center gap-2 text-xs text-[#8c838f]">
                      <Input
                        aria-label={`${WEEKDAY_NAMES[day.weekday]} start time`}
                        className="h-9 w-[110px] border-[#e9e6ed]"
                        onChange={(event) => updateDay(day.weekday, { start: event.target.value })}
                        type="time"
                        value={day.start}
                      />
                      <span>–</span>
                      <Input
                        aria-label={`${WEEKDAY_NAMES[day.weekday]} end time`}
                        className="h-9 w-[110px] border-[#e9e6ed]"
                        onChange={(event) => updateDay(day.weekday, { end: event.target.value })}
                        type="time"
                        value={day.end}
                      />
                    </div>
                  ) : (
                    <span className="text-xs text-[#b6aebc]">Unavailable</span>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="mt-5 flex items-center justify-end gap-3">
          {error ? <p className="text-xs text-[#b05f5f]">{error}</p> : null}
          {saved && !error ? <p className="flex items-center gap-1.5 text-xs text-[#47755b]"><FiCheck className="size-3.5" /> Saved</p> : null}
          <Button className="h-9 bg-[#292927] px-4 text-xs hover:bg-[#47464f]" disabled={saving || loading} onClick={() => void save()} type="button">
            {saving ? <FiLoader className="size-3.5 animate-spin" /> : null} Save availability
          </Button>
        </div>

        <p className="mt-3 text-[11px] leading-5 text-[#a198a5]">
          Availability windows are interpreted in UTC. Bookable slots are shown to guests in their own time zone.
        </p>
      </div>
    </AppPageFrame>
  );
}
