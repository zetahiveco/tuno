import { useEffect, useState } from "react";
import { FiArrowLeft, FiArrowRight, FiCheck, FiFileText, FiGrid, FiMail, FiSettings, FiShield, FiUsers, FiUserPlus } from "react-icons/fi";
import { Link } from "react-router-dom";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { api, type User, type WorkspaceSettings } from "@/lib/api-client";
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

export function HomePage({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [view, setView] = useState<"apps" | "settings">("apps");
  const firstName = user.email.split("@")[0]?.split(/[._-]/)[0] ?? "there";
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
              { label: "Apps connected", value: "2 apps", detail: "More coming soon", icon: FiGrid, tone: "bg-[#eaf0f8] text-[#587497]" },
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
