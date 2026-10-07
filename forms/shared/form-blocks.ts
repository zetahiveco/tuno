import { z } from "zod";

/* --------------------------------- Types ---------------------------------- */

export const FORM_BLOCK_TYPES = [
  "paragraph",
  "shortText",
  "longText",
  "email",
  "number",
  "date",
  "select",
  "multiSelect",
  "file",
] as const;

export type FormBlockType = (typeof FORM_BLOCK_TYPES)[number];

/** What happens after this option is chosen. */
export type SkipAction = "next" | "jump" | "end";

export type FormBlockOption = {
  id: string;
  label: string;
  skip: SkipAction;
  jumpTarget: string | null;
};

export type FormBlock = {
  id: string;
  type: FormBlockType;
  label: string;
  description: string;
  required: boolean;
  options: FormBlockOption[];
};

/** blockId -> answer: string (text/date/option id/file name) or string[] (multiSelect). */
export type SubmissionAnswers = Record<string, string | string[]>;

export const CHOICE_TYPES: FormBlockType[] = ["select", "multiSelect"];

export const INPUT_TYPES: FormBlockType[] = [
  "shortText",
  "longText",
  "email",
  "number",
  "date",
  "select",
  "multiSelect",
  "file",
];

export const BLOCK_TYPE_META: Record<FormBlockType, { label: string; hint: string; icon: string }> = {
  paragraph: { label: "Text", hint: "Share context or instructions", icon: "¶" },
  shortText: { label: "Short text", hint: "One-line free text answer", icon: "Aa" },
  longText: { label: "Long text", hint: "Multi-line free text answer", icon: "¶Aa" },
  email: { label: "Email", hint: "Collect an email address", icon: "@" },
  number: { label: "Number", hint: "Collect a numeric value", icon: "123" },
  date: { label: "Date", hint: "Pick a date", icon: "📅" },
  select: { label: "Single choice", hint: "Pick exactly one option", icon: "◉" },
  multiSelect: { label: "Multi choice", hint: "Pick any number of options", icon: "☑" },
  file: { label: "File upload", hint: "Respondents upload one file", icon: "📎" },
};

/* ------------------------------- Zod schemas ------------------------------- */

export const formBlockOptionSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(300),
  skip: z.enum(["next", "jump", "end"]).default("next"),
  jumpTarget: z.string().max(64).nullable().default(null),
});

export const formBlockSchema = z.object({
  id: z.string().min(1).max(64),
  type: z.enum(FORM_BLOCK_TYPES),
  label: z.string().max(500).default(""),
  description: z.string().max(1_000).default(""),
  required: z.boolean().default(false),
  options: z.array(formBlockOptionSchema).max(50).default([]),
});

export const formBlocksSchema = z.array(formBlockSchema).max(200);

/* ------------------------------ Skip logic -------------------------------- */

function optionById(block: FormBlock, optionId: unknown) {
  if (typeof optionId !== "string") return null;
  return block.options.find((option) => option.id === optionId) ?? null;
}

/**
 * Given the answer recorded for the block at `index`, decide where the flow goes
 * next: the following block's index, a jumped-to block's index, or "end".
 * Jumps are forward-only, so the flow always terminates.
 */
export function nextStep(blocks: FormBlock[], index: number, answers: SubmissionAnswers): number | "end" {
  const block = blocks[index];
  if (!block) return "end";

  if (block.type === "select") {
    const chosen = optionById(block, answers[block.id]);
    if (chosen?.skip === "end") return "end";
    if (chosen?.skip === "jump" && chosen.jumpTarget) {
      const target = blocks.findIndex((candidate) => candidate.id === chosen.jumpTarget);
      if (target > index) return target;
    }
  }

  if (block.type === "multiSelect" && Array.isArray(answers[block.id])) {
    const selectedIds = answers[block.id] as string[];
    // First selected option with explicit logic wins; order follows the option list.
    const chosen = block.options.find((option) => selectedIds.includes(option.id) && option.skip !== "next");
    if (chosen?.skip === "end") return "end";
    if (chosen?.skip === "jump" && chosen.jumpTarget) {
      const target = blocks.findIndex((candidate) => candidate.id === chosen.jumpTarget);
      if (target > index) return target;
    }
  }

  return index + 1 < blocks.length ? index + 1 : "end";
}

