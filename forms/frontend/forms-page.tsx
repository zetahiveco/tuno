import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink as RouterNavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import { formatDistanceToNow } from "date-fns";
import {
  FiArrowDown,
  FiArrowLeft,
  FiArrowRight,
  FiArrowUp,
  FiCheck,
  FiCheckSquare,
  FiCopy,
  FiEdit3,
  FiExternalLink,
  FiFileText,
  FiInbox,
  FiLoader,
  FiPlus,
  FiRotateCcw,
  FiSend,
  FiTrash2,
  FiUploadCloud,
  FiX,
} from "react-icons/fi";
import { api } from "@/lib/api-client";
import { AppPageFrame, AppShell } from "@/general/frontend/app-shell";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EmojiPicker } from "@/notes/frontend/emoji-picker";
import { cn } from "cn";
import {
  BLOCK_TYPE_META,
  CHOICE_TYPES,
  FORM_BLOCK_TYPES,
  INPUT_TYPES,
  nextStep,
  parseFormBlocks,
  type FormBlock,
  type FormBlockOption,
  type FormBlockType,
  type SubmissionAnswers,
} from "@/forms/shared/form-blocks";

const FORMS_REFRESH_EVENT = "tuno:forms-updated";
const DEFAULT_ICON = "🧾";

export type FormSummary = {
  id: string;
  title: string;
  description: string;
  icon: string;
  status: "DRAFT" | "PUBLISHED";
  publicSlug: string | null;
  createdById: string;
  _count: { submissions: number };
  createdAt: string;
  updatedAt: string;
};

export type FormRecord = FormSummary & { blocks: string };

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

function newId(): string {
  return crypto.randomUUID();
}

function parseBlocks(content: string): FormBlock[] {
  return parseFormBlocks(content);
}

function notifyFormsChanged() {
  window.dispatchEvent(new Event(FORMS_REFRESH_EVENT));
}

function blockDisplayName(block: FormBlock): string {
  return block.label.trim() || BLOCK_TYPE_META[block.type].label;
}

function createBlock(type: FormBlockType): FormBlock {
  const options: FormBlockOption[] = CHOICE_TYPES.includes(type)
    ? [1, 2].map((number) => ({ id: newId(), label: `Option ${number}`, skip: "next", jumpTarget: null }))
    : [];
  return {
    id: newId(),
    type,
    label: "",
    description: "",
    required: false,
    options,
  };
}

/* -------------------------------- Forms hook ------------------------------- */

