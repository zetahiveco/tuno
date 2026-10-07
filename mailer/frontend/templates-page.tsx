import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import { formatDistanceToNow } from "date-fns";
import { FiArrowLeft, FiCheck, FiEdit3, FiEye, FiLayers, FiLoader, FiPlus, FiSend, FiTrash2, FiX } from "react-icons/fi";
import { useConfirm } from "@/components/confirm-alert";
import { api, ApiRequestError } from "@/lib/api-client";
import { AppPageFrame } from "@/general/frontend/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "cn";
import { emailSchema } from "@/mailer/frontend/email-blocknote";
import {
  defaultTemplateBlocks,
  extractVariables,
  parseTemplateBlocks,
  renderEmailHtml,
  type EmailBlock,
  type InterpolationValues,
} from "@/mailer/shared/template-blocks";

export type TemplateSummary = {
  id: string;
  name: string;
  subject: string;
  createdAt: string;
  updatedAt: string;
};

type LoadedTemplate = {
  id: string;
  name: string;
  subject: string;
  blocks: string;
};

const SAMPLE_VALUES: Record<string, string> = {
  email: "jordan@example.com",
  name: "Jordan",
};

/** Placeholder unsubscribe link shown in previews; replaced per recipient at send time. */
const SAMPLE_UNSUBSCRIBE_URL = "https://example.com/unsubscribe";

/* ------------------------------- Template list ------------------------------ */

