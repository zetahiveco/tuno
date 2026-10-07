import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  FiChevronRight,
  FiDownload,
  FiFile,
  FiFileText,
  FiFolder,
  FiGrid,
  FiLoader,
  FiPlus,
  FiShare2,
  FiTrash2,
  FiUpload,
} from "react-icons/fi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useConfirm } from "@/components/confirm-alert";
import { AppPageFrame, AppShell, type AppNavPage } from "@/general/frontend/app-shell";
import { api } from "@/lib/api-client";

/* ---------------------------------- Types --------------------------------- */

type FolderSummary = {
  id: string;
  name: string;
  parentId: string | null;
  createdById: string;
  sharedAll: boolean;
  publicSlug: string | null;
  role: "owner" | "edit";
  _count: { shares: number; files: number; subfolders: number };
  createdAt: string;
  updatedAt: string;
};

type FileSummary = {
  id: string;
  name: string;
  size: number;
  mimeType: string;
  createdAt: string;
};

type Crumb = { id: string; name: string };

type Teammate = { id: string; name: string; email: string };

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function fileIcon(mimeType: string): string {
  if (mimeType.startsWith("image/")) return "🖼️";
  if (mimeType.startsWith("video/")) return "🎬";
  if (mimeType.startsWith("audio/")) return "🎵";
  if (mimeType.includes("pdf")) return "📕";
  if (mimeType.includes("zip") || mimeType.includes("compressed")) return "🗜️";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv")) return "📊";
  if (mimeType.includes("word") || mimeType.includes("document")) return "📘";
  return "📄";
}

/* ------------------------------- Share dialog ------------------------------ */

