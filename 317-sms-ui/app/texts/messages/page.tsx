"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldLabel } from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PageHeader } from "@/components/page-header";
import { Sparkles, Send, RefreshCw, Save, CheckCircle2, Undo2, AlertTriangle, ChevronDown, Cpu, Info } from "lucide-react";
import { toast } from "sonner";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

// ─── Types ────────────────────────────────────────────────────────────────────

type SendResult = { phone: string; status: "sent" | "failed"; error?: string };

type ParadeMessage = {
  id: number;
  parade_date: string;
  uniform: string;
  uniform_raw: string;
  dnco: string;
  c_flight_raw: string;
  main_body_raw: string;
  main_message: string;
  c_flight_message: string;
  status: "draft" | "ready" | "sent";
  generated_by_label: string | null;
  generated_with_fallback: boolean;
  generated_at: string | null;
  sent_at: string | null;
  send_results: SendResult[] | null;
};

type ModelUsage = { model: string; label: string; count: number; fallback: boolean };

type Editable = Pick<ParadeMessage, "uniform" | "dnco" | "main_message" | "c_flight_message">;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 3 }, (_, i) => currentYear + 1 - i);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatParadeDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });
}

/** Approximate SMS segment count (GSM-7: 160 single / 153 per multi-part segment). */
function smsSegments(text: string): number {
  if (!text) return 0;
  return text.length <= 160 ? 1 : Math.ceil(text.length / 153);
}

