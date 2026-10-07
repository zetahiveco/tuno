import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import type { PartialBlock } from "@blocknote/core";
import { api } from "@/lib/api-client";

type PublicPage = {
  title: string;
  icon: string;
  content: string;
  updatedAt: string;
};

function parseContent(content: string): PartialBlock[] {
  try {
    const parsed: unknown = JSON.parse(content);
    if (Array.isArray(parsed)) return parsed as PartialBlock[];
  } catch {
    // Fall through to an empty document.
  }
  return [];
}

export function PublicNotePage() {
  const { slug } = useParams<{ slug: string }>();
  const [page, setPage] = useState<PublicPage | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setPage(null);
    api<{ page: PublicPage }>(`/api/public/notes/${slug}`)
      .then((result) => {
        if (!cancelled) {
          setPage(result.page);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (status === "loading") {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f8f7fa] text-xs text-[#928995]">
        Opening shared page…
      </main>
    );
  }

  if (status === "missing" || !page) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f8f7fa] px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-white text-[22px] shadow-sm">
            🔒
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-[-0.03em]">Page not available</h1>
          <p className="mt-1.5 text-sm text-[#847b89]">
            This link may have been revoked, or the page was never shared publicly.
          </p>
        </div>
      </main>
    );
  }

  return <PublicPageSurface key={slug} page={page} />;
}

function PublicPageSurface({ page }: { page: PublicPage }) {
  const editor = useCreateBlockNote({
    initialContent: parseContent(page.content),
  });

  return (
    <main className="min-h-screen bg-[#f8f7fa]">
      <div className="mx-auto w-full max-w-[820px] px-6 pb-32 pt-14">
        <div className="mb-1 text-[34px] leading-none">{page.icon || "📄"}</div>
        <h1 className="mt-3 text-[34px] font-semibold tracking-[-0.04em] sm:text-[40px]">
          {page.title.trim() || "Untitled"}
        </h1>
        <p className="mt-2 text-xs text-[#a49ba9]">
          Last edited {formatDistanceToNow(new Date(page.updatedAt), { addSuffix: true })}
        </p>
        <div className="notes-editor mt-8 text-[15px] leading-7">
          <BlockNoteView editable={false} editor={editor} theme="light" />
        </div>
      </div>
    </main>
  );
}