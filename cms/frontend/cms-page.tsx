import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, NavLink, useNavigate, useParams } from "react-router-dom";
import { useCreateBlockNote } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/shadcn";
import type { PartialBlock } from "@blocknote/core";
import {
  FiArrowLeft,
  FiArrowRight,
  FiCheck,
  FiCode,
  FiDatabase,
  FiEdit2,
  FiFileText,
  FiGlobe,
  FiLayers,
  FiLoader,
  FiPlus,
  FiTrash2,
} from "react-icons/fi";
import { useConfirm } from "@/components/confirm-alert";
import { api } from "@/lib/api-client";
import { AppShell } from "@/general/frontend/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DateTimePicker } from "@/components/ui/date-time-picker";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const FIELD_TYPES = [
  { value: "text", label: "Short text" },
  { value: "longtext", label: "Long text" },
  { value: "richtext", label: "Rich text (block editor)" },
  { value: "number", label: "Number" },
  { value: "boolean", label: "Boolean" },
  { value: "date", label: "Date" },
  { value: "select", label: "Select" },
] as const;

type FieldType = (typeof FIELD_TYPES)[number]["value"];

export type CmsCollection = {
  id: string;
  name: string;
  apiId: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  _count?: { entries: number };
};

export type CmsField = {
  id: string;
  collectionId: string;
  name: string;
  apiId: string;
  type: FieldType;
  options: string;
  required: boolean;
  position: number;
};

export type CmsEntry = {
  id: string;
  collectionId: string;
  data: string;
  published: boolean;
  createdAt: string;
  updatedAt: string;
};

type EntryData = Record<string, unknown>;

const COLLECTIONS_REFRESH_EVENT = "tuno:cms-collections-updated";

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

/* ------------------------------- Collections hook -------------------------- */

function useCollections() {
  const [collections, setCollections] = useState<CmsCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await api<{ collections: CmsCollection[] }>("/api/cms/collections");
      setCollections(result.collections);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load collections.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
    const refresh = () => void load();
    window.addEventListener(COLLECTIONS_REFRESH_EVENT, refresh);
    return () => window.removeEventListener(COLLECTIONS_REFRESH_EVENT, refresh);
  }, [load]);

  return { collections, loading, error, reload: load, setCollections };
}

/* --------------------------------- Layout ---------------------------------- */

