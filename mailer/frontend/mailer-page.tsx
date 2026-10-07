import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  FiCheckCircle,
  FiEye,
  FiExternalLink,
  FiFileText,
  FiHelpCircle,
  FiHome,
  FiLayers,
  FiLoader,
  FiMail,
  FiMousePointer,
  FiServer,
  FiTrash2,
  FiTrendingUp,
  FiUsers,
  FiX,
} from "react-icons/fi";
import { api } from "@/lib/api-client";
import { AppPageFrame, AppShell } from "@/general/frontend/app-shell";
import { useConfirm } from "@/components/confirm-alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

const mailerPages = [
  { end: true, icon: FiHome, label: "Overview", to: "/mailer" },
  { icon: FiMail, label: "Campaigns", to: "/mailer/campaigns" },
  { icon: FiLayers, label: "Templates", to: "/mailer/templates" },
  { icon: FiUsers, label: "Audiences", to: "/mailer/audiences" },
];

export function MailerLayout() {
  return (
    <AppShell
      accent="bg-[#f4ecfb] text-[#8957a5]"
      appName="Mailer"
      icon={FiMail}
      pages={mailerPages}
    />
  );
}

/* --------------------------------- Analytics -------------------------------- */

type Analytics = {
  series: { date: string; sent: number; opened: number; clicked: number }[];
  totals: {
    sent: number;
    opened: number;
    clicked: number;
    failed: number;
    openRate: number;
    clickRate: number;
    contacts: number;
    subscribedContacts: number;
    templates: number;
  };
};

const chartConfig = {
  sent: { label: "Sent", color: "#7a4fa3" },
  opened: { label: "Opened", color: "#4f9d69" },
  clicked: { label: "Clicked", color: "#d9942b" },
} satisfies ChartConfig;

