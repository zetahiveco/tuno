import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import {
  FiDownload,
  FiLoader,
  FiMail,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiUpload,
  FiUserPlus,
  FiX,
} from "react-icons/fi";
import { api } from "@/lib/api-client";
import { AppPageFrame } from "@/general/frontend/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

export type MailerContact = {
  id: string;
  email: string;
  name: string;
  props: Record<string, string>;
  subscribed: boolean;
  createdAt: string;
  updatedAt: string;
};

export function MailerAudiencesPage() {
  const [contacts, setContacts] = useState<MailerContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const loadContacts = useCallback(async (query: string) => {
    setError("");
    try {
      const result = await api<{ contacts: MailerContact[] }>(`/api/mailer/contacts${query ? `?q=${encodeURIComponent(query)}` : ""}`);
      setContacts(result.contacts);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load your audience.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadContacts(search.trim()), search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [search, loadContacts]);

  const stats = useMemo(() => {
    const subscribed = contacts.filter((contact) => contact.subscribed).length;
    return { total: contacts.length, subscribed, unsubscribed: contacts.length - subscribed };
  }, [contacts]);

  async function toggleSubscribed(contact: MailerContact, subscribed: boolean) {
    setContacts((current) => current.map((entry) => (entry.id === contact.id ? { ...entry, subscribed } : entry)));
    try {
      await api(`/api/mailer/contacts/${contact.id}`, { body: JSON.stringify({ subscribed }), method: "PATCH" });
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Could not update the contact.");
      setContacts((current) => current.map((entry) => (entry.id === contact.id ? { ...entry, subscribed: !subscribed } : entry)));
    }
  }

  async function deleteContact(contact: MailerContact) {
    if (!window.confirm(`Remove ${contact.email} from your audience?`)) return;
    try {
      await api(`/api/mailer/contacts/${contact.id}`, { method: "DELETE" });
      setContacts((current) => current.filter((entry) => entry.id !== contact.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not remove the contact.");
    }
  }

  return (
    <AppPageFrame
      action={(
        <>
          <Button className="h-9 border-[#e8e4ee] bg-white text-[#5f5568] shadow-none hover:bg-[#f7f5f8]" onClick={() => setImportOpen(true)} variant="outline">
            <FiUpload className="size-3.5" />
            Import
          </Button>
          <Button className="h-9 bg-[#7a4fa3] hover:bg-[#6a4290]" onClick={() => setAddOpen(true)}>
            <FiUserPlus className="size-3.5" />
            Add contact
          </Button>
        </>
      )}
      description="Everyone you can email — contacts and their properties."
      title="Audiences"
    >
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative">
          <FiSearch className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[#a49ba9]" />
          <Input
            className="h-9 w-56 border-[#e8e4ee] pl-8"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search email or name"
            value={search}
          />
        </div>
        <Badge variant="secondary" className="bg-[#f5f3f6] px-2.5 py-1 text-[10px] font-medium text-[#8c838f]">
          {stats.subscribed} subscribed · {stats.unsubscribed} unsubscribed
        </Badge>
      </div>

      {error ? (
        <p className="mb-4 flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          <FiX className="size-3.5" />
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="grid h-40 place-items-center text-xs text-[#928995]">
          <span className="flex items-center gap-2">
            <FiLoader className="size-4 animate-spin" />
            Loading your audience…
          </span>
        </div>
      ) : contacts.length === 0 ? (
        <div className="max-w-xl border border-[#eeeaf1] bg-white p-10 text-center">
          <FiMail className="mx-auto size-7 text-[#b5abbe]" />
          <p className="mt-3 text-sm font-medium">No contacts yet</p>
          <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-[#847b89]">
            Add people one by one or paste a list. Each contact can carry custom properties (plan, company, …) that templates use with {'{{ key }}'} variables.
          </p>
        </div>
      ) : (
        <div className="overflow-hidden border border-[#eeeaf1] bg-white">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#f0edf3] text-[10px] font-semibold uppercase tracking-[0.14em] text-[#a49ba9]">
                <th className="px-4 py-2.5 font-semibold">Email</th>
                <th className="px-4 py-2.5 font-semibold">Name</th>
                <th className="hidden px-4 py-2.5 font-semibold md:table-cell">Properties</th>
                <th className="hidden px-4 py-2.5 font-semibold lg:table-cell">Added</th>
                <th className="px-4 py-2.5 font-semibold">Subscribed</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr className="border-b border-[#f6f4f8] last:border-0 hover:bg-[#fbfafc]" key={contact.id}>
                  <td className="max-w-[240px] truncate px-4 py-3 font-medium">{contact.email}</td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-[#5f5568]">{contact.name || "—"}</td>
                  <td className="hidden max-w-[260px] px-4 py-3 md:table-cell">
                    {Object.keys(contact.props).length ? (
                      <span className="line-clamp-1 text-xs text-[#8c838f]">
                        {Object.entries(contact.props).map(([key, value]) => `${key}=${value}`).join(", ")}
                      </span>
                    ) : (
                      <span className="text-xs text-[#c5bfca]">—</span>
                    )}
                  </td>
                  <td className="hidden whitespace-nowrap px-4 py-3 text-xs text-[#a49ba9] lg:table-cell">
                    {formatDistanceToNow(new Date(contact.createdAt), { addSuffix: true })}
                  </td>
                  <td className="px-4 py-3">
                    <Switch checked={contact.subscribed} onCheckedChange={(checked) => void toggleSubscribed(contact, checked)} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button className="rounded p-1.5 text-[#a49ba9] hover:bg-red-50 hover:text-red-600" onClick={() => void deleteContact(contact)} title="Remove contact" type="button">
                      <FiTrash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddContactDialog
        onClose={() => setAddOpen(false)}
        open={addOpen}
        onSaved={() => void loadContacts(search.trim())}
      />
      <ImportContactsDialog
        onClose={() => setImportOpen(false)}
        open={importOpen}
        onImported={(imported) => {
          void loadContacts(search.trim());
          return imported;
        }}
      />
    </AppPageFrame>
  );
}

function AddContactDialog({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [props, setProps] = useState("{}");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    try {
      await api("/api/mailer/contacts", {
        body: JSON.stringify({ email, name, props }),
        method: "POST",
      });
      setEmail("");
      setName("");
      setProps("{}");
      onClose();
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not add the contact.");
    }
    setSaving(false);
  }

  return (
    <Dialog onOpenChange={(next) => (next ? null : onClose())} open={open}>
      <DialogContent className="max-w-md border-[#eeeaf1]">
        <DialogHeader>
          <DialogTitle className="text-base">Add a contact</DialogTitle>
          <DialogDescription>Custom properties are optional and available as {'{{ key }}'} template variables.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-1.5">
            <Label className="text-xs" htmlFor="contact-email">Email</Label>
            <Input className="border-[#e8e4ee]" id="contact-email" onChange={(event) => setEmail(event.target.value)} placeholder="person@company.com" type="email" value={email} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs" htmlFor="contact-name">Name</Label>
            <Input className="border-[#e8e4ee]" id="contact-name" onChange={(event) => setName(event.target.value)} placeholder="Jordan Reyes" value={name} />
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs" htmlFor="contact-props">Custom properties (JSON)</Label>
            <Textarea
              className="border-[#e8e4ee] font-mono text-xs"
              id="contact-props"
              onChange={(event) => setProps(event.target.value)}
              placeholder={'{"plan": "pro", "company": "Acme"}'}
              rows={3}
              value={props}
            />
          </div>
          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button className="bg-[#7a4fa3] hover:bg-[#6a4290]" disabled={saving || !email} onClick={() => void save()}>
            {saving ? <FiLoader className="size-4 animate-spin" /> : <FiPlus className="size-4" />}
            Add contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportContactsDialog({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: (imported: number) => void }) {
  const [text, setText] = useState("");
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function runImport() {
    setImporting(true);
    setError("");
    try {
      const result = await api<{ imported: number }>("/api/mailer/contacts/import", {
        body: JSON.stringify({ text }),
        method: "POST",
      });
      setResult(result.imported);
      setText("");
      onImported(result.imported);
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : "Could not import the contacts.");
    }
    setImporting(false);
  }

  return (
    <Dialog
      onOpenChange={(next) => {
        if (!next) {
          setResult(null);
          onClose();
        }
      }}
      open={open}
    >
      <DialogContent className="max-w-md border-[#eeeaf1]">
        <DialogHeader>
          <DialogTitle className="text-base">Import contacts</DialogTitle>
          <DialogDescription>Paste one contact per line. Duplicates are skipped and existing names are updated.</DialogDescription>
        </DialogHeader>
        <Textarea
          className="border-[#e8e4ee] font-mono text-xs"
          onChange={(event) => setText(event.target.value)}
          placeholder={"jordan@example.com, Jordan Reyes\npriya@example.com\nsam@example.com, Sam Okafor"}
          rows={7}
          value={text}
        />
        {result !== null ? <p className="text-xs text-[#3d8a55]">Imported {result} contact{result === 1 ? "" : "s"}.</p> : null}
        {error ? <p className="text-xs text-red-600">{error}</p> : null}
        <DialogFooter>
          <Button className="bg-[#7a4fa3] hover:bg-[#6a4290]" disabled={importing || !text.trim()} onClick={() => void runImport()}>
            {importing ? <FiLoader className="size-4 animate-spin" /> : <FiDownload className="size-4" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