/* -------------------------- Submission validation -------------------------- */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FILE_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,299}$/;

type AnswerCheck = { ok: true; value: string | string[] | null } | { ok: false; error: string };

function checkAnswer(block: FormBlock, raw: unknown): AnswerCheck {
  const isEmpty =
    raw === undefined ||
    raw === null ||
    raw === "" ||
    (Array.isArray(raw) && raw.length === 0);

  if (isEmpty) {
    return block.required ? { ok: false, error: `"${block.label || "This question"}" is required.` } : { ok: true, value: null };
  }

  switch (block.type) {
    case "paragraph":
      return { ok: true, value: null };

    case "shortText":
    case "longText": {
      if (typeof raw !== "string" || raw.length > 5_000) {
        return { ok: false, error: `"${block.label || "This question"}" has an invalid answer.` };
      }
      return { ok: true, value: raw };
    }

    case "email": {
      if (typeof raw !== "string" || raw.length > 320 || !EMAIL_PATTERN.test(raw)) {
        return { ok: false, error: `"${block.label || "This question"}" needs a valid email address.` };
      }
      return { ok: true, value: raw };
    }

    case "number": {
      if (typeof raw !== "string" || raw.length > 40 || !Number.isFinite(Number(raw))) {
        return { ok: false, error: `"${block.label || "This question"}" needs a number.` };
      }
      return { ok: true, value: raw };
    }

    case "date": {
      if (typeof raw !== "string" || raw.length > 40 || Number.isNaN(Date.parse(raw))) {
        return { ok: false, error: `"${block.label || "This question"}" needs a valid date.` };
      }
      return { ok: true, value: raw };
    }

    case "select": {
      const chosen = optionById(block, raw);
      if (!chosen) {
        return { ok: false, error: `"${block.label || "This question"}" has an invalid choice.` };
      }
      return { ok: true, value: chosen.id };
    }

    case "multiSelect": {
      if (!Array.isArray(raw) || raw.some((item) => !optionById(block, item))) {
        return { ok: false, error: `"${block.label || "This question"}" has an invalid choice.` };
      }
      return { ok: true, value: [...new Set(raw as string[])] };
    }

    case "file": {
      if (typeof raw !== "string" || !FILE_NAME_PATTERN.test(raw)) {
        return { ok: false, error: `"${block.label || "This question"}" has an invalid file.` };
      }
      return { ok: true, value: raw };
    }

    default:
      return { ok: false, error: "Unsupported question type." };
  }
}

export type SubmissionValidation =
  | { ok: true; answers: SubmissionAnswers }
  | { ok: false; error: string };

/**
 * Validates a respondent's answers by walking the form the same way the
 * public form does — including skip logic — so only reachable questions
 * are enforced.
 */
export function validateSubmission(blocks: FormBlock[], raw: unknown): SubmissionValidation {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: "Invalid submission payload." };
  }

  const incoming = raw as Record<string, unknown>;
  const cleaned: SubmissionAnswers = {};
  let index: number | "end" = blocks.length > 0 ? 0 : "end";
  // Forward-only jumps guarantee termination; the cap is pure belt-and-braces.
  let steps = 0;
  const maxSteps = blocks.length + 1;

  while (index !== "end" && steps < maxSteps) {
    steps += 1;
    const block = blocks[index];
    if (!block) break;
    const check = checkAnswer(block, incoming[block.id]);
    if (!check.ok) return { ok: false, error: check.error };
    if (check.value !== null) cleaned[block.id] = check.value;
    index = nextStep(blocks, index, cleaned);
  }

  return { ok: true, answers: cleaned };
}

/** Parse the stored JSON `blocks` column into typed blocks. */
export function parseFormBlocks(content: string): FormBlock[] {
  try {
    const parsed: unknown = JSON.parse(content);
    const result = formBlocksSchema.safeParse(parsed);
    if (result.success) return result.data as FormBlock[];
  } catch {
    // Fall through to an empty form.
  }
  return [];
}

export function serializeFormBlocks(blocks: FormBlock[]): string {
  return JSON.stringify(blocks);
}