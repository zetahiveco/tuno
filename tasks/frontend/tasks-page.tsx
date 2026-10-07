import { useCallback, useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  FiArrowLeft,
  FiCalendar,
  FiCheckSquare,
  FiColumns,
  FiGrid,
  FiLoader,
  FiPlus,
  FiShare2,
  FiTrash2,
  FiUser,
} from "react-icons/fi";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Textarea } from "@/components/ui/textarea";
import { AppPageFrame, AppShell, type AppNavPage } from "@/general/frontend/app-shell";
import { api } from "@/lib/api-client";
import { cn } from "cn";

/* ---------------------------------- Types --------------------------------- */

type BoardSummary = {
  id: string;
  name: string;
  color: string;
  createdById: string;
  sharedAll: boolean;
  publicSlug: string | null;
  role: "owner" | "edit";
  _count: { shares: number; cards: number };
  updatedAt: string;
};

type BoardColumn = { id: string; boardId: string; name: string; position: number };

type Card = {
  id: string;
  boardId: string;
  columnId: string;
  title: string;
  description: string;
  assigneeId: string | null;
  dueDate: string | null;
  position: number;
  subtasks: Card[];
};

type Assignee = { id: string; name: string; email: string };

type BoardDetail = {
  id: string;
  name: string;
  color: string;
  createdById: string;
  sharedAll: boolean;
  publicSlug: string | null;
  role: "owner" | "edit";
  columns: BoardColumn[];
  cards: Card[];
  assignees: Assignee[];
};

type PlannerCard = {
  id: string;
  title: string;
  dueDate: string;
  boardId: string;
  boardName: string;
  assigneeId: string | null;
};

type Teammate = { id: string; name: string; email: string };

