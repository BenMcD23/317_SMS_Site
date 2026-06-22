"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { Plus, Pencil, Trash2, Download, Upload } from "lucide-react";
import { toast } from "sonner";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

type Recipient = {
  id: number;
  rank: string;
  surname: string;
  phone_number: string;
};

type RecipientForm = Omit<Recipient, "id">;

const EMPTY_FORM: RecipientForm = { rank: "", surname: "", phone_number: "" };

export default function TextRecipientsPage() {
  const { data: session } = useSession();

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Recipient | null>(null);
  const [form, setForm] = useState<RecipientForm>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<Recipient | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importing, setImporting] = useState(false);

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${session?.id_token}`, "Content-Type": "application/json" }),
    [session?.id_token]
  );

  const loadRecipients = useCallback(async () => {
    if (!session?.id_token) return;
    try {
      const resp = await apiFetch(`${API_BASE}/texts/recipients`, { headers: authHeaders });
      if (!resp.ok) {
        toast.error("Failed to load recipients.");
        return;
      }
      setRecipients(await resp.json());
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setLoading(false);
    }
  }, [session?.id_token, authHeaders]);

  useEffect(() => {
    loadRecipients();
  }, [loadRecipients]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (r: Recipient) => {
    setEditing(r);
    setForm({ rank: r.rank, surname: r.surname, phone_number: r.phone_number });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const url = editing
        ? `${API_BASE}/texts/recipients/${editing.id}`
        : `${API_BASE}/texts/recipients`;
      const resp = await apiFetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: authHeaders,
        body: JSON.stringify(form),
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast.error(data.detail || "Save failed.");
        return;
      }
      toast.success(editing ? "Recipient updated." : "Recipient added.");
      setDialogOpen(false);
      await loadRecipients();
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = () => {
    const escape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [
      "phone number,rank,surname",
      ...recipients.map((r) => [r.phone_number, r.rank, r.surname].map(escape).join(",")),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "text-recipients.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!importFile) return;
    setImporting(true);
    try {
      const form = new FormData();
      form.append("file", importFile);
      form.append("mode", importMode);
      const resp = await apiFetch(`${API_BASE}/texts/recipients/import`, {
        method: "POST",
        // No Content-Type — the browser sets the multipart boundary itself
        headers: { Authorization: `Bearer ${session?.id_token}` },
        body: form,
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast.error(data.detail || "Import failed.");
        return;
      }
      toast.success(
        `Imported ${data.imported} recipient${data.imported !== 1 ? "s" : ""}` +
          (data.skipped ? ` (${data.skipped} row${data.skipped !== 1 ? "s" : ""} without a phone number skipped)` : "") +
          ` — ${data.total} on the list now.`
      );
      setImportOpen(false);
      setImportFile(null);
      await loadRecipients();
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    try {
      const resp = await apiFetch(`${API_BASE}/texts/recipients/${deleting.id}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!resp.ok) {
        const data = await resp.json();
        toast.error(data.detail || "Delete failed.");
        return;
      }
      toast.success("Recipient removed.");
      setRecipients((prev) => prev.filter((r) => r.id !== deleting.id));
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="Text Recipients"
        description="Everyone on this list receives the parade night texts"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={handleExport} disabled={recipients.length === 0}>
              <Download /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!session}>
              <Upload /> Import
            </Button>
            <Button onClick={openAdd} disabled={!session}>
              <Plus /> Add recipient
            </Button>
          </div>
        }
      />

      {loading ? (
        <div className="flex justify-center py-12"><Spinner className="size-6" /></div>
      ) : recipients.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No recipients yet</EmptyTitle>
            <EmptyDescription>
              Add at least one recipient before any texts can be sent.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rank</TableHead>
              <TableHead>Surname</TableHead>
              <TableHead>Phone number</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {recipients.map((r) => (
              <TableRow key={r.id}>
                <TableCell>{r.rank}</TableCell>
                <TableCell>{r.surname}</TableCell>
                <TableCell className="font-mono text-sm">{r.phone_number}</TableCell>
                <TableCell>
                  <div className="flex justify-end gap-1">
                    <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => openEdit(r)}>
                      <Pencil />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Delete"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDeleting(r)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit recipient" : "Add recipient"}</DialogTitle>
            <DialogDescription>
              Rank and surname are used in the text greeting, e.g. &quot;Sgt Smith&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Field>
              <FieldLabel htmlFor="rank">Rank</FieldLabel>
              <Input
                id="rank"
                placeholder="Sgt"
                value={form.rank}
                onChange={(e) => setForm({ ...form, rank: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="surname">Surname</FieldLabel>
              <Input
                id="surname"
                placeholder="Smith"
                value={form.surname}
                onChange={(e) => setForm({ ...form, surname: e.target.value })}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="phone">Phone number</FieldLabel>
              <Input
                id="phone"
                placeholder="07700900000"
                value={form.phone_number}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !form.phone_number.trim()}>
              {saving && <Spinner />}
              {editing ? "Save changes" : "Add recipient"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={(open) => { setImportOpen(open); if (!open) setImportFile(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Import recipients</DialogTitle>
            <DialogDescription>
              Upload a .csv or .xlsx with columns: phone number, rank, surname (same layout as the
              old Numbers sheet).
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Field>
              <FieldLabel htmlFor="import-file">File</FieldLabel>
              <Input
                id="import-file"
                type="file"
                accept=".csv,.tsv,.txt,.xlsx,.xlsm"
                onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
              />
            </Field>
            <Field>
              <FieldLabel htmlFor="import-mode">Mode</FieldLabel>
              <Select value={importMode} onValueChange={(v) => setImportMode(v as "merge" | "replace")}>
                <SelectTrigger id="import-mode"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">Merge — add new numbers, update existing</SelectItem>
                  <SelectItem value="replace">Replace — wipe the list and use the file</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {importMode === "replace" && (
              <p className="text-xs text-destructive">
                Replace deletes every current recipient before importing.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button onClick={handleImport} disabled={!importFile || importing}>
              {importing && <Spinner />}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this recipient?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && `${deleting.rank} ${deleting.surname} (${deleting.phone_number})`} will no
              longer receive parade night texts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
