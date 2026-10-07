import { FiClock, FiFileText, FiShare2, FiStar } from "react-icons/fi";
import { Badge } from "@/components/ui/badge";
import { AppPageFrame, AppShell } from "@/general/frontend/app-shell";

const notesPages = [
  { end: true, icon: FiFileText, label: "All notes", to: "/notes" },
  { icon: FiClock, label: "Recent", to: "/notes/recent" },
  { icon: FiStar, label: "Favorites", to: "/notes/favorites" },
  { icon: FiShare2, label: "Shared", to: "/notes/shared" },
];

export function NotesLayout() {
  return (
    <AppShell
      accent="bg-[#eef3f8] text-[#5e7e9e]"
      appName="Notes"
      icon={FiFileText}
      pages={notesPages}
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
          Your notes workspace is connected. Content for this page will land here next.
        </p>
      </div>
    </AppPageFrame>
  );
}

export function NotesAllPage() {
  return (
    <ComingSoon
      description="A quiet home for ideas and shared knowledge."
      title="All notes"
    />
  );
}

export function NotesRecentPage() {
  return (
    <ComingSoon
      description="Pick up where you left off."
      title="Recent"
    />
  );
}

export function NotesFavoritesPage() {
  return (
    <ComingSoon
      description="Notes you want close at hand."
      title="Favorites"
    />
  );
}

export function NotesSharedPage() {
  return (
    <ComingSoon
      description="Notes shared with your team."
      title="Shared"
    />
  );
}
