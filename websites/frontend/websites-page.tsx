import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import {
  FiArrowLeft,
  FiCheck,
  FiCode,
  FiCopy,
  FiExternalLink,
  FiGlobe,
  FiClock,
  FiLoader,
  FiEye,
  FiPlus,
  FiRefreshCw,
  FiSend,
  FiSquare,
  FiTrash2,
} from "react-icons/fi";
import { api } from "@/lib/api-client";
import { AppShell } from "@/general/frontend/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "cn";

const WEBSITES_REFRESH_EVENT = "tuno:websites-updated";

export type WebsiteSummary = {
  id: string;
  name: string;
  slug: string | null;
  description: string;
  activeCommitSha: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ChatModel = { id: string; label: string; description: string };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

/* -------------------------------- Websites hook ---------------------------- */

function useWebsites() {
  const [websites, setWebsites] = useState<WebsiteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await api<{ websites: WebsiteSummary[] }>("/api/websites");
      setWebsites(result.websites);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadFailureMessage(loadError) : "Could not load your websites.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener(WEBSITES_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(WEBSITES_REFRESH_EVENT, refresh);
  }, [load]);

  return { websites, loading, error, setWebsites };
}

function loadFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

/* --------------------------------- Layout ---------------------------------- */

export function WebsitesLayout() {
  const { websites, loading, error } = useWebsites();

  return (
    <AppShell accent="bg-[#e8eefb] text-[#3b63a8]" appName="Websites" icon={FiGlobe}>
      <div className="mb-2 flex items-center justify-between px-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a49ba9]">Your websites</span>
        <Link className="p-1 text-[#3b63a8] hover:text-[#1e3a66]" to="/websites" title="All websites">
          <FiPlus className="size-4" />
        </Link>
      </div>
      {loading ? (
        <p className="px-3 py-2 text-xs text-[#928995]">Loading…</p>
      ) : error ? (
        <p className="px-3 py-2 text-xs text-red-700">{error}</p>
      ) : websites.length === 0 ? (
        <p className="px-3 py-2 text-xs leading-5 text-[#968d9a]">No websites yet. Create one and describe what you want to build.</p>
      ) : (
        <nav className="space-y-0.5">
          {websites.map((website) => (
            <NavLinkRow key={website.id} website={website} />
          ))}
        </nav>
      )}
    </AppShell>
  );
}

function NavLinkRow({ website }: { website: WebsiteSummary }) {
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    setDeleting(true);
    try {
      await api(`/api/websites/${website.id}`, { method: "DELETE" });
      window.dispatchEvent(new Event(WEBSITES_REFRESH_EVENT));
    } catch {
      // Ignore
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="group relative">
      <NavLink
        className={({ isActive }) =>
          `flex h-9 items-center gap-2.5 rounded-md px-3 pr-9 text-[13px] font-medium transition ${
            isActive ? "bg-[#f3eef7] text-[#4f3262]" : "text-[#716b76] hover:bg-[#f7f5f8]"
          }`
        }
        end
        to={`/websites/${website.id}`}
      >
        <FiGlobe className="size-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">{website.name}</span>
        {website.publishedAt && <span className="size-1.5 shrink-0 rounded-full bg-[#4e8a68]" title="Published" />}
      </NavLink>
      <button
        aria-label={`Delete ${website.name}`}
        className={cn(
          "absolute right-1.5 top-1/2 hidden size-6 -translate-y-1/2 place-items-center rounded-md text-[#a49ba9] transition hover:bg-red-50 hover:text-red-700 group-hover:grid",
          deleting && "grid",
        )}
        disabled={deleting}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          void remove();
        }}
        type="button"
      >
        {deleting ? <FiLoader className="size-3.5 animate-spin" /> : <FiTrash2 className="size-3.5" />}
      </button>
    </div>
  );
}

/* ------------------------------ Websites home ------------------------------ */

