"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader } from "@/components/page-header";
import { Plus, Pencil, Trash2, Download, Upload, MessageCircle, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

type Source = "cadet" | "staff" | "extra";

type Recipient = {
  key: string;
  source: Source;
  rank: string;
  surname: string;
  name: string;
  phone_number: string;
  cin: number | null;
};

// Extras are the only rows whose name is stored here — a cadet's or staff
// member's comes off the roster, so those fields are read-only below.
type ExtraForm = { rank: string; surname: string; phone_number: string };

// What /cadets/search answers with, trimmed to what the picker shows.
type CadetHit = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
};

// What /staff answers with. Only the roster fields the picker needs.
type StaffRow = {
  cin: number;
  firstName: string;
  lastName: string;
  rank: string | null;
};

// Either roster's people, once they're something to pick. `key` is the
// recipient key the number gets PATCHed onto.
type PersonHit = { key: string; label: string; hint: string | null };

const ADD_MODE_LABEL = {
  cadet: "A cadet",
  staff: "A staff member",
  extra: "Someone with no account",
} as const;

type AddMode = keyof typeof ADD_MODE_LABEL;

const EMPTY_FORM: ExtraForm = { rank: "", surname: "", phone_number: "" };

const SOURCE_LABEL: Record<Source, string> = {
  cadet: "Cadet",
  staff: "Staff",
  extra: "No account",
};