function formatDate(value: string | null): string {
  if (!value) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

function initials(name: string, email: string): string {
  return (name.trim() || email)[0]?.toUpperCase() ?? "?";
}

/* ------------------------------- Share dialog ------------------------------ */

function BoardShareDialog({
  board,
  onOpenChange,
  open,
}: {
  board: BoardSummary;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const [sharing, setSharing] = useState<{ sharedAll: boolean; publicSlug: string | null; users: Teammate[] } | null>(null);
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
    api<{ sharing: { sharedAll: boolean; publicSlug: string | null; users: Teammate[] } }>(`/api/tasks/boards/${board.id}/shares`)
      .then((result) => setSharing(result.sharing))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load sharing settings."));
    api<{ users: Teammate[] }>("/api/tasks/teammates")
      .then((result) => setTeammates(result.users))
      .catch(() => setTeammates([]));
  }, [board.id, open]);

  const publicUrl = sharing?.publicSlug ? `${window.location.origin}/t/${sharing.publicSlug}` : "";

  async function refresh() {
    const result = await api<{ sharing: { sharedAll: boolean; publicSlug: string | null; users: Teammate[] } }>(`/api/tasks/boards/${board.id}/shares`);
    setSharing(result.sharing);
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>Share "{board.name}"</DialogTitle>
          <DialogDescription>Teammates you share with can add and edit tasks.</DialogDescription>
        </DialogHeader>
        {error && <p className="text-xs text-[#b05f5f]">{error}</p>}
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-4">
            <span>
              <span className="block text-[13px] font-medium">All teammates</span>
              <span className="block text-xs text-[#8c838f]">Everyone in the workspace can edit.</span>
            </span>
            <Switch
              checked={sharing?.sharedAll ?? false}
              disabled={!sharing}
              onCheckedChange={async (value) => {
                setSharing((current) => (current ? { ...current, sharedAll: value } : current));
                try {
                  await api(`/api/tasks/boards/${board.id}/shares`, { body: JSON.stringify({ sharedAll: value }), method: "PATCH" });
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
              <span className="block text-xs text-[#8c838f]">Anyone with the link can view (read-only).</span>
            </span>
            <Switch
              checked={Boolean(sharing?.publicSlug)}
              disabled={!sharing || busy}
              onCheckedChange={async (value) => {
                setBusy(true);
                try {
                  if (value) {
                    const result = await api<{ sharing: { publicSlug: string } }>(`/api/tasks/boards/${board.id}/shares/public`, { method: "POST" });
                    setSharing((current) => (current ? { ...current, publicSlug: result.sharing.publicSlug } : current));
                  } else {
                    await api(`/api/tasks/boards/${board.id}/shares/public`, { method: "DELETE" });
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
            <div className="mb-2 flex items-center gap-1.5 text-[13px] font-medium">
              <FiUser className="size-3.5 text-[#8c838f]" /> Shared with specific people
            </div>
            <div className="mb-3 flex items-center gap-2">
              <Select onValueChange={setSelectedUserId} value={selectedUserId}>
                <SelectTrigger className="h-8 flex-1 text-[13px]"><SelectValue placeholder="Pick a teammate…" /></SelectTrigger>
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
                    await api(`/api/tasks/boards/${board.id}/shares`, { body: JSON.stringify({ userId: selectedUserId }), method: "POST" });
                    setSelectedUserId("");
                    await refresh();
                  } catch (shareError) {
                    setError(shareError instanceof Error ? shareError.message : "Could not share the board.");
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
                      try {
                        await api(`/api/tasks/boards/${board.id}/shares/${person.id}`, { method: "DELETE" });
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
  { end: true, icon: FiColumns, label: "Boards", to: "/tasks" },
  { icon: FiCalendar, label: "Planner", to: "/tasks/planner" },
];

export function TasksLayout() {
  return <AppShell accent="bg-[#e8eefb] text-[#3b63a8]" appName="Tasks" icon={FiColumns} pages={NAV} />;
}

/* ------------------------------- Boards page ------------------------------- */

export function TasksBoardsPage() {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [error, setError] = useState("");
  const [shareBoard, setShareBoard] = useState<BoardSummary | null>(null);
  const navigate = useNavigate();

  const loadBoards = useCallback(() => {
    api<{ boards: BoardSummary[] }>("/api/tasks/boards")
      .then((result) => setBoards(result.boards))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load boards."));
  }, []);

  useEffect(() => { loadBoards(); }, [loadBoards]);

  async function create() {
    if (!name.trim() || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      const result = await api<{ board: BoardSummary }>("/api/tasks/boards", { body: JSON.stringify({ name }), method: "POST" });
      setCreating(false);
      setCreateOpen(false);
      setName("");
      navigate(`/tasks/boards/${result.board.id}`);
    } catch (createError) {
      setCreateError(createError instanceof Error ? createError.message : "Could not create the board.");
      setCreating(false);
    }
  }

  async function remove(board: BoardSummary) {
    try {
      await api(`/api/tasks/boards/${board.id}`, { method: "DELETE" });
      setBoards((current) => (current ?? []).filter((entry) => entry.id !== board.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the board.");
    }
  }

  return (
    <AppPageFrame
      action={(
        <Button className="h-10 bg-[#291b32] px-4 hover:bg-[#473252]" onClick={() => setCreateOpen(true)}>
          <FiPlus className="size-4" /> Create board
        </Button>
      )}
      description="Kanban boards for your team's work."
      title="Boards"
    >
      {error && <p className="mb-3 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">{error}</p>}
      <Dialog
        onOpenChange={(open) => {
          setCreateOpen(open);
          if (open) setCreateError("");
        }}
        open={createOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create board</DialogTitle>
            <DialogDescription>Name your board — you can rename it later.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <Input
              autoFocus
              className="h-10 border-[#e9e6ed] bg-white"
              onChange={(event) => setName(event.target.value)}
              placeholder="New board name…"
              value={name}
            />
            {createError && <p className="mt-3 text-xs text-[#b05f5f]">{createError}</p>}
            <DialogFooter>
              <Button onClick={() => setCreateOpen(false)} type="button" variant="outline">Cancel</Button>
              <Button className="bg-[#291b32] hover:bg-[#473252]" disabled={creating || !name.trim()} type="submit">
                <FiPlus className="size-4" /> {creating ? "Creating…" : "Create board"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {boards === null && <p className="text-xs text-[#928995]">Loading boards…</p>}
        {boards !== null && boards.length === 0 && <p className="text-xs text-[#928995]">No boards yet. Create your first one above.</p>}
        {boards?.map((board) => (
          <div
            className="group cursor-pointer rounded-lg border border-[#eeeaf1] bg-white p-5 transition hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-22px_rgba(44,25,58,0.3)]"
            key={board.id}
            onClick={() => navigate(`/tasks/boards/${board.id}`)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter") navigate(`/tasks/boards/${board.id}`);
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="grid size-9 place-items-center rounded-md text-white" style={{ backgroundColor: board.color }}>
                <FiGrid className="size-4" />
              </span>
              <span className="rounded-full bg-[#f3eef7] px-2 py-0.5 text-[10px] font-medium text-[#5c3f6e]">
                {board.role === "owner" ? "Owner" : "Shared"}
              </span>
            </div>
            <p className="truncate text-sm font-semibold">{board.name}</p>
            <p className="mt-1 text-[11px] text-[#928995]">{board._count.cards} tasks · updated {formatDate(board.updatedAt)}</p>
            <div className="mt-3 flex items-center gap-1">
              {(board.role === "owner" || board.sharedAll || board._count.shares > 0) && (
                <Button
                  className="h-7 gap-1 px-2 text-[11px] text-[#716b76]"
                  onClick={(event) => {
                    event.stopPropagation();
                    if (board.role === "owner") setShareBoard(board);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  <FiShare2 className="size-3" />
                  {board.publicSlug ? "Public link" : board.sharedAll ? "All teammates" : board._count.shares > 0 ? `${board._count.shares} shared` : "Private"}
                </Button>
              )}
              {board.role === "owner" && (
                <Button
                  className="ml-auto h-7 w-7 p-0 text-[#a49ba9] opacity-0 hover:bg-red-50 hover:text-red-700 group-hover:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    void remove(board);
                  }}
                  size="sm"
                  variant="ghost"
                >
                  <FiTrash2 className="size-3.5" />
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
      {shareBoard && <BoardShareDialog board={shareBoard} onOpenChange={(open) => { if (!open) setShareBoard(null); }} open />}
    </AppPageFrame>
  );
}

/* -------------------------------- Board page ------------------------------- */

function CardChip({ card, assignees }: { card: Card; assignees: Assignee[] }) {
  const assignee = assignees.find((entry) => entry.id === card.assigneeId);
  return (
    <>
      <div className="flex items-center gap-2 text-[10px] text-[#968d9a]">
        {card.dueDate && (
          <span className="inline-flex items-center gap-1"><FiCalendar className="size-3" /> {formatDate(card.dueDate)}</span>
        )}
        {card.subtasks.length > 0 && (
          <span className="inline-flex items-center gap-1"><FiCheckSquare className="size-3" /> {card.subtasks.filter((subtask) => subtask.title).length}</span>
        )}
        {assignee && (
          <span className="ml-auto grid size-5 shrink-0 place-items-center rounded-full bg-[#e8dced] text-[9px] font-semibold text-[#513d5c]">
            {initials(assignee.name, assignee.email)}
          </span>
        )}
      </div>
    </>
  );
}

export function BoardPage() {
  const { boardId } = useParams<{ boardId: string }>();
  const navigate = useNavigate();
  const [board, setBoard] = useState<BoardDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [newCardTitles, setNewCardTitles] = useState<Record<string, string>>({});
  const [newColumnName, setNewColumnName] = useState("");
  const [editingCard, setEditingCard] = useState<Card | null>(null);
  const [dragCardId, setDragCardId] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [shareOpen, setShareOpen] = useState(false);

  const loadBoard = useCallback(() => {
    if (!boardId) return;
    api<{ board: BoardDetail }>(`/api/tasks/boards/${boardId}`)
      .then((result) => {
        setBoard(result.board);
        setStatus("ready");
      })
      .catch(() => setStatus("missing"));
  }, [boardId]);

  useEffect(() => { loadBoard(); }, [loadBoard]);

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center text-xs text-[#928995]">Opening board…</div>;
  }
  if (status === "missing" || !board) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm text-[#847b89]">Board not found, or not shared with you.</p>
        <Link className="text-xs font-medium text-[#755984]" to="/tasks">Back to boards</Link>
      </div>
    );
  }

  const isOwner = board.role === "owner";

  async function addCard(columnId: string) {
    const title = (newCardTitles[columnId] ?? "").trim();
    if (!title || !board) return;
    try {
      await api(`/api/tasks/boards/${board.id}/cards`, {
        body: JSON.stringify({ columnId, title }),
        method: "POST",
      });
      setNewCardTitles((current) => ({ ...current, [columnId]: "" }));
      loadBoard();
    } catch (cardError) {
      setError(cardError instanceof Error ? cardError.message : "Could not add the task.");
    }
  }

  async function addColumn() {
    if (!newColumnName.trim() || !board) return;
    try {
      await api(`/api/tasks/boards/${board.id}/columns`, { body: JSON.stringify({ name: newColumnName }), method: "POST" });
      setNewColumnName("");
      loadBoard();
    } catch (columnError) {
      setError(columnError instanceof Error ? columnError.message : "Could not add the column.");
    }
  }

  async function moveCard(card: Card, columnId: string) {
    if (!board || card.columnId === columnId) return;
    setBoard({
      ...board,
      cards: board.cards.map((entry) => (entry.id === card.id ? { ...entry, columnId } : entry)),
    });
    try {
      await api(`/api/tasks/cards/${card.id}`, { body: JSON.stringify({ columnId }), method: "PATCH" });
    } catch {
      loadBoard();
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[56px] shrink-0 items-center justify-between border-b border-[#eeeaf1] bg-white px-5">
        <div className="flex min-w-0 items-center gap-3">
          <Link className="flex items-center gap-1.5 text-[13px] font-medium text-[#716b76] transition hover:text-[#3e3543]" to="/tasks">
            <FiArrowLeft className="size-4" /> <span className="hidden sm:inline">Boards</span>
          </Link>
          <span className="truncate text-sm font-semibold">{board.name}</span>
          {!isOwner && <span className="rounded-full bg-[#f3eef7] px-2 py-0.5 text-[10px] font-medium text-[#5c3f6e]">Shared with you</span>}
        </div>
        <div className="flex items-center gap-2">
          {error && <span className="text-xs text-[#b05f5f]">{error}</span>}
          {isOwner && (
            <>
              <Button className="h-8 border-[#eeeaf1] bg-white px-2.5 text-xs" onClick={() => setShareOpen(true)} size="sm" variant="outline">
                <FiShare2 className="size-3.5" /> Share
              </Button>
              <Button
                className="h-8 border-[#eeeaf1] bg-white px-2.5 text-xs text-[#b05f5f] hover:bg-red-50"
                onClick={async () => {
                  try {
                    await api(`/api/tasks/boards/${board.id}`, { method: "DELETE" });
                    navigate("/tasks");
                  } catch (deleteError) {
                    setError(deleteError instanceof Error ? deleteError.message : "Could not delete the board.");
                  }
                }}
                size="sm"
                variant="outline"
              >
                <FiTrash2 className="size-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-x-auto overflow-y-hidden p-5">
        <div className="flex h-full items-start gap-4">
          {board.columns.map((column) => {
            const cards = board.cards.filter((card) => card.columnId === column.id);
            return (
              <div
                className={cn(
                  "flex max-h-full w-[280px] shrink-0 flex-col rounded-lg border border-[#eeeaf1] bg-[#f4f2f6]",
                  dragOverColumn === column.id && dragCardId && "border-[#b59ac7] bg-[#f3eef7]",
                )}
                key={column.id}
                onDragLeave={() => setDragOverColumn((current) => (current === column.id ? null : current))}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragOverColumn(column.id);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  setDragOverColumn(null);
                  const card = board.cards.find((entry) => entry.id === dragCardId);
                  if (card) void moveCard(card, column.id);
                  setDragCardId(null);
                }}
              >
                <div className="flex items-center justify-between px-3 pb-1 pt-3">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#716b76]">{column.name}</span>
                  <span className="text-[10px] text-[#a49ba9]">{cards.length}</span>
                </div>
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                  {cards.map((card) => (
                    <div
                      className="cursor-grab rounded-md border border-[#eeeaf1] bg-white px-3 py-2.5 shadow-sm transition hover:border-[#ddd3e4]"
                      draggable
                      key={card.id}
                      onClick={() => setEditingCard(card)}
                      onDragEnd={() => setDragCardId(null)}
                      onDragStart={() => setDragCardId(card.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") setEditingCard(card);
                      }}
                    >
                      <p className="text-xs font-medium">{card.title}</p>
                      <div className="mt-1.5"><CardChip assignees={board.assignees} card={card} /></div>
                    </div>
                  ))}
                </div>
                <form
                  className="border-t border-[#e9e6ed] p-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addCard(column.id);
                  }}
                >
                  <Input
                    className="h-8 border-[#e9e6ed] bg-white text-xs"
                    onChange={(event) => setNewCardTitles((current) => ({ ...current, [column.id]: event.target.value }))}
                    placeholder="Add a task…"
                    value={newCardTitles[column.id] ?? ""}
                  />
                </form>
              </div>
            );
          })}

          {isOwner && (
            <form
              className="w-[240px] shrink-0 rounded-lg border border-dashed border-[#ddd3e4] p-3"
              onSubmit={(event) => {
                event.preventDefault();
                void addColumn();
              }}
            >
              <Input
                className="h-8 border-[#e9e6ed] bg-white text-xs"
                onChange={(event) => setNewColumnName(event.target.value)}
                placeholder="New list name…"
                value={newColumnName}
              />
              <Button className="mt-2 h-7 w-full bg-white text-[11px] text-[#716b76] hover:bg-[#f7f5f8]" size="sm" type="submit" variant="outline">
                <FiPlus className="size-3" /> Add list
              </Button>
            </form>
          )}
        </div>
      </div>

      {editingCard && (
        <CardDialog
          board={board}
          card={editingCard}
          onOpenChange={(open) => {
            if (!open) {
              setEditingCard(null);
              loadBoard();
            }
          }}
        />
      )}
      {isOwner && (
        <BoardShareDialog
          board={{
            id: board.id,
            name: board.name,
            color: board.color,
            createdById: board.createdById,
            sharedAll: board.sharedAll,
            publicSlug: board.publicSlug,
            role: board.role,
            _count: { shares: 0, cards: board.cards.length },
            updatedAt: new Date().toISOString(),
          }}
          onOpenChange={setShareOpen}
          open={shareOpen}
        />
      )}
    </div>
  );
}

function CardDialog({
  board,
  card,
  onOpenChange,
}: {
  board: BoardDetail;
  card: Card;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState(card.title);
  const [description, setDescription] = useState(card.description);
  const [assigneeId, setAssigneeId] = useState(card.assigneeId ?? "none");
  const [dueDate, setDueDate] = useState(card.dueDate ? card.dueDate.slice(0, 10) : "");
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      await api(`/api/tasks/cards/${card.id}`, {
        body: JSON.stringify({
          title,
          description,
          assigneeId: assigneeId === "none" ? null : assigneeId,
          dueDate: dueDate ? new Date(`${dueDate}T12:00:00`).toISOString() : null,
        }),
        method: "PATCH",
      });
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  }

  async function addSubtask() {
    if (!subtaskTitle.trim()) return;
    await api(`/api/tasks/boards/${card.boardId}/cards`, {
      body: JSON.stringify({ columnId: card.columnId, title: subtaskTitle, parentId: card.id }),
      method: "POST",
    });
    setSubtaskTitle("");
    onOpenChange(false);
  }

  async function removeSubtask(subtaskId: string) {
    await api(`/api/tasks/cards/${subtaskId}`, { method: "DELETE" });
    onOpenChange(false);
  }

  async function remove() {
    await api(`/api/tasks/cards/${card.id}`, { method: "DELETE" });
    onOpenChange(false);
  }

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Task</DialogTitle>
          <DialogDescription>Details, assignment, and subtasks.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="space-y-2 text-xs font-medium">
            Title
            <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setTitle(event.target.value)} placeholder="Task title" value={title} />
          </label>
          <label className="space-y-2 text-xs font-medium">
            Description
            <Textarea className="min-h-[70px] border-[#e9e6ed] text-xs" onChange={(event) => setDescription(event.target.value)} placeholder="Add more details…" value={description} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-2 text-xs font-medium">
              Assignee
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger className="h-9 w-full border-[#e9e6ed] text-xs font-normal"><SelectValue placeholder="Unassigned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {board.assignees.map((assignee) => (
                    <SelectItem key={assignee.id} value={assignee.id}>{assignee.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-2 text-xs font-medium">
              Due date
              <DateTimePicker className="h-9 border-[#e9e6ed] bg-white" onChange={setDueDate} value={dueDate} />
            </label>
          </div>
          <div className="space-y-2 border-t border-[#eeeaf1] pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a49ba9]">Subtasks</p>
            {card.subtasks.map((subtask) => (
              <div className="flex items-center gap-2 rounded border border-[#f0edf2] bg-[#faf9fb] px-2.5 py-1.5" key={subtask.id}>
                <span className="min-w-0 flex-1 truncate text-xs">{subtask.title}</span>
                <button
                  aria-label="Remove subtask"
                  className="grid size-5 place-items-center rounded text-[#a49ba9] hover:bg-[#f7f5f8] hover:text-[#b05f5f]"
                  onClick={() => void removeSubtask(subtask.id)}
                  type="button"
                >
                  <FiTrash2 className="size-3" />
                </button>
              </div>
            ))}
            <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void addSubtask(); }}>
              <Input
                className="h-8 flex-1 border-[#e9e6ed] text-xs"
                onChange={(event) => setSubtaskTitle(event.target.value)}
                placeholder="Add a subtask…"
                value={subtaskTitle}
              />
              <Button className="h-8 px-3 text-xs" size="sm" type="submit" variant="outline">Add</Button>
            </form>
          </div>
        </div>
        <DialogFooter className="sm:justify-between">
          <Button className="text-[#b05f5f] hover:bg-red-50" onClick={() => void remove()} size="sm" type="button" variant="ghost">
            <FiTrash2 className="size-3.5" /> Delete
          </Button>
          <div className="flex gap-2">
            <Button onClick={() => onOpenChange(false)} type="button" variant="outline">Cancel</Button>
            <Button className="bg-[#291b32] hover:bg-[#473252]" disabled={saving} onClick={() => void save()} type="button">
              {saving ? "Saving…" : "Save task"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- Planner --------------------------------- */

export function TasksPlannerPage() {
  const [cards, setCards] = useState<PlannerCard[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<{ cards: PlannerCard[] }>("/api/tasks/planner")
      .then((result) => setCards(result.cards))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load the planner."));
  }, []);

  const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const today = startOfDay(new Date());
  const nextWeek = new Date(today.getTime() + 7 * 86_400_000);
  const weekAfter = new Date(today.getTime() + 14 * 86_400_000);

  const buckets: { label: string; cards: PlannerCard[] }[] = [
    { label: "Overdue", cards: [] },
    { label: "Today", cards: [] },
    { label: "This week", cards: [] },
    { label: "Next week", cards: [] },
    { label: "Later", cards: [] },
  ];

  for (const card of cards ?? []) {
    const due = startOfDay(new Date(card.dueDate));
    if (due < today) buckets[0]!.cards.push(card);
    else if (due.getTime() === today.getTime()) buckets[1]!.cards.push(card);
    else if (due < nextWeek) buckets[2]!.cards.push(card);
    else if (due < weekAfter) buckets[3]!.cards.push(card);
    else buckets[4]!.cards.push(card);
  }

  return (
    <AppPageFrame description="Everything with a due date, at a glance." title="Planner">
      {error && <p className="mb-3 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">{error}</p>}
      <div className="grid gap-4 lg:grid-cols-5">
        {buckets.map((bucket) => (
          <div className="rounded-lg border border-[#eeeaf1] bg-white p-3" key={bucket.label}>
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a49ba9]">
              {bucket.label} {bucket.cards.length > 0 && <span className="ml-1 text-[#716b76]">{bucket.cards.length}</span>}
            </p>
            <div className="space-y-2">
              {bucket.cards.map((card) => (
                <Link
                  className="block rounded-md border border-[#eeeaf1] px-2.5 py-2 transition hover:border-[#ddd3e4]"
                  key={card.id}
                  to={`/tasks/boards/${card.boardId}`}
                >
                  <p className="truncate text-xs font-medium">{card.title}</p>
                  <p className="mt-0.5 truncate text-[10px] text-[#968d9a]">{card.boardName} · {formatDate(card.dueDate)}</p>
                </Link>
              ))}
              {bucket.cards.length === 0 && <p className="text-[10px] text-[#cfc7d6]">Nothing here.</p>}
            </div>
          </div>
        ))}
      </div>
      {cards !== null && cards.length === 0 && (
        <p className="mt-6 text-xs text-[#928995]">No scheduled tasks yet. Add due dates to tasks on your boards.</p>
      )}
    </AppPageFrame>
  );
}

/* ------------------------------ Public board ------------------------------- */

export function PublicBoardPage() {
  const { slug } = useParams<{ slug: string }>();
  const [board, setBoard] = useState<{ name: string; color: string; columns: BoardColumn[]; cards: Card[]; assignees: Assignee[] } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    api<{ board: { name: string; color: string; columns: BoardColumn[]; cards: Card[]; assignees: Assignee[] } }>(`/api/public/tasks/boards/${slug}`)
      .then((result) => {
        setBoard(result.board);
        setStatus("ready");
      })
      .catch(() => setStatus("missing"));
  }, [slug]);

  if (status === "loading") {
    return <main className="grid min-h-screen place-items-center bg-[#f8f7fa] text-xs text-[#928995]">Opening board…</main>;
  }
  if (status === "missing" || !board) {
    return <main className="grid min-h-screen place-items-center bg-[#f8f7fa] text-sm text-[#847b89]">This board link is not available.</main>;
  }

  return (
    <main className="flex h-screen flex-col bg-[#f8f7fa]">
      <header className="flex h-[56px] shrink-0 items-center justify-between border-b border-[#eeeaf1] bg-white px-5">
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-md text-white" style={{ backgroundColor: board.color }}>
            <FiGrid className="size-4" />
          </span>
          <span className="text-sm font-semibold">{board.name}</span>
        </div>
        <span className="rounded-full bg-[#f3eef7] px-2.5 py-1 text-[10px] font-medium text-[#5c3f6e]">Read-only</span>
      </header>
      <div className="min-h-0 flex-1 overflow-x-auto p-5">
        <div className="flex items-start gap-4">
          {board.columns.map((column) => (
            <div className="w-[280px] shrink-0 rounded-lg border border-[#eeeaf1] bg-[#f4f2f6]" key={column.id}>
              <div className="flex items-center justify-between px-3 pb-1 pt-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#716b76]">{column.name}</span>
                <span className="text-[10px] text-[#a49ba9]">{board.cards.filter((card) => card.columnId === column.id).length}</span>
              </div>
              <div className="space-y-2 px-2 pb-3">
                {board.cards.filter((card) => card.columnId === column.id).map((card) => (
                  <div className="rounded-md border border-[#eeeaf1] bg-white px-3 py-2.5 shadow-sm" key={card.id}>
                    <p className="text-xs font-medium">{card.title}</p>
                    <div className="mt-1.5"><CardChip assignees={board.assignees} card={card} /></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
