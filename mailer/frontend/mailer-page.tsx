import { FiInbox, FiLayers, FiMail, FiUsers } from "react-icons/fi";
import { Badge } from "@/components/ui/badge";
import { AppPageFrame, AppShell } from "@/general/frontend/app-shell";

const mailerPages = [
  { end: true, icon: FiMail, label: "Overview", to: "/mailer" },
  { icon: FiInbox, label: "Campaigns", to: "/mailer/campaigns" },
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

function ComingSoon({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <AppPageFrame description={description} title={title}>
      <div className="max-w-xl border border-[#eeeaf1] bg-white p-7 sm:p-9">
        <Badge variant="secondary" className="mb-5 bg-[#f5f3f6] px-2.5 py-1 text-[10px] font-medium text-[#8c838f]">
          Coming soon
        </Badge>
        <h2 className="text-xl font-semibold tracking-[-0.04em]">This page is getting ready.</h2>
        <p className="mt-2 text-sm leading-6 text-[#847b89]">
          Your mailer workspace is connected. Content for this page will land here next.
        </p>
      </div>
    </AppPageFrame>
  );
}

export function MailerOverviewPage() {
  return (
    <ComingSoon
      description="Email campaigns, thoughtfully organized."
      title="Overview"
    />
  );
}

export function MailerCampaignsPage() {
  return (
    <ComingSoon
      description="Plan, schedule, and send your campaigns."
      title="Campaigns"
    />
  );
}

export function MailerTemplatesPage() {
  return (
    <ComingSoon
      description="Reusable layouts for every send."
      title="Templates"
    />
  );
}

export function MailerAudiencesPage() {
  return (
    <ComingSoon
      description="Keep your lists and segments in one place."
      title="Audiences"
    />
  );
}
