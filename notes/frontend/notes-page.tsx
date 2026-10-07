import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink as RouterNavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import type { PartialBlock } from "@blocknote/core";
import { FiArrowLeft, FiFileText, FiLoader, FiPlus, FiShare2, FiTrash2, FiUsers } from "react-icons/fi";
import { api } from "@/lib/api-client";
import { AppShell } from "@/general/frontend/app-shell";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmojiPicker } from "@/notes/frontend/emoji-picker";
import { ShareDialog } from "@/notes/frontend/share-dialog";
import { cn } from "cn";

const PAGES_REFRESH_EVENT = "tuno:notes-pages-updated";

export type NotePageSummary = {
  id: string;
  title: string;
  icon: string;
  favorite: boolean;
  createdById: string;
  sharedAll: boolean;
  publicSlug: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NotePage = NotePageSummary & { content: string };

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

const DEFAULT_ICON = "📄";

function parseContent(content: string): PartialBlock[] | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed as PartialBlock[];
  } catch {
    // Fall through to an empty document.
  }
  return undefined;
}

function notifyPagesChanged() {
  window.dispatchEvent(new Event(PAGES_REFRESH_EVENT));
}

/* -------------------------------- Pages hook ------------------------------- */

function useNotePages() {
  const [pages, setPages] = useState<NotePageSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const loadPages = useCallback(async () => {
    setError("");
    try {
      const result = await api<{ pages: NotePageSummary[] }>("/api/notes/pages");
      setPages(result.pages);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your pages.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPages();
    const refresh = () => void loadPages();
    window.addEventListener(PAGES_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(PAGES_REFRESH_EVENT, refresh);
  }, [loadPages]);

  async function createPage(): Promise<string | null> {
    setCreating(true);
    try {
      const result = await api<{ page: NotePageSummary }>("/api/notes/pages", {
        body: JSON.stringify({}),
        method: "POST",
      });
      setPages((current) => [result.page, ...current]);
      return result.page.id;
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the page.");
      return null;
    } finally {
      setCreating(false);
    }
  }

  async function deletePage(page: NotePageSummary): Promise<boolean> {
    try {
      await api(`/api/notes/pages/${page.id}`, { method: "DELETE" });
      setPages((current) => current.filter((entry) => entry.id !== page.id));
      notifyPagesChanged();
      return true;
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the page.");
      return false;
    }
  }

  return { createPage, creating, deletePage, error, loading, pages };
}

function useCreatePage() {
  const navigate = useNavigate();
  const { createPage, creating, error } = useNotePages();

  async function startCreate() {
    const id = await createPage();
    if (id) navigate(`/notes/${id}`);
  }

  return { createPage: startCreate, creating, error };
}

/* --------------------------------- Layout --------------------------------- */

export function NotesLayout() {
  const navigate = useNavigate();
  const { createPage, creating, deletePage, error, loading, pages } = useNotePages();

  return (
    <AppShell accent="bg-[#eef3f8] text-[#5e7e9e]" appName="Notes" icon={FiFileText}>
      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a49ba9]">
          Pages
        </span>
        <button
          aria-label="New page"
          className="grid size-6 place-items-center rounded-md text-[#a49ba9] transition hover:bg-[#f3eef7] hover:text-[#4f3262]"
          onClick={() => {
            void createPage().then((id) => {
              if (id) navigate(`/notes/${id}`);
            });
          }}
          type="button"
        >
          {creating ? <FiLoader className="size-3.5 animate-spin" /> : <FiPlus className="size-3.5" />}
        </button>
      </div>

      {error ? <p className="px-3 pb-2 text-xs text-[#b05f5f]">{error}</p> : null}

      {loading ? (
        <div className="space-y-1 px-3">
          {[0, 1, 2].map((index) => (
            <div className="h-8 animate-pulse rounded-md bg-[#f1edf4]" key={index} />
          ))}
        </div>
      ) : pages.length === 0 ? (
        <p className="px-3 text-xs leading-5 text-[#8c838f]">
          No pages yet. Use the + button to start your first note.
        </p>
      ) : (
        <nav className="space-y-0.5 px-2">
          {pages.map((page) => (
            <SidebarPageLink deletePage={deletePage} key={page.id} page={page} />
          ))}
        </nav>
      )}
    </AppShell>
  );
}

function SidebarPageLink({
  deletePage,
  page,
}: {
  deletePage: (page: NotePageSummary) => Promise<boolean>;
  page: NotePageSummary;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const title = page.title.trim() || "Untitled";

  async function confirmDelete() {
    setDeleting(true);
    const deleted = await deletePage(page);
    setDeleting(false);
    if (deleted && location.pathname === `/notes/${page.id}`) {
      navigate("/notes");
    }
  }

  return (
    <>
      <RouterNavLink
        className={({ isActive }) =>
          `group relative flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium transition ${
            isActive
              ? "bg-[#f3eef7] text-[#4f3262]"
              : "text-[#716b76] hover:bg-[#f7f5f8]"
          }`
        }
        to={`/notes/${page.id}`}
      >
        <span className="w-4 shrink-0 text-center text-[14px] leading-none">{page.icon || DEFAULT_ICON}</span>
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {page.sharedAll || page.publicSlug ? (
          <FiUsers aria-label="Shared" className="size-3 shrink-0 text-[#a49ba9] group-hover:hidden" />
        ) : null}
        <span
          aria-hidden
          className="absolute right-1 grid size-5 place-items-center rounded text-[#a49ba9] opacity-0 transition hover:bg-[#e9e2ef] hover:text-[#b05f5f] group-hover:opacity-100"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setConfirmOpen(true);
          }}
          role="button"
          aria-label={`Delete ${title}`}
        >
          <FiTrash2 className="size-3" />
        </span>
      </RouterNavLink>

      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the page and all of its content. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-[#a12312] text-white hover:bg-[#8a1d0f]"
              disabled={deleting}
              onClick={(event) => {
                event.preventDefault();
                void confirmDelete();
              }}
            >
              {deleting ? <FiLoader className="size-4 animate-spin" /> : <FiTrash2 className="size-4" />}
              Delete page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ------------------------------ Home (index) ------------------------------- */

export function NotesHomePage() {
  const { createPage, creating } = useCreatePage();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
      <div className="grid size-12 place-items-center rounded-xl bg-[#f6f4f8] text-[24px]">
        {DEFAULT_ICON}
      </div>
      <div className="text-center">
        <h1 className="text-lg font-semibold tracking-[-0.03em]">Welcome to Notes</h1>
        <p className="mt-1 text-sm text-[#847b89]">
          Pick a page from the sidebar, or create a new one to start writing.
        </p>
      </div>
      <Button className="bg-[#291b32]" disabled={creating} onClick={() => void createPage()}>
        {creating ? <FiLoader className="size-4 animate-spin" /> : <FiPlus className="size-4" />}
        New page
      </Button>
    </div>
  );
}

/* --------------------------------- Editor --------------------------------- */

const SAVE_STATUS_TEXT: Record<SaveState, string> = {
  idle: "Saved",
  pending: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn't save — retry by editing again",
};

function useAutosave(pageId: string) {
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Record<string, unknown>>({});
  const inFlightRef = useRef(false);

  const flushSave = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (inFlightRef.current || Object.keys(pendingRef.current).length === 0) return;

    const patch = pendingRef.current;
    pendingRef.current = {};
    inFlightRef.current = true;
    setSaveState("saving");
    try {
      await api(`/api/notes/pages/${pageId}`, {
        body: JSON.stringify(patch),
        method: "PATCH",
      });
      setSaveState("saved");
      notifyPagesChanged();
    } catch {
      setSaveState("error");
    }
    inFlightRef.current = false;
    if (Object.keys(pendingRef.current).length > 0) {
      timerRef.current = setTimeout(() => void flushSave(), 400);
    }
  }, [pageId]);

  const scheduleSave = useCallback(
    (patch: Record<string, unknown>, delay = 800) => {
      Object.assign(pendingRef.current, patch);
      setSaveState("pending");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => void flushSave(), delay);
    },
    [flushSave],
  );

  useEffect(() => {
    const flush = () => {
      void flushSave();
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, [flushSave]);

  return { flushSave, saveState, scheduleSave };
}

function EditorSurface({
  currentUserId,
  page,
}: {
  currentUserId: string;
  page: NotePage;
}) {
  const isOwner = page.createdById === currentUserId;
  const [icon, setIcon] = useState(page.icon || DEFAULT_ICON);
  const [title, setTitle] = useState(page.title);
  const [shareOpen, setShareOpen] = useState(false);
  const hydratedRef = useRef(false);
  const { flushSave, saveState, scheduleSave } = useAutosave(page.id);

  const editor = useCreateBlockNote({
    initialContent: parseContent(page.content),
  });

  useEffect(() => {
    hydratedRef.current = true;
  }, []);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-[#eeeaf1] bg-white px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            className="flex items-center gap-1.5 text-[13px] font-medium text-[#716b76] transition hover:text-[#3e3543]"
            to="/notes"
          >
            <FiArrowLeft className="size-4" />
            <span className="hidden sm:inline">All pages</span>
          </Link>
          {!isOwner ? (
            <Badge className="border-[#eeeaf1] bg-[#f5f3f6] text-[10px] font-medium text-[#8c838f]" variant="outline">
              Shared with you
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span className={cn("text-xs", saveState === "error" ? "text-[#b05f5f]" : "text-[#a49ba9]")}>
            {SAVE_STATUS_TEXT[saveState]}
          </span>
          {isOwner ? (
            <Button
              className="h-8 border-[#eeeaf1] bg-white px-2.5 text-xs text-[#5d5263] hover:bg-[#f7f5f8]"
              onClick={() => setShareOpen(true)}
              size="sm"
              variant="outline"
            >
              <FiShare2 className="size-3.5" />
              Share
            </Button>
          ) : null}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[820px] px-6 pb-32 pt-10">
          <div className="mb-1">
            <EmojiPicker
              current={icon}
              onSelect={(emoji) => {
                const next = emoji || DEFAULT_ICON;
                setIcon(next);
                scheduleSave({ icon: next }, 0);
              }}
            >
              <button
                aria-label="Change page icon"
                className="flex size-14 items-center rounded-lg text-[30px] leading-none transition hover:bg-[#f3eef7]"
                type="button"
              >
                {icon}
              </button>
            </EmojiPicker>
          </div>

          <input
            aria-label="Page title"
            className="w-full bg-transparent text-[34px] font-semibold tracking-[-0.04em] outline-none placeholder:text-[#cfc7d6] sm:text-[40px]"
            disabled={!isOwner}
            onChange={(event) => {
              setTitle(event.target.value);
              scheduleSave({ title: event.target.value });
            }}
            placeholder="Untitled"
            value={title}
          />

          <div className="notes-editor mt-6 text-[15px] leading-7">
            <BlockNoteView
              editable={isOwner}
              editor={editor}
              onChange={() => {
                if (!hydratedRef.current) return;
                scheduleSave({ content: JSON.stringify(editor.document) });
              }}
              theme="light"
            />
          </div>
        </div>
      </div>

      {isOwner ? (
        <ShareDialog onOpenChange={setShareOpen} open={shareOpen} page={page} />
      ) : null}
    </div>
  );
}

export function NotesPageEditor() {
  const { pageId } = useParams<{ pageId: string }>();
  const [page, setPage] = useState<NotePage | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    api<{ user: { id: string } }>("/api/auth/me")
      .then((result) => setCurrentUserId(result.user.id))
      .catch(() => setCurrentUserId(""));
  }, []);

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setPage(null);
    api<{ page: NotePage }>(`/api/notes/pages/${pageId}`)
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
  }, [pageId]);

  if (status === "loading" || currentUserId === null) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[#928995]">
        Opening page…
      </div>
    );
  }

  if (status === "missing" || !page) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="grid size-12 place-items-center rounded-lg bg-[#f6f4f8] text-[22px]">🔍</div>
        <div className="text-center">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Page not found</h2>
          <p className="mt-1 text-sm text-[#847b89]">It may have been deleted or not shared with you.</p>
        </div>
        <Link
          className="flex items-center gap-1.5 text-[13px] font-medium text-[#716b76] transition hover:text-[#3e3543]"
          to="/notes"
        >
          <FiArrowLeft className="size-4" />
          Back to Notes
        </Link>
      </div>
    );
  }

  return <EditorSurface currentUserId={currentUserId} key={page.id} page={page} />;
}