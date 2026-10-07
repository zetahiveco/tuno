import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  FiBriefcase,
  FiCheckCircle,
  FiChevronDown,
  FiFileText,
  FiGrid,
  FiLayers,
  FiList,
  FiPlus,
  FiTrash2,
  FiUsers,
} from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-alert";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { AppPageFrame, AppShell, type AppNavPage } from "@/general/frontend/app-shell";
import { api } from "@/lib/api-client";
import { cn } from "cn";

/* ---------------------------------- Types --------------------------------- */

type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
type FieldType = "TEXT" | "NUMBER" | "DATE" | "SELECT" | "CHECKBOX";
type FieldEntity = "ACCOUNT" | "CONTACT" | "TASK";

type CustomField = {
  id: string;
  name: string;
  type: FieldType;
  options: string;
  appliesTo: FieldEntity;
};

type PipelineStage = {
  id: string;
  name: string;
  color: string;
  position: number;
  accountCount: number;
};

type Account = {
  id: string;
  name: string;
  email: string;
  phone: string;
  source: string;
  value: number;
  stageId: string;
  stage: { id: string; name: string; color: string };
  customValues: Record<string, string>;
};

type Contact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  accountId: string;
  account: { id: string; name: string } | null;
  customValues: Record<string, string>;
};

type CrmTask = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  accountId: string | null;
  contactId: string | null;
  customValues: Record<string, string>;
};

type CrmNote = {
  id: string;
  body: string;
  accountId: string | null;
  contactId: string | null;
  createdAt: string;
  updatedAt: string;
};

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  TODO: "To do",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