function FolderShareDialog({
  folder,
  onOpenChange,
  open,
}: {
  folder: FolderSummary;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [sharing, setSharing] = useState<{ sharedAll: boolean; publicSlug: string | null; users: Teammate[] } | null>(null);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, element: confirmElement } = useConfirm();

  useEffect(() => {
    if (!open) return;
    setError("");
    setSharing(null);
    setSelectedUserId("");
    api<{ sharing: { sharedAll: boolean; publicSlug: string | null; users: Teammate[] } }>(`/api/documents/folders/${folder.id}/shares`)
      .then((result) => setSharing(result.sharing))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load sharing settings."));
    api<{ users: Teammate[] }>("/api/documents/teammates")
      .then((result) => setTeammates(result.users))
      .catch(() => setTeammates([]));
  }, [folder.id, open]);

  const publicUrl = sharing?.publicSlug ? `${window.location.origin}/d/${sharing.publicSlug}` : "";

  async function refresh() {
    const result = await api<{ sharing: { sharedAll: boolean; publicSlug: string | null; users: Teammate[] } }>(`/api/documents/folders/${folder.id}/shares`);
    setSharing(result.sharing);
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[420px]">
        {confirmElement}
        <DialogHeader>
          <DialogTitle>Share "{folder.name}"</DialogTitle>
          <DialogDescription>Teammates you share with can browse, upload, and download.</DialogDescription>
        </DialogHeader>
        {error && <p className="text-xs text-[#b05f5f]">{error}</p>}
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-[13px] font-medium">All teammates</span>
              <span className="block text-xs text-[#8c838f]">Everyone in the workspace can access.</span>
            </span>
            <Switch
              checked={sharing?.sharedAll ?? false}
              disabled={!sharing}
              onCheckedChange={async (value) => {
                setSharing((current) => (current ? { ...current, sharedAll: value } : current));
                try {
                  await api(`/api/documents/folders/${folder.id}/shares`, { body: JSON.stringify({ sharedAll: value }), method: "PATCH" });
                } catch (toggleError) {
                  setError(toggleError instanceof Error ? toggleError.message : "Could not update sharing.");
                  await refresh();
                }
              }}
            />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-[13px] font-medium">Public link</span>
              <span className="block text-xs text-[#8c838f]">Anyone with the link can view and download.</span>
            </span>
            <Switch
              checked={Boolean(sharing?.publicSlug)}
              disabled={!sharing || busy}
              onCheckedChange={async (value) => {
                setBusy(true);
                try {
                  if (value) {
                    const result = await api<{ sharing: { publicSlug: string } }>(`/api/documents/folders/${folder.id}/shares/public`, { method: "POST" });
                    setSharing((current) => (current ? { ...current, publicSlug: result.sharing.publicSlug } : current));
                  } else {
                    await api(`/api/documents/folders/${folder.id}/shares/public`, { method: "DELETE" });
                    setSharing((current) => (current ? { ...current, publicSlug: null } : current));
                  }
                } catch (linkError) {
                  setError(linkError instanceof Error ? linkError.message : "Could not update the public link.");
                }
                setBusy(false);
              }}
            />
          </label>
          {publicUrl && (
            <div className="flex items-center gap-1.5">
              <Input className="h-8 flex-1 bg-[#f4f2f6] text-xs" readOnly value={publicUrl} />
              <Button
                className="h-8 w-8 shrink-0 p-0"
                onClick={() => {
                  void navigator.clipboard.writeText(publicUrl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }}
                size="sm"
                variant="outline"
              >
                {copied ? "✓" : "⧉"}
              </Button>
            </div>
          )}
          <div className="border-t border-[#eeeaf1] pt-3">
            <div className="mb-2 text-[13px] font-medium">Shared with specific people</div>
            <div className="mb-3 flex items-center gap-2">
              <Select onValueChange={setSelectedUserId} value={selectedUserId}>
                <SelectTrigger className="flex-1 border-[#e9e6ed] bg-white text-[13px]" size="sm">
                  <SelectValue placeholder="Pick a teammate…" />
                </SelectTrigger>
                <SelectContent>
                  {teammates
                    .filter((teammate) => !sharing?.users.some((shared) => shared.id === teammate.id))
                    .map((teammate) => (
                      <SelectItem key={teammate.id} value={teammate.id}>{teammate.name} · {teammate.email}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Button
                className="bg-[#291b32]"
                disabled={!selectedUserId || busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(`/api/documents/folders/${folder.id}/shares`, { body: JSON.stringify({ userId: selectedUserId }), method: "POST" });
                    setSelectedUserId("");
                    await refresh();
                  } catch (shareError) {
                    setError(shareError instanceof Error ? shareError.message : "Could not share the folder.");
                  }
                  setBusy(false);
                }}
                size="sm"
              >
                Share
              </Button>
            </div>
            <div className="space-y-1">
              {sharing?.users.map((person) => (
                <div className="flex items-center justify-between gap-2 px-1 py-1.5" key={person.id}>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{person.name}</p>
                    <p className="truncate text-xs text-[#8c838f]">{person.email}</p>
                  </div>
                  <button
                    aria-label="Remove access"
                    className="grid size-7 shrink-0 place-items-center rounded-md text-[#a49ba9] transition hover:bg-[#f7f5f8] hover:text-[#b05f5f]"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true);
                      const confirmed = await confirm({
                        title: `Remove ${person.name}'s access?`,
                        description: "This person will no longer be able to open this folder.",
                      });
                      if (!confirmed) {
                        setBusy(false);
                        return;
                      }
                      try {
                        await api(`/api/documents/folders/${folder.id}/shares/${person.id}`, { method: "DELETE" });
                        await refresh();
                      } catch (removeError) {
                        setError(removeError instanceof Error ? removeError.message : "Could not remove access.");
                      }
                      setBusy(false);
                    }}
                    type="button"
                  >
                    <FiTrash2 className="size-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Layout ---------------------------------- */

const NAV: AppNavPage[] = [
  { end: true, icon: FiFolder, label: "My documents", to: "/documents" },
  { icon: FiGrid, label: "Shared with me", to: "/documents/shared" },
];

export function DocumentsLayout() {
  return <AppShell accent="bg-[#eaf0f8] text-[#587497]" appName="Documents" icon={FiFolder} pages={NAV} />;
}

/* --------------------------------- Browser --------------------------------- */

function DocumentsBrowser({ scope }: { scope: "mine" | "shared" }) {
  const { folderId } = useParams<{ folderId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [folders, setFolders] = useState<FolderSummary[] | null>(null);
  const [files, setFiles] = useState<FileSummary[]>([]);
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [error, setError] = useState("");
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [shareFolder, setShareFolder] = useState<FolderSummary | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { confirm, element: confirmElement } = useConfirm();

  const parentId = folderId ?? null;

  const loadContents = useCallback(() => {
    const listParams = new URLSearchParams();
    if (parentId) listParams.set("parentId", parentId);
    if (scope === "shared") listParams.set("scope", "shared");
    api<{ folders: FolderSummary[] }>(`/api/documents/folders?${listParams}`)
      .then((result) => setFolders(result.folders))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load folders."));
    api<{ files: FileSummary[] }>(`/api/documents/files${parentId ? `?parentId=${parentId}` : ""}`)
      .then((result) => setFiles(result.files))
      .catch(() => setFiles([]));
    if (parentId) {
      api<{ path: Crumb[] }>(`/api/documents/folders/${parentId}/path`)
        .then((result) => setCrumbs(result.path))
        .catch(() => setCrumbs([]));
    } else {
      setCrumbs([]);
    }
  }, [parentId, scope]);

  useEffect(() => { loadContents(); }, [loadContents]);

  async function createFolder() {
    if (!folderName.trim()) return;
    setCreatingFolder(true);
    setError("");
    try {
      await api("/api/documents/folders", {
        body: JSON.stringify({ name: folderName, parentId }),
        method: "POST",
      });
      setFolderName("");
      setFolderDialogOpen(false);
      loadContents();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the folder.");
    } finally {
      setCreatingFolder(false);
    }
  }

  async function removeFolder(folder: FolderSummary) {
    const confirmed = await confirm({
      title: `Delete "${folder.name}"?`,
      description: "This permanently deletes the folder and everything inside it. This action cannot be undone.",
    });
    if (!confirmed) return;
    try {
      await api(`/api/documents/folders/${folder.id}`, { method: "DELETE" });
      setFolders((current) => (current ?? []).filter((entry) => entry.id !== folder.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the folder.");
    }
  }

  async function removeFile(file: FileSummary) {
    const confirmed = await confirm({
      title: `Delete "${file.name}"?`,
      description: "This permanently deletes the file. This action cannot be undone.",
    });
    if (!confirmed) return;
    try {
      await api(`/api/documents/files/${file.id}`, { method: "DELETE" });
      setFiles((current) => current.filter((entry) => entry.id !== file.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the file.");
    }
  }

  async function uploadFiles(fileList: FileList) {
    setUploading(true);
    setError("");
    try {
      for (const file of Array.from(fileList)) {
        setUploadProgress(`Uploading ${file.name}…`);
        const { upload } = await api<{ upload: { filename: string; url: string } }>("/api/documents/uploads", {
          body: JSON.stringify({ name: file.name }),
          method: "POST",
        });
        const put = await fetch(upload.url, {
          method: "PUT",
          body: file,
          headers: { "Content-Type": file.type || "application/octet-stream" },
        });
        if (!put.ok) throw new Error(`Upload failed for ${file.name}.`);
        await api("/api/documents/files", {
          body: JSON.stringify({
            folderId: parentId,
            name: file.name,
            key: upload.filename,
            size: file.size,
            mimeType: file.type || "application/octet-stream",
          }),
          method: "POST",
        });
      }
      setUploadProgress("");
      loadContents();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Could not upload the files.");
    } finally {
      setUploading(false);
      setUploadProgress("");
    }
  }

  async function download(file: FileSummary) {
    try {
      const result = await api<{ download: { filename: string; url: string } }>(`/api/documents/files/${file.id}/download`);
      window.open(result.download.url, "_blank");
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Could not start the download.");
    }
  }

  const rootHref = scope === "shared" ? "/documents/shared" : "/documents";

  return (
    <AppPageFrame
      action={(
        <>
          {error && <span className="max-w-[240px] truncate text-xs text-[#b05f5f]">{error}</span>}
          <Button className="h-9 border-[#e9e6ed] bg-white px-3 text-xs" onClick={() => setFolderDialogOpen(true)} size="sm" variant="outline">
            <FiPlus className="size-3.5" /> New folder
          </Button>
          <Button className="h-9 bg-[#291b32] px-3 text-xs hover:bg-[#473252]" disabled={uploading} onClick={() => inputRef.current?.click()} size="sm">
            {uploading ? <FiLoader className="size-3.5 animate-spin" /> : <FiUpload className="size-3.5" />}
            {uploadProgress || "Upload files"}
          </Button>
          <input
            hidden
            multiple
            onChange={(event) => {
              if (event.target.files?.length) void uploadFiles(event.target.files);
              event.target.value = "";
            }}
            ref={inputRef}
            type="file"
          />
        </>
      )}
      description={scope === "shared" ? "Folders your teammates shared with you." : "Your files, organized your way."}
      title="Documents"
    >
      {confirmElement}
      <div className="mb-5 flex items-center gap-1 text-xs">
        <button className={`font-medium ${parentId ? "text-[#716b76] hover:text-[#3e3543]" : "text-[#211d26]"}`} onClick={() => navigate(rootHref)} type="button">
          {scope === "shared" ? "Shared" : "My documents"}
        </button>
        {crumbs.map((crumb, index) => (
          <span className="flex items-center gap-1" key={crumb.id}>
            <FiChevronRight className="size-3 text-[#cfc7d6]" />
            {index === crumbs.length - 1
              ? <span className="truncate font-medium text-[#211d26]">{crumb.name}</span>
              : <button className="truncate text-[#716b76] hover:text-[#3e3543]" onClick={() => navigate(`${rootHref}/folders/${crumb.id}`)} type="button">{crumb.name}</button>}
          </span>
        ))}
      </div>

      {folders !== null && folders.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {folders.map((folder) => (
            <div className="group relative cursor-pointer rounded-lg border border-[#eeeaf1] bg-white p-4 transition hover:border-[#ddd3e4]" key={folder.id} onClick={() => navigate(`${rootHref}/folders/${folder.id}`)} role="button" tabIndex={0}>
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center bg-[#eaf0f8] text-[#587497]"><FiFolder className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">{folder.name}</p>
                  <p className="mt-0.5 text-[10px] text-[#968d9a]">{folder._count.files} files · {folder._count.subfolders} folders</p>
                </div>
              </div>
              <div className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition group-hover:opacity-100">
                {folder.role === "owner" && (
                  <button
                    aria-label={`Share ${folder.name}`}
                    className="grid size-6 place-items-center rounded text-[#a49ba9] hover:bg-[#f3eef7] hover:text-[#5c3f6e]"
                    onClick={(event) => {
                      event.stopPropagation();
                      setShareFolder(folder);
                    }}
                    type="button"
                  >
                    <FiShare2 className="size-3" />
                  </button>
                )}
                {folder.role === "owner" && (
                  <button
                    aria-label={`Delete ${folder.name}`}
                    className="grid size-6 place-items-center rounded text-[#a49ba9] hover:bg-red-50 hover:text-[#b05f5f]"
                    onClick={(event) => {
                      event.stopPropagation();
                      void removeFolder(folder);
                    }}
                    type="button"
                  >
                    <FiTrash2 className="size-3" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-[#eeeaf1] bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[#eeeaf1] text-[10px] uppercase tracking-[0.1em] text-[#a49ba9]">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Size</th>
              <th className="px-4 py-3 font-semibold">Added</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {files.length === 0 && (
              <tr><td className="px-4 py-6 text-[#928995]" colSpan={4}>{folders === null ? "Loading…" : "No files here yet. Upload some files to get started."}</td></tr>
            )}
            {files.map((file) => (
              <tr className="border-b border-[#f4f2f5] last:border-0 hover:bg-[#faf9fb]" key={file.id}>
                <td className="px-4 py-3">
                  <span className="mr-2">{fileIcon(file.mimeType)}</span>
                  <span className="font-medium">{file.name}</span>
                </td>
                <td className="px-4 py-3 text-[#716b76]">{formatSize(file.size)}</td>
                <td className="px-4 py-3 text-[#716b76]">{new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(file.createdAt))}</td>
                <td className="px-2 py-3 text-right">
                  <div className="flex justify-end gap-0.5">
                    <button aria-label={`Download ${file.name}`} className="grid size-7 place-items-center rounded text-[#716b76] hover:bg-[#f7f5f8]" onClick={() => void download(file)} type="button">
                      <FiDownload className="size-3.5" />
                    </button>
                    <button aria-label={`Delete ${file.name}`} className="grid size-7 place-items-center rounded text-[#a49ba9] hover:bg-red-50 hover:text-[#b05f5f]" onClick={() => void removeFile(file)} type="button">
                      <FiTrash2 className="size-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog onOpenChange={setFolderDialogOpen} open={folderDialogOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>Create a folder{parentId ? " inside this folder" : ""}.</DialogDescription>
          </DialogHeader>
          <Input
            autoFocus
            className="h-9 border-[#e9e6ed]"
            onChange={(event) => setFolderName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void createFolder();
              }
            }}
            placeholder="Folder name"
            value={folderName}
          />
          <DialogFooter>
            <Button onClick={() => setFolderDialogOpen(false)} type="button" variant="outline">Cancel</Button>
            <Button className="bg-[#291b32] hover:bg-[#473252]" disabled={creatingFolder} onClick={() => void createFolder()} type="button">
              {creatingFolder ? "Creating…" : "Create folder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {shareFolder && <FolderShareDialog folder={shareFolder} onOpenChange={(open) => { if (!open) setShareFolder(null); }} open />}
    </AppPageFrame>
  );
}

export function DocumentsHomePage() {
  return <DocumentsBrowser scope="mine" />;
}

export function DocumentsSharedPage() {
  return <DocumentsBrowser scope="shared" />;
}

/* ------------------------------ Public folder ------------------------------ */

export function PublicFolderPage() {
  const { slug } = useParams<{ slug: string }>();
  const [folder, setFolder] = useState<{ name: string; subfolders: { id: string; name: string }[]; files: FileSummary[] } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ folder: { name: string; subfolders: { id: string; name: string }[]; files: FileSummary[] } }>(`/api/public/documents/folders/${slug}`)
      .then((result) => {
        setFolder(result.folder);
        setStatus("ready");
      })
      .catch(() => setStatus("missing"));
  }, [slug]);

  if (status === "loading") {
    return <main className="grid min-h-screen place-items-center bg-[#f8f7fa] text-xs text-[#928995]">Opening folder…</main>;
  }
  if (status === "missing" || !folder) {
    return <main className="grid min-h-screen place-items-center bg-[#f8f7fa] text-sm text-[#847b89]">This folder link is not available.</main>;
  }

  async function download(file: FileSummary) {
    try {
      const result = await api<{ download: { filename: string; url: string } }>(`/api/public/documents/files/${file.id}/download`);
      window.open(result.download.url, "_blank");
    } catch (downloadError) {
      setError(downloadError instanceof Error ? downloadError.message : "Could not start the download.");
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-[860px] bg-[#f8f7fa] px-5 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center bg-[#eaf0f8] text-[#587497]"><FiFolder className="size-5" /></span>
          <div>
            <h1 className="text-xl font-semibold tracking-[-0.03em]">{folder.name}</h1>
            <p className="text-xs text-[#928995]">Shared folder · read-only</p>
          </div>
        </div>
        <Link className="flex items-center gap-1.5 text-xs font-medium text-[#755984]" to="/home">
          <FiFileText className="size-3.5" /> Tuno
        </Link>
      </header>
      {error && <p className="mb-3 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">{error}</p>}
      {folder.subfolders.length > 0 && (
        <div className="mb-6 grid gap-3 sm:grid-cols-3">
          {folder.subfolders.map((subfolder) => (
            <div className="flex items-center gap-3 rounded-lg border border-[#eeeaf1] bg-white p-4" key={subfolder.id}>
              <span className="grid size-8 place-items-center bg-[#eaf0f8] text-[#587497]"><FiFolder className="size-3.5" /></span>
              <span className="truncate text-xs font-medium">{subfolder.name}</span>
            </div>
          ))}
        </div>
      )}
      <div className="rounded-lg border border-[#eeeaf1] bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[#eeeaf1] text-[10px] uppercase tracking-[0.1em] text-[#a49ba9]">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Size</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {folder.files.length === 0 && <tr><td className="px-4 py-6 text-[#928995]" colSpan={3}>This folder is empty.</td></tr>}
            {folder.files.map((file) => (
              <tr className="border-b border-[#f4f2f5] last:border-0" key={file.id}>
                <td className="px-4 py-3 font-medium"><span className="mr-2">{fileIcon(file.mimeType)}</span>{file.name}</td>
                <td className="px-4 py-3 text-[#716b76]">{formatSize(file.size)}</td>
                <td className="px-2 py-3 text-right">
                  <button aria-label={`Download ${file.name}`} className="grid size-7 place-items-center rounded text-[#716b76] hover:bg-[#f7f5f8]" onClick={() => void download(file)} type="button">
                    <FiDownload className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