export default function TextRecipientsPage() {
  const { data: session } = useSession();

  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Recipient | null>(null);
  const [form, setForm] = useState<ExtraForm>(EMPTY_FORM);
  const [deleting, setDeleting] = useState<Recipient | null>(null);
  // Adding under an account vs adding someone with no account behind them.
  const [addMode, setAddMode] = useState<AddMode>("cadet");
  const [query, setQuery] = useState("");
  const [cadetHits, setCadetHits] = useState<CadetHit[]>([]);
  const [staffRoster, setStaffRoster] = useState<StaffRow[]>([]);
  const [picked, setPicked] = useState<PersonHit | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importing, setImporting] = useState(false);
  // The WhatsApp community invite link. Set here, shown to cadets on the portal
  // and to staff in Settings once they've saved a number.
  const [inviteUrl, setInviteUrl] = useState("");
  const [savedInviteUrl, setSavedInviteUrl] = useState("");
  const [inviteSaving, setInviteSaving] = useState(false);

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

  useEffect(() => {
    if (!session?.id_token) return;
    apiFetch(`${API_BASE}/texts/settings`, { headers: authHeaders })
      .then((resp) => (resp.ok ? resp.json() : null))
      .then((data) => {
        if (!data) return;
        setInviteUrl(data.whatsapp_invite_url ?? "");
        setSavedInviteUrl(data.whatsapp_invite_url ?? "");
      })
      .catch(() => {
        // The list is the point of this page; a missing link isn't worth a toast.
      });
  }, [session?.id_token, authHeaders]);

  // Cadet search for the add dialog. Hundreds of cadets, so the roster stays on
  // the server. Debounced because it fires per keystroke, and abandoned on the
  // next one so a slow reply can't overwrite a newer list.
  useEffect(() => {
    const q = query.trim();
    if (addMode !== "cadet" || !session?.id_token || q.length < 2) {
      setCadetHits([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      apiFetch(`${API_BASE}/cadets/search?q=${encodeURIComponent(q)}`, {
        headers: authHeaders,
        signal: controller.signal,
      })
        .then((resp) => (resp.ok ? resp.json() : []))
        .then(setCadetHits)
        .catch(() => {
          // Aborted, or the server is down — the empty list says enough.
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, addMode, session?.id_token, authHeaders]);

  // Staff are a few dozen, so the whole roster comes down once and the filtering
  // happens below — a search endpoint for that many rows would earn nothing.
  useEffect(() => {
    if (addMode !== "staff" || !session?.id_token || staffRoster.length) return;
    apiFetch(`${API_BASE}/staff`, { headers: authHeaders })
      .then((resp) => (resp.ok ? resp.json() : []))
      .then(setStaffRoster)
      .catch(() => {
        // Same as above: an empty picker is the visible failure.
      });
  }, [addMode, session?.id_token, authHeaders, staffRoster.length]);

  // Whichever roster is being searched, as one list for the picker.
  const hits: PersonHit[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const name = (rank: string | null, first: string, last: string) =>
      `${rank ? `${rank} ` : ""}${first} ${last}`;

    if (addMode === "staff") {
      return staffRoster
        .filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q))
        .slice(0, 10)
        .map((p) => ({
          key: `staff:${p.cin}`,
          label: name(p.rank, p.firstName, p.lastName),
          hint: null,
        }));
    }
    return cadetHits.map((c) => ({
      key: `cadet:${c.cin}`,
      label: name(c.rank, c.first_name, c.last_name),
      hint: c.flight,
    }));
  }, [addMode, query, cadetHits, staffRoster]);

  const handleInviteSave = async () => {
    setInviteSaving(true);
    try {
      const resp = await apiFetch(`${API_BASE}/texts/settings`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify({ whatsapp_invite_url: inviteUrl }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast.error(data.detail || "Save failed.");
        return;
      }
      setInviteUrl(data.whatsapp_invite_url ?? "");
      setSavedInviteUrl(data.whatsapp_invite_url ?? "");
      toast.success(data.whatsapp_invite_url ? "Invite link saved." : "Invite link removed.");
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setInviteSaving(false);
    }
  };

  const counts = useMemo(
    () => ({
      cadet: recipients.filter((r) => r.source === "cadet").length,
      staff: recipients.filter((r) => r.source === "staff").length,
      extra: recipients.filter((r) => r.source === "extra").length,
    }),
    [recipients]
  );

  const resetPicker = () => {
    setAddMode("cadet");
    setQuery("");
    setCadetHits([]);
    setPicked(null);
  };

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    resetPicker();
    setDialogOpen(true);
  };

  const openEdit = (r: Recipient) => {
    setEditing(r);
    setForm({ rank: r.rank, surname: r.surname, phone_number: r.phone_number });
    resetPicker();
    setDialogOpen(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Adding under an account isn't a new row: the number goes onto the person
      // the same way it would if they'd saved it themselves.
      const addingToPerson = !editing && addMode !== "extra";
      const key = editing?.key ?? picked?.key ?? "";
      const url =
        editing || addingToPerson
          ? `${API_BASE}/texts/recipients/${encodeURIComponent(key)}`
          : `${API_BASE}/texts/recipients`;
      // Only an extra's rank and surname are ours to change; for a cadet or
      // staff member the number is the whole of the edit.
      const body =
        addingToPerson || (editing && editing.source !== "extra")
          ? { phone_number: form.phone_number }
          : form;
      const resp = await apiFetch(url, {
        method: editing || addingToPerson ? "PATCH" : "POST",
        headers: authHeaders,
        body: JSON.stringify(body),
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
        `Imported ${data.imported} number${data.imported !== 1 ? "s" : ""} — ` +
          `${data.matched} onto a cadet or staff record, ${data.extras} kept without one` +
          (data.skipped
            ? ` (${data.skipped} row${data.skipped !== 1 ? "s" : ""} without a phone number skipped)`
            : "") +
          `. ${data.total} on the list now.`
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
      const resp = await apiFetch(`${API_BASE}/texts/recipients/${encodeURIComponent(deleting.key)}`, {
        method: "DELETE",
        headers: authHeaders,
      });
      if (!resp.ok) {
        const data = await resp.json();
        toast.error(data.detail || "Remove failed.");
        return;
      }
      toast.success("Recipient removed.");
      setRecipients((prev) => prev.filter((r) => r.key !== deleting.key));
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setDeleting(null);
    }
  };

  const editingExtra = !editing || editing.source === "extra";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="Text Recipients"
        description="Everyone with a mobile saved against their record, plus anyone without one"
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" onClick={handleExport} disabled={recipients.length === 0}>
              <Download /> Export CSV
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)} disabled={!session}>
              <Upload /> Import
            </Button>
            <Button onClick={openAdd} disabled={!session}>
              <Plus /> Add number
            </Button>
          </div>
        }
      />

      <p className="text-muted-foreground text-sm">
        Cadets set their own number on the cadet portal and staff set theirs in{" "}
        <a href="/settings" className="underline underline-offset-4">
          Settings
        </a>{" "}
        — both land here on their own. Add a number by hand only for someone with no account, like a parent.
      </p>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <MessageCircle className="text-muted-foreground size-4" />
            WhatsApp community
          </CardTitle>
          <CardDescription>
            Cadets and staff are shown this link once they&apos;ve saved a number, so they can join themselves
            — WhatsApp has no way for us to add anyone directly. Paste the community&apos;s invite link here;
            leave it empty to hide the prompt.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              value={inviteUrl}
              onChange={(e) => setInviteUrl(e.target.value)}
              placeholder="https://chat.whatsapp.com/…"
              className="flex-1 font-mono text-sm"
            />
            <Button onClick={handleInviteSave} disabled={inviteSaving || inviteUrl.trim() === savedInviteUrl}>
              {inviteSaving && <Spinner />}
              Save
            </Button>
          </div>
          {savedInviteUrl && (
            <a
              href={savedInviteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground flex w-fit items-center gap-1.5 text-xs underline underline-offset-4"
            >
              Check the link works <ExternalLink className="size-3" />
            </a>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      ) : recipients.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No recipients yet</EmptyTitle>
            <EmptyDescription>
              Nobody has saved a mobile number yet, and no numbers have been added by hand — so there is
              nowhere for a text to go.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <p className="text-muted-foreground text-sm">
            {recipients.length} recipient{recipients.length !== 1 ? "s" : ""} — {counts.cadet} cadet
            {counts.cadet !== 1 ? "s" : ""}, {counts.staff} staff, {counts.extra} without an account.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Greeted as</TableHead>
                <TableHead>Phone number</TableHead>
                <TableHead className="w-24" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {recipients.map((r) => (
                <TableRow key={r.key}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span>{r.name || "—"}</span>
                      <Badge variant="outline" className="text-xs font-normal">
                        {SOURCE_LABEL[r.source]}
                      </Badge>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {`${r.rank} ${r.surname}`.trim() || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-sm">{r.phone_number}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon-sm" aria-label="Edit" onClick={() => openEdit(r)}>
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove"
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
        </>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit ${editing.name || "recipient"}` : "Add a number"}</DialogTitle>
            <DialogDescription>
              {!editing && addMode !== "extra"
                ? "The number goes onto their own record, so the greeting comes from the roster and stays right as they’re promoted."
                : editingExtra
                  ? "Rank and surname are used in the text greeting, e.g. “Sgt Smith”."
                  : "The greeting comes from their record on the squadron roster, so only the number is editable here."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            {!editing && (
              <Field>
                <FieldLabel htmlFor="add-mode">Who is this number for?</FieldLabel>
                <Select
                  value={addMode}
                  onValueChange={(v) => {
                    setAddMode(v as AddMode);
                    setPicked(null);
                    setQuery("");
                  }}
                >
                  <SelectTrigger id="add-mode" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ADD_MODE_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {!editing && addMode !== "extra" && (
              <Field>
                <FieldLabel htmlFor="person-search">
                  {addMode === "cadet" ? "Cadet" : "Staff member"}
                </FieldLabel>
                {picked ? (
                  <div className="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-sm">
                    <span>{picked.label}</span>
                    <Button size="sm" variant="ghost" onClick={() => setPicked(null)}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <>
                    <Input
                      id="person-search"
                      placeholder="Search by name"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      autoComplete="off"
                    />
                    {hits.length > 0 && (
                      <div className="max-h-44 overflow-y-auto rounded-md border">
                        {hits.map((h) => (
                          <button
                            key={h.key}
                            type="button"
                            className="hover:bg-accent flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm"
                            onClick={() => {
                              setPicked(h);
                              setQuery("");
                            }}
                          >
                            <span>{h.label}</span>
                            {h.hint && <span className="text-muted-foreground text-xs">{h.hint}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                    {query.trim().length >= 2 && hits.length === 0 && (
                      <p className="text-muted-foreground text-xs">
                        Nobody by that name on the {addMode} roster. If they aren’t on it, add them as someone
                        with no account instead.
                      </p>
                    )}
                  </>
                )}
              </Field>
            )}
            {editingExtra && (editing || addMode === "extra") && (
              <>
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
              </>
            )}
            <Field>
              <FieldLabel htmlFor="phone">Phone number</FieldLabel>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                placeholder="07700900000"
                value={form.phone_number}
                onChange={(e) => setForm({ ...form, phone_number: e.target.value })}
              />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving || !form.phone_number.trim() || (!editing && addMode !== "extra" && !picked)}
            >
              {saving && <Spinner />}
              {editing ? "Save changes" : "Add number"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={importOpen}
        onOpenChange={(open) => {
          setImportOpen(open);
          if (!open) setImportFile(null);
        }}
      >
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Import numbers</DialogTitle>
            <DialogDescription>
              Upload a .csv or .xlsx with columns: phone number, rank, surname (same layout as the old Numbers
              sheet). Each number goes onto the cadet or staff member it names, where the name can be matched.
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
                <SelectTrigger id="import-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="merge">Merge — add new numbers, update existing</SelectItem>
                  <SelectItem value="replace">Replace — wipe the added-by-hand numbers first</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {importMode === "replace" && (
              <p className="text-destructive text-xs">
                Replace deletes every number added by hand before importing. Numbers cadets and staff saved on
                their own records are left alone.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
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
            <AlertDialogTitle>Take this number off the list?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting && `${deleting.name || deleting.surname} (${deleting.phone_number})`} will no longer
              receive parade night texts.
              {deleting && deleting.source !== "extra"
                ? " Their record stays — only the number is cleared, and they can save a new one themselves."
                : ""}
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