export function CmsLayout() {
  const { collections, loading, error } = useCollections();

  return (
    <AppShell accent="bg-[#f4ecfb] text-[#8957a5]" appName="CMS" icon={FiDatabase}>
      <div className="mb-2 flex items-center justify-between px-3">
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#a49ba9]">Collections</span>
        <Link className="p-1 text-[#8957a5] hover:text-[#493254]" to="/cms" title="Manage collections">
          <FiPlus className="size-4" />
        </Link>
      </div>
      {loading ? (
        <p className="px-3 py-2 text-xs text-[#928995]">Loading…</p>
      ) : error ? (
        <p className="px-3 py-2 text-xs text-red-700">{error}</p>
      ) : collections.length === 0 ? (
        <p className="px-3 py-2 text-xs leading-5 text-[#968d9a]">No collections yet. Create one to start adding content.</p>
      ) : (
        <nav className="space-y-0.5">
          {collections.map((collection) => (
            <NavLink
              className={({ isActive }) =>
                `flex h-9 items-center gap-2.5 rounded-md px-3 text-[13px] font-medium transition ${
                  isActive ? "bg-[#f3eef7] text-[#4f3262]" : "text-[#716b76] hover:bg-[#f7f5f8]"
                }`
              }
              end
              key={collection.id}
              to={`/cms/${collection.id}`}
            >
              <FiLayers className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{collection.name}</span>
              <span className="shrink-0 text-[10px] text-[#a49ba9]">{collection._count?.entries ?? 0}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </AppShell>
  );
}

/* ------------------------------ Collections page --------------------------- */

export function CmsCollectionsHomePage() {
  const { collections, loading, error, setCollections } = useCollections();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [createError, setCreateError] = useState("");
  const [busy, setBusy] = useState(false);
  const { confirm, element: confirmElement } = useConfirm();

  async function createCollection() {
    if (!name.trim()) {
      setCreateError("Give the collection a name.");
      return;
    }
    setBusy(true);
    setCreateError("");
    try {
      const result = await api<{ collection: CmsCollection }>("/api/cms/collections", {
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
        method: "POST",
      });
      setCollections((current) => [result.collection, ...current]);
      window.dispatchEvent(new Event(COLLECTIONS_REFRESH_EVENT));
      setCreating(false);
      setName("");
      setDescription("");
    } catch (createFailure) {
      setCreateError(createFailure instanceof Error ? createFailure.message : "Could not create the collection.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteCollection(collection: CmsCollection) {
    const confirmed = await confirm({
      title: `Delete "${collection.name}"?`,
      description: "This permanently removes the collection, its fields, and every entry in it. This action cannot be undone.",
    });
    if (!confirmed) return;
    try {
      await api(`/api/cms/collections/${collection.id}`, { method: "DELETE" });
      setCollections((current) => current.filter((entry) => entry.id !== collection.id));
      window.dispatchEvent(new Event(COLLECTIONS_REFRESH_EVENT));
    } catch {
      // Ignore
    }
  }

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8">
      {confirmElement}
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-[28px] font-semibold tracking-[-0.05em]">Content Collections</h1>
          <p className="mt-1.5 text-sm text-[#847b89]">
            Model your content like Strapi — each collection gets a REST API your apps and websites can consume.
          </p>
        </div>
        <Button className="bg-[#291b32]" onClick={() => setCreating(true)}>
          <FiPlus className="size-4" /> New collection
        </Button>
      </div>

      {error && <p className="mb-4 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}

      {loading ? (
        <p className="text-xs text-[#928995]">Loading collections…</p>
      ) : collections.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e3dce8] bg-white p-12 text-center">
          <FiDatabase className="mx-auto size-8 text-[#c4b6cf]" />
          <p className="mt-4 text-sm font-semibold">No collections yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#847b89]">
            Create a collection (like “Articles” or “Products”), define its fields, and start adding items.
          </p>
          <Button className="mt-5 bg-[#291b32]" onClick={() => setCreating(true)}>
            <FiPlus className="size-4" /> Create collection
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {collections.map((collection) => (
            <div className="rounded-xl border border-[#eeeaf1] bg-white p-5 shadow-none" key={collection.id}>
              <div className="flex items-start justify-between gap-3">
                <Link className="group min-w-0 flex-1" to={`/cms/${collection.id}`}>
                  <div className="flex items-center gap-2.5">
                    <div className="grid size-9 place-items-center bg-[#f2eafa] text-[#78538c]">
                      <FiLayers className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold group-hover:underline">{collection.name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-[#968d9a]">apiId: {collection.apiId}</p>
                    </div>
                  </div>
                  {collection.description && <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#847b89]">{collection.description}</p>}
                </Link>
                <Button
                  aria-label={`Delete ${collection.name}`}
                  className="size-8 shrink-0 p-0 text-[#a49ba9] hover:bg-red-50 hover:text-red-700"
                  onClick={() => void deleteCollection(collection)}
                  size="sm"
                  variant="ghost"
                >
                  <FiTrash2 className="size-4" />
                </Button>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <Badge className="bg-[#f4f1f6] text-[10px] text-[#6f6078]" variant="secondary">
                  {collection._count?.entries ?? 0} items
                </Badge>
                <Link className="text-xs font-medium text-[#755984] hover:text-[#493254]" to={`/cms/${collection.id}`}>
                  Open <FiArrowRight className="ml-0.5 inline size-3" />
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog onOpenChange={setCreating} open={creating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New collection</DialogTitle>
            <DialogDescription>Collections group content items and expose them over the CMS API.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Label className="block space-y-2 text-xs font-medium">
              Name
              <Input maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Articles" value={name} />
            </Label>
            <Label className="block space-y-2 text-xs font-medium">
              Description
              <Textarea onChange={(event) => setDescription(event.target.value)} placeholder="What lives in this collection?" rows={2} value={description} />
            </Label>
            {createError && <p className="text-xs text-red-700">{createError}</p>}
          </div>
          <DialogFooter>
            <Button disabled={busy} onClick={() => setCreating(false)} variant="outline">
              Cancel
            </Button>
            <Button className="bg-[#291b32]" disabled={busy} onClick={() => void createCollection()}>
              {busy ? <FiLoader className="size-4 animate-spin" /> : <FiPlus className="size-4" />} Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------- Entries page ------------------------------ */

function fieldLabel(type: FieldType): string {
  return FIELD_TYPES.find((entry) => entry.value === type)?.label ?? type;
}

function previewValue(entry: CmsEntry, field: CmsField): string {
  const data = parseJson<EntryData>(entry.data, {});
  const raw = data[field.apiId];
  if (field.type === "richtext") {
    const blocks = typeof raw === "string" ? parseJson<unknown[]>(raw, []) : raw;
    return Array.isArray(blocks) && blocks.length > 0 ? `${blocks.length} blocks` : "—";
  }
  if (field.type === "boolean") return raw ? "Yes" : "No";
  if (raw === undefined || raw === null || raw === "") return "—";
  return String(raw).slice(0, 80);
}

export function CmsEntriesPage() {
  const { collectionId } = useParams();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<CmsCollection | null>(null);
  const [fields, setFields] = useState<CmsField[]>([]);
  const [entries, setEntries] = useState<CmsEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [fieldName, setFieldName] = useState("");
  const [fieldType, setFieldType] = useState<FieldType>("text");
  const [fieldRequired, setFieldRequired] = useState(false);
  const [fieldOptions, setFieldOptions] = useState("");
  const [fieldBusy, setFieldBusy] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const { confirm, element: confirmElement } = useConfirm();

  const load = useCallback(async () => {
    if (!collectionId) return;
    setLoading(true);
    setError("");
    try {
      const [collectionResult, fieldsResult, entriesResult] = await Promise.all([
        api<{ collection: CmsCollection }>(`/api/cms/collections/${collectionId}`),
        api<{ fields: CmsField[] }>(`/api/cms/collections/${collectionId}/fields`),
        api<{ entries: CmsEntry[] }>(`/api/cms/collections/${collectionId}/entries`),
      ]);
      setCollection(collectionResult.collection);
      setFields(fieldsResult.fields);
      setEntries(entriesResult.entries);
    } catch (loadFailure) {
      setError(loadFailure instanceof Error ? loadFailure.message : "Could not load this collection.");
    }
    setLoading(false);
  }, [collectionId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createEntry() {
    if (!collectionId) return;
    try {
      const result = await api<{ entry: CmsEntry }>(`/api/cms/collections/${collectionId}/entries`, {
        body: JSON.stringify({ data: {} }),
        method: "POST",
      });
      navigate(`/cms/${collectionId}/entries/${result.entry.id}`);
    } catch (createFailure) {
      setError(createFailure instanceof Error ? createFailure.message : "Could not create the item.");
    }
  }

  async function addField() {
    if (!collectionId) return;
    if (!fieldName.trim()) {
      setFieldError("Give the field a name.");
      return;
    }
    setFieldBusy(true);
    setFieldError("");
    try {
      const options = fieldType === "select"
        ? fieldOptions.split(",").map((option) => option.trim()).filter(Boolean)
        : undefined;
      const result = await api<{ field: CmsField }>(`/api/cms/collections/${collectionId}/fields`, {
        body: JSON.stringify({ name: fieldName.trim(), type: fieldType, required: fieldRequired, options }),
        method: "POST",
      });
      setFields((current) => [...current, result.field]);
      setAddFieldOpen(false);
      setFieldName("");
      setFieldType("text");
      setFieldRequired(false);
      setFieldOptions("");
    } catch (addFieldFailure) {
      setFieldError(addFieldFailure instanceof Error ? addFieldFailure.message : "Could not add the field.");
    } finally {
      setFieldBusy(false);
    }
  }

  async function removeField(field: CmsField) {
    const confirmed = await confirm({
      title: `Delete field "${field.name}"?`,
      description: "The column disappears from this collection. Stored values are kept. This action cannot be undone.",
    });
    if (!confirmed) return;
    try {
      await api(`/api/cms/fields/${field.id}`, { method: "DELETE" });
      setFields((current) => current.filter((entry) => entry.id !== field.id));
    } catch {
      // Ignore
    }
  }

  async function togglePublished(entry: CmsEntry) {
    try {
      const result = await api<{ entry: CmsEntry }>(`/api/cms/entries/${entry.id}`, {
        body: JSON.stringify({ published: !entry.published }),
        method: "PATCH",
      });
      setEntries((current) => current.map((item) => (item.id === entry.id ? result.entry : item)));
    } catch {
      // Ignore
    }
  }

  async function deleteEntry(entry: CmsEntry) {
    const confirmed = await confirm({
      title: "Delete this entry?",
      description: "This permanently removes the entry from the collection. This action cannot be undone.",
    });
    if (!confirmed) return;
    try {
      await api(`/api/cms/entries/${entry.id}`, { method: "DELETE" });
      setEntries((current) => current.filter((item) => item.id !== entry.id));
    } catch {
      // Ignore
    }
  }

  if (loading) {
    return <p className="px-8 py-10 text-xs text-[#928995]">Loading collection…</p>;
  }
  if (!collection) {
    return <p className="px-8 py-10 text-xs text-[#928995]">Collection not found.</p>;
  }

  return (
    <div className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8">
      {confirmElement}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <Link className="mb-1 flex items-center gap-1 text-xs text-[#755984] hover:text-[#493254]" to="/cms">
            <FiArrowLeft className="size-3.5" /> All collections
          </Link>
          <h1 className="truncate text-[26px] font-semibold tracking-[-0.05em]">{collection.name}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#847b89]">
            <span className="inline-flex items-center gap-1">
              <FiCode className="size-3" /> {collection.apiId}
            </span>
            <span>{entries.length} items</span>
            <Link className="font-medium text-[#755984] hover:text-[#493254]" to={`/cms/${collection.id}/api`}>
              View API <FiArrowRight className="ml-0.5 inline size-3" />
            </Link>
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button onClick={() => setAddFieldOpen(true)} variant="outline">
            <FiEdit2 className="size-4" /> Add field
          </Button>
          <Button className="bg-[#291b32]" onClick={() => void createEntry()}>
            <FiPlus className="size-4" /> New item
          </Button>
        </div>
      </div>

      {error && <p className="mb-4 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}

      {fields.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#e3dce8] bg-white p-12 text-center">
          <FiEdit2 className="mx-auto size-8 text-[#c4b6cf]" />
          <p className="mt-4 text-sm font-semibold">Define your fields first</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#847b89]">
            Add a title field, a rich text field for long content, or numbers and dates — then start adding items.
          </p>
          <Button className="mt-5 bg-[#291b32]" onClick={() => setAddFieldOpen(true)}>
            <FiPlus className="size-4" /> Add field
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#eeeaf1] bg-white">
          <Table>
            <TableHeader>
              <TableRow className="bg-[#faf9fb]">
                {fields.map((field) => (
                  <TableHead key={field.id}>
                    <span className="text-[11px] font-semibold">{field.name}</span>
                    <span className="ml-2 text-[10px] font-normal text-[#a49ba9]">{fieldLabel(field.type)}</span>
                  </TableHead>
                ))}
                <TableHead className="w-[90px] text-[11px]">Published</TableHead>
                <TableHead className="w-[110px] text-[11px]">Updated</TableHead>
                <TableHead className="w-[70px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell className="py-10 text-center text-xs text-[#928995]" colSpan={fields.length + 4}>
                    No items yet. Click “New item” to add the first one.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow key={entry.id}>
                    {fields.map((field, index) => (
                      <TableCell key={field.id} className="max-w-[240px]">
                        {index === 0 ? (
                          <Link className="truncate font-medium text-[#4f3262] hover:underline" to={`/cms/${collectionId}/entries/${entry.id}`}>
                            {previewValue(entry, field)}
                          </Link>
                        ) : (
                          <span className="block truncate text-xs text-[#5f5764]">{previewValue(entry, field)}</span>
                        )}
                      </TableCell>
                    ))}
                    <TableCell>
                      <button
                        aria-label={entry.published ? "Unpublish" : "Publish"}
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          entry.published ? "bg-[#eaf6ef] text-[#4e8a68]" : "bg-[#f4f1f6] text-[#8f8794]"
                        }`}
                        onClick={() => void togglePublished(entry)}
                      >
                        <FiGlobe className="size-3" />
                        {entry.published ? "Live" : "Draft"}
                      </button>
                    </TableCell>
                    <TableCell className="text-xs text-[#928995]">{formatDate(entry.updatedAt)}</TableCell>
                    <TableCell>
                      <Button
                        aria-label="Delete item"
                        className="size-7 p-0 text-[#a49ba9] hover:bg-red-50 hover:text-red-700"
                        onClick={() => void deleteEntry(entry)}
                        size="sm"
                        variant="ghost"
                      >
                        <FiTrash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog onOpenChange={setAddFieldOpen} open={addFieldOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add field</DialogTitle>
            <DialogDescription>Fields define the shape of items in this collection.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <Label className="block space-y-2 text-xs font-medium">
              Name
              <Input maxLength={80} onChange={(event) => setFieldName(event.target.value)} placeholder="Title" value={fieldName} />
            </Label>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Type</Label>
              <Select onValueChange={(value) => setFieldType(value as FieldType)} value={fieldType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {fieldType === "select" && (
              <Label className="block space-y-2 text-xs font-medium">
                Options (comma separated)
                <Input onChange={(event) => setFieldOptions(event.target.value)} placeholder="Draft, Review, Done" value={fieldOptions} />
              </Label>
            )}
            <div className="flex items-center gap-2">
              <Checkbox checked={fieldRequired} id="field-required" onCheckedChange={(checked) => setFieldRequired(checked === true)} />
              <Label htmlFor="field-required" className="text-xs">
                Required
              </Label>
            </div>
            {fieldError && <p className="text-xs text-red-700">{fieldError}</p>}
          </div>
          <DialogFooter>
            <Button disabled={fieldBusy} onClick={() => setAddFieldOpen(false)} variant="outline">
              Cancel
            </Button>
            <Button className="bg-[#291b32]" disabled={fieldBusy} onClick={() => void addField()}>
              {fieldBusy ? <FiLoader className="size-4 animate-spin" /> : <FiPlus className="size-4" />} Add field
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ------------------------------- Entry editor ------------------------------ */

function RichTextField({ value, onChange }: { value: unknown; onChange: (blocks: string) => void }) {
  const initial = useMemo(() => {
    const blocks = typeof value === "string" ? parseJson<PartialBlock[]>(value, []) : value;
    return Array.isArray(blocks) && blocks.length > 0 ? (blocks as PartialBlock[]) : undefined;
  }, [value]);
  const editor = useCreateBlockNote({ initialContent: initial });
  return (
    <div className="overflow-hidden rounded-lg border border-[#e9e6ed]">
      <BlockNoteView
        editor={editor}
        onChange={() => onChange(JSON.stringify(editor.document))}
        theme="light"
      />
    </div>
  );
}

export function CmsEntryEditorPage() {
  const { collectionId, entryId } = useParams();
  const navigate = useNavigate();
  const [collection, setCollection] = useState<CmsCollection | null>(null);
  const [fields, setFields] = useState<CmsField[]>([]);
  const [entry, setEntry] = useState<CmsEntry | null>(null);
  const [data, setData] = useState<EntryData>({});
  const [published, setPublished] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!collectionId || !entryId) return;
    (async () => {
      setLoading(true);
      setError("");
      try {
        const [collectionResult, fieldsResult, entryResult] = await Promise.all([
          api<{ collection: CmsCollection }>(`/api/cms/collections/${collectionId}`),
          api<{ fields: CmsField[] }>(`/api/cms/collections/${collectionId}/fields`),
          api<{ entry: CmsEntry }>(`/api/cms/entries/${entryId}`),
        ]);
        if (!active) return;
        setCollection(collectionResult.collection);
        setFields(fieldsResult.fields);
        setEntry(entryResult.entry);
        setData(parseJson<EntryData>(entryResult.entry.data, {}));
        setPublished(entryResult.entry.published);
      } catch (loadFailure) {
        if (active) setError(loadFailure instanceof Error ? loadFailure.message : "Could not load this item.");
      }
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [collectionId, entryId]);

  async function save() {
    if (!entryId) return;
    setSaving(true);
    setSaved(false);
    setError("");
    try {
      const result = await api<{ entry: CmsEntry }>(`/api/cms/entries/${entryId}`, {
        body: JSON.stringify({ data, published }),
        method: "PATCH",
      });
      setEntry(result.entry);
      setSaved(true);
    } catch (saveFailure) {
      setError(saveFailure instanceof Error ? saveFailure.message : "Could not save this item.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="px-8 py-10 text-xs text-[#928995]">Loading item…</p>;
  }
  if (!entry || !collection) {
    return <p className="px-8 py-10 text-xs text-[#928995]">Item not found.</p>;
  }

  const titleField = fields[0];
  const title = titleField ? String(data[titleField.apiId] ?? "Untitled item").slice(0, 80) : "Untitled item";

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8 sm:px-8">
      <div className="mb-8 flex items-end justify-between gap-4">
        <div className="min-w-0">
          <Link className="mb-1 flex items-center gap-1 text-xs text-[#755984] hover:text-[#493254]" to={`/cms/${collectionId}`}>
            <FiArrowLeft className="size-3.5" /> {collection.name}
          </Link>
          <h1 className="truncate text-[26px] font-semibold tracking-[-0.05em]">{title}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch checked={published} id="entry-published" onCheckedChange={setPublished} />
            <Label className="text-xs" htmlFor="entry-published">
              {published ? "Published" : "Draft"}
            </Label>
          </div>
          <Button className="bg-[#291b32]" disabled={saving} onClick={() => void save()}>
            {saving ? <FiLoader className="size-4 animate-spin" /> : saved ? <FiCheck className="size-4" /> : <FiCheck className="size-4" />}
            {saving ? "Saving…" : saved ? "Saved" : "Save"}
          </Button>
        </div>
      </div>

      {error && <p className="mb-4 bg-red-50 px-4 py-3 text-xs text-red-700">{error}</p>}

      {fields.length === 0 ? (
        <p className="text-xs text-[#928995]">This collection has no fields yet — add fields from the items page.</p>
      ) : (
        <div className="space-y-6">
          {fields.map((field) => {
            const raw = data[field.apiId];
            const update = (value: unknown) => setData((current) => ({ ...current, [field.apiId]: value }));
            return (
              <div className="rounded-xl border border-[#eeeaf1] bg-white p-5" key={field.id}>
                <div className="mb-3 flex items-center justify-between">
                  <Label className="text-xs font-semibold">
                    {field.name}
                    {field.required && <span className="ml-1 text-red-600">*</span>}
                  </Label>
                  <Badge className="bg-[#f4f1f6] text-[10px] text-[#6f6078]" variant="secondary">
                    {fieldLabel(field.type)}
                  </Badge>
                </div>
                {field.type === "text" && <Input maxLength={10000} onChange={(event) => update(event.target.value)} value={typeof raw === "string" ? raw : ""} />}
                {field.type === "longtext" && (
                  <Textarea onChange={(event) => update(event.target.value)} rows={5} value={typeof raw === "string" ? raw : ""} />
                )}
                {field.type === "richtext" && <RichTextField onChange={update} value={raw} />}
                {field.type === "number" && (
                  <Input onChange={(event) => update(event.target.value === "" ? null : Number(event.target.value))} type="number" value={raw === null || raw === undefined ? "" : String(raw)} />
                )}
                {field.type === "boolean" && (
                  <div className="flex items-center gap-2">
                    <Switch checked={Boolean(raw)} onCheckedChange={update} />
                    <span className="text-xs text-[#847b89]">{raw ? "Yes" : "No"}</span>
                  </div>
                )}
                {field.type === "date" && (
                  <DateTimePicker onChange={update} value={typeof raw === "string" && raw ? raw.slice(0, 10) : ""} />
                )}
                {field.type === "select" && (
                  <Select onValueChange={update} value={typeof raw === "string" ? raw : ""}>
                    <SelectTrigger>
                      <SelectValue placeholder="Choose an option" />
                    </SelectTrigger>
                    <SelectContent>
                      {(parseJson<string[]>(field.options, []) ?? []).map((option) => (
                        <SelectItem key={option} value={option}>
                          {option}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* --------------------------------- API page -------------------------------- */

export function CmsCollectionApiPage() {
  const { collectionId } = useParams();
  const [collection, setCollection] = useState<CmsCollection | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!collectionId) return;
    api<{ collection: CmsCollection }>(`/api/cms/collections/${collectionId}`)
      .then((result) => {
        if (active) setCollection(result.collection);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [collectionId]);

  if (loading) return <p className="px-8 py-10 text-xs text-[#928995]">Loading…</p>;
  if (!collection) return <p className="px-8 py-10 text-xs text-[#928995]">Collection not found.</p>;

  const baseUrl = window.location.origin;
  const endpoints = [
    { method: "GET", path: `/api/public/cms/content/${collection.apiId}`, auth: "Public", note: "Published entries" },
    { method: "GET", path: `/api/public/cms/collections/${collection.apiId}/entries?scope=all`, auth: "API key", note: "All entries incl. drafts" },
    { method: "POST", path: `/api/public/cms/collections/${collection.apiId}/entries`, auth: "API key", note: "Create entry { data }" },
    { method: "PATCH", path: `/api/public/cms/entries/:entryId`, auth: "API key", note: "Update entry" },
    { method: "DELETE", path: `/api/public/cms/entries/:entryId`, auth: "API key", note: "Delete entry" },
  ];

  return (
    <div className="mx-auto max-w-[900px] px-5 py-8 sm:px-8">
      <Link className="mb-1 flex items-center gap-1 text-xs text-[#755984] hover:text-[#493254]" to={`/cms/${collectionId}`}>
        <FiArrowLeft className="size-3.5" /> {collection.name}
      </Link>
      <h1 className="mb-2 text-[26px] font-semibold tracking-[-0.05em]">Standalone API</h1>
      <p className="mb-6 max-w-xl text-sm text-[#847b89]">
        This collection is available as a standalone REST API. API keys are created under Settings → API keys; pass them as
        <code className="mx-1 rounded bg-[#f4f1f6] px-1 py-0.5 text-[11px]">Authorization: Bearer</code>or
        <code className="mx-1 rounded bg-[#f4f1f6] px-1 py-0.5 text-[11px]">X-API-Key</code>.
      </p>
      <div className="overflow-hidden rounded-xl border border-[#eeeaf1] bg-white">
        <Table>
          <TableHeader>
            <TableRow className="bg-[#faf9fb]">
              <TableHead className="w-[90px] text-[11px]">Method</TableHead>
              <TableHead className="text-[11px]">Endpoint</TableHead>
              <TableHead className="w-[110px] text-[11px]">Auth</TableHead>
              <TableHead className="text-[11px]">Notes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {endpoints.map((endpoint) => (
              <TableRow key={`${endpoint.method}-${endpoint.path}`}>
                <TableCell>
                  <Badge className="bg-[#f2eafa] font-mono text-[10px] text-[#78538c]" variant="secondary">
                    {endpoint.method}
                  </Badge>
                </TableCell>
                <TableCell className="break-all font-mono text-[11px]">
                  {endpoint.path.startsWith("/api/public/cms/content") ? baseUrl + endpoint.path : endpoint.path}
                </TableCell>
                <TableCell className="text-xs">{endpoint.auth}</TableCell>
                <TableCell className="text-xs text-[#847b89]">{endpoint.note}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