function parseOptions(options: string): string[] {
  try {
    const parsed: unknown = JSON.parse(options);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

/* -------------------------------- Custom values --------------------------- */

function CustomValueInputs({
  fields,
  values,
  onChange,
}: {
  fields: CustomField[];
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
}) {
  if (fields.length === 0) return null;
  return (
    <div className="space-y-3 border-t border-[#eeeaf1] pt-4">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#a49ba9]">Custom fields</p>
      {fields.map((field) => {
        const value = values[field.id] ?? "";
        return (
          <label className="block space-y-2 text-xs font-medium" key={field.id}>
            {field.name}
            {field.type === "SELECT" ? (
              <Select value={value} onValueChange={(next) => onChange(field.id, next)}>
                <SelectTrigger className="h-9 w-full border-[#e9e6ed] text-xs font-normal">
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {parseOptions(field.options).map((option) => (
                    <SelectItem key={option} value={option}>{option}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : field.type === "CHECKBOX" ? (
              <Select value={value || "false"} onValueChange={(next) => onChange(field.id, next)}>
                <SelectTrigger className="h-9 w-full border-[#e9e6ed] text-xs font-normal">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Yes</SelectItem>
                  <SelectItem value="false">No</SelectItem>
                </SelectContent>
              </Select>
            ) : field.type === "DATE" ? (
              <DateTimePicker className="h-9 border-[#e9e6ed] bg-white" onChange={(next) => onChange(field.id, next)} value={value} />
            ) : (
              <Input
                className="h-9 border-[#e9e6ed]"
                onChange={(event) => onChange(field.id, event.target.value)}
                placeholder={field.type === "NUMBER" ? "0" : `Enter ${field.name.toLowerCase()}`}
                type={field.type === "NUMBER" ? "number" : "text"}
                value={value}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

async function saveCustomValues(entityType: FieldEntity, entityId: string, values: Record<string, string>) {
  const payload: Record<string, string> = {};
  for (const [fieldId, value] of Object.entries(values)) {
    payload[fieldId] = value;
  }
  await api("/api/crm/values", {
    body: JSON.stringify({ entityType, entityId, values: payload }),
    method: "PUT",
  });
}

function renderCustomValue(field: CustomField, value: string | undefined): string {
  if (!value) return "—";
  if (field.type === "DATE") return formatDate(value);
  if (field.type === "CHECKBOX") return value === "true" ? "Yes" : "No";
  return value;
}

/* ---------------------------------- Layout --------------------------------- */

const NAV: AppNavPage[] = [
  { end: true, icon: FiBriefcase, label: "Accounts", to: "/crm" },
  { icon: FiUsers, label: "Contacts", to: "/crm/contacts" },
  { icon: FiCheckCircle, label: "Tasks", to: "/crm/tasks" },
  { icon: FiFileText, label: "Notes", to: "/crm/notes" },
  { icon: FiLayers, label: "Custom fields", to: "/crm/fields" },
];

export function CrmLayout() {
  return <AppShell accent="bg-[#eaf6ef] text-[#4e8a68]" appName="CRM" icon={FiBriefcase} pages={NAV} />;
}

/* ------------------------------ Shared fields hook -------------------------- */

function useCrmFields() {
  const [fields, setFields] = useState<CustomField[]>([]);
  useEffect(() => {
    api<{ fields: CustomField[] }>("/api/crm/fields")
      .then((result) => setFields(result.fields))
      .catch(() => setFields([]));
  }, []);
  return {
    accountFields: useMemo(() => fields.filter((field) => field.appliesTo === "ACCOUNT"), [fields]),
    contactFields: useMemo(() => fields.filter((field) => field.appliesTo === "CONTACT"), [fields]),
    taskFields: useMemo(() => fields.filter((field) => field.appliesTo === "TASK"), [fields]),
  };
}

/* --------------------------------- Accounts --------------------------------- */

function AccountDialog({
  fieldList,
  stages,
  account,
  onOpenChange,
  onSaved,
  open,
}: {
  fieldList: CustomField[];
  stages: PipelineStage[];
  account: Account | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  open: boolean;
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", source: "", stageId: "", value: "0" });
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setValues(account?.customValues ?? {});
    setForm({
      name: account?.name ?? "",
      email: account?.email ?? "",
      phone: account?.phone ?? "",
      source: account?.source ?? "",
      stageId: account?.stageId ?? stages[0]?.id ?? "",
      value: String(account?.value ?? 0),
    });
  }, [account, open, stages]);

  async function submit() {
    if (!form.name.trim()) {
      setError("An account name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        source: form.source,
        stageId: form.stageId,
        value: Number(form.value) || 0,
      };
      const result = account
        ? await api<{ account: Account }>(`/api/crm/accounts/${account.id}`, { body: JSON.stringify(body), method: "PATCH" })
        : await api<{ account: Account }>("/api/crm/accounts", { body: JSON.stringify(body), method: "POST" });
      await saveCustomValues("ACCOUNT", result.account.id, values);
      onOpenChange(false);
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the account.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{account ? "Edit account" : "New account"}</DialogTitle>
          <DialogDescription>A company you sell to, tracked through your pipeline stages.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="space-y-2 text-xs font-medium">
            Name
            <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Acme Corp" value={form.name} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-2 text-xs font-medium">
              Source
              <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="Referral" value={form.source} />
            </label>
            <label className="space-y-2 text-xs font-medium">
              Email
              <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="hello@company.com" type="email" value={form.email} />
            </label>
            <label className="space-y-2 text-xs font-medium">
              Phone
              <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+1 555 000 1234" value={form.phone} />
            </label>
            <label className="space-y-2 text-xs font-medium">
              Stage
              <Select value={form.stageId} onValueChange={(stageId) => setForm({ ...form, stageId })}>
                <SelectTrigger className="h-9 w-full border-[#e9e6ed] text-xs font-normal"><SelectValue placeholder="Pick a stage" /></SelectTrigger>
                <SelectContent>
                  {stages.map((stage) => (
                    <SelectItem key={stage.id} value={stage.id}>{stage.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="space-y-2 text-xs font-medium">
              Value
              <Input className="h-9 border-[#e9e6ed]" min="0" onChange={(event) => setForm({ ...form, value: event.target.value })} step="0.01" type="number" value={form.value} />
            </label>
          </div>
          <CustomValueInputs fields={fieldList} onChange={(fieldId, value) => setValues({ ...values, [fieldId]: value })} values={values} />
          {error && <p className="text-xs text-[#b05f5f]">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">Cancel</Button>
          <Button className="bg-[#291b32] hover:bg-[#473252]" disabled={saving} onClick={() => void submit()} type="button">
            {saving ? "Saving…" : "Save account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------- Kanban board -------------------------------- */

function AccountKanbanCard({ account, onEdit }: { account: Account; onEdit: (account: Account) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: account.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 40 }
    : undefined;
  return (
    <div
      className={cn(
        "touch-none rounded-md border border-[#eeeaf1] bg-white px-3 py-2.5 shadow-sm transition hover:border-[#ddd3e4]",
        isDragging && "opacity-40",
      )}
      {...listeners}
      {...attributes}
      ref={setNodeRef}
      style={style}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 text-xs font-medium">{account.name}</p>
        <span
          className="mt-1 size-2 shrink-0 rounded-full"
          style={{ backgroundColor: account.stage.color }}
          title={account.stage.name}
        />
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[10px] text-[#968d9a]">
          {account.value ? `$${account.value.toLocaleString()}` : "No value"}
          {account.email ? ` · ${account.email}` : ""}
        </p>
        <Button
          className="h-6 shrink-0 px-1.5 text-[10px] opacity-0 transition group-hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation();
            onEdit(account);
          }}
          onMouseDown={(event) => event.stopPropagation()}
          onPointerDown={(event) => event.stopPropagation()}
          size="sm"
          variant="ghost"
        >
          Edit
        </Button>
      </div>
    </div>
  );
}

function StageColumn({
  accounts,
  canEdit,
  onEditAccount,
  onRemoveStage,
  stage,
}: {
  accounts: Account[];
  canEdit: boolean;
  onEditAccount: (account: Account) => void;
  onRemoveStage: (stage: PipelineStage) => void;
  stage: PipelineStage;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div
      className={cn(
        "flex max-h-full w-[280px] shrink-0 flex-col rounded-lg border border-[#eeeaf1] bg-[#f4f2f6]",
        isOver && "border-[#b59ac7] bg-[#f3eef7]",
      )}
      ref={setNodeRef}
    >
      <div className="flex items-center justify-between gap-2 px-3 pb-1 pt-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: stage.color }} />
          <span className="truncate text-[11px] font-semibold uppercase tracking-[0.1em] text-[#716b76]">{stage.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-[#a49ba9]">{accounts.length}</span>
          {canEdit && (
            <button
              aria-label={`Delete stage ${stage.name}`}
              className={cn(
                "grid size-5 place-items-center rounded text-[#a49ba9] transition hover:bg-red-50 hover:text-[#b05f5f]",
                accounts.length > 0 && "hidden",
              )}
              onClick={() => onRemoveStage(stage)}
              type="button"
            >
              <FiTrash2 className="size-3" />
            </button>
          )}
        </div>
      </div>
      <div className="min-h-[80px] flex-1 space-y-2 overflow-y-auto px-2 pb-2 pt-1">
        {accounts.map((account) => (
          <AccountKanbanCard account={account} key={account.id} onEdit={onEditAccount} />
        ))}
        {accounts.length === 0 && <p className="px-1 py-2 text-[10px] text-[#cfc7d6]">Drop accounts here.</p>}
      </div>
    </div>
  );
}

function AddStageCard({ onAdded }: { onAdded: () => void }) {
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  async function submit() {
    if (!name.trim() || adding) return;
    setAdding(true);
    try {
      await api("/api/crm/stages", { body: JSON.stringify({ name }), method: "POST" });
      setName("");
      onAdded();
    } finally {
      setAdding(false);
    }
  }

  return (
    <form
      className="w-[240px] shrink-0 rounded-lg border border-dashed border-[#ddd3e4] p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Input
        className="h-8 border-[#e9e6ed] bg-white text-xs"
        onChange={(event) => setName(event.target.value)}
        placeholder="New stage name…"
        value={name}
      />
      <Button className="mt-2 h-7 w-full bg-white text-[11px] text-[#716b76] hover:bg-[#f7f5f8]" disabled={adding || !name.trim()} size="sm" type="submit" variant="outline">
        <FiPlus className="size-3" /> Add stage
      </Button>
    </form>
  );
}

function AccountsKanban({
  accounts,
  onEditAccount,
  onMove,
  onStagesChanged,
  stages,
}: {
  accounts: Account[];
  onEditAccount: (account: Account) => void;
  onMove: (accountId: string, stageId: string) => void;
  onStagesChanged: () => void;
  stages: PipelineStage[];
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const { confirm, element: confirmElement } = useConfirm();

  const activeAccount = accounts.find((account) => account.id === activeId) ?? null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over) return;
    const accountId = String(active.id);
    const stageId = String(over.id);
    const account = accounts.find((entry) => entry.id === accountId);
    if (!account || account.stageId === stageId) return;
    onMove(accountId, stageId);
  }

  return (
    <DndContext
      collisionDetection={closestCorners}
      onDragEnd={handleDragEnd}
      onDragStart={handleDragStart}
      sensors={sensors}
    >
      {confirmElement}
      <div className="flex items-start gap-4">
        {stages.map((stage) => (
          <StageColumn
            accounts={accounts.filter((account) => account.stageId === stage.id)}
            canEdit
            key={stage.id}
            onEditAccount={onEditAccount}
            onRemoveStage={async (removed) => {
              const confirmed = await confirm({
                title: `Delete stage "${removed.name}"?`,
                description: "Accounts in this stage will move to Unsorted. This action cannot be undone.",
              });
              if (!confirmed) return;
              try {
                await api(`/api/crm/stages/${removed.id}`, { method: "DELETE" });
                onStagesChanged();
              } catch {
                onStagesChanged();
              }
            }}
            stage={stage}
          />
        ))}
        <AddStageCard onAdded={onStagesChanged} />
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)" }}>
        {activeAccount && (
          <div className="w-[256px] rotate-2 rounded-md border border-[#ddd3e4] bg-white px-3 py-2.5 shadow-lg">
            <p className="text-xs font-medium">{activeAccount.name}</p>
            <p className="mt-0.5 text-[10px] text-[#968d9a]">
              {activeAccount.value ? `$${activeAccount.value.toLocaleString()}` : "No value"}
            </p>
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/* --------------------------------- Accounts page ----------------------------- */

export function CrmAccountsPage() {
  const { accountFields } = useCrmFields();
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [view, setView] = useState<"board" | "table">("board");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const { confirm, element: confirmElement } = useConfirm();

  const loadAccounts = useCallback(() => {
    api<{ accounts: Account[] }>("/api/crm/accounts")
      .then((result) => setAccounts(result.accounts))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load accounts."));
  }, []);

  const loadStages = useCallback(() => {
    api<{ stages: PipelineStage[] }>("/api/crm/stages")
      .then((result) => setStages(result.stages))
      .catch(() => setStages([]));
  }, []);

  useEffect(() => {
    loadAccounts();
    loadStages();
  }, [loadAccounts, loadStages]);

  async function moveAccount(accountId: string, stageId: string) {
    const stage = stages.find((entry) => entry.id === stageId);
    setAccounts((current) =>
      (current ?? []).map((entry) =>
        entry.id === accountId ? { ...entry, stageId, stage: { id: stageId, name: stage?.name ?? entry.stage.name, color: stage?.color ?? entry.stage.color } } : entry,
      ),
    );
    try {
      await api(`/api/crm/accounts/${accountId}`, { body: JSON.stringify({ stageId }), method: "PATCH" });
      loadStages();
    } catch {
      loadAccounts();
    }
  }

  async function remove(account: Account) {
    const confirmed = await confirm({
      title: `Delete "${account.name}"?`,
      description: "This permanently removes the account and its notes and tasks. This action cannot be undone.",
    });
    if (!confirmed) return;
    try {
      await api(`/api/crm/accounts/${account.id}`, { method: "DELETE" });
      setAccounts((current) => (current ?? []).filter((entry) => entry.id !== account.id));
      loadStages();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the account.");
    }
  }

  return (
    <AppPageFrame
      action={(
        <div className="flex items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-[#eeeaf1] bg-white text-xs">
            <button
              className={cn("flex items-center gap-1.5 px-3 py-1.5 transition", view === "board" ? "bg-[#f3eef7] font-medium text-[#5c3f6e]" : "text-[#716b76] hover:bg-[#f7f5f8]")}
              onClick={() => setView("board")}
              type="button"
            >
              <FiGrid className="size-3.5" /> Board
            </button>
            <button
              className={cn("flex items-center gap-1.5 px-3 py-1.5 transition", view === "table" ? "bg-[#f3eef7] font-medium text-[#5c3f6e]" : "text-[#716b76] hover:bg-[#f7f5f8]")}
              onClick={() => setView("table")}
              type="button"
            >
              <FiList className="size-3.5" /> Table
            </button>
          </div>
          <Button className="bg-[#291b32] hover:bg-[#473252]" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <FiPlus className="size-4" /> New account
          </Button>
        </div>
      )}
      description="Companies in your pipeline, from first touch to close."
      title="Accounts"
    >
      {confirmElement}
      {error && <p className="mb-3 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">{error}</p>}
      {view === "board" && (
        <div className="min-h-0 flex-1 overflow-x-auto pb-4">
          <AccountsKanban
            accounts={accounts ?? []}
            onEditAccount={(account) => { setEditing(account); setDialogOpen(true); }}
            onMove={moveAccount}
            onStagesChanged={loadStages}
            stages={stages}
          />
        </div>
      )}
      {view === "table" && (
        <div className="overflow-x-auto rounded-lg border border-[#eeeaf1] bg-white">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[#eeeaf1] text-[10px] uppercase tracking-[0.1em] text-[#a49ba9]">
                <th className="px-4 py-3 font-semibold">Name</th>
                <th className="px-4 py-3 font-semibold">Stage</th>
                <th className="px-4 py-3 font-semibold">Value</th>
                <th className="px-4 py-3 font-semibold">Email</th>
                {accountFields.map((field) => <th className="px-4 py-3 font-semibold" key={field.id}>{field.name}</th>)}
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {accounts === null && <tr><td className="px-4 py-6 text-[#928995]" colSpan={99}>Loading accounts…</td></tr>}
              {accounts !== null && accounts.length === 0 && <tr><td className="px-4 py-6 text-[#928995]" colSpan={99}>No accounts yet.</td></tr>}
              {accounts?.map((account) => (
                <tr className="border-b border-[#f4f2f5] last:border-0 hover:bg-[#faf9fb]" key={account.id}>
                  <td className="px-4 py-3 font-medium">{account.name}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f3eef7] px-2 py-0.5 text-[10px] font-medium text-[#5c3f6e]">
                      <span className="size-1.5 rounded-full" style={{ backgroundColor: account.stage.color }} />
                      {account.stage.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#716b76]">{account.value ? `$${account.value.toLocaleString()}` : "—"}</td>
                  <td className="px-4 py-3 text-[#716b76]">{account.email || "—"}</td>
                  {accountFields.map((field) => <td className="px-4 py-3 text-[#716b76]" key={field.id}>{renderCustomValue(field, account.customValues[field.id])}</td>)}
                  <td className="px-2 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button className="h-7 px-2 text-[11px]" onClick={() => { setEditing(account); setDialogOpen(true); }} size="sm" variant="outline">Edit</Button>
                      <Button className="h-7 w-7 p-0 text-[#a49ba9] hover:bg-red-50 hover:text-red-700" onClick={() => void remove(account)} size="sm" variant="ghost"><FiTrash2 className="size-3.5" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <AccountDialog
        fieldList={accountFields}
        account={editing}
        onOpenChange={setDialogOpen}
        onSaved={() => {
          loadAccounts();
          loadStages();
        }}
        open={dialogOpen}
        stages={stages}
      />
    </AppPageFrame>
  );
}

/* --------------------------------- Contacts -------------------------------- */

function ContactDialog({
  contact,
  fieldList,
  accounts,
  onOpenChange,
  onSaved,
  open,
}: {
  contact: Contact | null;
  fieldList: CustomField[];
  accounts: Account[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  open: boolean;
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", role: "", accountId: "" });
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setValues(contact?.customValues ?? {});
    setForm({
      name: contact?.name ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      role: contact?.role ?? "",
      accountId: contact?.accountId ?? accounts[0]?.id ?? "",
    });
  }, [contact, open, accounts]);

  async function submit() {
    if (!form.name.trim()) {
      setError("A contact name is required.");
      return;
    }
    if (!form.accountId) {
      setError("Every contact must belong to an account.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        role: form.role,
        accountId: form.accountId,
      };
      const result = contact
        ? await api<{ contact: Contact }>(`/api/crm/contacts/${contact.id}`, { body: JSON.stringify(body), method: "PATCH" })
        : await api<{ contact: Contact }>("/api/crm/contacts", { body: JSON.stringify(body), method: "POST" });
      await saveCustomValues("CONTACT", result.contact.id, values);
      onOpenChange(false);
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the contact.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{contact ? "Edit contact" : "New contact"}</DialogTitle>
          <DialogDescription>People who work at the accounts you sell to.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="space-y-2 text-xs font-medium">
            Name
            <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Jane Doe" value={form.name} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-2 text-xs font-medium">
              Email
              <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="jane@company.com" type="email" value={form.email} />
            </label>
            <label className="space-y-2 text-xs font-medium">
              Phone
              <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+1 555 010 2030" value={form.phone} />
            </label>
            <label className="space-y-2 text-xs font-medium">
              Role
              <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setForm({ ...form, role: event.target.value })} placeholder="e.g. Head of Purchasing" value={form.role} />
            </label>
          </div>
          <label className="space-y-2 text-xs font-medium">
            Account
            <Select value={form.accountId} onValueChange={(accountId) => setForm({ ...form, accountId })}>
              <SelectTrigger className="h-9 w-full border-[#e9e6ed] text-xs font-normal">
                <SelectValue placeholder="Pick an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </label>
          <CustomValueInputs fields={fieldList} onChange={(fieldId, value) => setValues({ ...values, [fieldId]: value })} values={values} />
          {error && <p className="text-xs text-[#b05f5f]">{error}</p>}
        </div>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">Cancel</Button>
          <Button className="bg-[#291b32] hover:bg-[#473252]" disabled={saving} onClick={() => void submit()} type="button">
            {saving ? "Saving…" : "Save contact"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CrmContactsPage() {
  const { contactFields } = useCrmFields();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const [error, setError] = useState("");

  const loadContacts = useCallback(() => {
    api<{ contacts: Contact[] }>("/api/crm/contacts")
      .then((result) => setContacts(result.contacts))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load contacts."));
  }, []);

  useEffect(() => {
    loadContacts();
    api<{ accounts: Account[] }>("/api/crm/accounts").then((result) => setAccounts(result.accounts)).catch(() => setAccounts([]));
  }, [loadContacts]);

  async function remove(contact: Contact) {
    try {
      await api(`/api/crm/contacts/${contact.id}`, { method: "DELETE" });
      setContacts((current) => (current ?? []).filter((entry) => entry.id !== contact.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the contact.");
    }
  }

  return (
    <AppPageFrame
      action={(
        <Button className="bg-[#291b32] hover:bg-[#473252]" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <FiPlus className="size-4" /> New contact
        </Button>
      )}
      description="People at the accounts in your pipeline. Every contact belongs to an account."
      title="Contacts"
    >
      {error && <p className="mb-3 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-[#eeeaf1] bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[#eeeaf1] text-[10px] uppercase tracking-[0.1em] text-[#a49ba9]">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Account</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Role</th>
              {contactFields.map((field) => <th className="px-4 py-3 font-semibold" key={field.id}>{field.name}</th>)}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {contacts === null && <tr><td className="px-4 py-6 text-[#928995]" colSpan={99}>Loading contacts…</td></tr>}
            {contacts !== null && contacts.length === 0 && <tr><td className="px-4 py-6 text-[#928995]" colSpan={99}>No contacts yet.</td></tr>}
            {contacts?.map((contact) => (
              <tr className="border-b border-[#f4f2f5] last:border-0 hover:bg-[#faf9fb]" key={contact.id}>
                <td className="px-4 py-3 font-medium">{contact.name}</td>
                <td className="px-4 py-3 text-[#716b76]">{contact.account?.name ?? "—"}</td>
                <td className="px-4 py-3 text-[#716b76]">{contact.email || "—"}</td>
                <td className="px-4 py-3 text-[#716b76]">{contact.role || "—"}</td>
                {contactFields.map((field) => <td className="px-4 py-3 text-[#716b76]" key={field.id}>{renderCustomValue(field, contact.customValues[field.id])}</td>)}
                <td className="px-2 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button className="h-7 px-2 text-[11px]" onClick={() => { setEditing(contact); setDialogOpen(true); }} size="sm" variant="outline">Edit</Button>
                    <Button className="h-7 w-7 p-0 text-[#a49ba9] hover:bg-red-50 hover:text-red-700" onClick={() => void remove(contact)} size="sm" variant="ghost"><FiTrash2 className="size-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {accounts.length === 0 && contacts !== null && contacts.length === 0 && (
        <p className="mt-3 text-xs text-[#928995]">Create an account first — every contact needs one.</p>
      )}
      <ContactDialog contact={editing} fieldList={contactFields} accounts={accounts} onOpenChange={setDialogOpen} onSaved={loadContacts} open={dialogOpen} />
    </AppPageFrame>
  );
}

/* ----------------------------------- Tasks --------------------------------- */

export function CrmTasksPage() {
  const { taskFields } = useCrmFields();
  const [tasks, setTasks] = useState<CrmTask[] | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TaskStatus>("TODO");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [error, setError] = useState("");

  const loadTasks = useCallback(() => {
    api<{ tasks: CrmTask[] }>("/api/crm/tasks")
      .then((result) => setTasks(result.tasks))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load tasks."));
  }, []);

  useEffect(() => {
    loadTasks();
    api<{ accounts: Account[] }>("/api/crm/accounts").then((result) => setAccounts(result.accounts)).catch(() => setAccounts([]));
    api<{ contacts: Contact[] }>("/api/crm/contacts").then((result) => setContacts(result.contacts)).catch(() => setContacts([]));
  }, [loadTasks]);

  async function create() {
    if (!title.trim() || creating) return;
    setCreating(true);
    setCreateError("");
    try {
      await api("/api/crm/tasks", { body: JSON.stringify({ title, status }), method: "POST" });
      setTitle("");
      setStatus("TODO");
      setCreateOpen(false);
      loadTasks();
    } catch (createError) {
      setCreateError(createError instanceof Error ? createError.message : "Could not create the task.");
    } finally {
      setCreating(false);
    }
  }

  async function updateStatus(task: CrmTask, next: TaskStatus) {
    if (next === task.status) return;
    setTasks((current) => (current ?? []).map((entry) => (entry.id === task.id ? { ...entry, status: next } : entry)));
    try {
      await api(`/api/crm/tasks/${task.id}`, { body: JSON.stringify({ status: next }), method: "PATCH" });
    } catch {
      loadTasks();
    }
  }

  async function remove(task: CrmTask) {
    try {
      await api(`/api/crm/tasks/${task.id}`, { method: "DELETE" });
      setTasks((current) => (current ?? []).filter((entry) => entry.id !== task.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the task.");
    }
  }

  return (
    <AppPageFrame
      action={(
        <Button
          className="h-10 bg-[#291b32] px-4 hover:bg-[#473252]"
          onClick={() => {
            setCreateError("");
            setCreateOpen(true);
          }}
        >
          <FiPlus className="size-4" /> Add task
        </Button>
      )}
      description="Follow-ups and to-dos tied to your accounts."
      title="Tasks"
    >
      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add task</DialogTitle>
            <DialogDescription>Follow-ups keep deals and accounts moving.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <div className="space-y-3 py-1">
              <Input
                autoFocus
                className="h-10 border-[#e9e6ed] bg-white"
                onChange={(event) => setTitle(event.target.value)}
                placeholder="e.g. Follow up with Acme about pricing"
                value={title}
              />
              <Select value={status} onValueChange={(next) => setStatus(next as TaskStatus)}>
                <SelectTrigger className="h-10 w-full border-[#e9e6ed] bg-white text-xs font-normal"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((entry) => (
                    <SelectItem key={entry} value={entry}>{TASK_STATUS_LABEL[entry]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {createError && <p className="text-xs text-[#b05f5f]">{createError}</p>}
            </div>
            <DialogFooter>
              <Button onClick={() => setCreateOpen(false)} type="button" variant="outline">Cancel</Button>
              <Button className="bg-[#291b32] hover:bg-[#473252]" disabled={creating || !title.trim()} type="submit">
                <FiPlus className="size-4" /> {creating ? "Adding…" : "Add task"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {error && <p className="mb-3 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">{error}</p>}
      <div className="space-y-2">
        {tasks === null && <p className="text-xs text-[#928995]">Loading tasks…</p>}
        {tasks !== null && tasks.length === 0 && <p className="text-xs text-[#928995]">No tasks yet. Add your first follow-up above.</p>}
        {tasks?.map((task) => (
          <div className="flex items-center gap-3 rounded-lg border border-[#eeeaf1] bg-white px-4 py-3" key={task.id}>
            <button
              aria-label={task.status === "DONE" ? "Mark as to-do" : "Mark as done"}
              className={`grid size-5 shrink-0 place-items-center rounded-full border transition ${
                task.status === "DONE" ? "border-[#4e8a68] bg-[#eaf6ef] text-[#4e8a68]" : "border-[#d8d2dd] hover:border-[#a49ba9]"
              }`}
              onClick={() => void updateStatus(task, task.status === "DONE" ? "TODO" : "DONE")}
              type="button"
            >
              {task.status === "DONE" ? "✓" : ""}
            </button>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-xs font-medium ${task.status === "DONE" ? "text-[#a49ba9] line-through" : ""}`}>{task.title}</p>
              <div className="mt-0.5 flex items-center gap-x-2 text-[10px] text-[#968d9a]">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      aria-label="Change task status"
                      className="flex items-center gap-1 rounded text-[10px] text-[#968d9a] transition hover:text-[#3e3543] hover:underline"
                      onClick={(event) => event.stopPropagation()}
                      type="button"
                    >
                      {TASK_STATUS_LABEL[task.status]}
                      <FiChevronDown className="size-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="min-w-[9rem]">
                    <DropdownMenuRadioGroup onValueChange={(next) => void updateStatus(task, next as TaskStatus)} value={task.status}>
                      {(Object.keys(TASK_STATUS_LABEL) as TaskStatus[]).map((entry) => (
                        <DropdownMenuRadioItem className="text-xs" key={entry} value={entry}>{TASK_STATUS_LABEL[entry]}</DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                {task.dueDate ? <span>· Due {formatDate(task.dueDate)}</span> : null}
                {task.accountId ? <span>· Account: {accounts.find((account) => account.id === task.accountId)?.name ?? "—"}</span> : null}
                {task.contactId ? <span>· Contact: {contacts.find((contact) => contact.id === task.contactId)?.name ?? "—"}</span> : null}
              </div>
            </div>
            <Button className="h-7 w-7 p-0 text-[#a49ba9] hover:bg-red-50 hover:text-red-700" onClick={() => void remove(task)} size="sm" variant="ghost"><FiTrash2 className="size-3.5" /></Button>
          </div>
        ))}
      </div>
    </AppPageFrame>
  );
}

/* ----------------------------------- Notes --------------------------------- */

export function CrmNotesPage() {
  const [notes, setNotes] = useState<CrmNote[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [body, setBody] = useState("");
  const [accountId, setAccountId] = useState("");
  const [contactId, setContactId] = useState("");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [error, setError] = useState("");

  const loadNotes = useCallback(() => {
    const params = new URLSearchParams();
    if (accountId) params.set("accountId", accountId);
    if (contactId) params.set("contactId", contactId);
    api<{ notes: CrmNote[] }>(`/api/crm/notes${params.size ? `?${params}` : ""}`)
      .then((result) => setNotes(result.notes))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load notes."));
  }, [accountId, contactId]);

  useEffect(() => {
    loadNotes();
    api<{ accounts: Account[] }>("/api/crm/accounts").then((result) => setAccounts(result.accounts)).catch(() => setAccounts([]));
    api<{ contacts: Contact[] }>("/api/crm/contacts").then((result) => setContacts(result.contacts)).catch(() => setContacts([]));
  }, [loadNotes]);

  async function create() {
    if (!body.trim() || saving) return;
    setSaving(true);
    setCreateError("");
    try {
      await api("/api/crm/notes", {
        body: JSON.stringify({ body, accountId: accountId || null, contactId: contactId || null }),
        method: "POST",
      });
      setBody("");
      setAccountId("");
      setContactId("");
      setCreateOpen(false);
      loadNotes();
    } catch (createError) {
      setCreateError(createError instanceof Error ? createError.message : "Could not save the note.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(note: CrmNote) {
    try {
      await api(`/api/crm/notes/${note.id}`, { method: "DELETE" });
      setNotes((current) => (current ?? []).filter((entry) => entry.id !== note.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the note.");
    }
  }

  return (
    <AppPageFrame
      action={(
        <Button
          className="bg-[#291b32] hover:bg-[#473252]"
          onClick={() => {
            setCreateError("");
            setCreateOpen(true);
          }}
        >
          <FiPlus className="size-4" /> New note
        </Button>
      )}
      description="A timeline of everything worth remembering."
      title="Notes"
    >
      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New note</DialogTitle>
            <DialogDescription>Log a call, a meeting, or a thought worth remembering.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <Textarea
              autoFocus
              className="min-h-[80px] border-[#e9e6ed] text-xs"
              onChange={(event) => setBody(event.target.value)}
              placeholder="What happened?"
              value={body}
            />
            <div className="flex flex-col gap-2 sm:flex-row">
              <Select value={accountId} onValueChange={setAccountId}>
                <SelectTrigger className="h-8 w-full border-[#e9e6ed] text-[11px] font-normal sm:w-48">
                  <SelectValue placeholder="Link an account (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No account</SelectItem>
                  {accounts.map((account) => <SelectItem key={account.id} value={account.id}>{account.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={contactId} onValueChange={setContactId}>
                <SelectTrigger className="h-8 w-full border-[#e9e6ed] text-[11px] font-normal sm:w-48">
                  <SelectValue placeholder="Link a contact (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No contact</SelectItem>
                  {contacts.map((contact) => <SelectItem key={contact.id} value={contact.id}>{contact.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {createError && <p className="text-xs text-[#b05f5f]">{createError}</p>}
          </div>
          <DialogFooter>
            <Button onClick={() => setCreateOpen(false)} type="button" variant="outline">Cancel</Button>
            <Button className="bg-[#291b32] hover:bg-[#473252]" disabled={saving || !body.trim()} onClick={() => void create()} type="button">
              {saving ? "Saving…" : "Add note"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {error && <p className="mb-3 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {notes === null && <p className="text-xs text-[#928995]">Loading notes…</p>}
        {notes !== null && notes.length === 0 && <p className="text-xs text-[#928995]">No notes yet.</p>}
        {notes?.map((note) => (
          <div className="group rounded-lg border border-[#eeeaf1] bg-white px-4 py-3" key={note.id}>
            <p className="whitespace-pre-wrap text-xs leading-5">{note.body}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[10px] text-[#a49ba9]">
                {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "numeric" }).format(new Date(note.createdAt))}
                {note.accountId ? ` · ${accounts.find((account) => account.id === note.accountId)?.name ?? ""}` : ""}
                {note.contactId ? ` · ${contacts.find((contact) => contact.id === note.contactId)?.name ?? ""}` : ""}
              </p>
              <button
                aria-label="Delete note"
                className="grid size-6 place-items-center rounded text-[#a49ba9] opacity-0 transition hover:bg-[#f7f5f8] hover:text-[#b05f5f] group-hover:opacity-100"
                onClick={() => void remove(note)}
                type="button"
              >
                <FiTrash2 className="size-3" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </AppPageFrame>
  );
}

/* ------------------------------- Custom fields ------------------------------ */

export function CrmFieldsPage() {
  const [fields, setFields] = useState<CustomField[] | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<FieldType>("TEXT");
  const [appliesTo, setAppliesTo] = useState<FieldEntity>("ACCOUNT");
  const [options, setOptions] = useState("");
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [error, setError] = useState("");

  const loadFields = useCallback(() => {
    api<{ fields: CustomField[] }>("/api/crm/fields")
      .then((result) => setFields(result.fields))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load fields."));
  }, []);

  useEffect(() => { loadFields(); }, [loadFields]);

  async function create() {
    if (!name.trim()) {
      setCreateError("A field name is required.");
      return;
    }
    if (type === "SELECT" && !options.trim()) {
      setCreateError("Add at least one option for a select field.");
      return;
    }
    setSaving(true);
    setCreateError("");
    try {
      await api("/api/crm/fields", {
        body: JSON.stringify({
          name,
          type,
          appliesTo,
          options: type === "SELECT" ? options.split(",").map((option) => option.trim()).filter(Boolean) : [],
        }),
        method: "POST",
      });
      setName("");
      setOptions("");
      setType("TEXT");
      setAppliesTo("ACCOUNT");
      setCreateOpen(false);
      loadFields();
    } catch (createError) {
      setCreateError(createError instanceof Error ? createError.message : "Could not create the field.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(field: CustomField) {
    try {
      await api(`/api/crm/fields/${field.id}`, { method: "DELETE" });
      setFields((current) => (current ?? []).filter((entry) => entry.id !== field.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the field.");
    }
  }

  const entityLabel: Record<FieldEntity, string> = { ACCOUNT: "Accounts", CONTACT: "Contacts", TASK: "Tasks" };

  return (
    <AppPageFrame
      action={(
        <Button
          className="h-10 bg-[#291b32] px-4 hover:bg-[#473252]"
          onClick={() => {
            setCreateError("");
            setCreateOpen(true);
          }}
        >
          <FiPlus className="size-4" /> New field
        </Button>
      )}
      description="Add your own columns to accounts, contacts, and tasks."
      title="Custom fields"
    >
      <Dialog onOpenChange={setCreateOpen} open={createOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New field</DialogTitle>
            <DialogDescription>Custom fields show up as extra columns on records.</DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <div className="grid gap-3 py-1 sm:grid-cols-2">
              <label className="space-y-2 text-xs font-medium">
                Field name
                <Input autoFocus className="h-9 border-[#e9e6ed]" onChange={(event) => setName(event.target.value)} placeholder="e.g. Contract signed" value={name} />
              </label>
              <label className="space-y-2 text-xs font-medium">
                Type
                <Select value={type} onValueChange={(next) => setType(next as FieldType)}>
                  <SelectTrigger className="h-9 w-full border-[#e9e6ed] text-xs font-normal"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="TEXT">Text</SelectItem>
                    <SelectItem value="NUMBER">Number</SelectItem>
                    <SelectItem value="DATE">Date</SelectItem>
                    <SelectItem value="SELECT">Select</SelectItem>
                    <SelectItem value="CHECKBOX">Checkbox</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="space-y-2 text-xs font-medium">
                Applies to
                <Select value={appliesTo} onValueChange={(next) => setAppliesTo(next as FieldEntity)}>
                  <SelectTrigger className="h-9 w-full border-[#e9e6ed] text-xs font-normal"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACCOUNT">Accounts</SelectItem>
                    <SelectItem value="CONTACT">Contacts</SelectItem>
                    <SelectItem value="TASK">Tasks</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              {type === "SELECT" && (
                <label className="space-y-2 text-xs font-medium">
                  Options (comma-separated)
                  <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setOptions(event.target.value)} placeholder="Small, Medium, Large" value={options} />
                </label>
              )}
            </div>
            {createError && <p className="mt-3 text-xs text-[#b05f5f]">{createError}</p>}
            <DialogFooter>
              <Button onClick={() => setCreateOpen(false)} type="button" variant="outline">Cancel</Button>
              <Button className="bg-[#291b32] hover:bg-[#473252]" disabled={saving} type="submit">
                <FiPlus className="size-3.5" /> {saving ? "Creating…" : "Create field"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {fields === null && <p className="text-xs text-[#928995]">Loading fields…</p>}
        {fields !== null && fields.length === 0 && <p className="text-xs text-[#928995]">No custom fields yet.</p>}
        {fields?.map((field) => (
          <div className="flex items-center gap-3 rounded-lg border border-[#eeeaf1] bg-white px-4 py-3" key={field.id}>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{field.name}</p>
              <p className="mt-0.5 text-[10px] text-[#968d9a]">
                {field.type.toLowerCase()} · {entityLabel[field.appliesTo]}
                {field.type === "SELECT" ? ` · ${parseOptions(field.options).join(", ")}` : ""}
              </p>
            </div>
            <Button className="h-7 w-7 p-0 text-[#a49ba9] hover:bg-red-50 hover:text-red-700" onClick={() => void remove(field)} size="sm" variant="ghost"><FiTrash2 className="size-3.5" /></Button>
          </div>
        ))}
      </div>
    </AppPageFrame>
  );
}

/* ------------------------------- Public entry ------------------------------- */

export function CrmNotFound() {
  const navigate = useNavigate();
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4">
      <div className="grid size-12 place-items-center rounded-xl bg-[#f6f4f8] text-[24px]">🧭</div>
      <p className="text-sm text-[#847b89]">This page does not exist.</p>
      <Link className="text-xs font-medium text-[#755984]" onClick={() => navigate("/crm")} to="/crm">Back to CRM</Link>
    </div>
  );
}
