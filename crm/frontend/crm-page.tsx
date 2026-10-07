import { useCallback, useEffect, useMemo, useState } from "react";
import {
  FiBriefcase,
  FiCheckCircle,
  FiFileText,
  FiLayers,
  FiPlus,
  FiTrash2,
  FiUsers,
} from "react-icons/fi";
import { Link, useNavigate } from "react-router-dom";
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
import { Textarea } from "@/components/ui/textarea";
import { AppPageFrame, AppShell, type AppNavPage } from "@/general/frontend/app-shell";
import { api } from "@/lib/api-client";

/* ---------------------------------- Types --------------------------------- */

type LeadStatus = "NEW" | "CONTACTED" | "QUALIFIED" | "PROPOSAL" | "WON" | "LOST";
type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE";
type FieldType = "TEXT" | "NUMBER" | "DATE" | "SELECT" | "CHECKBOX";
type FieldEntity = "LEAD" | "CONTACT" | "TASK";

type CustomField = {
  id: string;
  name: string;
  type: FieldType;
  options: string;
  appliesTo: FieldEntity;
};

type Lead = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  status: LeadStatus;
  value: number;
  customValues: Record<string, string>;
};

type Contact = {
  id: string;
  name: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  leadId: string | null;
  customValues: Record<string, string>;
};

type CrmTask = {
  id: string;
  title: string;
  status: TaskStatus;
  dueDate: string | null;
  leadId: string | null;
  contactId: string | null;
  customValues: Record<string, string>;
};

type CrmNote = {
  id: string;
  body: string;
  leadId: string | null;
  contactId: string | null;
  createdAt: string;
  updatedAt: string;
};

const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUALIFIED: "Qualified",
  PROPOSAL: "Proposal",
  WON: "Won",
  LOST: "Lost",
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
  { end: true, icon: FiBriefcase, label: "Leads", to: "/crm" },
  { icon: FiUsers, label: "Contacts", to: "/crm/contacts" },
  { icon: FiCheckCircle, label: "Tasks", to: "/crm/tasks" },
  { icon: FiFileText, label: "Notes", to: "/crm/notes" },
  { icon: FiLayers, label: "Custom fields", to: "/crm/fields" },
];

export function CrmLayout() {
  return <AppShell accent="bg-[#eaf6ef] text-[#4e8a68]" appName="CRM" icon={FiBriefcase} pages={NAV} />;
}

/* ---------------------------------- Leads ---------------------------------- */

function useLeadFields() {
  const [fields, setFields] = useState<CustomField[]>([]);
  useEffect(() => {
    api<{ fields: CustomField[] }>("/api/crm/fields")
      .then((result) => setFields(result.fields))
      .catch(() => setFields([]));
  }, []);
  return {
    leadFields: useMemo(() => fields.filter((field) => field.appliesTo === "LEAD"), [fields]),
    contactFields: useMemo(() => fields.filter((field) => field.appliesTo === "CONTACT"), [fields]),
    taskFields: useMemo(() => fields.filter((field) => field.appliesTo === "TASK"), [fields]),
    reload: useCallback(() => {
      api<{ fields: CustomField[] }>("/api/crm/fields")
        .then((result) => setFields(result.fields))
        .catch(() => setFields([]));
    }, []),
  };
}

