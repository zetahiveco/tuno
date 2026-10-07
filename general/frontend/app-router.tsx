import { useEffect, useState } from "react";
import { FiAlertTriangle, FiRefreshCw } from "react-icons/fi";
import { Navigate, Route, Routes } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api, ApiRequestError, type User } from "@/lib/api-client";
import { LoginPage, SignupPage } from "@/general/frontend/auth/auth-page";
import { HomePage } from "@/general/frontend/home/home-page";
import {
  MailerAudiencesPage,
  MailerCampaignsPage,
  MailerLayout,
  MailerOverviewPage,
  MailerTemplatesPage,
} from "@/mailer/frontend/mailer-page";
import {
  NotesAllPage,
  NotesFavoritesPage,
  NotesLayout,
  NotesRecentPage,
  NotesSharedPage,
} from "@/notes/frontend/notes-page";

export function AppRouter() {
  const [user, setUser] = useState<User | null>(null);
  const [registrationOpen, setRegistrationOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [startupError, setStartupError] = useState("");

  async function loadSession() {
    setLoading(true);
    setStartupError("");
    try {
      const result = await api<{ user: User }>("/api/auth/me");
      setUser(result.user);
    } catch (error) {
      if (!(error instanceof ApiRequestError) || error.status !== 401) {
        setStartupError(error instanceof Error ? error.message : "Could not connect to your workspace.");
        setLoading(false);
        return;
      }
      setUser(null);
      try {
        const status = await api<{ registrationOpen: boolean }>("/api/auth/registration-status");
        setRegistrationOpen(status.registrationOpen);
      } catch (statusError) {
        setStartupError(statusError instanceof Error ? statusError.message : "Could not check account setup.");
      }
    }
    setLoading(false);
  }

  useEffect(() => {
    void loadSession();
  }, []);

  if (loading) {
    return <main className="grid min-h-screen place-items-center bg-[#f8f7fa] text-xs text-[#928995]">Opening your workspace…</main>;
  }
  if (startupError) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f8f7fa] p-6">
        <div className="max-w-md text-center">
          <FiAlertTriangle className="mx-auto size-6 text-[#78538c]" />
          <p className="mt-4 text-lg font-semibold">We couldn't open your workspace.</p>
          <p className="mt-2 text-sm text-[#847b89]">{startupError}</p>
          <Button className="mt-5 bg-[#291b32]" onClick={() => void loadSession()}>
            <FiRefreshCw className="size-4" />
            Try again
          </Button>
        </div>
      </main>
    );
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate replace to={user ? "/home" : registrationOpen ? "/auth/signup" : "/auth/login"} />} />
      <Route path="/auth/login" element={user ? <Navigate replace to="/home" /> : <LoginPage registrationOpen={registrationOpen} onAuthenticated={setUser} />} />
      <Route path="/auth/signup" element={user ? <Navigate replace to="/home" /> : <SignupPage registrationOpen={registrationOpen} onAuthenticated={(newUser) => {
        setRegistrationOpen(false);
        setUser(newUser);
      }} />} />
      <Route path="/home" element={user ? <HomePage user={user} onLogout={() => setUser(null)} onUserChange={setUser} /> : <Navigate replace to="/auth/login" />} />
      <Route path="/mailer" element={user ? <MailerLayout /> : <Navigate replace to="/auth/login" />}>
        <Route index element={<MailerOverviewPage />} />
        <Route path="campaigns" element={<MailerCampaignsPage />} />
        <Route path="templates" element={<MailerTemplatesPage />} />
        <Route path="audiences" element={<MailerAudiencesPage />} />
      </Route>
      <Route path="/notes" element={user ? <NotesLayout /> : <Navigate replace to="/auth/login" />}>
        <Route index element={<NotesAllPage />} />
        <Route path="recent" element={<NotesRecentPage />} />
        <Route path="favorites" element={<NotesFavoritesPage />} />
        <Route path="shared" element={<NotesSharedPage />} />
      </Route>
      <Route path="*" element={<Navigate replace to={user ? "/home" : registrationOpen ? "/auth/signup" : "/auth/login"} />} />
    </Routes>
  );
}