/** The personalisation sections, assembled the way the Notify template combines them. */
function previewText(m: Editable): string {
  return [
    m.uniform ? `Uniform: ${m.uniform}` : "",
    m.main_message,
    m.c_flight_message ? `C Flight\n${m.c_flight_message}` : "",
    m.dnco ? `DNCO: ${m.dnco}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function StatusBadge({ status }: { status: ParadeMessage["status"] }) {
  if (status === "sent") return <Badge className="bg-success/15 text-success">Sent</Badge>;
  if (status === "ready") return <Badge className="bg-primary/15 text-primary">Ready to send</Badge>;
  return <Badge variant="secondary">Draft</Badge>;
}

/** Small line showing which AI model wrote this message, flagged if it fell back. */
function ModelLine({ message }: { message: ParadeMessage }) {
  if (!message.generated_by_label) return null;
  if (message.generated_with_fallback) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-warning">
        <AlertTriangle className="size-3.5" />
        Written by {message.generated_by_label} — the preferred model had hit its daily free-tier limit.
      </p>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Cpu className="size-3.5" />
      Written by {message.generated_by_label}
    </p>
  );
}

// ─── Message card ─────────────────────────────────────────────────────────────

function MessageCard({
  message,
  onPatch,
  onAction,
}: {
  message: ParadeMessage;
  onPatch: (id: number, body: Partial<Editable> & { status?: "draft" | "ready" }) => Promise<boolean>;
  onAction: (id: number, action: "regenerate" | "send" | "test-send", body?: object) => Promise<boolean>;
}) {
  const [edit, setEdit] = useState<Editable>({
    uniform: message.uniform,
    dnco: message.dnco,
    main_message: message.main_message,
    c_flight_message: message.c_flight_message,
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState("");
  const [testOpen, setTestOpen] = useState(false);

  // Refresh local edits when the server copy changes (regenerate, month switch)
  useEffect(() => {
    setEdit({
      uniform: message.uniform,
      dnco: message.dnco,
      main_message: message.main_message,
      c_flight_message: message.c_flight_message,
    });
  }, [message.uniform, message.dnco, message.main_message, message.c_flight_message]);

  const dirty =
    edit.uniform !== message.uniform ||
    edit.dnco !== message.dnco ||
    edit.main_message !== message.main_message ||
    edit.c_flight_message !== message.c_flight_message;

  const sent = message.status === "sent";
  const preview = previewText(edit);
  const failures = (message.send_results ?? []).filter((r) => r.status === "failed");

  const run = async (key: string, fn: () => Promise<boolean>) => {
    setBusy(key);
    await fn();
    setBusy(null);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{formatParadeDate(message.parade_date)}</CardTitle>
        <CardAction>
          <StatusBadge status={message.status} />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ModelLine message={message} />

        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="-ml-2 w-fit text-muted-foreground group">
              <ChevronDown className="transition-transform group-data-[state=open]:rotate-180" />
              Parsed programme data
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 grid gap-4 rounded-md border bg-muted/40 p-3 text-sm sm:grid-cols-2">
              <div>
                <p className="mb-1 text-xs font-medium text-muted-foreground">Main body</p>
                <p className="whitespace-pre-wrap">{message.main_body_raw || "—"}</p>
              </div>
              <div className="flex flex-col gap-3">
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">C Flight</p>
                  <p className="whitespace-pre-wrap">{message.c_flight_raw || "—"}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">Uniform</p>
                  <p className="whitespace-pre-wrap">{message.uniform_raw || "—"}</p>
                </div>
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">DNCO</p>
                  <p>{message.dnco || "—"}</p>
                </div>
              </div>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`uniform-${message.id}`}>Uniform</FieldLabel>
            <Input
              id={`uniform-${message.id}`}
              value={edit.uniform}
              disabled={sent}
              onChange={(e) => setEdit({ ...edit, uniform: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`dnco-${message.id}`}>DNCO</FieldLabel>
            <Input
              id={`dnco-${message.id}`}
              value={edit.dnco}
              disabled={sent}
              onChange={(e) => setEdit({ ...edit, dnco: e.target.value })}
            />
          </Field>
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <Field>
            <FieldLabel htmlFor={`main-${message.id}`}>Main flight message</FieldLabel>
            <Textarea
              id={`main-${message.id}`}
              rows={6}
              value={edit.main_message}
              disabled={sent}
              onChange={(e) => setEdit({ ...edit, main_message: e.target.value })}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`cflight-${message.id}`}>C Flight message</FieldLabel>
            <Textarea
              id={`cflight-${message.id}`}
              rows={6}
              value={edit.c_flight_message}
              disabled={sent}
              onChange={(e) => setEdit({ ...edit, c_flight_message: e.target.value })}
            />
          </Field>
        </div>

        <div className="rounded-md border bg-muted/40 p-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-medium">Preview</span>
            <span>
              {preview.length} chars · ~{smsSegments(preview)} SMS segment{smsSegments(preview) !== 1 ? "s" : ""} + greeting
            </span>
          </div>
          <p className="whitespace-pre-wrap text-sm">{preview || "Nothing to send yet."}</p>
        </div>

        {sent && (
          <div className="text-sm text-muted-foreground">
            Sent {message.sent_at ? new Date(message.sent_at).toLocaleString("en-GB") : ""}
            {message.send_results && ` · ${message.send_results.length - failures.length}/${message.send_results.length} delivered to Notify`}
            {failures.length > 0 && (
              <div className="mt-2 flex flex-col gap-1 text-destructive">
                {failures.map((f) => (
                  <span key={f.phone} className="flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5" /> {f.phone}: {f.error}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {!sent && (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <Button
              size="sm"
              variant="outline"
              disabled={!dirty || busy !== null}
              onClick={() => run("save", () => onPatch(message.id, edit))}
            >
              {busy === "save" ? <Spinner /> : <Save />} Save
            </Button>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="outline" disabled={busy !== null}>
                  {busy === "regenerate" ? <Spinner /> : <RefreshCw />} Regenerate
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Regenerate with AI?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This replaces the current message text (including any edits) with a fresh AI
                    version from the programme data, and sets the night back to draft.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => run("regenerate", () => onAction(message.id, "regenerate"))}>
                    Regenerate
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>

            {message.status === "draft" ? (
              <Button
                size="sm"
                disabled={busy !== null || dirty}
                title={dirty ? "Save your edits first" : undefined}
                onClick={() => run("ready", () => onPatch(message.id, { status: "ready" }))}
              >
                {busy === "ready" ? <Spinner /> : <CheckCircle2 />} Mark ready
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={busy !== null}
                onClick={() => run("ready", () => onPatch(message.id, { status: "draft" }))}
              >
                {busy === "ready" ? <Spinner /> : <Undo2 />} Back to draft
              </Button>
            )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex sm:items-center">
              <Dialog open={testOpen} onOpenChange={setTestOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={busy !== null}>
                    Test send
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-sm">
                  <DialogHeader>
                    <DialogTitle>Send a test text</DialogTitle>
                    <DialogDescription>
                      Sends this message to a single number only (named &quot;Test Recipient&quot;).
                    </DialogDescription>
                  </DialogHeader>
                  <Field>
                    <FieldLabel htmlFor={`test-phone-${message.id}`}>Phone number</FieldLabel>
                    <Input
                      id={`test-phone-${message.id}`}
                      placeholder="07700900000"
                      value={testPhone}
                      onChange={(e) => setTestPhone(e.target.value)}
                    />
                  </Field>
                  <DialogFooter>
                    <Button
                      disabled={!testPhone.trim() || busy !== null}
                      onClick={() =>
                        run("test", async () => {
                          const ok = await onAction(message.id, "test-send", { phone_number: testPhone });
                          if (ok) setTestOpen(false);
                          return ok;
                        })
                      }
                    >
                      {busy === "test" ? <Spinner /> : <Send />} Send test
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={busy !== null || dirty}
                    title={dirty ? "Save your edits first" : undefined}>
                    {busy === "send" ? <Spinner /> : <Send />} Send now
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Send to all recipients now?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This immediately texts every recipient on the list for{" "}
                      {formatParadeDate(message.parade_date)}. It can&apos;t be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => run("send", () => onAction(message.id, "send"))}>
                      Send to everyone
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TextMessagesPage() {
  const { data: session } = useSession();

  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [messages, setMessages] = useState<ParadeMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const authHeaders = useMemo(
    () => ({ Authorization: `Bearer ${session?.id_token}`, "Content-Type": "application/json" }),
    [session?.id_token]
  );

  const loadMessages = useCallback(async () => {
    if (!session?.id_token) return;
    setLoading(true);
    try {
      const resp = await apiFetch(`${API_BASE}/texts/messages?month=${month}&year=${year}`, {
        headers: authHeaders,
      });
      if (!resp.ok) {
        toast.error("Failed to load messages.");
        return;
      }
      setMessages(await resp.json());
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setLoading(false);
    }
  }, [session?.id_token, month, year, authHeaders]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const resp = await apiFetch(`${API_BASE}/texts/generate?month=${month}&year=${year}`, {
        method: "POST",
        headers: authHeaders,
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast.error(data.detail || "Generation failed.");
        return;
      }

      const models: ModelUsage[] = data.models_used ?? [];
      const fellBack = models.filter((m) => m.fallback);
      const base =
        `Generated ${data.generated} message${data.generated !== 1 ? "s" : ""}` +
        (data.skipped_sent ? ` (${data.skipped_sent} already sent, left alone)` : "");

      if (fellBack.length > 0) {
        const breakdown = models.map((m) => `${m.count} × ${m.label}`).join(", ");
        toast.warning(`${base}. Best model hit its daily free-tier limit — fell back to a backup model.`, {
          description: breakdown,
          duration: 10000,
        });
      } else {
        toast.success(base, models.length ? { description: `Written by ${models[0].label}` } : undefined);
      }
      await loadMessages();
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setGenerating(false);
    }
  };

  const replaceMessage = (updated: ParadeMessage) =>
    setMessages((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));

  const handlePatch = async (
    id: number,
    body: Partial<Editable> & { status?: "draft" | "ready" }
  ): Promise<boolean> => {
    try {
      const resp = await apiFetch(`${API_BASE}/texts/messages/${id}`, {
        method: "PATCH",
        headers: authHeaders,
        body: JSON.stringify(body),
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast.error(data.detail || "Update failed.");
        return false;
      }
      replaceMessage(data);
      toast.success(body.status ? `Marked as ${body.status === "ready" ? "ready to send" : "draft"}.` : "Saved.");
      return true;
    } catch {
      toast.error("Server unreachable.");
      return false;
    }
  };

  const handleAction = async (
    id: number,
    action: "regenerate" | "send" | "test-send",
    body?: object
  ): Promise<boolean> => {
    try {
      const resp = await apiFetch(`${API_BASE}/texts/messages/${id}/${action}`, {
        method: "POST",
        headers: authHeaders,
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await resp.json();
      if (!resp.ok) {
        toast.error(data.detail || "Action failed.");
        return false;
      }
      if (action === "regenerate") {
        replaceMessage(data);
        if (data.generated_with_fallback) {
          toast.warning(`Regenerated with ${data.generated_by_label}.`, {
            description: "The preferred model had hit its daily free-tier limit.",
          });
        } else {
          toast.success(`Regenerated with ${data.generated_by_label ?? "AI"}.`);
        }
      } else if (action === "send") {
        replaceMessage(data.message);
        if (data.failed > 0) toast.warning(`Sent to ${data.sent}, but ${data.failed} failed — see card for details.`);
        else toast.success(`Sent to ${data.sent} recipient${data.sent !== 1 ? "s" : ""}.`);
      } else {
        toast.success("Test text sent.");
      }
      return true;
    } catch {
      toast.error("Server unreachable.");
      return false;
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <PageHeader
        title="Parade Night Texts"
        description="Generate, review and approve the weekly SMS — texts go out automatically at 4pm the day before each parade night"
      />

      <div className="flex flex-wrap items-end gap-3">
        <Field className="w-36">
          <FieldLabel htmlFor="month">Month</FieldLabel>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger id="month"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {MONTHS.map((m, i) => (
                  <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
        <Field className="w-28">
          <FieldLabel htmlFor="year">Year</FieldLabel>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger id="year"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button className="ml-auto" disabled={generating || !session}>
              {generating ? <Spinner /> : <Sparkles />}
              {generating ? "Generating…" : "Generate from programme"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Generate messages from the programme?</AlertDialogTitle>
              <AlertDialogDescription>
                Reads the {MONTHS[Number(month) - 1]} {year} programme doc and creates an AI-drafted
                text for each parade night. Existing drafts for this month are overwritten (including
                edits); nights already sent are left untouched.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleGenerate}>Generate</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <p className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <span>
          The best AI model is on a free tier limited to ~20 generations a day. Generate a month once
          and edit by hand where you can, rather than re-generating repeatedly — each night you generate
          or regenerate uses one. If the daily limit is reached, texts are still written by a backup model
          (you&apos;ll see a note on those).
        </span>
      </p>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner className="size-6" /></div>
      ) : messages.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No messages for {MONTHS[Number(month) - 1]} {year}</EmptyTitle>
            <EmptyDescription>
              Use &quot;Generate from programme&quot; to create drafts from the programme doc.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        messages.map((m) => (
          <MessageCard key={m.id} message={m} onPatch={handlePatch} onAction={handleAction} />
        ))
      )}
    </div>
  );
}
