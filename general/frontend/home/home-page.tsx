import { useEffect, useState } from "react";
import { FiArrowLeft, FiArrowRight, FiBriefcase, FiCalendar, FiCheck, FiCheckSquare, FiCopy, FiDatabase, FiFileText, FiFolder, FiGlobe, FiGrid, FiKey, FiMail, FiSettings, FiShield, FiTrash2, FiUsers, FiUser, FiUserPlus } from "react-icons/fi";
import { Link } from "react-router-dom";
import { z } from "zod";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { api, type ApiKeyRecord, type User, type WorkspaceSettings } from "@/lib/api-client";
import { WorkspaceShell } from "@/general/frontend/workspace-shell";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { isSupportedTimezone } from "@/lib/timezones";
import { TimezoneSelector } from "@/general/frontend/home/timezone-selector";

const settingsSchema = z.object({
  workspaceName: z.string().trim().min(1, "Workspace name is required.").max(120),
  timezone: z.string().trim().refine(isSupportedTimezone, "Choose a time zone."),
});

type SettingsForm = z.infer<typeof settingsSchema>;
const memberInvitationSchema = z.object({ email: z.email("Enter a valid email address.") });
type MemberInvitationForm = z.infer<typeof memberInvitationSchema>;

type TeamMember = { id: string; email: string; role: User["role"]; createdAt: string };
type PendingInvitation = { id: string; email: string; expiresAt: string };

const nameSchema = z.object({
  name: z.string().trim().min(1, "Name is required.").max(80, "Name must be 80 characters or fewer."),
});
type NameForm = z.infer<typeof nameSchema>;

const apiKeySchema = z.object({
  name: z.string().trim().min(1, "Key name is required.").max(100, "Key name must be 100 characters or fewer."),
  expiresAt: z.date().optional(),
});
type ApiKeyForm = z.infer<typeof apiKeySchema>;

function formatDate(value: string | Date): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function maskKey(key: string): string {
  return `${key.slice(0, 8)}${"•".repeat(16)}`;
}