export function WebsitesHomePage() {
  const { websites, loading, error, setWebsites } = useWebsites();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [createError, setCreateError] = useState("");

  async function createWebsite() {
    if (!name.trim()) {
      setCreateError("Give the website a name.");
      return;
    }
    setBusy(true);
    setCreateError("");
    try {
      const result = await api<{ website: WebsiteSummary }>("/api/websites", {
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
        method: "POST",
      });
      setWebsites((current) => [result.website, ...current]);
      window.dispatchEvent(new Event(WEBSITES_REFRESH_EVENT));
      window.location.assign(`/websites/${result.website.id}`);
    } catch (createFailure) {
      setCreateError(loadFailureMessage(createFailure));
    } finally {
      setBusy(false);
    }
  }

  async function deleteWebsite(website: WebsiteSummary) {
    try {
      await api(`/api/websites/${website.id}`, { method: "DELETE" });
      setWebsites((current) => current.filter((entry) => entry.id !== website.id));
      window.dispatchEvent(new Event(WEBSITES_REFRESH_EVENT));
    } catch {
      // Ignore
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.05em]">Websites</h1>
          <p className="mt-1.5 text-sm text-[#847b89]">
            Describe a website in the chat — AI builds it with React + Tailwind, and you publish it with a link.
          </p>
        </div>
        <Button className="bg-[#291b32]" onClick={() => setCreating(true)}>
          <FiPlus className="size-4" /> New website
        </Button>
      </div>

      {error && <p className="mb-4 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}

      {loading ? (
        <p className="text-xs text-[#928995]">Loading websites…</p>
      ) : websites.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e3dce8] bg-white p-12 text-center">
          <FiGlobe className="mx-auto size-8 text-[#c4b6cf]" />
          <p className="mt-4 text-sm font-semibold">Build your first website</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#847b89]">
            Chat with the builder — it writes the code, keeps every version in your bucket, and can pull content from your CMS.
          </p>
          <Button className="mt-5 bg-[#291b32]" onClick={() => setCreating(true)}>
            <FiPlus className="size-4" /> New website
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {websites.map((website) => (
            <div className="rounded-xl border border-[#eeeaf1] bg-white p-5 shadow-none" key={website.id}>
              <div className="flex items-start justify-between gap-3">
                <Link className="group min-w-0 flex-1" to={`/websites/${website.id}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="grid size-9 place-items-center bg-[#e8eefb] text-[#3b63a8]">
                      <FiGlobe className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold group-hover:underline">{website.name}</p>
                      <p className="mt-0.5 text-[11px] text-[#968d9a]">Updated {formatDate(website.updatedAt)}</p>
                    </div>
                  </div>
                  {website.description && <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#847b89]">{website.description}</p>}
                </Link>
                <Button
                  aria-label={`Delete ${website.name}`}
                  className="size-8 shrink-0 p-0 text-[#a49ba9] hover:bg-red-50 hover:text-red-700"
                  onClick={() => void deleteWebsite(website)}
                  size="sm"
                  variant="ghost"
                >
                  <FiTrash2 className="size-4" />
                </Button>
              </div>
              <div className="mt-4 flex items-center gap-2">
                {website.publishedAt && website.slug ? (
                  <a
                    className="inline-flex items-center gap-1 rounded-full bg-[#eaf6ef] px-2 py-0.5 text-[10px] font-medium text-[#4e8a68] hover:underline"
                    href={`/p/${website.slug}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    <FiExternalLink className="size-3" /> Published
                  </a>
                ) : (
                  <Badge className="bg-[#f4f1f6] text-[10px] text-[#6f6078]" variant="secondary">
                    Draft
                  </Badge>
                )}
                <Link className="text-xs font-medium text-[#755984] hover:text-[#493254]" to={`/websites/${website.id}`}>
                  Open builder <FiArrowLeft className="ml-0.5 inline size-3 rotate-180" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog onOpenChange={setCreating} open={creating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New website</DialogTitle>
            <DialogDescription>You'll describe the site in the builder chat next.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Label className="block space-y-2 text-xs font-medium">
              Name
              <Input maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Portfolio" value={name} />
            </Label>
            <Label className="block space-y-2 text-xs font-medium">
              Description (optional)
              <Input
                onChange={(event) => setDescription(event.target.value)}
                placeholder="A landing page for my coffee shop"
                value={description}
              />
            </Label>
            {createError && <p className="text-xs text-red-700">{createError}</p>}
          </div>
          <DialogFooter>
            <Button disabled={busy} onClick={() => setCreating(false)} variant="outline">
              Cancel
            </Button>
            <Button className="bg-[#291b32]" disabled={busy} onClick={() => void createWebsite()}>
              {busy ? <FiLoader className="size-4 animate-spin" /> : <FiPlus className="size-4" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------------------- Builder page ----------------------------- */

type ViewerTab = "preview" | "code" | "history";

export function WebsiteBuilderPage() {
  const { websiteId } = useParams();
  const [website, setWebsite] = useState<WebsiteSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const loadWebsite = useCallback(async () => {
    if (!websiteId) return;
    try {
      const result = await api<{ website: WebsiteSummary }>(`/api/websites/${websiteId}`);
      setWebsite(result.website);
    } catch (error) {
      if (error instanceof Error && /404/.test(error.message)) setNotFound(true);
    }
    setLoading(false);
  }, [websiteId]);

  useEffect(() => {
    void loadWebsite();
  }, [loadWebsite]);

  if (notFound) {
    return (
      <div className="grid h-full place-items-center">
        <div className="text-center">
          <p className="text-sm font-semibold">Website not found</p>
          <Link className="mt-2 inline-block text-xs text-[#755984] hover:underline" to="/websites">
            Back to your websites
          </Link>
        </div>
      </div>
    );
  }
  if (loading || !website || !websiteId) {
    return <p className="px-8 py-10 text-xs text-[#928995]">Loading builder…</p>;
  }

  return <Builder website={website} key={website.id} onWebsiteChange={setWebsite} websiteId={websiteId} />;
}

function Builder({
  website,
  websiteId,
  onWebsiteChange,
}: {
  website: WebsiteSummary;
  websiteId: string;
  onWebsiteChange: (website: WebsiteSummary) => void;
}) {
  const [models, setModels] = useState<ChatModel[]>([]);
  const [defaultModelId, setDefaultModelId] = useState("");
  const [modelId, setModelId] = useState("");
  const [tab, setTab] = useState<ViewerTab>("preview");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [commitRefreshKey, setCommitRefreshKey] = useState(0);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const navigate = useNavigate();

  const modelRef = useRef("");

  useEffect(() => {
    api<{ models: ChatModel[]; defaultModelId: string }>("/api/websites/models")
      .then((result) => {
        setModels(result.models);
        setDefaultModelId(result.defaultModelId);
        setModelId(result.defaultModelId);
        modelRef.current = result.defaultModelId;
      })
      .catch(() => {});
  }, []);

  const refreshWebsite = useCallback(async () => {
    try {
      const result = await api<{ website: WebsiteSummary }>(`/api/websites/${websiteId}`);
      onWebsiteChange(result.website);
      setCommitRefreshKey((key) => key + 1);
    } catch {
      // Ignore
    }
  }, [websiteId, onWebsiteChange]);

  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
  useEffect(() => {
    api<{ messages: UIMessage[] }>(`/api/websites/${websiteId}/messages`)
      .then((result) => setInitialMessages(result.messages))
      .catch(() => setInitialMessages([]));
  }, [websiteId]);

  if (initialMessages === null || !modelId) {
    return <p className="px-8 py-10 text-xs text-[#928995]">Loading builder…</p>;
  }

  async function publish() {
    setPublishing(true);
    setPublishError("");
    try {
      const result = await api<{ url: string }>(`/api/websites/${websiteId}/publish`, { method: "POST", body: JSON.stringify({}) });
      setPublishedUrl(result.url);
      void refreshWebsite();
    } catch (publishFailure) {
      setPublishError(loadFailureMessage(publishFailure));
    } finally {
      setPublishing(false);
    }
  }

  async function deleteWebsite() {
    setDeleting(true);
    setDeleteError("");
    try {
      await api(`/api/websites/${websiteId}`, { method: "DELETE" });
      window.dispatchEvent(new Event(WEBSITES_REFRESH_EVENT));
      navigate("/websites");
    } catch (deleteFailure) {
      setDeleteError(loadFailureMessage(deleteFailure));
      setDeleting(false);
      setConfirmingDelete(false);
    }
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Chat window (left) */}
      <ChatPanel
        initialMessages={initialMessages}
        key={websiteId}
        modelId={modelId}
        modelRef={modelRef}
        models={models}
        onModelChange={(nextModel) => {
          setModelId(nextModel);
          modelRef.current = nextModel;
        }}
        onFinish={() => void refreshWebsite()}
        websiteId={websiteId}
      />

      {/* Website viewer (right) */}
      <div className="flex min-w-0 flex-1 flex-col border-l border-[#eeeaf1] bg-white">
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-[#eeeaf1] px-4">
          <div className="flex items-center gap-1">
            <ViewerTabButton active={tab === "preview"} icon={FiEye} label="Preview" onClick={() => setTab("preview")} />
            <ViewerTabButton active={tab === "code"} icon={FiCode} label="Code" onClick={() => setTab("code")} />
            <ViewerTabButton active={tab === "history"} icon={FiClock} label="History" onClick={() => setTab("history")} />
          </div>
          <div className="flex items-center gap-2">
            {publishedUrl && (
              <a
                className="inline-flex max-w-[260px] items-center gap-1 truncate rounded-md bg-[#eaf6ef] px-2.5 py-1 text-[11px] font-medium text-[#4e8a68] hover:underline"
                href={publishedUrl}
                rel="noreferrer"
                target="_blank"
              >
                <FiExternalLink className="size-3 shrink-0" /> {publishedUrl.replace(/^https?:\/\//, "")}
              </a>
            )}
            {website.publishedAt && !publishedUrl && website.slug && (
              <a
                className="inline-flex max-w-[260px] items-center gap-1 truncate rounded-md bg-[#eaf6ef] px-2.5 py-1 text-[11px] font-medium text-[#4e8a68] hover:underline"
                href={`/p/${website.slug}`}
                rel="noreferrer"
                target="_blank"
              >
                <FiExternalLink className="size-3 shrink-0" /> /p/{website.slug}
              </a>
            )}
            <Button className="h-8 bg-[#291b32] px-3 text-xs" disabled={publishing || !website.activeCommitSha} onClick={() => void publish()}>
              {publishing ? <FiLoader className="size-3.5 animate-spin" /> : <FiGlobe className="size-3.5" />}
              {website.publishedAt ? "Republish" : "Publish"}
            </Button>
            <Button
              aria-label={`Delete ${website.name}`}
              className="size-8 p-0 text-[#a49ba9] hover:bg-red-50 hover:text-red-700"
              onClick={() => setConfirmingDelete(true)}
              size="sm"
              variant="ghost"
            >
              <FiTrash2 className="size-3.5" />
            </Button>
          </div>
        </div>

        {(publishError || deleteError) && <p className="border-b border-red-100 bg-red-50 px-4 py-2 text-xs text-red-700">{publishError || deleteError}</p>}

        <div className="min-h-0 flex-1">
          {tab === "preview" && (
            <iframe
              className="h-full w-full bg-[#f8f7fa]"
              key={website.activeCommitSha ?? "empty"}
              sandbox="allow-same-origin"
              src={`/api/websites/${websiteId}/preview${website.activeCommitSha ? `?v=${website.activeCommitSha}` : ""}`}
              title="Website preview"
            />
          )}
          {tab === "code" && <CodePanel onCommitted={() => void refreshWebsite()} websiteId={websiteId} />}
          {tab === "history" && (
            <HistoryPanel
              activeSha={website.activeCommitSha}
              onReverted={() => void refreshWebsite()}
              refreshKey={commitRefreshKey}
              websiteId={websiteId}
            />
          )}
        </div>
      </div>

      <Dialog onOpenChange={setConfirmingDelete} open={confirmingDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete “{website.name}”?</DialogTitle>
            <DialogDescription>
              This permanently removes the website, its versions in storage, and the chat history. A published link will stop
              working. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button disabled={deleting} onClick={() => setConfirmingDelete(false)} variant="outline">
              Cancel
            </Button>
            <Button className="bg-red-700 hover:bg-red-800" disabled={deleting} onClick={() => void deleteWebsite()}>
              {deleting ? <FiLoader className="size-4 animate-spin" /> : <FiTrash2 className="size-4" />} Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ViewerTabButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof FiEye;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition",
        active ? "bg-[#f3eef7] text-[#4f3262]" : "text-[#716b76] hover:bg-[#f7f5f8]",
      )}
      onClick={onClick}
      type="button"
    >
      <Icon className="size-3.5" /> {label}
    </button>
  );
}

/* --------------------------------- Chat panel ------------------------------ */

function ChatPanel({
  websiteId,
  models,
  modelId,
  modelRef,
  onModelChange,
  initialMessages,
  onFinish,
}: {
  websiteId: string;
  models: ChatModel[];
  modelId: string;
  modelRef: { current: string };
  onModelChange: (modelId: string) => void;
  initialMessages: UIMessage[];
  onFinish: () => void;
}) {
  const [input, setInput] = useState("");

  const transport = useRef(
    new DefaultChatTransport<UIMessage>({
      api: `/api/websites/${websiteId}/chat`,
      body: () => ({ modelId: modelRef.current }),
    }),
  ).current;

  const { messages, sendMessage, status, stop, error, regenerate } = useChat({
    id: websiteId,
    transport,
    messages: initialMessages,
    onFinish: () => onFinish(),
  });

  const busy = status === "submitted" || status === "streaming";

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void sendMessage({ text });
  }

  return (
    <div className="flex w-[380px] shrink-0 flex-col bg-[#fbfafc]">
      <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-[#eeeaf1] px-4">
        <Link className="flex items-center gap-1.5 text-xs text-[#736b78] hover:text-[#3e3543]" to="/websites">
          <FiArrowLeft className="size-3.5" /> All websites
        </Link>
        {models.length > 0 && (
          <Select onValueChange={onModelChange} value={modelId}>
            <SelectTrigger className="h-8 w-[160px] border-[#e9e6ed] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {models.map((model) => (
                <SelectItem key={model.id} value={model.id}>
                  {model.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 && (
          <div className="rounded-xl border border-[#eeeaf1] bg-white p-5">
            <p className="text-sm font-semibold">Describe your website</p>
            <p className="mt-1.5 text-xs leading-5 text-[#847b89]">
              The builder writes React + Tailwind code, streams it live, and commits every version. It can also read your CMS
              collections — try “Build a landing page from my Articles collection”.
            </p>
          </div>
        )}
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-xs text-[#928995]">
            <FiLoader className="size-3.5 animate-spin" /> Building…
          </div>
        )}
        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error.message || "The request failed."}</p>}
      </div>

      <div className="shrink-0 border-t border-[#eeeaf1] p-3">
        <div className="flex items-end gap-2 rounded-xl border border-[#e9e6ed] bg-white p-2 shadow-sm">
          <textarea
            className="max-h-[140px] min-h-[38px] flex-1 resize-none bg-transparent px-2 py-2 text-[13px] outline-none placeholder:text-[#a49ba9]"
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                submit();
              }
            }}
            placeholder="Describe a change…"
            rows={1}
            value={input}
          />
          {busy ? (
            <Button aria-label="Stop" className="size-9 shrink-0 bg-[#291b32] p-0" onClick={stop}>
              <FiSquare className="size-3.5" />
            </Button>
          ) : (
            <Button aria-label="Send" className="size-9 shrink-0 bg-[#291b32] p-0" disabled={!input.trim()} onClick={submit}>
              <FiSend className="size-4" />
            </Button>
          )}
        </div>
        {messages.length > 0 && !busy && (
          <button
            className="mt-2 flex items-center gap-1 px-1 text-[11px] text-[#928995] hover:text-[#5f5764]"
            onClick={() => void regenerate()}
            type="button"
          >
            <FiRefreshCw className="size-3" /> Regenerate last reply
          </button>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ Message bubbles ---------------------------- */

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const text = message.parts
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("\n");

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-[13px] leading-6",
          isUser ? "bg-[#291b32] text-white" : "bg-white text-[#211d26] shadow-sm border border-[#eeeaf1]",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap">{text}</p>
        ) : (
          <MessageMarkdown text={text} />
        )}
      </div>
    </div>
  );
}

/** Minimal renderer: prose paragraphs + collapsible tsx code blocks. */
function MessageMarkdown({ text }: { text: string }) {
  const segments = text.split(/```(?:tsx|typescript|jsx)\r?\n([\s\S]*?)```/g);
  return (
    <div className="space-y-2">
      {segments.map((segment, index) =>
        index % 2 === 1 ? (
          <details className="rounded-lg border border-[#eeeaf1] bg-[#fbfafc]" key={index}>
            <summary className="cursor-pointer px-3 py-2 text-[11px] font-medium text-[#6f6078]">
              Updated src/app/page.tsx ({segment.split("\n").length} lines)
            </summary>
            <pre className="max-h-[280px] overflow-auto border-t border-[#eeeaf1] px-3 py-2 text-[10px] leading-5 text-[#5f5764]">
              {segment.trim()}
            </pre>
          </details>
        ) : segment.trim() ? (
          <p className="whitespace-pre-wrap" key={index}>
            {segment.trim()}
          </p>
        ) : null,
      )}
    </div>
  );
}

/* -------------------------------- Code panel ------------------------------- */

function CodePanel({ websiteId, onCommitted }: { websiteId: string; onCommitted: () => void }) {
  const [code, setCode] = useState<string | null>(null);
  const [sha, setSha] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const website = await api<{ website: WebsiteSummary }>(`/api/websites/${websiteId}`);
      if (!website.website.activeCommitSha) {
        setCode(null);
      } else {
        const result = await api<{ files: Record<string, string> }>(`/api/websites/${websiteId}/commits/${website.website.activeCommitSha}`);
        setSha(website.website.activeCommitSha);
        setCode(result.files["src/app/page.tsx"] ?? "");
      }
    } catch (loadError) {
      setError(loadFailureMessage(loadError));
    }
    setLoading(false);
  }, [websiteId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    if (!code?.trim()) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      await api(`/api/websites/${websiteId}/commits`, {
        body: JSON.stringify({ code, message: "Manual code edit" }),
        method: "POST",
      });
      setSaved(true);
      onCommitted();
    } catch (saveError) {
      setError(loadFailureMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="px-6 py-6 text-xs text-[#928995]">Loading source…</p>;
  if (code === null) {
    return <p className="px-6 py-6 text-xs text-[#928995]">No source yet — describe the site in the chat to generate the first build.</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#eeeaf1] px-4 py-2">
        <span className="font-mono text-[11px] text-[#6f6078]">src/app/page.tsx{sha ? ` @ ${sha.slice(0, 7)}` : ""}</span>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="inline-flex items-center gap-1 text-[11px] text-[#4e8a68]">
              <FiCheck className="size-3" /> Committed
            </span>
          )}
          <Button className="h-7 px-2.5 text-[11px]" disabled={saving} onClick={() => void navigator.clipboard.writeText(code)} size="sm" variant="outline">
            <FiCopy className="size-3" /> Copy
          </Button>
          <Button className="h-7 bg-[#291b32] px-2.5 text-[11px]" disabled={saving || !code.trim()} onClick={() => void save()} size="sm">
            {saving ? <FiLoader className="size-3 animate-spin" /> : <FiCheck className="size-3" />} Commit
          </Button>
        </div>
      </div>
      {error && <p className="bg-red-50 px-4 py-2 text-xs text-red-700">{error}</p>}
      <textarea
        className="min-h-0 flex-1 resize-none bg-[#fbfafc] p-4 font-mono text-[11px] leading-6 text-[#211d26] outline-none"
        onChange={(event) => setCode(event.target.value)}
        spellCheck={false}
        value={code}
      />
    </div>
  );
}

/* ------------------------------- History panel ------------------------------ */

type CommitSummary = {
  sha: string;
  parent: string | null;
  message: string;
  model: string;
  createdAt: string;
  fileCount: number;
};

function HistoryPanel({
  websiteId,
  activeSha,
  onReverted,
  refreshKey,
}: {
  websiteId: string;
  activeSha: string | null;
  onReverted: () => void;
  refreshKey: number;
}) {
  const [commits, setCommits] = useState<CommitSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [reverting, setReverting] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ commits: CommitSummary[] }>(`/api/websites/${websiteId}/commits`);
      setCommits(result.commits);
    } catch (loadError) {
      setError(loadFailureMessage(loadError));
    }
    setLoading(false);
  }, [websiteId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function revert(sha: string) {
    setReverting(sha);
    try {
      await api(`/api/websites/${websiteId}/revert`, { body: JSON.stringify({ sha }), method: "POST" });
      onReverted();
    } catch (revertError) {
      setError(loadFailureMessage(revertError));
    } finally {
      setReverting("");
    }
  }

  if (loading) return <p className="px-6 py-6 text-xs text-[#928995]">Loading history…</p>;
  if (commits.length === 0) {
    return <p className="px-6 py-6 text-xs text-[#928995]">No versions yet. Every AI build and manual edit is committed here.</p>;
  }

  return (
    <div className="h-full overflow-y-auto px-4 py-4">
      {error && <p className="mb-3 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
      <div className="space-y-2">
        {commits.map((commit) => (
          <div
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border px-4 py-3",
              commit.sha === activeSha ? "border-[#d9c8e8] bg-[#faf7fc]" : "border-[#eeeaf1] bg-white",
            )}
            key={commit.sha}
          >
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{commit.message || "Update"}</p>
              <p className="mt-0.5 text-[11px] text-[#968d9a]">
                <span className="font-mono">{commit.sha.slice(0, 7)}</span> · {formatTime(commit.createdAt)} · {commit.model}
              </p>
            </div>
            {commit.sha === activeSha ? (
              <Badge className="shrink-0 bg-[#f2eafa] text-[10px] text-[#78538c]" variant="secondary">
                Active
              </Badge>
            ) : (
              <Button
                className="h-7 shrink-0 px-2.5 text-[11px]"
                disabled={reverting === commit.sha}
                onClick={() => void revert(commit.sha)}
                size="sm"
                variant="outline"
              >
                {reverting === commit.sha ? <FiLoader className="size-3 animate-spin" /> : <FiClock className="size-3" />} Restore
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------------------------- Routes --------------------------------- */

export function WebsitesRoutes() {
  return (
    <Routes>
      <Route element={<WebsitesLayout />} path="/">
        <Route index element={<WebsitesHomePage />} />
        <Route path=":websiteId" element={<WebsiteBuilderPage />} />
        <Route path="*" element={<Navigate replace to="/websites" />} />
      </Route>
    </Routes>
  );
}