function useFormSummaries() {
  const [forms, setForms] = useState<FormSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  const loadForms = useCallback(async () => {
    setError("");
    try {
      const result = await api<{ forms: FormSummary[] }>("/api/forms/forms");
      setForms(result.forms);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your forms.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadForms();
    const refresh = () => void loadForms();
    window.addEventListener(FORMS_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(FORMS_REFRESH_EVENT, refresh);
  }, [loadForms]);

  async function createForm(): Promise<string | null> {
    setCreating(true);
    try {
      const result = await api<{ form: FormSummary }>("/api/forms/forms", {
        body: JSON.stringify({}),
        method: "POST",
      });
      setForms((current) => [result.form, ...current]);
      return result.form.id;
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the form.");
      return null;
    } finally {
      setCreating(false);
    }
  }

  async function deleteForm(form: FormSummary): Promise<boolean> {
    try {
      await api(`/api/forms/forms/${form.id}`, { method: "DELETE" });
      setForms((current) => current.filter((entry) => entry.id !== form.id));
      notifyFormsChanged();
      return true;
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the form.");
      return false;
    }
  }

  return { createForm, creating, deleteForm, error, loading, forms };
}

/* --------------------------------- Layout --------------------------------- */

export function FormsLayout() {
  const navigate = useNavigate();
  const { createForm, creating, deleteForm, error, loading, forms } = useFormSummaries();

  return (
    <AppShell accent="bg-[#eaf6ef] text-[#4e8a68]" appName="Forms" icon={FiCheckSquare}>
      <div className="flex items-center justify-between px-3 pb-1">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a49ba9]">Forms</span>
        <button
          aria-label="New form"
          className="grid size-6 place-items-center rounded-md text-[#a49ba9] transition hover:bg-[#f3eef7] hover:text-[#4f3262]"
          onClick={() => {
            void createForm().then((id) => {
              if (id) navigate(`/forms/${id}`);
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
      ) : forms.length === 0 ? (
        <p className="px-3 text-xs leading-5 text-[#8c838f]">
          No forms yet. Use the + button to build your first form.
        </p>
      ) : (
        <nav className="space-y-0.5 px-2">
          {forms.map((form) => (
            <SidebarFormLink deleteForm={deleteForm} form={form} key={form.id} />
          ))}
        </nav>
      )}
    </AppShell>
  );
}

function SidebarFormLink({
  deleteForm,
  form,
}: {
  deleteForm: (form: FormSummary) => Promise<boolean>;
  form: FormSummary;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const title = form.title.trim() || "Untitled form";

  async function confirmDelete() {
    setDeleting(true);
    const deleted = await deleteForm(form);
    setDeleting(false);
    if (deleted && (location.pathname === `/forms/${form.id}` || location.pathname.startsWith(`/forms/${form.id}/`))) {
      navigate("/forms");
    }
  }

  return (
    <>
      <RouterNavLink
        className={({ isActive }) =>
          `group relative flex h-8 items-center gap-2 rounded-md px-2.5 text-[13px] font-medium transition ${
            isActive ? "bg-[#f3eef7] text-[#4f3262]" : "text-[#716b76] hover:bg-[#f7f5f8]"
          }`
        }
        to={`/forms/${form.id}`}
      >
        <span className="w-4 shrink-0 text-center text-[14px] leading-none">{form.icon || DEFAULT_ICON}</span>
        <span className="min-w-0 flex-1 truncate">{title}</span>
        <span
          aria-label={form.status === "PUBLISHED" ? "Published" : "Draft"}
          className={cn(
            "size-1.5 shrink-0 rounded-full group-hover:hidden",
            form.status === "PUBLISHED" ? "bg-[#4e8a68]" : "bg-[#d5cdd9]",
          )}
        />
        <span
          aria-hidden
          aria-label={`Delete ${title}`}
          className="absolute right-1 grid size-5 place-items-center rounded text-[#a49ba9] opacity-0 transition hover:bg-[#e9e2ef] hover:text-[#b05f5f] group-hover:opacity-100"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setConfirmOpen(true);
          }}
          role="button"
        >
          <FiTrash2 className="size-3" />
        </span>
      </RouterNavLink>

      <AlertDialog onOpenChange={setConfirmOpen} open={confirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete "{title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the form{form.status === "PUBLISHED" ? ", unpublish its live link," : null} and
              all collected responses. This action cannot be undone.
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
              Delete form
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/* ------------------------------ Home (index) ------------------------------- */

export function FormsHomePage() {
  const navigate = useNavigate();
  const { createForm, creating } = useFormSummaries();

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6">
      <div className="grid size-12 place-items-center rounded-xl bg-[#eaf6ef] text-[#4e8a68]">
        <FiCheckSquare className="size-6" />
      </div>
      <div className="text-center">
        <h1 className="text-lg font-semibold tracking-[-0.03em]">Welcome to Forms</h1>
        <p className="mt-1 text-sm text-[#847b89]">
          Pick a form from the sidebar, or build a new one — blocks, skip logic, and all.
        </p>
      </div>
      <Button className="bg-[#291b32]" disabled={creating} onClick={() => void createForm().then((id) => id && navigate(`/forms/${id}`))}>
        {creating ? <FiLoader className="size-4 animate-spin" /> : <FiPlus className="size-4" />}
        New form
      </Button>
    </div>
  );
}

/* --------------------------------- Autosave -------------------------------- */

const SAVE_STATUS_TEXT: Record<SaveState, string> = {
  idle: "Saved",
  pending: "Unsaved changes",
  saving: "Saving…",
  saved: "Saved",
  error: "Couldn't save — retry by editing again",
};

function useAutosave(formId: string) {
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
      await api(`/api/forms/forms/${formId}`, {
        body: JSON.stringify(patch),
        method: "PATCH",
      });
      setSaveState("saved");
      notifyFormsChanged();
    } catch {
      setSaveState("error");
    }
    inFlightRef.current = false;
    if (Object.keys(pendingRef.current).length > 0) {
      timerRef.current = setTimeout(() => void flushSave(), 400);
    }
  }, [formId]);

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

/* ------------------------------- Block editor ------------------------------ */

type BlockChange = (blockId: string, patch: Partial<FormBlock>) => void;

function TypeGrid({ onPick }: { onPick: (type: FormBlockType) => void }) {
  return (
    <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
      {FORM_BLOCK_TYPES.map((type) => (
        <button
          className="flex flex-col items-center gap-1 rounded-md border border-[#eeeaf1] bg-white px-2 py-2.5 text-center transition hover:border-[#d9cfe2] hover:bg-[#faf8fb]"
          key={type}
          onClick={() => onPick(type)}
          type="button"
        >
          <span className="text-[11px] font-semibold text-[#78538c]">{BLOCK_TYPE_META[type].icon}</span>
          <span className="text-[11px] leading-tight text-[#5d5263]">{BLOCK_TYPE_META[type].label}</span>
        </button>
      ))}
    </div>
  );
}

function SkipSelect({
  blockIndex,
  blocks,
  option,
  onChange,
}: {
  blockIndex: number;
  blocks: FormBlock[];
  option: FormBlockOption;
  onChange: (skip: FormBlockOption["skip"], jumpTarget: string | null) => void;
}) {
  // Jumps are forward-only so the flow always terminates.
  const targets = blocks.slice(blockIndex + 1);
  const targetValid = option.jumpTarget ? targets.some((block) => block.id === option.jumpTarget) : false;
  const effectiveSkip = option.skip === "jump" && !targetValid ? "next" : option.skip;

  function handleSkipChange(value: string) {
    if (value === "next" || value === "end") {
      onChange(value as FormBlockOption["skip"], null);
      return;
    }
    const firstTarget = targets[0]?.id ?? null;
    if (!firstTarget) {
      onChange("next", null);
      return;
    }
    onChange("jump", firstTarget);
  }

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <FiArrowRight aria-hidden className="size-3 text-[#a49ba9]" />
      <Select onValueChange={handleSkipChange} value={effectiveSkip}>
        <SelectTrigger
          aria-label="After this option"
          className="max-w-[190px] border-[#eeeaf1] bg-white px-1.5 text-[11px] text-[#5d5263]"
          size="sm"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="next">Continue to next</SelectItem>
          {targets.length > 0 ? (
            <SelectItem value="jump">Skip to a question…</SelectItem>
          ) : null}
          <SelectItem value="end">End the form</SelectItem>
        </SelectContent>
      </Select>
      {effectiveSkip === "jump" && option.jumpTarget && targetValid ? (
        <Select onValueChange={(value) => onChange("jump", value)} value={option.jumpTarget}>
          <SelectTrigger
            aria-label="Jump target"
            className="max-w-[190px] border-[#c9b8d6] bg-white px-1.5 text-[11px] text-[#4f3262]"
            size="sm"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {targets.map((target) => (
              <SelectItem key={target.id} value={target.id}>
                {blockDisplayName(target)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  );
}

function BlockCard({
  block,
  blockIndex,
  blocks,
  onChange,
  onInsert,
  onMove,
  onRemove,
}: {
  block: FormBlock;
  blockIndex: number;
  blocks: FormBlock[];
  onChange: BlockChange;
  onInsert: (afterIndex: number) => void;
  onMove: (fromIndex: number, direction: -1 | 1) => void;
  onRemove: (blockId: string) => void;
}) {
  const meta = BLOCK_TYPE_META[block.type];
  const isQuestion = block.type !== "paragraph";
  const isChoice = CHOICE_TYPES.includes(block.type);

  function updateOption(optionId: string, patch: Partial<FormBlockOption>) {
    onChange(block.id, {
      options: block.options.map((option) => (option.id === optionId ? { ...option, ...patch } : option)),
    });
  }

  function addOption() {
    onChange(block.id, {
      options: [...block.options, { id: newId(), label: "", skip: "next", jumpTarget: null }],
    });
  }

  function removeOption(optionId: string) {
    onChange(block.id, { options: block.options.filter((option) => option.id !== optionId) });
  }

  return (
    <div className="group rounded-lg border border-[#eeeaf1] bg-white p-4 shadow-[0_1px_2px_rgba(40,20,60,0.04)] transition hover:border-[#e2d8ea]">
      <div className="mb-3 flex items-center gap-2">
        <Badge className="border-[#eeeaf1] bg-[#f5f3f6] text-[10px] font-medium text-[#78538c]" variant="outline">
          {meta.icon} {meta.label}
        </Badge>
        {isQuestion ? (
          <button
            className={cn(
              "rounded-full border px-2 py-0.5 text-[10px] font-medium transition",
              block.required
                ? "border-[#cfe6d8] bg-[#eaf6ef] text-[#3f7354]"
                : "border-[#eeeaf1] bg-white text-[#a49ba9] hover:text-[#716b76]",
            )}
            onClick={() => onChange(block.id, { required: !block.required })}
            type="button"
          >
            {block.required ? "Required" : "Optional"}
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-0.5 opacity-0 transition group-hover:opacity-100">
          <button
            aria-label="Insert block below"
            className="grid size-6 place-items-center rounded-md text-[#a49ba9] transition hover:bg-[#f3eef7] hover:text-[#4f3262]"
            onClick={() => onInsert(blockIndex)}
            type="button"
          >
            <FiPlus className="size-3.5" />
          </button>
          <button
            aria-label="Move block up"
            className="grid size-6 place-items-center rounded-md text-[#a49ba9] transition hover:bg-[#f3eef7] hover:text-[#4f3262] disabled:opacity-30"
            disabled={blockIndex === 0}
            onClick={() => onMove(blockIndex, -1)}
            type="button"
          >
            <FiArrowUp className="size-3.5" />
          </button>
          <button
            aria-label="Move block down"
            className="grid size-6 place-items-center rounded-md text-[#a49ba9] transition hover:bg-[#f3eef7] hover:text-[#4f3262] disabled:opacity-30"
            disabled={blockIndex === blocks.length - 1}
            onClick={() => onMove(blockIndex, 1)}
            type="button"
          >
            <FiArrowDown className="size-3.5" />
          </button>
          <button
            aria-label="Delete block"
            className="grid size-6 place-items-center rounded-md text-[#a49ba9] transition hover:bg-[#fbeeee] hover:text-[#b05f5f]"
            onClick={() => onRemove(block.id)}
            type="button"
          >
            <FiX className="size-3.5" />
          </button>
        </div>
      </div>

      {block.type === "paragraph" ? (
        <textarea
          aria-label="Text block"
          className="w-full resize-none rounded-md border border-transparent bg-[#faf8fb] px-3 py-2 text-[13px] leading-6 text-[#3e3543] outline-none transition placeholder:text-[#cfc7d6] focus:border-[#d9cfe2] focus:bg-white"
          onChange={(event) => onChange(block.id, { label: event.target.value })}
          placeholder="Add some context or instructions for your respondents…"
          rows={2}
          value={block.label}
        />
      ) : (
        <>
          <input
            aria-label="Question label"
            className="w-full bg-transparent text-[15px] font-medium tracking-[-0.01em] outline-none placeholder:text-[#cfc7d6]"
            onChange={(event) => onChange(block.id, { label: event.target.value })}
            placeholder={isChoice ? "Your question" : `Ask something (${meta.label.toLowerCase()})`}
            value={block.label}
          />
          <input
            aria-label="Question help text"
            className="mt-1 w-full bg-transparent text-xs outline-none placeholder:text-[#dcd5e1]"
            onChange={(event) => onChange(block.id, { description: event.target.value })}
            placeholder="Help text (optional)"
            value={block.description}
          />
        </>
      )}

      {isChoice ? (
        <div className="mt-3 space-y-1.5 border-t border-[#f1edf4] pt-3">
          {block.options.map((option) => (
            <div className="flex flex-wrap items-center gap-2" key={option.id}>
              <span aria-hidden className="grid size-4 shrink-0 place-items-center rounded-full border border-[#d5cdd9] text-[8px] text-[#a49ba9]">
                {block.type === "select" ? "" : "✓"}
              </span>
              <input
                aria-label="Option label"
                className="h-7 w-full min-w-[120px] max-w-[280px] flex-1 rounded-md border border-transparent bg-[#faf8fb] px-2 text-[13px] outline-none transition placeholder:text-[#cfc7d6] focus:border-[#d9cfe2] focus:bg-white"
                onChange={(event) => updateOption(option.id, { label: event.target.value })}
                placeholder="Option label"
                value={option.label}
              />
              <SkipSelect
                blocks={blocks}
                blockIndex={blockIndex}
                onChange={(skip, jumpTarget) => updateOption(option.id, { skip, jumpTarget })}
                option={option}
              />
              <button
                aria-label="Remove option"
                className="grid size-6 shrink-0 place-items-center rounded-md text-[#a49ba9] transition hover:bg-[#fbeeee] hover:text-[#b05f5f]"
                onClick={() => removeOption(option.id)}
                type="button"
              >
                <FiX className="size-3.5" />
              </button>
            </div>
          ))}
          <button
            className="flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-[#78538c] transition hover:bg-[#f3eef7]"
            onClick={addOption}
            type="button"
          >
            <FiPlus className="size-3" /> Add option
          </button>
        </div>
      ) : null}

      {block.type === "file" ? (
        <p className="mt-3 flex items-center gap-1.5 border-t border-[#f1edf4] pt-3 text-[11px] text-[#8c838f]">
          <FiUploadCloud className="size-3.5" /> Respondents can upload one file — it lands in your storage bucket.
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------ Form builder ------------------------------- */

export function FormBuilderPage() {
  const { formId } = useParams<{ formId: string }>();
  const [form, setForm] = useState<FormRecord | null>(null);
  const [blocks, setBlocks] = useState<FormBlock[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState("");
  const [copied, setCopied] = useState(false);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const hydratedRef = useRef(false);
  const { saveState, scheduleSave } = useAutosave(formId ?? "");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    hydratedRef.current = false;
    setForm(null);
    api<{ form: FormRecord }>(`/api/forms/forms/${formId}`)
      .then((result) => {
        if (cancelled) return;
        setForm(result.form);
        setBlocks(parseBlocks(result.form.blocks));
        setStatus("ready");
        requestAnimationFrame(() => {
          hydratedRef.current = true;
        });
      })
      .catch(() => {
        if (!cancelled) setStatus("missing");
      });
    return () => {
      cancelled = true;
    };
  }, [formId]);

  function applyBlocks(next: FormBlock[]) {
    if (!hydratedRef.current) return;
    setBlocks(next);
    scheduleSave({ blocks: next });
  }

  function handleBlockChange(blockId: string, patch: Partial<FormBlock>) {
    applyBlocks(blocks.map((block) => (block.id === blockId ? { ...block, ...patch } : block)));
  }

  function handleBlockRemove(blockId: string) {
    // Options pointing at the removed block fall back to "continue to next".
    applyBlocks(
      blocks
        .filter((block) => block.id !== blockId)
        .map((block) => ({
          ...block,
          options: block.options.map((option) =>
            option.jumpTarget === blockId ? { ...option, skip: "next", jumpTarget: null } : option,
          ),
        })),
    );
  }

  function handleBlockMove(fromIndex: number, direction: -1 | 1) {
    const toIndex = fromIndex + direction;
    if (toIndex < 0 || toIndex >= blocks.length) return;
    const next = [...blocks];
    const [moved] = next.splice(fromIndex, 1);
    if (!moved) return;
    next.splice(toIndex, 0, moved);
    applyBlocks(next);
  }

  function handleInsert(afterIndex: number, type: FormBlockType) {
    const block = createBlock(type);
    const next = [...blocks];
    next.splice(afterIndex + 1, 0, block);
    applyBlocks(next);
    setInsertAt(null);
  }

  async function togglePublish(publish: boolean) {
    if (!form) return;
    setPublishing(true);
    setPublishError("");
    try {
      if (publish) {
        const result = await api<{ status: "PUBLISHED"; publicSlug: string }>(`/api/forms/forms/${form.id}/publish`, {
          method: "POST",
        });
        setForm({ ...form, status: result.status, publicSlug: result.publicSlug });
      } else {
        const result = await api<{ status: "DRAFT" }>(`/api/forms/forms/${form.id}/publish`, { method: "DELETE" });
        setForm({ ...form, status: result.status });
      }
      notifyFormsChanged();
    } catch (publishIssue) {
      setPublishError(publishIssue instanceof Error ? publishIssue.message : "Could not update the form status.");
    }
    setPublishing(false);
  }

  function copyLiveLink() {
    if (!form?.publicSlug) return;
    void navigator.clipboard.writeText(`${window.location.origin}/f/${form.publicSlug}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (status === "loading") {
    return (
      <div className="flex h-full items-center justify-center text-xs text-[#928995]">Opening form…</div>
    );
  }

  if (status === "missing" || !form) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="grid size-12 place-items-center rounded-lg bg-[#f6f4f8] text-[22px]">🔍</div>
        <div className="text-center">
          <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Form not found</h2>
          <p className="mt-1 text-sm text-[#847b89]">It may have been deleted.</p>
        </div>
        <Link className="flex items-center gap-1.5 text-[13px] font-medium text-[#716b76] transition hover:text-[#3e3543]" to="/forms">
          <FiArrowLeft className="size-4" />
          Back to Forms
        </Link>
      </div>
    );
  }

  const isPublished = form.status === "PUBLISHED";
  const hasQuestion = blocks.some((block) => block.type !== "paragraph");

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-[52px] shrink-0 items-center justify-between gap-3 border-b border-[#eeeaf1] bg-white px-4">
        <div className="flex min-w-0 items-center gap-2">
          <Link
            className="flex items-center gap-1.5 text-[13px] font-medium text-[#716b76] transition hover:text-[#3e3543]"
            to="/forms"
          >
            <FiArrowLeft className="size-4" />
            <span className="hidden sm:inline">All forms</span>
          </Link>
          <Badge
            className={cn(
              "text-[10px] font-medium",
              isPublished ? "border-[#cfe6d8] bg-[#eaf6ef] text-[#3f7354]" : "border-[#eeeaf1] bg-[#f5f3f6] text-[#8c838f]",
            )}
            variant="outline"
          >
            {isPublished ? "Published" : "Draft"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className={cn("hidden text-xs sm:inline", saveState === "error" ? "text-[#b05f5f]" : "text-[#a49ba9]")}>
            {SAVE_STATUS_TEXT[saveState]}
          </span>
          <Link
            className="flex h-8 items-center gap-1.5 rounded-md border border-[#eeeaf1] bg-white px-2.5 text-xs font-medium text-[#5d5263] transition hover:bg-[#f7f5f8]"
            to={`/forms/${form.id}/submissions`}
          >
            <FiInbox className="size-3.5" />
            Responses
          </Link>
          {isPublished && form.publicSlug ? (
            <>
              <a
                className="flex h-8 items-center gap-1.5 rounded-md border border-[#eeeaf1] bg-white px-2.5 text-xs font-medium text-[#5d5263] transition hover:bg-[#f7f5f8]"
                href={`/f/${form.publicSlug}`}
                rel="noreferrer"
                target="_blank"
              >
                <FiExternalLink className="size-3.5" />
                <span className="hidden sm:inline">Live form</span>
              </a>
              <Button
                className="h-8 border-[#eeeaf1] bg-white px-2.5 text-xs text-[#5d5263] hover:bg-[#f7f5f8]"
                onClick={copyLiveLink}
                size="sm"
                variant="outline"
              >
                {copied ? <FiCheck className="size-3.5 text-[#4e8a68]" /> : <FiCopy className="size-3.5" />}
                <span className="hidden md:inline">{copied ? "Copied!" : "Copy link"}</span>
              </Button>
              <Button
                className="h-8 border-[#eeeaf1] bg-white px-2.5 text-xs text-[#5d5263] hover:bg-[#f7f5f8]"
                disabled={publishing}
                onClick={() => void togglePublish(false)}
                size="sm"
                variant="outline"
              >
                Unpublish
              </Button>
            </>
          ) : (
            <Button
              className="h-8 bg-[#291b32] px-3 text-xs"
              disabled={publishing || !hasQuestion}
              onClick={() => void togglePublish(true)}
              size="sm"
            >
              {publishing ? <FiLoader className="size-3.5 animate-spin" /> : <FiSend className="size-3.5" />}
              Publish
            </Button>
          )}
        </div>
      </div>

      {publishError ? <p className="bg-red-50 px-4 py-2 text-xs text-[#b05f5f]">{publishError}</p> : null}
      {isPublished && !hasQuestion && blocks.length > 0 ? (
        <p className="bg-amber-50 px-4 py-2 text-xs text-[#8a6d3b]">
          This form has no questions — respondents will see nothing to answer. Add a question, then republish.
        </p>
      ) : null}

      <div className="min-h-0 flex-1 overflow-auto">
        <div className="mx-auto w-full max-w-[760px] px-5 pb-32 pt-8">
          <div className="mb-1">
            <EmojiPicker
              current={form.icon || DEFAULT_ICON}
              onSelect={(emoji) => {
                const next = emoji || DEFAULT_ICON;
                setForm({ ...form, icon: next });
                scheduleSave({ icon: next }, 0);
              }}
            >
              <button
                aria-label="Change form icon"
                className="grid size-12 place-items-center rounded-lg text-[26px] leading-none transition hover:bg-[#f3eef7]"
                type="button"
              >
                {form.icon || DEFAULT_ICON}
              </button>
            </EmojiPicker>
          </div>

          <input
            aria-label="Form title"
            className="w-full bg-transparent text-[30px] font-semibold tracking-[-0.04em] outline-none placeholder:text-[#cfc7d6] sm:text-[36px]"
            disabled={false}
            onChange={(event) => {
              setForm({ ...form, title: event.target.value });
              scheduleSave({ title: event.target.value });
            }}
            placeholder="Untitled form"
            value={form.title}
          />
          <textarea
            aria-label="Form description"
            className="mt-2 w-full resize-none bg-transparent text-sm leading-6 text-[#6f6078] outline-none placeholder:text-[#dcd5e1]"
            onChange={(event) => {
              setForm({ ...form, description: event.target.value });
              scheduleSave({ description: event.target.value });
            }}
            placeholder="Add a description so people know why they're filling this in."
            rows={2}
            value={form.description}
          />

          <div className="mt-6 space-y-2.5">
            {blocks.map((block, index) => (
              <BlockCard
                block={block}
                blockIndex={index}
                blocks={blocks}
                key={block.id}
                onChange={handleBlockChange}
                onInsert={setInsertAt}
                onMove={handleBlockMove}
                onRemove={handleBlockRemove}
              />
            ))}

            {blocks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[#e2d8ea] bg-white/60 p-8 text-center">
                <p className="text-sm font-medium text-[#5d5263]">Your form is empty</p>
                <p className="mt-1 text-xs text-[#8c838f]">Add your first block below — questions, text, or a file upload.</p>
              </div>
            ) : null}

            {insertAt === null ? (
              <button
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[#e2d8ea] bg-white/60 py-3 text-[13px] font-medium text-[#716b76] transition hover:border-[#c9b8d6] hover:bg-white hover:text-[#4f3262]"
                onClick={() => setInsertAt(blocks.length - 1)}
                type="button"
              >
                <FiPlus className="size-4" /> Add a block
              </button>
            ) : (
              <div className="rounded-lg border border-[#d9cfe2] bg-white p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a49ba9]">Choose a block</span>
                  <button
                    aria-label="Cancel"
                    className="grid size-6 place-items-center rounded-md text-[#a49ba9] transition hover:bg-[#f7f5f8]"
                    onClick={() => setInsertAt(null)}
                    type="button"
                  >
                    <FiX className="size-3.5" />
                  </button>
                </div>
                <TypeGrid onPick={(type) => handleInsert(insertAt, type)} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------- Submissions ------------------------------- */

export type FormSubmissionRecord = {
  id: string;
  formId: string;
  answers: string;
  createdAt: string;
};

function formatAnswer(blocks: FormBlock[], answers: SubmissionAnswers, block: FormBlock): string | null {
  const value = answers[block.id];
  if (block.type === "paragraph" || value === undefined || value === null) return null;
  if (block.type === "select") {
    return block.options.find((option) => option.id === value)?.label ?? String(value);
  }
  if (block.type === "multiSelect" && Array.isArray(value)) {
    return value
      .map((id) => block.options.find((option) => option.id === id)?.label ?? id)
      .join(", ");
  }
  return String(value);
}

function SubmissionCard({ blocks, submission }: { blocks: FormBlock[]; submission: FormSubmissionRecord }) {
  const [opening, setOpening] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const answers = parseSubmissionAnswers(submission.answers);
  const entries = blocks
    .map((block) => ({ block, value: formatAnswer(blocks, answers, block) }))
    .filter((entry) => entry.value !== null);

  async function openFile(filename: string) {
    setOpening(filename);
    try {
      const result = await api<{ url: string }>(`/api/forms/files/${encodeURIComponent(filename)}/url`);
      window.open(result.url, "_blank", "noopener");
    } catch {
      // The link request failed; nothing else we can do here.
    }
    setOpening(null);
  }

  async function remove() {
    setRemoving(true);
    try {
      await api<void>(`/api/forms/forms/${submission.formId}/submissions/${submission.id}`, { method: "DELETE" });
      notifyFormsChanged();
      window.dispatchEvent(new Event("tuno:form-submissions-updated"));
    } finally {
      setRemoving(false);
    }
  }

  const isFile = (block: FormBlock) => block.type === "file";

  return (
    <div className="rounded-lg border border-[#eeeaf1] bg-white p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs text-[#a49ba9]">
          {formatDistanceToNow(new Date(submission.createdAt), { addSuffix: true })}
        </span>
        <button
          aria-label="Delete submission"
          className="grid size-7 place-items-center rounded-md text-[#a49ba9] transition hover:bg-[#fbeeee] hover:text-[#b05f5f] disabled:opacity-40"
          disabled={removing}
          onClick={() => void remove()}
          type="button"
        >
          {removing ? <FiLoader className="size-3.5 animate-spin" /> : <FiTrash2 className="size-3.5" />}
        </button>
      </div>
      {entries.length === 0 ? (
        <p className="text-xs text-[#8c838f]">No answers were required for this submission.</p>
      ) : (
        <dl className="space-y-2.5">
          {entries.map(({ block, value }) => (
            <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-4" key={block.id}>
              <dt className="w-full shrink-0 text-xs font-medium text-[#8c838f] sm:w-[220px]">{blockDisplayName(block)}</dt>
              <dd className="min-w-0 text-[13px] text-[#3e3543]">
                {isFile(block) ? (
                  <button
                    className="inline-flex items-center gap-1.5 rounded-md bg-[#f3eef7] px-2 py-1 text-xs font-medium text-[#4f3262] transition hover:bg-[#e9dff0]"
                    disabled={opening !== null}
                    onClick={() => void openFile(value as string)}
                    type="button"
                  >
                    {opening === value ? <FiLoader className="size-3 animate-spin" /> : <FiFileText className="size-3" />}
                    Open uploaded file
                  </button>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

function parseSubmissionAnswers(content: string): SubmissionAnswers {
  try {
    const parsed: unknown = JSON.parse(content);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      return parsed as SubmissionAnswers;
    }
  } catch {
    // Fall through to empty answers.
  }
  return {};
}

export function FormSubmissionsPage() {
  const { formId } = useParams<{ formId: string }>();
  const [form, setForm] = useState<FormRecord | null>(null);
  const [submissions, setSubmissions] = useState<FormSubmissionRecord[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  const load = useCallback(() => {
    void Promise.all([
      api<{ form: FormRecord }>(`/api/forms/forms/${formId}`),
      api<{ submissions: FormSubmissionRecord[] }>(`/api/forms/forms/${formId}/submissions`),
    ])
      .then(([formResult, submissionResult]) => {
        setForm(formResult.form);
        setSubmissions(submissionResult.submissions);
        setStatus("ready");
      })
      .catch(() => setStatus("missing"));
  }, [formId]);

  useEffect(() => {
    setStatus("loading");
    load();
    const refresh = () => load();
    window.addEventListener("tuno:form-submissions-updated", refresh);
    return () => window.removeEventListener("tuno:form-submissions-updated", refresh);
  }, [load]);

  if (status === "loading") {
    return <div className="flex h-full items-center justify-center text-xs text-[#928995]">Loading responses…</div>;
  }

  if (status === "missing" || !form) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4">
        <div className="grid size-12 place-items-center rounded-lg bg-[#f6f4f8] text-[22px]">🔍</div>
        <h2 className="text-[15px] font-semibold tracking-[-0.02em]">Form not found</h2>
        <Link className="flex items-center gap-1.5 text-[13px] font-medium text-[#716b76] transition hover:text-[#3e3543]" to="/forms">
          <FiArrowLeft className="size-4" />
          Back to Forms
        </Link>
      </div>
    );
  }

  const blocks = parseBlocks(form.blocks);

  return (
    <AppPageFrame
      description={form.description.trim() || `Answers collected through ${form.title.trim() || "your form"}.`}
      title={`Responses · ${form.title.trim() || "Untitled form"}`}
    >
      <Link
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-[#716b76] transition hover:text-[#3e3543]"
        to={`/forms/${form.id}`}
      >
        <FiEdit3 className="size-3.5" />
        Edit form
      </Link>

      {submissions.length === 0 ? (
        <div className="max-w-xl rounded-lg border border-dashed border-[#e2d8ea] bg-white/60 p-10 text-center">
          <div className="mx-auto grid size-11 place-items-center rounded-lg bg-[#eaf6ef] text-[#4e8a68]">
            <FiInbox className="size-5" />
          </div>
          <p className="mt-3 text-sm font-medium text-[#5d5263]">No responses yet</p>
          <p className="mt-1 text-xs leading-5 text-[#847b89]">
            {form.status === "PUBLISHED" && form.publicSlug
              ? "Share your form link and responses will show up here."
              : "Publish your form to start collecting responses."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[#a49ba9]">
            {submissions.length} {submissions.length === 1 ? "response" : "responses"}
          </p>
          {submissions.map((submission) => (
            <SubmissionCard blocks={blocks} key={submission.id} submission={submission} />
          ))}
        </div>
      )}
    </AppPageFrame>
  );
}