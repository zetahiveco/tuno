import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import {
  FiArrowLeft,
  FiCheckCircle,
  FiEye,
  FiLoader,
  FiMail,
  FiMousePointer,
  FiPlus,
  FiSend,
  FiTrash2,
  FiX,
  FiXCircle,
  FiZap,
} from "react-icons/fi";
import { api } from "@/lib/api-client";
import { AppPageFrame } from "@/general/frontend/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { extractVariables } from "@/mailer/shared/template-blocks";

export type CampaignSummary = {
  id: string;
  name: string;
  subject: string;
  templateId: string | null;
  status: "DRAFT" | "SENDING" | "SENT" | "FAILED";
  recipientCount: number;
  sentAt: string | null;
  createdAt: string;
};

type TemplateSummary = { id: string; name: string; subject: string };
type PayloadRow = { id: string; key: string; value: string };

const STATUS_META: Record<CampaignSummary["status"], { label: string; className: string }> = {
  DRAFT: { label: "Draft", className: "bg-[#f5f3f6] text-[#8c838f]" },
  SENDING: { label: "Sending", className: "bg-[#f6effc] text-[#7a4fa3]" },
  SENT: { label: "Sent", className: "bg-[#eef8f0] text-[#3d8a55]" },
  FAILED: { label: "Failed", className: "bg-[#fdeeee] text-red-600" },
};

/* ------------------------------- Campaign list ------------------------------ */

