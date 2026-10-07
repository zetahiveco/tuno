import { useEffect, useState } from "react";
import { FiAlertTriangle, FiRefreshCw } from "react-icons/fi";
import { Navigate, Route, Routes } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { api, ApiRequestError, type User } from "@/lib/api-client";
import { LoginPage, SignupPage } from "@/general/frontend/auth/auth-page";
import { HomePage } from "@/general/frontend/home/home-page";
import {
  MailerLayout,
  MailerOverviewPage,
} from "@/mailer/frontend/mailer-page";
import {
  MailerAudiencesPage,
} from "@/mailer/frontend/audiences-page";
import {
  TemplateEditorPage,
  TemplatesHomePage,
} from "@/mailer/frontend/templates-page";
import {
  CampaignDetailPage,
  MailerCampaignsPage,
} from "@/mailer/frontend/campaigns-page";
import {
  NotesHomePage,
  NotesLayout,
  NotesPageEditor,
} from "@/notes/frontend/notes-page";
import { PublicNotePage } from "@/notes/frontend/public-note-page";
import {
  FormBuilderPage,
  FormsHomePage,
  FormsLayout,
  FormSubmissionsPage,
} from "@/forms/frontend/forms-page";
import { PublicFormPage } from "@/forms/frontend/public-form-page";
import {
  SchedulerAvailabilityPage,
  SchedulerBookingsPage,
  SchedulerEventTypesPage,
  SchedulerLayout,
} from "@/scheduler/frontend/scheduler-page";
import { PublicBookingPage } from "@/scheduler/frontend/public-booking-page";
import {
  CrmContactsPage,
  CrmFieldsPage,
  CrmLayout,
  CrmLeadsPage,
  CrmNotesPage,
  CrmTasksPage,
} from "@/crm/frontend/crm-page";
import {
  BoardPage,
  PublicBoardPage,
  TasksBoardsPage,
  TasksLayout,
  TasksPlannerPage,
} from "@/tasks/frontend/tasks-page";
import {
  DocumentsHomePage,
  DocumentsLayout,
  DocumentsSharedPage,
  PublicFolderPage,
} from "@/documents/frontend/documents-page";
import { WebsitesLayout, WebsitesHomePage, WebsiteBuilderPage } from "@/websites/frontend/websites-page";
import {
  CmsCollectionApiPage,
  CmsCollectionsHomePage,
  CmsEntriesPage,
  CmsEntryEditorPage,
  CmsLayout,
} from "@/cms/frontend/cms-page";

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
        <Route path="campaigns/:campaignId" element={<CampaignDetailPage />} />
        <Route path="templates" element={<TemplatesHomePage />} />
        <Route path="templates/:templateId" element={<TemplateEditorPage />} />
        <Route path="audiences" element={<MailerAudiencesPage />} />
      </Route>
      <Route path="/notes" element={user ? <NotesLayout /> : <Navigate replace to="/auth/login" />}>
        <Route index element={<NotesHomePage />} />
        <Route path=":pageId" element={<NotesPageEditor />} />
      </Route>
      <Route path="/forms" element={user ? <FormsLayout /> : <Navigate replace to="/auth/login" />}>
        <Route index element={<FormsHomePage />} />
        <Route path=":formId" element={<FormBuilderPage />} />
        <Route path=":formId/submissions" element={<FormSubmissionsPage />} />
      </Route>
      <Route path="/scheduler" element={user ? <SchedulerLayout /> : <Navigate replace to="/auth/login" />}>
        <Route index element={<SchedulerEventTypesPage />} />
        <Route path="bookings" element={<SchedulerBookingsPage />} />
        <Route path="availability" element={<SchedulerAvailabilityPage />} />
      </Route>
      <Route path="/crm" element={user ? <CrmLayout /> : <Navigate replace to="/auth/login" />}>
        <Route index element={<CrmLeadsPage />} />
        <Route path="contacts" element={<CrmContactsPage />} />
        <Route path="tasks" element={<CrmTasksPage />} />
        <Route path="notes" element={<CrmNotesPage />} />
        <Route path="fields" element={<CrmFieldsPage />} />
      </Route>
      <Route path="/tasks" element={user ? <TasksLayout /> : <Navigate replace to="/auth/login" />}>
        <Route index element={<TasksBoardsPage />} />
        <Route path="boards/:boardId" element={<BoardPage />} />
        <Route path="planner" element={<TasksPlannerPage />} />
      </Route>
      <Route path="/documents" element={user ? <DocumentsLayout /> : <Navigate replace to="/auth/login" />}>
        <Route index element={<DocumentsHomePage />} />
        <Route path="shared" element={<DocumentsSharedPage />} />
        <Route path="folders/:folderId" element={<DocumentsHomePage />} />
      </Route>
      <Route path="/websites" element={user ? <WebsitesLayout /> : <Navigate replace to="/auth/login" />}>
        <Route index element={<WebsitesHomePage />} />
        <Route path=":websiteId" element={<WebsiteBuilderPage />} />
      </Route>
      <Route path="/cms" element={user ? <CmsLayout /> : <Navigate replace to="/auth/login" />}>
        <Route index element={<CmsCollectionsHomePage />} />
        <Route path=":collectionId" element={<CmsEntriesPage />} />
        <Route path=":collectionId/api" element={<CmsCollectionApiPage />} />
        <Route path=":collectionId/entries/:entryId" element={<CmsEntryEditorPage />} />
      </Route>
      <Route path="/s/:slug" element={<PublicBookingPage />} />
      <Route path="/f/:slug" element={<PublicFormPage />} />
      <Route path="/share/:slug" element={<PublicNotePage />} />
      <Route path="/t/:slug" element={<PublicBoardPage />} />
      <Route path="/d/:slug" element={<PublicFolderPage />} />
      <Route path="*" element={<Navigate replace to={user ? "/home" : registrationOpen ? "/auth/signup" : "/auth/login"} />} />
    </Routes>
  );
}