function SettingsPanel() {
  const [settings, setSettings] = useState<WorkspaceSettings | null>(null);
  const [loadError, setLoadError] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const form = useForm<SettingsForm>({
    resolver: zodResolver(settingsSchema),
    defaultValues: { workspaceName: "", timezone: "" },
  });
  const { reset } = form;

  useEffect(() => {
    let active = true;
    api<{ settings: WorkspaceSettings }>("/api/settings")
      .then(({ settings: currentSettings }) => {
        if (!active) return;
        setSettings(currentSettings);
        reset(currentSettings);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : "Could not load settings.");
      });
    return () => { active = false; };
  }, [reset]);

  async function save(values: SettingsForm) {
    setSaving(true);
    setSaved(false);
    setLoadError("");
    try {
      const result = await api<{ settings: WorkspaceSettings }>("/api/settings", {
        method: "PUT",
        body: JSON.stringify({ settings: values }),
      });
      setSettings(result.settings);
      reset(result.settings);
      setSaved(true);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not save settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-[760px] border-[#eeeaf1] bg-white shadow-none">
      <CardHeader className="px-6 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center bg-[#f2eafa] text-[#78538c]"><FiSettings className="size-[17px]" /></div>
          <div><CardTitle className="text-sm">Workspace preferences</CardTitle><CardDescription className="mt-1 text-xs">Shared settings for your Tuno apps.</CardDescription></div>
        </div>
      </CardHeader>
      <Separator className="bg-[#f0edf2]" />
      {settings ? (
        <form onSubmit={form.handleSubmit(save)}>
          <CardContent className="space-y-6 px-6 py-6">
            <label className="block max-w-md space-y-2 text-xs font-medium">
              Workspace name
              <Input className="h-10 border-[#e9e6ed]" maxLength={120} {...form.register("workspaceName")} />
              {form.formState.errors.workspaceName?.message && <span className="block text-red-700">{form.formState.errors.workspaceName.message}</span>}
            </label>
            <label className="block max-w-md space-y-2 text-xs font-medium">
              Time zone
              <Controller
                control={form.control}
                name="timezone"
                render={({ field }) => (
                  <TimezoneSelector
                    invalid={Boolean(form.formState.errors.timezone)}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={field.onChange}
                  />
                )}
              />
              {form.formState.errors.timezone?.message
                ? <span className="block text-red-700">{form.formState.errors.timezone.message}</span>
                : <span className="block text-[10px] font-normal text-[#968d9a]">Used for dates and scheduled activity in connected apps.</span>}
            </label>
            {loadError && <p aria-live="polite" className="text-xs text-red-700">{loadError}</p>}
            {saved && <p aria-live="polite" className="flex items-center gap-1.5 text-xs text-[#47755b]"><FiCheck className="size-3.5" /> Your changes are saved.</p>}
          </CardContent>
          <Separator className="bg-[#f0edf2]" />
          <div className="flex items-center justify-between px-6 py-4">
            <span className="text-[10px] text-[#a198a5]">Changes are shared across your apps.</span>
            <Button className="h-9 bg-[#291b32] px-4 text-xs hover:bg-[#473252]" disabled={saving} type="submit">{saving ? "Saving…" : "Save changes"}</Button>
          </div>
        </form>
      ) : <div className="px-6 py-10 text-xs text-[#928995]">{loadError || "Loading your settings…"}</div>}
    </Card>
  );
}

function ProfilePanel({ user, onUserChange }: { user: User; onUserChange: (user: User) => void }) {
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const form = useForm<NameForm>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: user.name },
  });

  async function save(values: NameForm) {
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const result = await api<{ user: User }>("/api/user/me", {
        method: "PATCH",
        body: JSON.stringify({ name: values.name }),
      });
      form.reset({ name: result.user.name });
      onUserChange(result.user);
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not update your name.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mt-4 max-w-[760px] border-[#eeeaf1] bg-white shadow-none">
      <CardHeader className="px-6 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center bg-[#eaf0f8] text-[#587497]"><FiUser className="size-[17px]" /></div>
          <div><CardTitle className="text-sm">Your profile</CardTitle><CardDescription className="mt-1 text-xs">The name shown across your workspace.</CardDescription></div>
        </div>
      </CardHeader>
      <Separator className="bg-[#f0edf2]" />
      <form onSubmit={form.handleSubmit(save)}>
        <CardContent className="space-y-5 px-6 py-6">
          <label className="block max-w-md space-y-2 text-xs font-medium">
            Your name
            <Input className="h-10 border-[#e9e6ed]" maxLength={80} placeholder="Your name" {...form.register("name")} />
            {form.formState.errors.name?.message && <span className="block text-red-700">{form.formState.errors.name.message}</span>}
          </label>
          <label className="block max-w-md space-y-2 text-xs font-medium">
            Email
            <Input className="h-10 border-[#e9e6ed] bg-[#f8f7fa] text-[#7c7480]" disabled value={user.email} />
          </label>
          {error && <p aria-live="polite" className="text-xs text-red-700">{error}</p>}
          {saved && <p aria-live="polite" className="flex items-center gap-1.5 text-xs text-[#47755b]"><FiCheck className="size-3.5" /> Your name is updated.</p>}
        </CardContent>
        <Separator className="bg-[#f0edf2]" />
        <div className="flex items-center justify-between px-6 py-4">
          <span className="text-[10px] text-[#a198a5]">Only you can see changes until they're shared.</span>
          <Button className="h-9 bg-[#291b32] px-4 text-xs hover:bg-[#473252]" disabled={saving} type="submit">{saving ? "Saving…" : "Save name"}</Button>
        </div>
      </form>
    </Card>
  );
}