export function MailerCampaignsPage() {
  const navigate = useNavigate();
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [composeOpen, setComposeOpen] = useState(false);
  const [sending, setSending] = useState<string | null>(null);
  const [sendResult, setSendResult] = useState<string | null>(null);

  const loadCampaigns = useCallback(async () => {
    setError("");
    try {
      const [campaignsResult, templatesResult] = await Promise.all([
        api<{ campaigns: CampaignSummary[] }>("/api/mailer/campaigns"),
        api<{ templates: TemplateSummary[] }>("/api/mailer/templates"),
      ]);
      setCampaigns(campaignsResult.campaigns);
      setTemplates(templatesResult.templates);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your campaigns.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadCampaigns();
  }, [loadCampaigns]);

  async function sendCampaign(campaign: CampaignSummary) {
    if (!window.confirm(`Send "${campaign.name}" to every subscribed contact? This cannot be undone.`)) return;
    setSending(campaign.id);
    setSendResult(null);
    try {
      const result = await api<{ sent: number; failed: number }>(`/api/mailer/campaigns/${campaign.id}/send`, {
        body: JSON.stringify({}),
        method: "POST",
      });
      setSendResult(`Sent to ${result.sent} contact${result.sent === 1 ? "" : "s"}${result.failed ? `, ${result.failed} failed` : ""}.`);
      await loadCampaigns();
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "The campaign could not be sent.");
    }
    setSending(null);
  }

  async function deleteCampaign(campaign: CampaignSummary) {
    if (!window.confirm(`Delete "${campaign.name}" and its analytics?`)) return;
    try {
      await api(`/api/mailer/campaigns/${campaign.id}`, { method: "DELETE" });
      setCampaigns((current) => current.filter((entry) => entry.id !== campaign.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the campaign.");
    }
  }

  return (
    <AppPageFrame
      action={(
        <Button className="bg-[#7a4fa3] hover:bg-[#6a4290]" disabled={loading} onClick={() => setComposeOpen(true)}>
          <FiPlus className="size-4" />
          New campaign
        </Button>
      )}
      description="Compose, send, and measure your email sends."
      title="Campaigns"
    >
      <p className="mb-5 text-xs text-[#847b89]">
        {loading ? "Loading campaigns…" : `${campaigns.length} campaign${campaigns.length === 1 ? "" : "s"}`}
      </p>

      {sendResult ? <p className="mb-4 rounded-md border border-[#cde8d3] bg-[#f0faf2] px-3 py-2 text-xs text-[#3d8a55]">{sendResult}</p> : null}
      {error ? <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}

      {loading ? null : campaigns.length === 0 ? (
        <div className="max-w-xl border border-[#eeeaf1] bg-white p-10 text-center">
          <FiMail className="mx-auto size-7 text-[#b5abbe]" />
          <p className="mt-3 text-sm font-medium">No campaigns yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#847b89]">
            Pick a template, choose your audience, and inject a custom payload — {'{{ plan }}'}, {'{{ amount }}'} — at send time.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((campaign) => {
            const meta = STATUS_META[campaign.status];
            return (
              <div key={campaign.id} className="flex flex-wrap items-center gap-4 border border-[#eeeaf1] bg-white px-5 py-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Link className="truncate text-sm font-semibold tracking-[-0.02em] hover:text-[#7a4fa3]" to={`/mailer/campaigns/${campaign.id}`}>
                      {campaign.name || "Untitled campaign"}
                    </Link>
                    <Badge className={`px-2 py-0.5 text-[10px] font-medium ${meta.className}`} variant="secondary">
                      {meta.label}
                    </Badge>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-[#847b89]">
                    {campaign.subject || "No subject"}
                    {campaign.sentAt ? ` · sent ${formatDistanceToNow(new Date(campaign.sentAt), { addSuffix: true })}` : ` · created ${formatDistanceToNow(new Date(campaign.createdAt), { addSuffix: true })}`}
                    {campaign.recipientCount ? ` · ${campaign.recipientCount} recipient${campaign.recipientCount === 1 ? "" : "s"}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    className="h-8 border-[#e8e4ee] bg-white text-[#5f5568] shadow-none hover:bg-[#f7f5f8]"
                    onClick={() => navigate(`/mailer/campaigns/${campaign.id}`)}
                    size="sm"
                    variant="outline"
                  >
                    <FiEye className="size-3.5" />
                    Stats
                  </Button>
                  {campaign.status === "DRAFT" || campaign.status === "FAILED" ? (
                    <Button className="h-8 bg-[#7a4fa3] px-3 hover:bg-[#6a4290]" disabled={sending === campaign.id} onClick={() => void sendCampaign(campaign)} size="sm">
                      {sending === campaign.id ? <FiLoader className="size-3.5 animate-spin" /> : <FiSend className="size-3.5" />}
                      {campaign.status === "FAILED" ? "Retry" : "Send"}
                    </Button>
                  ) : null}
                  <button className="rounded p-1.5 text-[#a49ba9] hover:bg-red-50 hover:text-red-600" onClick={() => void deleteCampaign(campaign)} title="Delete campaign" type="button">
                    <FiTrash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ComposeCampaignDialog
        onClose={() => setComposeOpen(false)}
        open={composeOpen}
        onCreated={(campaign) => {
          setCampaigns((current) => [campaign, ...current]);
          setComposeOpen(false);
        }}
        templates={templates}
      />
    </AppPageFrame>
  );
}

function ComposeCampaignDialog({
  open,
  onClose,
  onCreated,
  templates,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (campaign: CampaignSummary) => void;
  templates: TemplateSummary[];
}) {
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [payloadRows, setPayloadRows] = useState<PayloadRow[]>([{ id: "1", key: "", value: "" }]);
  const [testEmail, setTestEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const template = templates.find((entry) => entry.id === templateId) ?? null;
  const templateVariables = useMemo(() => (template ? extractVariables(template.subject) : []), [template]);

  function buildPayload(): Record<string, string> {
    const payload: Record<string, string> = {};
    for (const row of payloadRows) {
      if (row.key.trim()) payload[row.key.trim()] = row.value;
    }
    return payload;
  }

  async function create(sendAfter: boolean, testTo?: string) {
    setCreating(true);
    setError("");
    setNotice("");
    try {
      const result = await api<{ campaign: CampaignSummary }>("/api/mailer/campaigns", {
        body: JSON.stringify({ name, subject, templateId: templateId || null, payload: JSON.stringify(buildPayload()) }),
        method: "POST",
      });
      if (testTo) {
        await api(`/api/mailer/campaigns/${result.campaign.id}/send`, {
          body: JSON.stringify({ testEmail: testTo }),
          method: "POST",
        });
        setNotice(`Test email sent to ${testTo}. The draft is saved — send it for real whenever you're ready.`);
        onCreated(result.campaign);
      } else if (sendAfter) {
        const sendResult = await api<{ sent: number; failed: number }>(`/api/mailer/campaigns/${result.campaign.id}/send`, {
          body: JSON.stringify({}),
          method: "POST",
        });
        onCreated({ ...result.campaign, status: "SENT", sentAt: new Date().toISOString(), recipientCount: sendResult.sent });
        onClose();
      } else {
        onCreated(result.campaign);
        onClose();
      }
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the campaign.");
    }
    setCreating(false);
  }

  return (
    <Dialog onOpenChange={(next) => (next ? null : onClose())} open={open}>
      <DialogContent className="max-w-lg border-[#eeeaf1]">
        <DialogHeader>
          <DialogTitle className="text-base">New campaign</DialogTitle>
          <DialogDescription>Choose a template and audience. Custom payload values are injected into {'{{ variables }}'} at send time, overriding contact properties.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Campaign name</Label>
            <Input className="border-[#e8e4ee]" onChange={(event) => setName(event.target.value)} placeholder="October product update" value={name} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Subject — try Hi {'{{ name }}'}, …</Label>
            <Input className="border-[#e8e4ee]" onChange={(event) => setSubject(event.target.value)} placeholder="Your subject line" value={subject} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Template</Label>
            <Select onValueChange={setTemplateId} value={templateId}>
              <SelectTrigger className="border-[#e8e4ee]">
                <SelectValue placeholder="Pick a template" />
              </SelectTrigger>
              <SelectContent>
                {templates.map((entry) => (
                  <SelectItem key={entry.id} value={entry.id}>{entry.name || "Untitled template"}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {templateVariables.length ? (
              <p className="text-[11px] text-[#a49ba9]">Subject variables: {templateVariables.map((key) => (
                <code className="rounded bg-[#f4f2f6] px-1 text-[10px] text-[#7a4fa3]" key={key}>{`{{ ${key} }}`}</code>
              ))}</p>
            ) : null}
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Custom payload — injected at send time</Label>
            <div className="space-y-1.5">
              {payloadRows.map((row, index) => (
                <div className="flex gap-1.5" key={row.id}>
                  <Input
                    className="h-8 border-[#e8e4ee] text-xs"
                    onChange={(event) => setPayloadRows((rows) => rows.map((entry) => (entry.id === row.id ? { ...entry, key: event.target.value } : entry)))}
                    placeholder="key — e.g. plan"
                    value={row.key}
                  />
                  <Input
                    className="h-8 flex-1 border-[#e8e4ee] text-xs"
                    onChange={(event) => setPayloadRows((rows) => rows.map((entry) => (entry.id === row.id ? { ...entry, value: event.target.value } : entry)))}
                    placeholder="value — e.g. Pro"
                    value={row.value}
                  />
                  <button
                    className="rounded p-1.5 text-[#a49ba9] hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                    disabled={payloadRows.length === 1}
                    onClick={() => setPayloadRows((rows) => rows.filter((entry) => entry.id !== row.id))}
                    title="Remove row"
                    type="button"
                  >
                    <FiX className="size-3.5" />
                  </button>
                  {index === payloadRows.length - 1 ? (
                    <button
                      className="rounded p-1.5 text-[#7a4fa3] hover:bg-[#f7f3fb]"
                      onClick={() => setPayloadRows((rows) => [...rows, { id: `${Date.now()}`, key: "", value: "" }])}
                      title="Add row"
                      type="button"
                    >
                      <FiPlus className="size-3.5" />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Optional test email</Label>
            <div className="flex gap-1.5">
              <Input className="h-8 flex-1 border-[#e8e4ee] text-xs" onChange={(event) => setTestEmail(event.target.value)} placeholder="you@example.com" type="email" value={testEmail} />
              <Button className="h-8 border-[#e8e4ee] bg-white text-[#5f5568] shadow-none hover:bg-[#f7f5f8]" disabled={creating || !testEmail || !templateId} onClick={() => void create(false, testEmail)} size="sm" variant="outline">
                <FiZap className="size-3.5" />
                Send test
              </Button>
            </div>
          </div>
          {notice ? <p className="text-xs text-[#3d8a55]">{notice}</p> : null}
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button className="border-[#e8e4ee] bg-white text-[#5f5568] shadow-none hover:bg-[#f7f5f8]" disabled={creating} onClick={() => void create(false)} size="sm" variant="outline">
            Save draft
          </Button>
          <Button className="bg-[#7a4fa3] hover:bg-[#6a4290]" disabled={creating || !templateId} onClick={() => void create(true)}>
            {creating ? <FiLoader className="size-4 animate-spin" /> : <FiSend className="size-4" />}
            Send to audience
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Campaign detail ----------------------------- */

type MailerEvent = {
  id: string;
  email: string;
  type: "SENT" | "OPENED" | "CLICKED" | "FAILED";
  meta: string;
  createdAt: string;
};

const EVENT_ICONS = { SENT: FiCheckCircle, OPENED: FiEye, CLICKED: FiMousePointer, FAILED: FiXCircle } as const;

export function CampaignDetailPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState<CampaignSummary | null>(null);
  const [events, setEvents] = useState<MailerEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [campaignsResult, eventsResult] = await Promise.all([
          api<{ campaigns: CampaignSummary[] }>("/api/mailer/campaigns"),
          api<{ events: MailerEvent[] }>(`/api/mailer/campaigns/${campaignId}/events`),
        ]);
        if (cancelled) return;
        setCampaign(campaignsResult.campaigns.find((entry) => entry.id === campaignId) ?? null);
        setEvents(eventsResult.events);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : "Could not load this campaign.");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [campaignId]);

  const stats = useMemo(() => {
    const sent = events.filter((event) => event.type === "SENT").length;
    const failed = events.filter((event) => event.type === "FAILED").length;
    const opened = events.filter((event) => event.type === "OPENED").length;
    const clicked = events.filter((event) => event.type === "CLICKED").length;
    return { sent, failed, opened, clicked, deliveries: sent + failed };
  }, [events]);

  const series = useMemo(() => {
    const map = new Map<string, { date: string; sent: number; opened: number; clicked: number }>();
    for (let index = 13; index >= 0; index -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - index);
      map.set(date.toISOString().slice(0, 10), { date: date.toISOString().slice(0, 10), sent: 0, opened: 0, clicked: 0 });
    }
    for (const event of events) {
      const entry = map.get(event.createdAt.slice(0, 10));
      if (!entry) continue;
      if (event.type === "SENT" || event.type === "FAILED") entry.sent += 1;
      if (event.type === "OPENED") entry.opened += 1;
      if (event.type === "CLICKED") entry.clicked += 1;
    }
    return [...map.values()].map((entry) => ({ ...entry, label: format(new Date(`${entry.date}T00:00:00`), "MMM d") }));
  }, [events]);

  if (loading) {
    return <main className="grid h-full place-items-center text-xs text-[#928995]">Opening campaign…</main>;
  }
  if (!campaign) {
    return (
      <AppPageFrame description="Campaign" title="Not found">
        <p className="text-sm text-[#847b89]">{error || "This campaign no longer exists."}</p>
        <Button className="mt-4 bg-[#7a4fa3] hover:bg-[#6a4290]" onClick={() => navigate("/mailer/campaigns")}>
          <FiArrowLeft className="size-4" />
          Back to campaigns
        </Button>
      </AppPageFrame>
    );
  }

  const meta = STATUS_META[campaign.status];
  const chartConfig = {
    sent: { label: "Delivered", color: "#7a4fa3" },
    opened: { label: "Opened", color: "#4f9d69" },
    clicked: { label: "Clicked", color: "#d9942b" },
  } satisfies ChartConfig;

  return (
    <AppPageFrame
      description={campaign.subject || "No subject"}
      title={campaign.name || "Untitled campaign"}
    >
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <Badge className={`px-2.5 py-1 text-[10px] font-medium ${meta.className}`} variant="secondary">
          {meta.label}
        </Badge>
        {campaign.sentAt ? (
          <span className="text-xs text-[#8c838f]">
            Sent {format(new Date(campaign.sentAt), "MMM d, yyyy 'at' HH:mm")} · {campaign.recipientCount} recipient{campaign.recipientCount === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FiCheckCircle} label="Delivered" tone="text-[#7a4fa3]" value={stats.deliveries} />
        <StatCard icon={FiEye} label="Unique opens" tone="text-[#4f9d69]" value={stats.opened} />
        <StatCard icon={FiMousePointer} label="Unique clicks" tone="text-[#d9942b]" value={stats.clicked} />
        <StatCard icon={FiXCircle} label="Failed" tone="text-red-500" value={stats.failed} />
      </div>

      <div className="mb-6 border border-[#eeeaf1] bg-white p-5">
        <h2 className="text-sm font-semibold tracking-[-0.02em]">Engagement, last 14 days</h2>
        <ChartContainer className="mt-4 h-56 w-full" config={chartConfig}>
          <AreaChart data={series} margin={{ left: -20, right: 8 }}>
            <defs>
              <linearGradient id="fillSent" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#7a4fa3" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#7a4fa3" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis axisLine={false} dataKey="label" tickLine={false} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={40} />
            <ChartTooltip content={<ChartTooltipContent />} cursor={{ stroke: "#e8e4ee" }} />
            <Area dataKey="sent" fill="url(#fillSent)" stroke="#7a4fa3" strokeWidth={2} type="monotone" />
            <Area dataKey="opened" fill="transparent" stroke="#4f9d69" strokeWidth={1.5} type="monotone" />
            <Area dataKey="clicked" fill="transparent" stroke="#d9942b" strokeWidth={1.5} type="monotone" />
          </AreaChart>
        </ChartContainer>
      </div>

      <div className="border border-[#eeeaf1] bg-white">
        <div className="border-b border-[#f0edf3] px-5 py-3">
          <h2 className="text-sm font-semibold tracking-[-0.02em]">Recent events</h2>
        </div>
        {events.length === 0 ? (
          <p className="px-5 py-8 text-center text-xs text-[#a49ba9]">No events yet.</p>
        ) : (
          <ul>
            {events.slice(0, 100).map((event) => {
              const Icon = EVENT_ICONS[event.type];
              return (
                <li className="flex items-center gap-3 border-b border-[#f6f4f8] px-5 py-2.5 text-[13px] last:border-0" key={event.id}>
                  <Icon className={`size-4 ${event.type === "FAILED" ? "text-red-500" : event.type === "OPENED" ? "text-[#4f9d69]" : event.type === "CLICKED" ? "text-[#d9942b]" : "text-[#a49ba9]"}`} />
                  <span className="min-w-0 flex-1 truncate">{event.email}</span>
                  <Badge variant="secondary" className="bg-[#f5f3f6] px-2 py-0.5 text-[10px] font-medium text-[#8c838f]">
                    {event.type}
                  </Badge>
                  <span className="hidden whitespace-nowrap text-xs text-[#a49ba9] sm:block">
                    {format(new Date(event.createdAt), "MMM d, HH:mm:ss")}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </AppPageFrame>
  );
}

function StatCard({ icon: Icon, label, tone, value }: { icon: typeof FiMail; label: string; tone: string; value: number }) {
  return (
    <div className="border border-[#eeeaf1] bg-white px-5 py-4">
      <div className={`flex items-center gap-2 text-xs font-medium ${tone}`}>
        <Icon className="size-3.5" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">{value.toLocaleString()}</p>
    </div>
  );
}
