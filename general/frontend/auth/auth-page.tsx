import { useEffect, useState } from "react";
import { useForm, type FieldValues, type Path, type UseFormRegister } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { FiArrowRight, FiCommand, FiLock, FiShield, FiStar } from "react-icons/fi";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type User } from "@/lib/api-client";

const credentialsSchema = z.object({
  email: z.email("Enter a valid email address."),
  password: z.string().min(8, "Use at least 8 characters.").max(128, "Password is too long."),
});

const signupSchema = credentialsSchema
  .extend({ confirmPassword: z.string() })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Those passwords don't match.",
    path: ["confirmPassword"],
  });

type Credentials = z.infer<typeof credentialsSchema>;
type SignupForm = z.infer<typeof signupSchema>;

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid size-9 place-items-center bg-[#24152f] text-white">
        <FiCommand className="size-[17px]" />
      </div>
      {!compact && <span className="text-[17px] font-semibold tracking-[-0.04em]">tuno</span>}
    </div>
  );
}

function AuthFrame({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-[#f7f6fa] p-4 sm:p-7">
      <div className="mx-auto grid min-h-[calc(100vh-56px)] max-w-[1320px] overflow-hidden border border-black/[0.06] bg-white shadow-[0_28px_100px_-48px_rgba(31,19,45,0.28)] lg:grid-cols-[1.02fr_0.98fr]">
        <section className="relative hidden overflow-hidden bg-[#20142b] p-12 text-white lg:flex lg:flex-col lg:justify-between xl:p-[72px]">
          <div className="absolute -right-24 -top-28 size-[440px] rounded-full border border-white/[0.08]" />
          <div className="absolute -right-2 top-8 size-[280px] rounded-full border border-white/[0.07]" />
          <div className="absolute -bottom-52 -left-28 size-[470px] rounded-full bg-[#7d42a7]/20 blur-3xl" />
          <div className="relative flex items-center gap-3">
            <Brand compact />
            <span className="text-lg font-semibold tracking-[-0.03em]">tuno</span>
          </div>
          <div className="relative max-w-lg">
            <Badge className="mb-6 border-white/15 bg-white/[0.08] px-3 py-1.5 text-white hover:bg-white/[0.08]">
              <FiStar className="mr-1.5 size-3.5" />
              Your work, in one place
            </Badge>
            <h1 className="text-[clamp(2.7rem,5vw,4.45rem)] font-medium leading-[1.02] tracking-[-0.065em]">
              A calmer way
              <br />
              to get things
              <br />
              <span className="text-[#c8a9dc]">moving.</span>
            </h1>
            <p className="mt-6 max-w-sm text-[15px] leading-7 text-white/58">
              One thoughtful workspace for the tools and small details that keep your day flowing.
            </p>
          </div>
          <p className="relative text-xs text-white/55">Made for teams that like to keep it simple.</p>
        </section>
        <section className="flex items-center justify-center px-6 py-12 sm:px-12 lg:px-14 xl:px-20">
          <div className="w-full max-w-[390px]">
            <div className="mb-12 flex items-center justify-between lg:hidden">
              <Brand />
              <Badge variant="secondary">Workspace</Badge>
            </div>
            {children}
            <p className="mt-10 flex items-center justify-center gap-1.5 text-xs text-muted-foreground/75">
              <FiShield className="size-3.5" />
              Private by design. Your session is protected.
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}

function FormField<T extends FieldValues>({
  autoComplete,
  error,
  label,
  name,
  register,
  type,
}: {
  autoComplete: string;
  error?: string;
  label: string;
  name: Path<T>;
  register: UseFormRegister<T>;
  type: "email" | "password";
}) {
  return (
    <label className="block space-y-2 text-sm font-medium">
      {label}
      <Input
        autoComplete={autoComplete}
        aria-invalid={Boolean(error)}
        className="h-11 border-[#e9e6ed] bg-white px-3.5"
        placeholder={name === "email" ? "you@company.com" : "At least 8 characters"}
        type={type}
        {...register(name)}
      />
      {error && <span className="block text-xs font-normal text-red-700">{error}</span>}
    </label>
  );
}

export function LoginPage({
  registrationOpen,
  onAuthenticated,
}: {
  registrationOpen: boolean;
  onAuthenticated: (user: User) => void;
}) {
  const navigate = useNavigate();
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useForm<Credentials>({
    resolver: zodResolver(credentialsSchema),
    defaultValues: { email: "", password: "" },
  });

  if (registrationOpen) return <Navigate replace to="/auth/signup" />;

  async function submit(values: Credentials) {
    setServerError("");
    setBusy(true);
    try {
      const result = await api<{ user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      });
      onAuthenticated(result.user);
      navigate("/home", { replace: true });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame>
      <div className="mb-8">
        <div className="mb-5 grid size-11 place-items-center bg-[#f2eafa] text-[#71428b]">
          <FiLock className="size-5" />
        </div>
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.13em] text-muted-foreground">Welcome back</p>
        <h2 className="text-[32px] font-semibold tracking-[-0.055em]">Sign in to Tuno</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">Enter your details to pick up where you left off.</p>
      </div>
      <form className="space-y-5" onSubmit={form.handleSubmit(submit)}>
        <FormField autoComplete="email" error={form.formState.errors.email?.message} label="Email address" name="email" register={form.register} type="email" />
        <FormField autoComplete="current-password" error={form.formState.errors.password?.message} label="Password" name="password" register={form.register} type="password" />
        {serverError && <p aria-live="polite" className="bg-red-50 px-3.5 py-3 text-sm text-red-700">{serverError}</p>}
        <Button className="h-11 w-full bg-[#25172e] text-sm font-medium hover:bg-[#392448]" disabled={busy} type="submit">
          {busy ? "One moment…" : "Sign in"}
          {!busy && <FiArrowRight className="size-4" />}
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-muted-foreground">
        Have an invitation?{" "}
        <Link className="font-medium text-[#513165] hover:underline" to="/auth/signup">Sign up</Link>
      </p>
    </AuthFrame>
  );
}

export function SignupPage({
  registrationOpen,
  onAuthenticated,
}: {
  registrationOpen: boolean;
  onAuthenticated: (user: User) => void;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const invitationToken = searchParams.get("invite");
  const [invitedEmail, setInvitedEmail] = useState("");
  const [checkingInvite, setCheckingInvite] = useState(Boolean(invitationToken));
  const [inviteError, setInviteError] = useState("");
  const [serverError, setServerError] = useState("");
  const [busy, setBusy] = useState(false);
  const form = useForm<SignupForm>({
    resolver: zodResolver(signupSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  useEffect(() => {
    if (!invitationToken) {
      setCheckingInvite(false);
      return;
    }
    let active = true;
    api<{ email: string }>(`/api/auth/invitations/${encodeURIComponent(invitationToken)}`)
      .then(({ email }) => {
        if (!active) return;
        setInvitedEmail(email);
        form.setValue("email", email);
      })
      .catch((error: unknown) => {
        if (active) setInviteError(error instanceof Error ? error.message : "This invitation is invalid or has expired.");
      })
      .finally(() => {
        if (active) setCheckingInvite(false);
      });
    return () => {
      active = false;
    };
  }, [form.setValue, invitationToken]);

  async function submit({ confirmPassword: _confirmPassword, ...credentials }: SignupForm) {
    setServerError("");
    setBusy(true);
    try {
      const result = await api<{ user: User }>(
        invitationToken ? "/api/auth/invitations/accept" : "/api/auth/signup",
        {
        method: "POST",
        body: JSON.stringify(invitationToken
          ? { token: invitationToken, password: credentials.password }
          : credentials),
        },
      );
      onAuthenticated(result.user);
      navigate("/home", { replace: true });
    } catch (error) {
      setServerError(error instanceof Error ? error.message : "Unable to create an account.");
    } finally {
      setBusy(false);
    }
  }

  if (checkingInvite) {
    return <AuthFrame><p className="text-sm text-muted-foreground">Checking your invitation…</p></AuthFrame>;
  }

  if (invitationToken && (inviteError || !invitedEmail)) {
    return (
      <AuthFrame>
        <div className="mb-8">
          <h2 className="text-[32px] font-semibold tracking-[-0.055em]">Invitation unavailable</h2>
          <p aria-live="polite" className="mt-3 text-sm text-red-700">{inviteError || "This invitation is invalid or has expired."}</p>
        </div>
        <Link className="text-sm font-medium text-[#513165] hover:underline" to="/auth/login">Return to sign in</Link>
      </AuthFrame>
    );
  }

  if (!registrationOpen && !invitationToken) {
    return (
      <AuthFrame>
        <div className="mb-8">
          <h2 className="text-[32px] font-semibold tracking-[-0.055em]">Sign-up is by invitation</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Ask a workspace admin to invite you. Follow the one-time link in your invitation email to join.</p>
        </div>
        <Link className="text-sm font-medium text-[#513165] hover:underline" to="/auth/login">Already have an account? Sign in</Link>
      </AuthFrame>
    );
  }

  return (
    <AuthFrame>
      <div className="mb-8">
        <div className="mb-5 grid size-11 place-items-center bg-[#f2eafa] text-[#71428b]">
          <FiLock className="size-5" />
        </div>
        <p className="mb-2 text-xs font-medium uppercase tracking-[0.13em] text-muted-foreground">{invitationToken ? "Workspace invitation" : "A good place to begin"}</p>
        <h2 className="text-[32px] font-semibold tracking-[-0.055em]">{invitationToken ? "Join your workspace" : "Create your workspace"}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{invitationToken ? `Create a password for ${invitedEmail}.` : "Set up your admin account. Public signup closes after this first account."}</p>
      </div>
      <form className="space-y-5" onSubmit={form.handleSubmit(submit)}>
        {invitationToken
          ? <label className="block space-y-2 text-sm font-medium">Email address<Input className="h-11 border-[#e9e6ed] bg-[#f8f7fa] px-3.5" readOnly value={invitedEmail} /></label>
          : <FormField autoComplete="email" error={form.formState.errors.email?.message} label="Email address" name="email" register={form.register} type="email" />}
        <FormField autoComplete="new-password" error={form.formState.errors.password?.message} label="Password" name="password" register={form.register} type="password" />
        <FormField autoComplete="new-password" error={form.formState.errors.confirmPassword?.message} label="Confirm password" name="confirmPassword" register={form.register} type="password" />
        {serverError && <p aria-live="polite" className="bg-red-50 px-3.5 py-3 text-sm text-red-700">{serverError}</p>}
        <Button className="h-11 w-full bg-[#25172e] text-sm font-medium hover:bg-[#392448]" disabled={busy} type="submit">
          {busy ? "One moment…" : invitationToken ? "Join workspace" : "Create admin account"}
          {!busy && <FiArrowRight className="size-4" />}
        </Button>
      </form>
      <p className="mt-7 text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link className="font-medium text-[#513165] hover:underline" to="/auth/login">Sign in</Link>
      </p>
    </AuthFrame>
  );
}
