import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "@/lib/api-client";
import { cn } from "cn";
import {
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiCheckSquare,
  FiLoader,
  FiSend,
  FiTrash2,
  FiUploadCloud,
} from "react-icons/fi";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { nextStep, type FormBlock, type SubmissionAnswers } from "@/forms/shared/form-blocks";

type PublicForm = {
  title: string;
  description: string;
  icon: string;
  blocks: FormBlock[];
  updatedAt: string;
};

type Position = { kind: "block"; index: number } | { kind: "review" };

function isAnswered(value: string | string[] | undefined): boolean {
  if (value === undefined || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

function formatAnswer(block: FormBlock, value: string | string[] | undefined): string {
  if (Array.isArray(value)) {
    return value.map((id) => block.options.find((option) => option.id === id)?.label ?? id).join(", ");
  }
  return block.options.find((option) => option.id === value)?.label ?? String(value ?? "");
}

export function PublicFormPage() {
  const { slug } = useParams<{ slug: string }>();
  const [form, setForm] = useState<PublicForm | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing">("loading");

  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    api<{ form: PublicForm }>(`/api/public/forms/${slug}`)
      .then((result) => {
        if (!cancelled) {
          setForm(result.form);
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
        Opening form…
      </main>
    );
  }

  if (status === "missing" || !form) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f8f7fa] px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-xl bg-white text-[#78538c] shadow-sm">
            <FiCheckSquare className="size-5" />
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-[-0.03em]">Form not available</h1>
          <p className="mt-1.5 text-sm text-[#847b89]">
            This link may have been unpublished, or the form was never shared.
          </p>
        </div>
      </main>
    );
  }

  return <RespondentForm form={form} key={slug} slug={slug ?? ""} />;
}

function RespondentForm({ form, slug }: { form: PublicForm; slug: string }) {
  const inputBlocks = useMemo(() => form.blocks.filter((block) => block.type !== "paragraph"), [form.blocks]);
  const [answers, setAnswers] = useState<SubmissionAnswers>({});
  const [position, setPosition] = useState<Position>(
    inputBlocks.length === 0 ? { kind: "review" } : { kind: "block", index: 0 },
  );
  const [history, setHistory] = useState<number[]>([]);
  const [fieldError, setFieldError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const current =
    position.kind === "block" && form.blocks[position.index]
      ? { block: form.blocks[position.index]!, index: position.index }
      : null;

  const progress = useMemo(() => {
    if (inputBlocks.length === 0) return 100;
    if (position.kind === "review") return 100;
    const answered = inputBlocks.filter((block) => isAnswered(answers[block.id])).length;
    const currentIndex = current && current.block.type !== "paragraph" ? inputBlocks.indexOf(current.block) + 1 : answered;
    return Math.min(100, Math.round((Math.max(answered, currentIndex) / inputBlocks.length) * 100));
  }, [answers, current, inputBlocks, position.kind]);

  const setAnswer = useCallback((blockId: string, value: string | string[]) => {
    setAnswers((previous) => ({ ...previous, [blockId]: value }));
    setFieldError("");
  }, []);

  function goTo(next: Position) {
    setFieldError("");
    setSubmitError("");
    setPosition(next);
  }

  function handleContinue() {
    if (!current) return;
    if (current.block.required && !isAnswered(answers[current.block.id])) {
      setFieldError("This question is required.");
      return;
    }
    const next = nextStep(form.blocks, current.index, answers);
    setHistory((previous) => [...previous, current.index]);
    if (next === "end") {
      goTo({ kind: "review" });
    } else {
      goTo({ kind: "block", index: next });
    }
  }

  function handleBack() {
    const previous = history[history.length - 1];
    if (previous === undefined) return;
    setHistory((existing) => existing.slice(0, -1));
    goTo({ kind: "block", index: previous });
  }

  function editFromReview(index: number) {
    setHistory([]);
    goTo({ kind: "block", index });
  }

  async function handleSubmit() {
    setSubmitting(true);
    setSubmitError("");
    try {
      await api(`/api/public/forms/${slug}/submissions`, {
        body: JSON.stringify({ answers }),
        method: "POST",
      });
      setSubmitted(true);
    } catch (submitIssue) {
      setSubmitError(submitIssue instanceof Error ? submitIssue.message : "Could not submit your response.");
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f8f7fa] px-6">
        <div className="max-w-md text-center">
          <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-[#eaf6ef] text-[#4e8a68]">
            <FiCheck className="size-7" />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-[-0.03em]">
            {form.title.trim() || "Thanks for your response!"}
          </h1>
          <p className="mt-2 text-sm text-[#847b89]">Your response has been recorded.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f8f7fa]">
      <div className="sticky top-0 z-10 h-1 bg-[#ece8ef]">
        <div className="h-full bg-[#4e8a68] transition-all duration-300" style={{ width: `${progress}%` }} />
      </div>

      <div className="mx-auto flex min-h-[calc(100vh-4px)] w-full max-w-[640px] flex-col px-6 pb-16 pt-12">
        <div className="mb-10">
          <div className="text-[30px] leading-none">{form.icon || "🧾"}</div>
          <h1 className="mt-4 text-[26px] font-semibold tracking-[-0.04em] sm:text-[30px]">
            {form.title.trim() || "Untitled form"}
          </h1>
          {form.description.trim() ? (
            <p className="mt-2 text-sm leading-6 text-[#847b89]">{form.description}</p>
          ) : null}
        </div>

        <div className="flex-1">
          {position.kind === "block" && current ? (
            <BlockInput
              block={current.block}
              error={fieldError}
              onChange={setAnswer}
              value={answers[current.block.id]}
            />
          ) : null}

          {position.kind === "review" ? (
            <ReviewAnswers blocks={form.blocks} answers={answers} onEdit={editFromReview} />
          ) : null}
        </div>

        <div className="mt-10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            {fieldError || submitError ? (
              <p aria-live="polite" className="text-xs font-medium text-[#b05f5f]">
                {fieldError || submitError}
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {history.length > 0 ? (
              <button
                className="flex h-9 items-center gap-1.5 rounded-md border border-[#eeeaf1] bg-white px-3 text-[13px] font-medium text-[#716b76] transition hover:bg-[#f7f5f8]"
                onClick={handleBack}
                type="button"
              >
                <FiArrowLeft className="size-3.5" /> Back
              </button>
            ) : null}
            {position.kind === "block" ? (
              <button
                className="flex h-9 items-center gap-2 rounded-md bg-[#291b32] px-5 text-[13px] font-medium text-white transition hover:bg-[#3a2547]"
                onClick={handleContinue}
                type="button"
              >
                Continue <FiArrowRight className="size-3.5" />
              </button>
            ) : (
              <button
                className="flex h-9 items-center gap-2 rounded-md bg-[#4e8a68] px-5 text-[13px] font-medium text-white transition hover:bg-[#3f7354] disabled:opacity-60"
                disabled={submitting}
                onClick={() => void handleSubmit()}
                type="button"
              >
                {submitting ? <FiLoader className="size-3.5 animate-spin" /> : <FiSend className="size-3.5" />}
                Submit response
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

/* -------------------------------- Block input ------------------------------ */

const CONTROL_CLASS =
  "w-full rounded-lg border border-[#e2d8ea] bg-white px-4 py-3 text-[15px] text-[#211d26] outline-none transition placeholder:text-[#cfc7d6] focus:border-[#4e8a68] focus:ring-2 focus:ring-[#4e8a68]/15";

function BlockInput({
  block,
  error,
  onChange,
  value,
}: {
  block: FormBlock;
  error: string;
  onChange: (blockId: string, value: string | string[]) => void;
  value: string | string[] | undefined;
}) {
  const multi = Array.isArray(value) ? value : [];

  function toggleMulti(optionId: string) {
    const next = multi.includes(optionId) ? multi.filter((id) => id !== optionId) : [...multi, optionId];
    onChange(block.id, next);
  }

  return (
    <div>
      <h2 className="text-[17px] font-semibold tracking-[-0.02em]">
        {block.label.trim() || "Untitled question"}
        {block.required ? <span className="ml-1 text-[#b05f5f]">*</span> : null}
      </h2>
      {block.description.trim() ? (
        <p className="mt-1 text-[13px] leading-5 text-[#847b89]">{block.description}</p>
      ) : null}

      <div className="mt-4">
        {block.type === "shortText" ? (
          <input
            aria-label={block.label}
            className={CONTROL_CLASS}
            onChange={(event) => onChange(block.id, event.target.value)}
            placeholder="Type your answer…"
            type="text"
            value={typeof value === "string" ? value : ""}
          />
        ) : null}
        {block.type === "longText" ? (
          <textarea
            aria-label={block.label}
            className={cn(CONTROL_CLASS, "min-h-[120px] resize-y")}
            onChange={(event) => onChange(block.id, event.target.value)}
            placeholder="Type your answer…"
            rows={4}
            value={typeof value === "string" ? value : ""}
          />
        ) : null}
        {block.type === "email" ? (
          <input
            aria-label={block.label}
            className={CONTROL_CLASS}
            onChange={(event) => onChange(block.id, event.target.value)}
            placeholder="name@example.com"
            type="email"
            value={typeof value === "string" ? value : ""}
          />
        ) : null}
        {block.type === "number" ? (
          <input
            aria-label={block.label}
            className={CONTROL_CLASS}
            onChange={(event) => onChange(block.id, event.target.value)}
            placeholder="0"
            type="number"
            value={typeof value === "string" ? value : ""}
          />
        ) : null}
        {block.type === "date" ? (
          <DateTimePicker
            ariaLabel={block.label}
            className="h-auto rounded-lg border-[#e2d8ea] px-4 py-3 text-[15px] text-[#211d26] hover:bg-white focus:border-[#4e8a68] focus:ring-2 focus:ring-[#4e8a68]/15"
            onChange={(next) => onChange(block.id, next)}
            placeholder="Pick a date"
            value={typeof value === "string" ? value : ""}
          />
        ) : null}

        {block.type === "select" ? (
          <div className="space-y-2" role="radiogroup">
            {block.options.map((option) => (
              <button
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-[14px] transition",
                  value === option.id
                    ? "border-[#4e8a68] bg-[#eaf6ef] text-[#2e5a41]"
                    : "border-[#e2d8ea] bg-white text-[#3e3543] hover:border-[#c9b8d6]",
                )}
                key={option.id}
                onClick={() => onChange(block.id, option.id)}
                role="radio"
                type="button"
                aria-checked={value === option.id}
              >
                <span
                  className={cn(
                    "grid size-4 shrink-0 place-items-center rounded-full border",
                    value === option.id ? "border-[#4e8a68]" : "border-[#d5cdd9]",
                  )}
                >
                  {value === option.id ? <span className="size-2 rounded-full bg-[#4e8a68]" /> : null}
                </span>
                {option.label}
              </button>
            ))}
          </div>
        ) : null}

        {block.type === "multiSelect" ? (
          <div className="space-y-2">
            {block.options.map((option) => {
              const checked = multi.includes(option.id);
              return (
                <button
                  aria-checked={checked}
                  aria-label={option.label}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg border px-4 py-3 text-left text-[14px] transition",
                    checked
                      ? "border-[#4e8a68] bg-[#eaf6ef] text-[#2e5a41]"
                      : "border-[#e2d8ea] bg-white text-[#3e3543] hover:border-[#c9b8d6]",
                  )}
                  key={option.id}
                  onClick={() => toggleMulti(option.id)}
                  role="checkbox"
                  type="button"
                >
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded border",
                      checked ? "border-[#4e8a68] bg-[#4e8a68] text-white" : "border-[#d5cdd9]",
                    )}
                  >
                    {checked ? <FiCheck className="size-3" /> : null}
                  </span>
                  {option.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {block.type === "file" ? (
          <FileInput
            filename={typeof value === "string" ? value : null}
            onUploaded={(filename) => onChange(block.id, filename)}
            onCleared={() => onChange(block.id, "")}
          />
        ) : null}
      </div>

      {error ? <p className="mt-3 text-xs font-medium text-[#b05f5f]">{error}</p> : null}
    </div>
  );
}

/* -------------------------------- File input ------------------------------- */

function FileInput({
  filename,
  onCleared,
  onUploaded,
}: {
  filename: string | null;
  onCleared: () => void;
  onUploaded: (filename: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  async function handlePick(file: File) {
    setUploading(true);
    setUploadError("");
    try {
      const upload = await api<{ filename: string; url: string }>("/api/public/forms/upload-url", {
        body: JSON.stringify({ filename: file.name }),
        method: "POST",
      });
      const response = await fetch(upload.url, {
        body: file,
        method: "PUT",
      });
      if (!response.ok) {
        throw new Error("Upload failed");
      }
      onUploaded(upload.filename);
    } catch {
      setUploadError("The upload failed. Please try again.");
    }
    setUploading(false);
  }

  if (filename) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-lg border border-[#cfe6d8] bg-[#eaf6ef] px-4 py-3">
        <span className="flex min-w-0 items-center gap-2 text-[13px] text-[#2e5a41]">
          <FiCheck className="size-4 shrink-0" />
          <span className="truncate">{filename}</span>
        </span>
        <button
          aria-label="Remove file"
          className="grid size-7 shrink-0 place-items-center rounded-md text-[#4e8a68] transition hover:bg-white hover:text-[#b05f5f]"
          onClick={onCleared}
          type="button"
        >
          <FiTrash2 className="size-3.5" />
        </button>
      </div>
    );
  }

  return (
    <div>
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-[#c9d9cf] bg-white px-4 py-8 text-center transition hover:border-[#4e8a68] hover:bg-[#f5faf7]">
        {uploading ? (
          <>
            <FiLoader aria-hidden className="size-5 animate-spin text-[#4e8a68]" />
            <span className="text-[13px] font-medium text-[#4e8a68]">Uploading…</span>
          </>
        ) : (
          <>
            <FiUploadCloud aria-hidden className="size-5 text-[#4e8a68]" />
            <span className="text-[13px] font-medium text-[#3e3543]">Choose a file to upload</span>
            <span className="text-[11px] text-[#8c838f]">Click to pick a file from your device</span>
          </>
        )}
        <input
          className="sr-only"
          disabled={uploading}
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (file) void handlePick(file);
          }}
          type="file"
        />
      </label>
      {uploadError ? <p className="mt-2 text-xs font-medium text-[#b05f5f]">{uploadError}</p> : null}
    </div>
  );
}

/* ------------------------------- Review screen ----------------------------- */

function ReviewAnswers({
  answers,
  blocks,
  onEdit,
}: {
  answers: SubmissionAnswers;
  blocks: FormBlock[];
  onEdit: (index: number) => void;
}) {
  const entries = blocks
    .map((block, index) => ({ block, index, value: answers[block.id] }))
    .filter((entry) => entry.block.type !== "paragraph" && isAnswered(entry.value));

  if (entries.length === 0) {
    return (
      <div className="rounded-lg border border-[#eeeaf1] bg-white p-6 text-center">
        <p className="text-sm text-[#847b89]">Nothing to review — submit your response below.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-[#eeeaf1] bg-white p-5">
      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#a49ba9]">Review your answers</p>
      <dl className="space-y-3">
        {entries.map(({ block, index, value }) => (
          <div className="flex items-start justify-between gap-3" key={block.id}>
            <div className="min-w-0">
              <dt className="text-xs font-medium text-[#8c838f]">{block.label.trim() || "Untitled question"}</dt>
              <dd className="mt-0.5 break-words text-[14px] text-[#211d26]">{formatAnswer(block, value)}</dd>
            </div>
            <button
              className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-[#78538c] transition hover:bg-[#f3eef7]"
              onClick={() => onEdit(index)}
              type="button"
            >
              Edit
            </button>
          </div>
        ))}
      </dl>
    </div>
  );
}