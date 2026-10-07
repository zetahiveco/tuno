import { useEffect, useState } from "react";
import { FiCheck, FiCopy, FiLink2, FiTrash2 } from "react-icons/fi";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api-client";

type Teammate = { id: string; name: string; email: string };

type Sharing = {
  sharedAll: boolean;
  publicSlug: string | null;
  users: Teammate[];
};

export function ShareDialog({
  onOpenChange,
  open,
  page,
}: {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  page: { id: string; title: string; icon: string };
}) {
  const [sharing, setSharing] = useState<Sharing | null>(null);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setSharing(null);
    setSelectedUserId("");
    api<{ sharing: Sharing }>(`/api/notes/pages/${page.id}/shares`)
      .then((result) => setSharing(result.sharing))
      .catch((loadError) =>
        setError(loadError instanceof Error ? loadError.message : "Could not load sharing settings."),
      );
    api<{ users: Teammate[] }>("/api/notes/teammates")
      .then((result) => setTeammates(result.users))
      .catch(() => setTeammates([]));
  }, [open, page.id]);

  const publicUrl = sharing?.publicSlug
    ? `${window.location.origin}/share/${sharing.publicSlug}`
    : "";

  async function toggleSharedAll(value: boolean) {
    if (!sharing) return;
    setSharing({ ...sharing, sharedAll: value });
    try {
      await api(`/api/notes/pages/${page.id}/shares`, {
        body: JSON.stringify({ sharedAll: value }),
        method: "PATCH",
      });
    } catch (toggleError) {
      setSharing({ ...sharing, sharedAll: !value });
      setError(toggleError instanceof Error ? toggleError.message : "Could not update sharing.");
    }
  }

  async function togglePublicLink(enable: boolean) {
    if (!sharing) return;
    setBusy(true);
    try {
      if (enable) {
        const result = await api<{ sharing: { publicSlug: string } }>(
          `/api/notes/pages/${page.id}/shares/public`,
          { method: "POST" },
        );
        setSharing({ ...sharing, publicSlug: result.sharing.publicSlug });
      } else {
        await api(`/api/notes/pages/${page.id}/shares/public`, { method: "DELETE" });
        setSharing({ ...sharing, publicSlug: null });
      }
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update the public link.");
    }
    setBusy(false);
  }

  async function refreshShares() {
    const result = await api<{ sharing: Sharing }>(`/api/notes/pages/${page.id}/shares`);
    setSharing(result.sharing);
  }

  async function addPerson() {
    if (!selectedUserId) return;
    setBusy(true);
    try {
      await api(`/api/notes/pages/${page.id}/shares`, {
        body: JSON.stringify({ userId: selectedUserId }),
        method: "POST",
      });
      setSelectedUserId("");
      await refreshShares();
    } catch (addError) {
      setError(addError instanceof Error ? addError.message : "Could not share the page.");
    }
    setBusy(false);
  }

  async function removePerson(userId: string) {
    setBusy(true);
    try {
      await api(`/api/notes/pages/${page.id}/shares/${userId}`, { method: "DELETE" });
      await refreshShares();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Could not remove access.");
    }
    setBusy(false);
  }

  const owner = { id: "", name: "You", email: "Page owner" };
  const availableTeammates = teammates.filter(
    (teammate) => !sharing?.users.some((shared) => shared.id === teammate.id),
  );

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-lg">{page.icon || "📄"}</span>
            <span className="truncate">Share "{page.title.trim() || "Untitled"}"</span>
          </DialogTitle>
          <DialogDescription>Choose who can see this page.</DialogDescription>
        </DialogHeader>

        {error ? <p className="text-xs text-[#b05f5f]">{error}</p> : null}

        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-[13px] font-medium">All teammates</span>
              <span className="block text-xs text-[#8c838f]">Everyone in the workspace can view.</span>
            </span>
            <Switch
              checked={sharing?.sharedAll ?? false}
              disabled={!sharing}
              onCheckedChange={(value) => void toggleSharedAll(value)}
            />
          </label>

          <div>
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-[13px] font-medium">Public link</span>
                <span className="block text-xs text-[#8c838f]">Anyone with the link can view.</span>
              </span>
              <Switch
                checked={Boolean(sharing?.publicSlug)}
                disabled={!sharing || busy}
                onCheckedChange={(value) => void togglePublicLink(value)}
              />
            </label>
            {publicUrl ? (
              <div className="mt-2 flex items-center gap-1.5">
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
                  {copied ? <FiCheck className="size-3.5 text-[#3f8f5f]" /> : <FiCopy className="size-3.5" />}
                </Button>
              </div>
            ) : null}
          </div>

          <div className="border-t border-[#eeeaf1] pt-3">
            <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium">
              <FiLink2 className="size-3.5 text-[#8c838f]" />
              Shared with specific people
            </div>

            <div className="mb-3 flex items-center gap-2">
              <Select
                onValueChange={setSelectedUserId}
                value={selectedUserId}
              >
                <SelectTrigger className="h-8 flex-1 text-[13px]">
                  <SelectValue placeholder="Pick a teammate…" />
                </SelectTrigger>
                <SelectContent>
                  {availableTeammates.map((teammate) => (
                    <SelectItem key={teammate.id} value={teammate.id}>
                      {teammate.name} · {teammate.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="bg-[#291b32]"
                disabled={!selectedUserId || busy}
                onClick={() => void addPerson()}
                size="sm"
              >
                Share
              </Button>
            </div>

            <div className="space-y-1">
              {[owner, ...(sharing?.users ?? [])].map((person) => (
                <div
                  className="flex items-center justify-between gap-2 px-1 py-1.5"
                  key={person.id || "owner"}
                >
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium">{person.name}</p>
                    <p className="truncate text-xs text-[#8c838f]">{person.email}</p>
                  </div>
                  {person.id ? (
                    <button
                      aria-label="Remove access"
                      className="grid size-7 shrink-0 place-items-center rounded-md text-[#a49ba9] transition hover:bg-[#f7f5f8] hover:text-[#b05f5f]"
                      disabled={busy}
                      onClick={() => void removePerson(person.id)}
                      type="button"
                    >
                      <FiTrash2 className="size-3.5" />
                    </button>
                  ) : (
                    <span className="shrink-0 text-[11px] text-[#a49ba9]">Owner</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}