function ApiKeysPanel() {
  const [keys, setKeys] = useState<ApiKeyRecord[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [creating, setCreating] = useState(false);
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState("");
  const [revoking, setRevoking] = useState("");
  const form = useForm<ApiKeyForm>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: { name: "", expiresAt: undefined },
  });

  async function loadKeys() {
    const result = await api<{ keys: ApiKeyRecord[] }>("/api/keys");
    setKeys(result.keys);
  }

  useEffect(() => {
    let active = true;
    api<{ keys: ApiKeyRecord[] }>("/api/keys")
      .then((result) => {
        if (active) setKeys(result.keys);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load API keys.");
      });
    return () => { active = false; };
  }, []);

  async function createKey(values: ApiKeyForm) {
    setError("");
    setNotice("");
    setCreatedKey(null);
    setCreating(true);
    try {
      const result = await api<{ key: ApiKeyRecord }>("/api/keys", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          ...(values.expiresAt
            ? {
                expiresAt: new Date(
                  values.expiresAt.getFullYear(),
                  values.expiresAt.getMonth(),
                  values.expiresAt.getDate(),
                  23,
                  59,
                  59,
                ).toISOString(),
              }
            : {}),
        }),
      });
      form.reset();
      setCreatedKey(result.key.key);
      setCopiedKey("");
      await loadKeys();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the API key.");
    } finally {
      setCreating(false);
    }
  }

  async function revokeKey(key: string) {
    setError("");
    setNotice("");
    setRevoking(key);
    try {
      await api<void>(`/api/keys/${encodeURIComponent(key)}`, { method: "DELETE" });
      if (createdKey === key) setCreatedKey(null);
      setNotice("The API key was revoked.");
      await loadKeys();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Could not revoke the API key.");
    } finally {
      setRevoking("");
    }
  }

  async function copyKey(key: string) {
    try {
      await navigator.clipboard.writeText(key);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? "" : current)), 2000);
    } catch {
      setError("Could not copy the key to your clipboard.");
    }
  }

  return (
    <Card className="mt-4 max-w-[760px] border-[#eeeaf1] bg-white shadow-none">
      <CardHeader className="px-6 pb-4 pt-6">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center bg-[#f2eafa] text-[#78538c]"><FiKey className="size-[17px]" /></div>
          <div><CardTitle className="text-sm">API keys</CardTitle><CardDescription className="mt-1 text-xs">Let scripts and integrations call public API endpoints on your behalf.</CardDescription></div>
        </div>
      </CardHeader>
      <Separator className="bg-[#f0edf2]" />
      <CardContent className="space-y-5 px-6 py-6">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={form.handleSubmit(createKey)}>
          <label className="min-w-0 flex-1 space-y-1.5 text-xs font-medium">
            Key name
            <Input className="h-10 border-[#e9e6ed]" maxLength={100} placeholder="e.g. Zapier integration" {...form.register("name")} />
            {form.formState.errors.name?.message && <span className="block text-red-700">{form.formState.errors.name.message}</span>}
          </label>
          <label className="space-y-1.5 text-xs font-medium sm:w-52">
            Expires (optional)
            <Controller
              control={form.control}
              name="expiresAt"
              render={({ field }) => (
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      className={`h-10 w-full justify-between border-[#e9e6ed] bg-white px-3 text-xs font-normal shadow-none hover:bg-[#f8f7fa] ${field.value ? "text-[#211d26]" : "text-[#9b929f]"}`}
                      type="button"
                      variant="outline"
                    >
                      {field.value ? formatDate(field.value) : "Never expires"}
                      <FiCalendar className="size-3.5 text-[#8c838f]" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-auto p-0">
                    <Calendar
                      disabled={{ before: startOfToday() }}
                      mode="single"
                      selected={field.value}
                      onSelect={(date) => field.onChange(date ?? undefined)}
                    />
                    <div className="flex justify-end border-t border-[#f0edf2] p-2">
                      <Button className="h-7 px-2.5 text-[11px] text-[#736b78] hover:text-[#3e3543]" onClick={() => field.onChange(undefined)} size="sm" type="button" variant="ghost">
                        Clear expiry
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              )}
            />
            {form.formState.errors.expiresAt?.message && <span className="block text-red-700">{form.formState.errors.expiresAt.message}</span>}
          </label>
          <Button className="mt-auto h-10 bg-[#291b32] px-4 text-xs hover:bg-[#473252]" disabled={creating} type="submit">
            <FiKey className="size-4" /> {creating ? "Creating…" : "Create key"}
          </Button>
        </form>
        {error && <p aria-live="polite" className="bg-red-50 px-3.5 py-3 text-xs text-red-700">{error}</p>}
        {notice && <p aria-live="polite" className="flex items-center gap-1.5 text-xs text-[#47755b]"><FiCheck className="size-3.5" /> {notice}</p>}
        {createdKey && (
          <div className="space-y-2 bg-[#f3eef7] p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-[#4f3262]"><FiCheck className="size-3.5" /> Key created — copy it now.</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate bg-white px-3 py-2 font-mono text-[11px] text-[#3e3543]">{maskKey(createdKey)}</code>
              <Button aria-label="Copy API key" className="h-9 shrink-0 border-[#e9e6ed] bg-white px-3 text-xs text-[#3e3543] hover:bg-[#f8f7fa]" onClick={() => void copyKey(createdKey)} type="button" variant="outline">
                {copiedKey === createdKey ? <FiCheck className="size-3.5 text-[#47755b]" /> : <FiCopy className="size-3.5" />} {copiedKey === createdKey ? "Copied" : "Copy"}
              </Button>
            </div>
            <p className="text-[10px] text-[#8c838f]">Anyone with this key can call your workspace's public API until it expires or is revoked.</p>
          </div>
        )}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a49ba9]">Your keys</p>
          {keys === null && <p className="text-xs text-[#928995]">Loading your API keys…</p>}
          {keys !== null && keys.length === 0 && <p className="text-xs text-[#928995]">No API keys yet. Create one to connect external tools.</p>}
          {keys?.map((apiKey) => (
            <div className="flex items-center gap-3 border border-[#f0edf2] px-3 py-2.5" key={apiKey.key}>
              <div className="grid size-8 place-items-center bg-[#f4f2f5] text-[#8c838f]"><FiKey className="size-3.5" /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium">{apiKey.name}</p>
                <p className="mt-0.5 truncate font-mono text-[10px] text-[#968d9a]">{maskKey(apiKey.key)}</p>
              </div>
              <button aria-label={`Copy ${apiKey.name} key`} className="shrink-0 p-1.5 text-[#908794] hover:bg-[#f4f2f5] hover:text-[#3e3543]" onClick={() => void copyKey(apiKey.key)} title="Copy key" type="button">
                {copiedKey === apiKey.key ? <FiCheck className="size-3.5 text-[#47755b]" /> : <FiCopy className="size-3.5" />}
              </button>
              <span className="hidden shrink-0 text-[10px] text-[#9b929f] sm:block">Created {formatDate(apiKey.createdAt)}</span>
              {apiKey.expiresAt
                ? <Badge className={new Date(apiKey.expiresAt) <= new Date() ? "bg-red-50 text-[10px] text-red-700" : "text-[10px]"} variant="secondary">{new Date(apiKey.expiresAt) <= new Date() ? "Expired" : `Expires ${formatDate(apiKey.expiresAt)}`}</Badge>
                : <Badge variant="secondary" className="text-[10px]">Never expires</Badge>}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="shrink-0 text-[#908794] hover:bg-red-50 hover:text-red-700" disabled={revoking === apiKey.key} size="icon" type="button" variant="ghost">
                    <FiTrash2 className="size-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Revoke “{apiKey.name}”?</AlertDialogTitle>
                    <AlertDialogDescription>Integrations using this key will stop working immediately. This cannot be undone.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction className="bg-red-700 hover:bg-red-800" onClick={() => void revokeKey(apiKey.key)}>Revoke key</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      </CardContent>
      <Separator className="bg-[#f0edf2]" />
      <div className="px-6 py-4">
        <span className="text-[10px] text-[#a198a5]">Pass keys via <code className="font-mono">Authorization: Bearer</code> or <code className="font-mono">X-API-Key</code> headers on <code className="font-mono">/api/public/*</code> endpoints.</span>
      </div>
    </Card>
  );
}

function AppCard({
  appPath,
  description,
  icon,
  name,
  tint,
}: {
  appPath: string;
  description: string;
  icon: React.ReactNode;
  name: string;
  tint: string;
}) {
  return (
    <Card className="group border-[#eeeaf1] bg-white shadow-none transition hover:-translate-y-0.5 hover:border-[#ddd3e4] hover:shadow-[0_12px_30px_-22px_rgba(44,25,58,0.3)]">
      <CardContent className="p-5 sm:p-6">
        <div className="mb-5">
          <span className={`grid size-11 place-items-center ${tint}`}>{icon}</span>
        </div>
        <h3 className="text-[15px] font-semibold tracking-[-0.03em]">{name}</h3>
        <p className="mt-1.5 max-w-[330px] text-xs leading-5 text-[#928995]">{description}</p>
        <Link className="mt-5 inline-flex items-center gap-1.5 text-[11px] font-medium text-[#755984] transition group-hover:text-[#493254]" to={appPath}>
          Explore {name.toLowerCase()} <FiArrowRight className="size-3.5 transition group-hover:translate-x-0.5" />
        </Link>
      </CardContent>
    </Card>
  );
}

function TeamPanel() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sending, setSending] = useState(false);
  const form = useForm<MemberInvitationForm>({
    resolver: zodResolver(memberInvitationSchema),
    defaultValues: { email: "" },
  });

  async function loadMembers() {
    const result = await api<{ members: TeamMember[]; pendingInvitations: PendingInvitation[] }>("/api/team/members");
    setMembers(result.members);
    setPendingInvitations(result.pendingInvitations);
  }

  useEffect(() => {
    let active = true;
    api<{ members: TeamMember[]; pendingInvitations: PendingInvitation[] }>("/api/team/members")
      .then((result) => {
        if (!active) return;
        setMembers(result.members);
        setPendingInvitations(result.pendingInvitations);
      })
      .catch((loadError: unknown) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Could not load team members.");
      });
    return () => { active = false; };
  }, []);

  async function inviteMember({ email }: MemberInvitationForm) {
    setError("");
    setNotice("");
    setSending(true);
    try {
      const result = await api<{ message: string }>("/api/team/invitations", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      form.reset();
      setNotice(result.message);
      await loadMembers();
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : "Could not send the invitation.");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="mt-6 border-[#eeeaf1] bg-white shadow-none">
      <CardHeader className="px-5 pb-4 pt-5 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center bg-[#f2eafa] text-[#78538c]"><FiUsers className="size-[17px]" /></div>
          <div><CardTitle className="text-sm">Team members</CardTitle><CardDescription className="mt-1 text-xs">Invite teammates to join your workspace.</CardDescription></div>
        </div>
      </CardHeader>
      <Separator className="bg-[#f0edf2]" />
      <CardContent className="space-y-5 px-5 py-5 sm:px-6">
        <form className="flex flex-col gap-2 sm:flex-row" onSubmit={form.handleSubmit(inviteMember)}>
          <label className="min-w-0 flex-1 space-y-1.5 text-xs font-medium">
            Invite by email
            <Input className="h-10 border-[#e9e6ed]" placeholder="teammate@company.com" type="email" {...form.register("email")} />
            {form.formState.errors.email?.message && <span className="block text-red-700">{form.formState.errors.email.message}</span>}
          </label>
          <Button className="mt-auto h-10 bg-[#291b32] px-4 text-xs hover:bg-[#473252]" disabled={sending} type="submit">
            <FiUserPlus className="size-4" /> {sending ? "Sending…" : "Invite member"}
          </Button>
        </form>
        {error && <p aria-live="polite" className="bg-red-50 px-3.5 py-3 text-xs text-red-700">{error}</p>}
        {notice && <p aria-live="polite" className="flex items-center gap-1.5 text-xs text-[#47755b]"><FiCheck className="size-3.5" /> {notice}</p>}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a49ba9]">Workspace members</p>
          {members.map((member) => (
            <div className="flex items-center gap-3 border border-[#f0edf2] px-3 py-2.5" key={member.id}>
              <div className="grid size-8 place-items-center bg-[#e8dced] text-[10px] font-semibold uppercase text-[#513d5c]">{member.email[0]}</div>
              <span className="min-w-0 flex-1 truncate text-xs font-medium">{member.email}</span>
              <Badge variant="secondary" className="text-[9px]">{member.role.toLowerCase()}</Badge>
            </div>
          ))}
          {pendingInvitations.map((invitation) => (
            <div className="flex items-center gap-3 border border-dashed border-[#e5dfea] px-3 py-2.5" key={invitation.id}>
              <div className="grid size-8 place-items-center bg-[#f4f2f5] text-[#8c838f]"><FiMail className="size-3.5" /></div>
              <span className="min-w-0 flex-1 truncate text-xs text-[#716b76]">{invitation.email}</span>
              <span className="text-[9px] text-[#9b929f]">Invitation pending</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function HomePage({ user, onLogout, onUserChange }: { user: User; onLogout: () => void; onUserChange: (user: User) => void }) {
  const [view, setView] = useState<"apps" | "settings">("apps");
  const fallbackName = user.email.split("@")[0]?.split(/[._-]/)[0] ?? "there";
  const firstName = user.name.trim() && user.name.trim().toLowerCase() !== "user" ? user.name.trim().split(" ")[0] : fallbackName;
  const date = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(new Date());

  return (
    <WorkspaceShell pageName={view === "settings" ? "Settings" : "Overview"} user={user} onLogout={onLogout}>
      {view === "apps" ? (
        <>
          <div className="mb-9 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="mb-2 text-xs font-medium text-[#928995]">{date}</p>
              <h1 className="text-[34px] font-semibold tracking-[-0.06em] sm:text-[40px]">Good morning, {firstName}.</h1>
              <p className="mt-2 text-sm text-[#847b89]">A little space to make progress on what matters.</p>
            </div>
            <Button className="h-10 w-fit bg-[#291b32] px-4 text-xs hover:bg-[#473252]" onClick={() => setView("settings")}><FiSettings className="size-4" /> Workspace settings</Button>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              { label: "Workspace status", value: "All set up", detail: "Your account is ready", icon: FiCheck, tone: "bg-[#e7f2eb] text-[#47755b]" },
              { label: "Team members", value: "Your team", detail: "Invite teammates to your workspace", icon: FiUsers, tone: "bg-[#f2eafa] text-[#78538c]" },
              { label: "Apps connected", value: "7 apps", detail: "More coming soon", icon: FiGrid, tone: "bg-[#eaf0f8] text-[#587497]" },
            ].map((stat) => (
              <Card key={stat.label} className="border-[#eeeaf1] bg-white shadow-none">
                <CardContent className="flex items-start justify-between p-5">
                  <div><p className="text-xs text-[#928995]">{stat.label}</p><p className="mt-3 text-[21px] font-semibold tracking-[-0.04em]">{stat.value}</p><p className="mt-1.5 text-[11px] text-[#928995]">{stat.detail}</p></div>
                  <span className={`grid size-9 place-items-center ${stat.tone}`}><stat.icon className="size-[17px]" /></span>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mb-4 mt-10 flex items-end justify-between">
            <div><h2 className="text-lg font-semibold tracking-[-0.04em]">Your apps</h2><p className="mt-1 text-xs text-[#928995]">A home for the tools in your workflow.</p></div>
            <button className="hidden items-center gap-1 text-xs font-medium text-[#755984] hover:text-[#493254] sm:flex" onClick={() => setView("settings")}>Manage workspace <FiArrowRight className="size-3.5" /></button>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <AppCard appPath="/mailer" description="Create, organize, and send beautiful email campaigns." icon={<FiMail className="size-5" />} name="Mailer" tint="bg-[#f4ecfb] text-[#8957a5]" />
            <AppCard appPath="/notes" description="Capture thoughts and keep your team's knowledge close." icon={<FiFileText className="size-5" />} name="Notes" tint="bg-[#eef3f8] text-[#5e7e9e]" />
            <AppCard appPath="/forms" description="Build forms with skip logic and collect responses." icon={<FiCheckSquare className="size-5" />} name="Forms" tint="bg-[#eaf6ef] text-[#4e8a68]" />
            <AppCard appPath="/scheduler" description="Share booking links and let people schedule meetings with you." icon={<FiCalendar className="size-5" />} name="Scheduler" tint="bg-[#e8eefb] text-[#3b63a8]" />
            <AppCard appPath="/crm" description="Track leads, contacts, tasks, and notes in one pipeline." icon={<FiBriefcase className="size-5" />} name="CRM" tint="bg-[#eaf6ef] text-[#4e8a68]" />
            <AppCard appPath="/tasks" description="Organize work on kanban boards with your team." icon={<FiCheckSquare className="size-5" />} name="Tasks" tint="bg-[#e8eefb] text-[#3b63a8]" />
            <AppCard appPath="/documents" description="Store files in folders and share them with anyone." icon={<FiFolder className="size-5" />} name="Documents" tint="bg-[#eef3f8] text-[#587497]" />
            <AppCard appPath="/websites" description="Chat with AI to build and publish websites with a link." icon={<FiGlobe className="size-5" />} name="Websites" tint="bg-[#e8eefb] text-[#3b63a8]" />
            <AppCard appPath="/cms" description="Model content collections with a standalone REST API." icon={<FiDatabase className="size-5" />} name="CMS" tint="bg-[#f4ecfb] text-[#8957a5]" />
          </div>
          {user.role === "ADMIN" && <TeamPanel />}
        </>
      ) : (
        <>
          <div className="mb-8">
            <button className="mb-4 flex items-center gap-1 text-xs text-[#755984]" onClick={() => setView("apps")}><FiArrowLeft className="size-3.5" /> Back to apps</button>
            <p className="mb-2 text-xs font-medium text-[#928995]">Workspace</p>
            <h1 className="text-[34px] font-semibold tracking-[-0.06em]">Settings</h1>
            <p className="mt-2 text-sm text-[#847b89]">Make this workspace feel like yours.</p>
          </div>
          <SettingsPanel />
          <ProfilePanel onUserChange={onUserChange} user={user} />
          <ApiKeysPanel />
          <Card className="mt-4 max-w-[760px] border-[#eeeaf1] bg-white shadow-none">
            <CardContent className="flex items-center gap-3 p-5">
              <div className="grid size-9 place-items-center bg-[#f4f2f5] text-[#7c7480]"><FiShield className="size-[17px]" /></div>
              <div className="flex-1"><p className="text-xs font-medium">Your account</p><p className="mt-1 text-[11px] text-[#928995]">{user.email} · {user.role.toLowerCase()}</p></div>
              <Badge variant="secondary" className="text-[10px]">Protected</Badge>
            </CardContent>
          </Card>
        </>
      )}
    </WorkspaceShell>
  );
}