export function MailerOverviewPage() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAnalytics = useCallback(async () => {
    setError("");
    try {
      const result = await api<{ analytics: Analytics }>("/api/mailer/analytics");
      setAnalytics(result.analytics);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your analytics.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const totals = analytics?.totals;

  return (
    <AppPageFrame description="Email campaigns, thoughtfully organized." title="Overview">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FiCheckCircle} label="Emails delivered" loading={loading} value={totals?.sent ?? 0} />
        <StatCard icon={FiEye} label="Open rate" loading={loading} suffix="%" value={totals?.openRate ?? 0} />
        <StatCard icon={FiMousePointer} label="Click rate" loading={loading} suffix="%" value={totals?.clickRate ?? 0} />
        <StatCard icon={FiUsers} label="Subscribed contacts" loading={loading} value={totals?.subscribedContacts ?? 0} />
      </div>

      <div className="mt-6 border border-[#eeeaf1] bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-[-0.02em]">Sends, opens &amp; clicks — last 30 days</h2>
          <Badge variant="secondary" className="bg-[#f5f3f6] px-2 py-0.5 text-[10px] font-medium text-[#8c838f]">
            <FiTrendingUp className="mr-1 size-3" />
            Live tracking
          </Badge>
        </div>
        {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}
        <ChartContainer className="mt-4 h-64 w-full" config={chartConfig}>
          <AreaChart data={(analytics?.series ?? []).map((entry) => ({ ...entry, label: entry.date.slice(5) }))} margin={{ left: -20, right: 8 }}>
            <defs>
              <linearGradient id="overviewSent" x1="0" x2="0" y1="0" y2="1">
                <stop offset="5%" stopColor="#7a4fa3" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#7a4fa3" stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis axisLine={false} dataKey="label" interval={4} tickLine={false} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={40} />
            <ChartTooltip content={<ChartTooltipContent />} cursor={{ stroke: "#e8e4ee" }} />
            <Area dataKey="sent" fill="url(#overviewSent)" stroke="#7a4fa3" strokeWidth={2} type="monotone" />
            <Area dataKey="opened" fill="transparent" stroke="#4f9d69" strokeWidth={1.5} type="monotone" />
            <Area dataKey="clicked" fill="transparent" stroke="#d9942b" strokeWidth={1.5} type="monotone" />
          </AreaChart>
        </ChartContainer>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <SmtpCard onChanged={() => void loadAnalytics()} />
        <FooterCard />
        <SmtpGuideCard />
      </div>
    </AppPageFrame>
  );
}

function StatCard({ icon: Icon, label, loading, suffix, value }: { icon: typeof FiMail; label: string; loading: boolean; suffix?: string; value: number }) {
  return (
    <div className="border border-[#eeeaf1] bg-white px-5 py-4">
      <div className="flex items-center gap-2 text-xs font-medium text-[#8c838f]">
        <Icon className="size-3.5 text-[#7a4fa3]" />
        {label}
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-[-0.03em]">
        {loading ? <FiLoader className="size-4 animate-spin text-[#c5bfca]" /> : value.toLocaleString()}
        {suffix && !loading ? <span className="text-base font-medium text-[#8c838f]">{suffix}</span> : null}
      </p>
    </div>
  );
}

/* ------------------------------- SMTP settings ------------------------------ */

type SmtpStatus = {
  hasCustomSmtp: boolean;
  appFallbackAvailable: boolean;
  config: { id: string; host: string; port: number; secure: boolean; username: string; fromName: string; fromEmail: string; updatedAt: string } | null;
};

function SmtpCard({ onChanged }: { onChanged: () => void }) {
  const [status, setStatus] = useState<SmtpStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const { confirm, element: confirmElement } = useConfirm();

  const loadStatus = useCallback(async () => {
    setError("");
    try {
      const result = await api<SmtpStatus>("/api/mailer/smtp");
      setStatus(result);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load SMTP settings.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  async function removeCustom() {
    const confirmed = await confirm({
      title: "Remove your SMTP server?",
      description: "Campaigns will fall back to the app-wide SMTP server. This action cannot be undone.",
    });
    if (!confirmed) return;
    try {
      await api("/api/mailer/smtp", { method: "DELETE" });
      await loadStatus();
      onChanged();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove the SMTP configuration.");
    }
  }

  return (
    <div className="border border-[#eeeaf1] bg-white p-5">
      {confirmElement}
      <div className="flex items-center gap-2">
        <FiServer className="size-4 text-[#7a4fa3]" />
        <h2 className="text-sm font-semibold tracking-[-0.02em]">Sending email</h2>
        {loading ? (
          <FiLoader className="ml-auto size-3.5 animate-spin text-[#a49ba9]" />
        ) : (
          <Badge
            className={`ml-auto px-2 py-0.5 text-[10px] font-medium ${status?.hasCustomSmtp ? "bg-[#eef8f0] text-[#3d8a55]" : "bg-[#f6effc] text-[#7a4fa3]"}`}
            variant="secondary"
          >
            {status?.hasCustomSmtp ? "Your SMTP server" : status?.appFallbackAvailable ? "App fallback" : "Not configured"}
          </Badge>
        )}
      </div>

      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}

      <p className="mt-3 text-xs leading-5 text-[#847b89]">
        {status?.hasCustomSmtp
          ? `Campaigns are delivered through ${status.config?.host}:${status.config?.port} as ${status.config?.fromEmail}.`
          : status?.appFallbackAvailable
            ? "You're using the app-wide SMTP server (SMTP_* environment variables). Configure your own server below for dedicated deliverability."
            : "No SMTP server is available yet. Campaigns and test emails will fail until you configure one below or set the app's SMTP_* environment variables."}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="h-8 bg-[#7a4fa3] px-3 hover:bg-[#6a4290]" onClick={() => setDialogOpen(true)} size="sm">
          {status?.hasCustomSmtp ? "Edit SMTP" : "Configure SMTP"}
        </Button>
        {status?.hasCustomSmtp ? (
          <Button className="h-8 border-[#e8e4ee] bg-white text-[#5f5568] shadow-none hover:bg-[#f7f5f8]" onClick={() => void removeCustom()} size="sm" variant="outline">
            <FiTrash2 className="size-3.5" />
            Remove
          </Button>
        ) : null}
      </div>

      {status ? (
        <SmtpDialog
          current={status.config}
          onClose={() => setDialogOpen(false)}
          onSaved={async () => {
            setDialogOpen(false);
            await loadStatus();
            onChanged();
          }}
          open={dialogOpen}
        />
      ) : null}
    </div>
  );
}

function FooterCard() {
  const [footerText, setFooterText] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ footerText: string }>("/api/mailer/settings")
      .then((result) => setFooterText(result.footerText))
      .catch(() => setError("Could not load the footer text."))
      .finally(() => setLoading(false));
  }, []);

  async function save() {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const result = await api<{ footerText: string }>("/api/mailer/settings", {
        body: JSON.stringify({ footerText }),
        method: "PUT",
      });
      setFooterText(result.footerText);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the footer text.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-[#eeeaf1] bg-white p-5">
      <div className="flex items-center gap-2">
        <FiFileText className="size-4 text-[#7a4fa3]" />
        <h2 className="text-sm font-semibold tracking-[-0.02em]">Email footer</h2>
        {loading ? <FiLoader className="ml-auto size-3.5 animate-spin text-[#a49ba9]" /> : null}
      </div>

      {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}

      <p className="mt-3 text-xs leading-5 text-[#847b89]">
        Shown at the bottom of every campaign. Variables like {"{{ email }}"} and {"{{ name }}"} work here. An
        Unsubscribe link is added automatically for each recipient.
      </p>

      <Textarea
        className="mt-3 min-h-[70px] border-[#e8e4ee] text-xs"
        disabled={loading}
        maxLength={500}
        onChange={(event) => setFooterText(event.target.value)}
        placeholder="You're receiving this email because you're part of this workspace's audience."
        value={footerText}
      />
      <p className="mt-1 text-right text-[10px] text-[#a49ba9]">{footerText.length}/500</p>

      <div className="mt-3 flex items-center justify-end gap-2">
        {saved ? (
          <span className="flex items-center gap-1 text-xs text-[#3d8a55]">
            <FiCheckCircle className="size-3.5" /> Saved
          </span>
        ) : null}
        <Button
          className="h-8 bg-[#7a4fa3] px-3 hover:bg-[#6a4290]"
          disabled={loading || saving}
          onClick={() => void save()}
          size="sm"
        >
          {saving ? <FiLoader className="size-3.5 animate-spin" /> : null} Save footer
        </Button>
      </div>
    </div>
  );
}

function SmtpDialog({ open, onClose, onSaved, current }: { open: boolean; onClose: () => void; onSaved: () => void; current: SmtpStatus["config"] }) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("587");
  const [secure, setSecure] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [fromName, setFromName] = useState("");
  const [fromEmail, setFromEmail] = useState("");
  const [testTo, setTestTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [initialised, setInitialised] = useState(false);

  useEffect(() => {
    if (!open || initialised) return;
    if (current) {
      setHost(current.host);
      setPort(String(current.port));
      setSecure(current.secure);
      setUsername(current.username);
      setFromName(current.fromName);
      setFromEmail(current.fromEmail);
    } else {
      setHost("");
      setPort("587");
      setSecure(true);
      setUsername("");
      setFromName("");
      setFromEmail("");
    }
    setPassword("");
    setTestTo("");
    setMessage(null);
    setInitialised(true);
  }, [open, current, initialised]);

  function buildBody() {
    return JSON.stringify({
      host,
      port: Number(port) || 587,
      secure,
      username,
      password,
      fromName,
      fromEmail,
    });
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/mailer/smtp", { body: buildBody(), method: "PUT" });
      setMessage({ ok: true, text: "SMTP server saved." });
      onSaved();
    } catch (saveError) {
      setMessage({ ok: false, text: saveError instanceof Error ? saveError.message : "Could not save the SMTP settings." });
    }
    setBusy(false);
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    try {
      await api("/api/mailer/smtp", { body: buildBody(), method: "PUT" });
      const result = await api<{ source: string }>("/api/mailer/smtp/test", {
        body: JSON.stringify({ to: testTo }),
        method: "POST",
      });
      setMessage({ ok: true, text: `Test email sent via ${result.source === "user" ? "your SMTP server" : "the app's SMTP server"}.` });
      onSaved();
    } catch (testError) {
      setMessage({ ok: false, text: testError instanceof Error ? testError.message : "The test email could not be sent." });
    }
    setBusy(false);
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          setInitialised(false);
          onClose();
        }
      }}
      open={open}
    >
      <DialogContent className="max-w-md border-[#eeeaf1]">
        <DialogHeader>
          <DialogTitle className="text-base">SMTP server</DialogTitle>
          <DialogDescription>
            Used for campaigns and test sends. Without one, Tuno falls back to the app's SMTP_* environment variables.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-[1fr_100px] gap-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">Host</Label>
              <Input className="border-[#e8e4ee]" onChange={(event) => setHost(event.target.value)} placeholder="smtp.resend.com" value={host} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">Port</Label>
              <Input className="border-[#e8e4ee]" onChange={(event) => setPort(event.target.value)} placeholder="587" type="number" value={port} />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-[#f0edf3] bg-[#fbfafc] px-3 py-2">
            <div>
              <p className="text-xs font-medium">TLS / SSL</p>
              <p className="text-[11px] text-[#a49ba9]">Usually on for port 465, STARTTLS for 587.</p>
            </div>
            <Switch checked={secure} onCheckedChange={setSecure} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Username</Label>
            <Input className="border-[#e8e4ee]" onChange={(event) => setUsername(event.target.value)} placeholder="resend" value={username} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Password{current ? " (leave blank to keep)" : ""}</Label>
            <Input className="border-[#e8e4ee]" onChange={(event) => setPassword(event.target.value)} placeholder="••••••••" type="password" value={password} />
            <p className="text-[11px] text-[#a49ba9]">Stored encrypted (AES-256-GCM) and never displayed again.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="grid gap-1.5">
              <Label className="text-xs">From name</Label>
              <Input className="border-[#e8e4ee]" onChange={(event) => setFromName(event.target.value)} placeholder="Tuno" value={fromName} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">From email</Label>
              <Input className="border-[#e8e4ee]" onChange={(event) => setFromEmail(event.target.value)} placeholder="hello@yourdomain.com" type="email" value={fromEmail} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Send a test to</Label>
            <div className="flex gap-1.5">
              <Input className="h-8 flex-1 border-[#e8e4ee] text-xs" onChange={(event) => setTestTo(event.target.value)} placeholder="you@example.com" type="email" value={testTo} />
              <Button className="h-8 border-[#e8e4ee] bg-white text-[#5f5568] shadow-none hover:bg-[#f7f5f8]" disabled={busy || !testTo || !host || !username || (!password && !current)} onClick={() => void sendTest()} size="sm" variant="outline">
                Save &amp; test
              </Button>
            </div>
          </div>
          {message ? <p className={`text-xs ${message.ok ? "text-[#3d8a55]" : "text-red-600"}`}>{message.text}</p> : null}
        </div>
        <DialogFooter>
          <Button className="bg-[#7a4fa3] hover:bg-[#6a4290]" disabled={busy || !host || !username || (!password && !current)} onClick={() => void save()}>
            {busy ? <FiLoader className="size-4 animate-spin" /> : <FiCheckCircle className="size-4" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------- SMTP provider guide card ------------------------- */

export function SmtpGuideCard() {
  return (
    <div className="border border-[#eeeaf1] bg-white p-5">
      <div className="flex items-center gap-2">
        <FiHelpCircle className="size-4 text-[#7a4fa3]" />
        <h2 className="text-sm font-semibold tracking-[-0.02em]">Don't have an SMTP server?</h2>
      </div>
      <p className="mt-3 text-xs leading-5 text-[#847b89]">
        Any SMTP provider works. Here's how to get credentials from the two we recommend — then paste them into the SMTP form.
      </p>

      <Tabs className="mt-4" defaultValue="resend">
        <TabsList className="h-8">
          <TabsTrigger className="text-xs" value="resend">Resend</TabsTrigger>
          <TabsTrigger className="text-xs" value="ses">AWS SES</TabsTrigger>
        </TabsList>

        <TabsContent className="mt-3" value="resend">
          <ol className="space-y-2 text-xs leading-5 text-[#5f5568]">
            <li>
              <strong>1.</strong> Sign up at{" "}
              <a className="inline-flex items-center gap-0.5 text-[#7a4fa3] underline" href="https://resend.com" rel="noreferrer" target="_blank">
                resend.com <FiExternalLink className="size-3" />
              </a>{" "}
              and add + verify your sending domain (or verify a single email to start).
            </li>
            <li>
              <strong>2.</strong> Open <em>API Keys</em> and create a key starting with <code className="rounded bg-[#f4f2f6] px-1">re_</code>. Resend exposes it over SMTP automatically.
            </li>
            <li>
              <strong>3.</strong> Fill the SMTP form with:
              <ul className="ml-4 mt-1 list-disc space-y-0.5">
                <li>Host <code className="rounded bg-[#f4f2f6] px-1">smtp.resend.com</code></li>
                <li>Port <code className="rounded bg-[#f4f2f6] px-1">465</code> (SSL) or <code className="rounded bg-[#f4f2f6] px-1">587</code></li>
                <li>Username <code className="rounded bg-[#f4f2f6] px-1">resend</code></li>
                <li>Password: your <code className="rounded bg-[#f4f2f6] px-1">re_…</code> API key</li>
                <li>From email: an address on your verified domain</li>
              </ul>
            </li>
          </ol>
        </TabsContent>

        <TabsContent className="mt-3" value="ses">
          <ol className="space-y-2 text-xs leading-5 text-[#5f5568]">
            <li>
              <strong>1.</strong> Open the{" "}
              <a className="inline-flex items-center gap-0.5 text-[#7a4fa3] underline" href="https://console.aws.amazon.com/console/home" rel="noreferrer" target="_blank">
                AWS Console <FiExternalLink className="size-3" />
              </a>{" "}
              → <em>Amazon SES</em> → pick a region, then verify your sending identity under <em>Identities</em> (a domain or a single email).
            </li>
            <li>
              <strong>2.</strong> In SES, go to <em>SMTP settings</em> → <em>Create SMTP credentials</em>. AWS generates an SMTP username and password for you (they are different from your AWS access keys).
            </li>
            <li>
              <strong>3.</strong> Fill the SMTP form with:
              <ul className="ml-4 mt-1 list-disc space-y-0.5">
                <li>Host <code className="rounded bg-[#f4f2f6] px-1">email-smtp.REGION.amazonaws.com</code> (e.g. <code className="rounded bg-[#f4f2f6] px-1">eu-north-1</code>)</li>
                <li>Port <code className="rounded bg-[#f4f2f6] px-1">587</code> (STARTTLS) or <code className="rounded bg-[#f4f2f6] px-1">465</code></li>
                <li>Username / password: the SES SMTP credentials from step 2</li>
                <li>From email: your verified identity</li>
              </ul>
            </li>
            <li><strong>4.</strong> New SES accounts are in the sandbox — request production access in the SES console before emailing real audiences.</li>
          </ol>
        </TabsContent>
      </Tabs>

      <p className="mt-4 border-t border-[#f0edf3] pt-3 text-[11px] leading-5 text-[#a49ba9]">
        Tip: warm up new SMTP accounts with small sends first — large cold blasts from a fresh domain are the fastest way to land in spam.
      </p>
    </div>
  );
}