export function TemplatesHomePage() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const { confirm, element: confirmElement } = useConfirm();

  const loadTemplates = useCallback(async () => {
    setError("");
    try {
      const result = await api<{ templates: TemplateSummary[] }>("/api/mailer/templates");
      setTemplates(result.templates);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your templates.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  async function createTemplate() {
    setCreating(true);
    try {
      const result = await api<{ template: TemplateSummary }>("/api/mailer/templates", { method: "POST" });
      navigate(`/mailer/templates/${result.template.id}`);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Could not create the template.");
    }
    setCreating(false);
  }

  async function deleteTemplate(template: TemplateSummary) {
    const confirmed = await confirm({
      title: `Delete "${template.name || "Untitled template"}"?`,
      description: "This permanently removes the template. Campaigns that already sent keep their history. This action cannot be undone.",
    });
    if (!confirmed) return;
    setDeletingId(template.id);
    try {
      await api(`/api/mailer/templates/${template.id}`, { method: "DELETE" });
      setTemplates((current) => current.filter((entry) => entry.id !== template.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the template.");
    }
    setDeletingId(null);
  }

  return (
    <AppPageFrame
      action={(
        <Button className="bg-[#7a4fa3] hover:bg-[#6a4290]" disabled={creating} onClick={() => void createTemplate()}>
          {creating ? <FiLoader className="size-4 animate-spin" /> : <FiPlus className="size-4" />}
          New template
        </Button>
      )}
      description="Block-based email templates for every send."
      title="Templates"
    >
      {confirmElement}
      <p className="mb-5 text-xs text-[#847b89]">
        {loading ? "Loading templates…" : `${templates.length} template${templates.length === 1 ? "" : "s"}`}
      </p>

      {error ? <p className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p> : null}

      {loading ? null : templates.length === 0 ? (
        <div className="max-w-xl border border-[#eeeaf1] bg-white p-10 text-center">
          <FiLayers className="mx-auto size-7 text-[#b5abbe]" />
          <p className="mt-3 text-sm font-medium">No templates yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#847b89]">
            Templates are built in a block editor — headings, text, buttons, dividers, spacers — with <code className="rounded bg-[#f4f2f6] px-1">{"{{ email }}"}</code> style variables filled in per contact when you send.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((template) => (
            <div key={template.id} className="group flex flex-col border border-[#eeeaf1] bg-white transition hover:border-[#d8cfe4]">
              <Link className="flex-1 p-5" to={`/mailer/templates/${template.id}`}>
                <p className="truncate text-sm font-semibold tracking-[-0.02em]">{template.name || "Untitled template"}</p>
                <p className="mt-1 line-clamp-1 text-xs text-[#847b89]">{template.subject || "No subject yet"}</p>
                <div className="mt-4 flex items-center gap-2">
                  <Badge variant="secondary" className="bg-[#f5f3f6] px-2 py-0.5 text-[10px] font-medium text-[#8c838f]">
                    Updated {formatDistanceToNow(new Date(template.updatedAt), { addSuffix: true })}
                  </Badge>
                </div>
              </Link>
              <div className="flex items-center justify-end border-t border-[#f0edf3] px-3 py-2 opacity-0 transition group-hover:opacity-100">
                <button
                  className="rounded p-1.5 text-[#8c838f] hover:bg-red-50 hover:text-red-600"
                  disabled={deletingId === template.id}
                  onClick={() => void deleteTemplate(template)}
                  title="Delete template"
                  type="button"
                >
                  <FiTrash2 className="size-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </AppPageFrame>
  );
}

/* ------------------------------- Block editor ------------------------------- */

type SaveState = "idle" | "pending" | "saving" | "saved" | "error";

export function TemplateEditorPage() {
  const { templateId } = useParams<{ templateId: string }>();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<LoadedTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await api<{ template: { id: string; name: string; subject: string; blocks: string } }>(`/api/mailer/templates/${templateId}`);
        if (cancelled) return;
        setTemplate({ id: result.template.id, name: result.template.name, subject: result.template.subject, blocks: result.template.blocks });
      } catch (error) {
        if (!cancelled) setLoadError(error instanceof ApiRequestError && error.status === 404 ? "This template no longer exists." : error instanceof Error ? error.message : "Could not load the template.");
      }
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  if (loading) {
    return <main className="grid h-full place-items-center text-xs text-[#928995]">Opening template…</main>;
  }
  if (loadError || !template) {
    return (
      <AppPageFrame description="Template" title="Not found">
        <p className="text-sm text-[#847b89]">{loadError}</p>
        <Button className="mt-4 bg-[#7a4fa3] hover:bg-[#6a4290]" onClick={() => navigate("/mailer/templates")}>
          <FiArrowLeft className="size-4" />
          Back to templates
        </Button>
      </AppPageFrame>
    );
  }

  return <TemplateEditor template={template} />;
}

function TemplateEditor({ template }: { template: LoadedTemplate }) {
  const navigate = useNavigate();
  const [name, setName] = useState(template.name);
  const [subject, setSubject] = useState(template.subject);
  const [blocks, setBlocks] = useState<EmailBlock[]>(() => {
    const parsed = parseTemplateBlocks(template.blocks);
    return parsed.length ? parsed : defaultTemplateBlocks();
  });
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState("");
  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [footerText, setFooterText] = useState("");

  useEffect(() => {
    let cancelled = false;
    api<{ footerText: string }>("/api/mailer/settings")
      .then((result) => {
        if (!cancelled) setFooterText(result.footerText);
      })
      .catch(() => {
        /* preview falls back to the default footer */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nameRef = useRef(name);
  const subjectRef = useRef(subject);
  nameRef.current = name;
  subjectRef.current = subject;

  const editor = useCreateBlockNote({
    schema: emailSchema as any,
    initialContent: blocks as any,
  });

  const save = useCallback(
    async (next: { name: string; subject: string; blocks: EmailBlock[] }) => {
      setSaveState("saving");
      setSaveError("");
      try {
        await api(`/api/mailer/templates/${template.id}`, {
          body: JSON.stringify(next),
          method: "PATCH",
        });
        setSaveState("saved");
      } catch (error) {
        setSaveState("error");
        setSaveError(error instanceof Error ? error.message : "Could not save the template.");
      }
    },
    [template.id],
  );

  const scheduleSave = useCallback(() => {
    setSaveState("pending");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void save({ name: nameRef.current, subject: subjectRef.current, blocks: editor.document as unknown as EmailBlock[] });
    }, 600);
  }, [editor, save]);

  useEffect(() => () => {
    if (saveTimer.current !== null) clearTimeout(saveTimer.current);
  }, []);

  const variables = useMemo(() => {
    const found = new Set<string>(["email", "name"]);
    for (const value of extractVariables(JSON.stringify(blocks))) found.add(value);
    for (const value of extractVariables(subject)) found.add(value);
    return [...found];
  }, [blocks, subject]);

  const previewValues: InterpolationValues = useMemo(() => {
    const values: Record<string, string> = { ...SAMPLE_VALUES };
    for (const key of variables) values[key] ??= `«${key}»`;
    return values;
  }, [variables]);

  const previewHtml = useMemo(
    () =>
      renderEmailHtml({
        blocks,
        values: previewValues,
        footerText: footerText || undefined,
        // The real per-recipient unsubscribe link is signed and injected at send
        // time; the preview just shows where it will appear in the footer.
        unsubscribeUrl: SAMPLE_UNSUBSCRIBE_URL,
      }),
    [blocks, previewValues, footerText],
  );

  function updateBlocks() {
    setBlocks(editor.document as unknown as EmailBlock[]);
    scheduleSave();
  }

  async function sendTest() {
    setTesting(true);
    setTestMessage(null);
    try {
      await api(`/api/mailer/templates/${template.id}/test`, {
        body: JSON.stringify({ to: testEmail }),
        method: "POST",
      });
      setTestMessage({ ok: true, text: `Test email sent to ${testEmail}.` });
    } catch (error) {
      setTestMessage({ ok: false, text: error instanceof Error ? error.message : "Could not send the test email." });
    }
    setTesting(false);
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-[#eeeaf1] bg-white px-5 py-3 sm:px-8">
        <Button className="h-8 border-[#e8e4ee] bg-white px-3 text-[#5f5568] shadow-none hover:bg-[#f7f5f8]" onClick={() => navigate("/mailer/templates")} size="sm" variant="outline">
          <FiArrowLeft className="size-3.5" />
          Templates
        </Button>
        <Input
          className="h-8 w-48 border-transparent bg-transparent text-sm font-semibold shadow-none focus-visible:border-[#e8e4ee] focus-visible:bg-white"
          onChange={(event) => {
            setName(event.target.value);
            scheduleSave();
          }}
          placeholder="Template name"
          value={name}
        />
        <Tabs className="ml-auto" onValueChange={(value) => setMode(value as "edit" | "preview")} value={mode}>
          <TabsList className="h-8">
            <TabsTrigger className="text-xs" value="edit">
              <FiEdit3 className="size-3.5" />
              Edit
            </TabsTrigger>
            <TabsTrigger className="text-xs" value="preview">
              <FiEye className="size-3.5" />
              Preview
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2">
          {saveState === "pending" ? <span className="text-xs text-[#a49ba9]">Unsaved changes</span> : null}
          {saveState === "saving" ? <span className="flex items-center gap-1.5 text-xs text-[#8c838f]"><FiLoader className="size-3 animate-spin" /> Saving…</span> : null}
          {saveState === "saved" ? <span className="flex items-center gap-1.5 text-xs text-[#3d8a55]"><FiCheck className="size-3" /> Saved</span> : null}
          {saveState === "error" ? <span className="flex items-center gap-1.5 text-xs text-red-600"><FiX className="size-3" /> {saveError}</span> : null}
          <TestSendButton email={testEmail} message={testMessage} onEmailChange={setTestEmail} onSend={() => void sendTest()} testing={testing} />
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto px-5 py-6 sm:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="mb-4 border border-[#eeeaf1] bg-white p-4">
            <label className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a49ba9]">Subject</label>
            <Input
              className="mt-1.5 border-[#e8e4ee]"
              onChange={(event) => {
                setSubject(event.target.value);
                scheduleSave();
              }}
              placeholder="Your subject — try Hi {{ name }}, …"
              value={subject}
            />
            <p className="mt-2 text-[11px] text-[#a49ba9]">
              Variables available: {variables.map((key) => (
                <code className="mr-1.5 rounded bg-[#f4f2f6] px-1.5 py-0.5 text-[10px] text-[#7a4fa3]" key={key}>{`{{ ${key} }}`}</code>
              ))}
            </p>
          </div>

          {mode === "preview" ? (
            <iframe
              className="min-h-[640px] w-full rounded-lg border border-[#eeeaf1] bg-white"
              sandbox=""
              srcDoc={previewHtml}
              title="Template preview"
            />
          ) : (
            <div className="email-editor border border-[#eeeaf1] bg-white p-4">
              <BlockNoteView editor={editor} onChange={() => updateBlocks()} theme="light" />
              <p className="mt-3 border-t border-[#f0edf3] pt-3 text-[11px] text-[#a49ba9]">
                Tip: press <code className="rounded bg-[#f4f2f6] px-1 text-[#7a4fa3]">/</code> to insert blocks — including the custom <strong>Button</strong> and <strong>Spacer</strong> blocks. Use {'{{ email }}'} or {'{{ name }}'} to personalize.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TestSendButton({
  email,
  message,
  onEmailChange,
  onSend,
  testing,
}: {
  email: string;
  message: { ok: boolean; text: string } | null;
  onEmailChange: (value: string) => void;
  onSend: () => void;
  testing: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <Button
        className="h-8 bg-[#7a4fa3] px-3 hover:bg-[#6a4290]"
        onClick={(event) => {
          event.preventDefault();
          setOpen(true);
        }}
        size="sm"
      >
        <FiSend className="size-3.5" />
        Send test
      </Button>
      <DialogContent className="max-w-sm border-[#eeeaf1]">
        <DialogHeader>
          <DialogTitle className="text-base">Send a test email</DialogTitle>
          <DialogDescription>Renders this template with sample values for {'{{ email }}'} and {'{{ name }}'}.</DialogDescription>
        </DialogHeader>
        <Input
          className="border-[#e8e4ee]"
          onChange={(event) => onEmailChange(event.target.value)}
          placeholder="you@example.com"
          type="email"
          value={email}
        />
        {message ? <p className={cn("text-xs", message.ok ? "text-[#3d8a55]" : "text-red-600")}>{message.text}</p> : null}
        <DialogFooter>
          <Button className="bg-[#7a4fa3] hover:bg-[#6a4290]" disabled={testing || !email} onClick={onSend}>
            {testing ? <FiLoader className="size-4 animate-spin" /> : <FiSend className="size-4" />}
            Send test
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