function LeadDialog({
  fieldList,
  lead,
  onOpenChange,
  onSaved,
  open,
}: {
  fieldList: CustomField[];
  lead: Lead | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  open: boolean;
}) {
  const [form, setForm] = useState({ name: "", company: "", email: "", phone: "", source: "", status: "NEW" as LeadStatus, value: "0" });
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError("");
    setValues(lead?.customValues ?? {});
    setForm({
      name: lead?.name ?? "",
      company: lead?.company ?? "",
      email: lead?.email ?? "",
      phone: lead?.phone ?? "",
      source: lead?.source ?? "",
      status: lead?.status ?? "NEW",
      value: String(lead?.value ?? 0),
    });
  }, [lead, open]);

  async function submit() {
    if (!form.name.trim()) {
      setError("A lead name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        name: form.name,
        company: form.company,
        email: form.email,
        phone: form.phone,
        source: form.source,
        status: form.status,
        value: Number(form.value) || 0,
      };
      const result = lead
        ? await api<{ lead: Lead }>(`/api/crm/leads/${lead.id}`, { body: JSON.stringify(body), method: "PATCH" })
        : await api<{ lead: Lead }>("/api/crm/leads", { body: JSON.stringify(body), method: "POST" });
      await saveCustomValues("LEAD", result.lead.id, values);
      onOpenChange(false);
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the lead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{lead ? "Edit lead" : "New lead"}</DialogTitle>
          <DialogDescription>Track a potential deal from first touch to close.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <label className="space-y-2 text-xs font-medium">
            Name
            <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Acme Corp" value={form.name} />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-2 text-xs font-medium">
              Company
              <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setForm({ ...form, company: event.target.value })} placeholder="Company name" value={form.company} />
            </label>
            <label className="space-y-2 text-xs font-medium">
              Source
              <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="Referral" value={form.source} />
            </label>
            <label className="space-y-2 text-xs font-medium">
              Email
              <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="name@company.com" type="email" value={form.email} />
            </label>
            <label className="space-y-2 text-xs font-medium">
              Phone
              <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="+1 555 000 1234" value={form.phone} />
            </label>
            <label className="space-y-2 text-xs font-medium">
              Status
              <Select value={form.status} onValueChange={(status) => setForm({ ...form, status: status as LeadStatus })}>
                <SelectTrigger className="h-9 w-full border-[#e9e6ed] text-xs font-normal"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(LEAD_STATUS_LABEL) as LeadStatus[]).map((status) => (
                    <SelectItem key={status} value={status}>{LEAD_STATUS_LABEL[status]}</SelectItem>
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
            {saving ? "Saving…" : "Save lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CrmLeadsPage() {
  const { leadFields } = useLeadFields();
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Lead | null>(null);
  const [error, setError] = useState("");

  const loadLeads = useCallback(() => {
    api<{ leads: Lead[] }>("/api/crm/leads")
      .then((result) => setLeads(result.leads))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load leads."));
  }, []);

  useEffect(() => { loadLeads(); }, [loadLeads]);

  async function remove(lead: Lead) {
    try {
      await api(`/api/crm/leads/${lead.id}`, { method: "DELETE" });
      setLeads((current) => (current ?? []).filter((entry) => entry.id !== lead.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the lead.");
    }
  }

  return (
    <AppPageFrame
      action={(
        <Button className="bg-[#291b32] hover:bg-[#473252]" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <FiPlus className="size-4" /> New lead
        </Button>
      )}
      description="Track potential deals through your pipeline."
      title="Leads"
    >
      {error && <p className="mb-3 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-[#eeeaf1] bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[#eeeaf1] text-[10px] uppercase tracking-[0.1em] text-[#a49ba9]">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Value</th>
              {leadFields.map((field) => <th className="px-4 py-3 font-semibold" key={field.id}>{field.name}</th>)}
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {leads === null && <tr><td className="px-4 py-6 text-[#928995]" colSpan={99}>Loading leads…</td></tr>}
            {leads !== null && leads.length === 0 && <tr><td className="px-4 py-6 text-[#928995]" colSpan={99}>No leads yet.</td></tr>}
            {leads?.map((lead) => (
              <tr className="border-b border-[#f4f2f5] last:border-0 hover:bg-[#faf9fb]" key={lead.id}>
                <td className="px-4 py-3 font-medium">{lead.name}</td>
                <td className="px-4 py-3 text-[#716b76]">{lead.company || "—"}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-[#f3eef7] px-2 py-0.5 text-[10px] font-medium text-[#5c3f6e]">{LEAD_STATUS_LABEL[lead.status]}</span></td>
                <td className="px-4 py-3 text-[#716b76]">{lead.value ? `$${lead.value.toLocaleString()}` : "—"}</td>
                {leadFields.map((field) => <td className="px-4 py-3 text-[#716b76]" key={field.id}>{renderCustomValue(field, lead.customValues[field.id])}</td>)}
                <td className="px-2 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <Button className="h-7 px-2 text-[11px]" onClick={() => { setEditing(lead); setDialogOpen(true); }} size="sm" variant="outline">Edit</Button>
                    <Button className="h-7 w-7 p-0 text-[#a49ba9] hover:bg-red-50 hover:text-red-700" onClick={() => void remove(lead)} size="sm" variant="ghost"><FiTrash2 className="size-3.5" /></Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <LeadDialog fieldList={leadFields} lead={editing} onOpenChange={setDialogOpen} onSaved={loadLeads} open={dialogOpen} />
    </AppPageFrame>
  );
}

/* --------------------------------- Contacts -------------------------------- */

function ContactDialog({
  contact,
  fieldList,
  leads,
  onOpenChange,
  onSaved,
  open,
}: {
  contact: Contact | null;
  fieldList: CustomField[];
  leads: Lead[];
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  open: boolean;
}) {
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", role: "", leadId: "" });
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
      company: contact?.company ?? "",
      role: contact?.role ?? "",
      leadId: contact?.leadId ?? "",
    });
  }, [contact, open]);

  async function submit() {
    if (!form.name.trim()) {
      setError("A contact name is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = {
        name: form.name,
        email: form.email,
        phone: form.phone,
        company: form.company,
        role: form.role,
        leadId: form.leadId || null,
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
          <DialogDescription>People you do business with.</DialogDescription>
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
              Company
              <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setForm({ ...form, company: event.target.value })} placeholder="Company name" value={form.company} />
            </label>
            <label className="space-y-2 text-xs font-medium">
              Role
              <Input className="h-9 border-[#e9e6ed]" onChange={(event) => setForm({ ...form, role: event.target.value })} placeholder="e.g. Head of Purchasing" value={form.role} />
            </label>
          </div>
          <label className="space-y-2 text-xs font-medium">
            Linked lead
            <Select value={form.leadId} onValueChange={(leadId) => setForm({ ...form, leadId })}>
              <SelectTrigger className="h-9 w-full border-[#e9e6ed] text-xs font-normal">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {leads.map((lead) => <SelectItem key={lead.id} value={lead.id}>{lead.name}</SelectItem>)}
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
  const { contactFields } = useLeadFields();
  const [contacts, setContacts] = useState<Contact[] | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
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
    api<{ leads: Lead[] }>("/api/crm/leads").then((result) => setLeads(result.leads)).catch(() => setLeads([]));
  }, [loadContacts]);

  async function remove(contact: Contact) {
    try {
      await api(`/api/crm/contacts/${contact.id}`, { method: "DELETE" });
      setContacts((current) => (current ?? []).filter((entry) => entry.id !== contact.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Could not delete the contact.");
    }
  }

  const leadName = (leadId: string | null) => leads.find((lead) => lead.id === leadId)?.name ?? "—";

  return (
    <AppPageFrame
      action={(
        <Button className="bg-[#291b32] hover:bg-[#473252]" onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <FiPlus className="size-4" /> New contact
        </Button>
      )}
      description="People and companies in your network."
      title="Contacts"
    >
      {error && <p className="mb-3 bg-red-50 px-3.5 py-2.5 text-xs text-red-700">{error}</p>}
      <div className="overflow-x-auto rounded-lg border border-[#eeeaf1] bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[#eeeaf1] text-[10px] uppercase tracking-[0.1em] text-[#a49ba9]">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Company</th>
              <th className="px-4 py-3 font-semibold">Email</th>
              <th className="px-4 py-3 font-semibold">Lead</th>
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
                <td className="px-4 py-3 text-[#716b76]">{contact.company || "—"}</td>
                <td className="px-4 py-3 text-[#716b76]">{contact.email || "—"}</td>
                <td className="px-4 py-3 text-[#716b76]">{leadName(contact.leadId)}</td>
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
      <ContactDialog contact={editing} fieldList={contactFields} leads={leads} onOpenChange={setDialogOpen} onSaved={loadContacts} open={dialogOpen} />
    </AppPageFrame>
  );
}

/* ----------------------------------- Tasks --------------------------------- */

export function CrmTasksPage() {
  const { taskFields } = useLeadFields();
  const [tasks, setTasks] = useState<CrmTask[] | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
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
    api<{ leads: Lead[] }>("/api/crm/leads").then((result) => setLeads(result.leads)).catch(() => setLeads([]));
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

  async function toggle(task: CrmTask) {
    const next = task.status === "DONE" ? "TODO" : "DONE";
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
      description="Follow-ups and to-dos tied to your pipeline."
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
              aria-label="Toggle task status"
              className={`grid size-5 shrink-0 place-items-center rounded-full border transition ${
                task.status === "DONE" ? "border-[#4e8a68] bg-[#eaf6ef] text-[#4e8a68]" : "border-[#d8d2dd] hover:border-[#a49ba9]"
              }`}
              onClick={() => void toggle(task)}
              type="button"
            >
              {task.status === "DONE" ? "✓" : ""}
            </button>
            <div className="min-w-0 flex-1">
              <p className={`truncate text-xs font-medium ${task.status === "DONE" ? "text-[#a49ba9] line-through" : ""}`}>{task.title}</p>
              <p className="mt-0.5 truncate text-[10px] text-[#968d9a]">
                {TASK_STATUS_LABEL[task.status]}
                {task.dueDate ? ` · Due ${formatDate(task.dueDate)}` : ""}
                {task.leadId ? ` · Lead: ${leads.find((lead) => lead.id === task.leadId)?.name ?? "—"}` : ""}
                {task.contactId ? ` · Contact: ${contacts.find((contact) => contact.id === task.contactId)?.name ?? "—"}` : ""}
              </p>
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
  const [leadId, setLeadId] = useState("");
  const [contactId, setContactId] = useState("");
  const [leads, setLeads] = useState<Lead[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState("");
  const [error, setError] = useState("");

  const loadNotes = useCallback(() => {
    const params = new URLSearchParams();
    if (leadId) params.set("leadId", leadId);
    if (contactId) params.set("contactId", contactId);
    api<{ notes: CrmNote[] }>(`/api/crm/notes${params.size ? `?${params}` : ""}`)
      .then((result) => setNotes(result.notes))
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load notes."));
  }, [contactId, leadId]);

  useEffect(() => {
    loadNotes();
    api<{ leads: Lead[] }>("/api/crm/leads").then((result) => setLeads(result.leads)).catch(() => setLeads([]));
    api<{ contacts: Contact[] }>("/api/crm/contacts").then((result) => setContacts(result.contacts)).catch(() => setContacts([]));
  }, [loadNotes]);

  async function create() {
    if (!body.trim() || saving) return;
    setSaving(true);
    setCreateError("");
    try {
      await api("/api/crm/notes", {
        body: JSON.stringify({ body, leadId: leadId || null, contactId: contactId || null }),
        method: "POST",
      });
      setBody("");
      setLeadId("");
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
              <Select value={leadId} onValueChange={setLeadId}>
                <SelectTrigger className="h-8 w-full border-[#e9e6ed] text-[11px] font-normal sm:w-48">
                  <SelectValue placeholder="Link a lead (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No lead</SelectItem>
                  {leads.map((lead) => <SelectItem key={lead.id} value={lead.id}>{lead.name}</SelectItem>)}
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
      <div className="space-y-3">
        {notes === null && <p className="text-xs text-[#928995]">Loading notes…</p>}
        {notes !== null && notes.length === 0 && <p className="text-xs text-[#928995]">No notes yet.</p>}
        {notes?.map((note) => (
          <div className="group max-w-[720px] rounded-lg border border-[#eeeaf1] bg-white px-4 py-3" key={note.id}>
            <p className="whitespace-pre-wrap text-xs leading-5">{note.body}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[10px] text-[#a49ba9]">
                {new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "numeric" }).format(new Date(note.createdAt))}
                {note.leadId ? ` · ${leads.find((lead) => lead.id === note.leadId)?.name ?? ""}` : ""}
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
  const [appliesTo, setAppliesTo] = useState<FieldEntity>("LEAD");
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
      setAppliesTo("LEAD");
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

  const entityLabel: Record<FieldEntity, string> = { LEAD: "Leads", CONTACT: "Contacts", TASK: "Tasks" };

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
      description="Add your own columns to leads, contacts, and tasks."
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
                    <SelectItem value="LEAD">Leads</SelectItem>
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
      <div className="max-w-[720px] space-y-2">
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
