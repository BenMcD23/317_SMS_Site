"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Copy, ExternalLink, Loader2, Mail, Pencil, RotateCcw } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ErrorAlert } from "@/components/error-alert";
import { useConfirm } from "@/components/confirm-dialog";
import { LEAVING_KEY } from "@/components/oc/leaving-process-card";
import { apiRequest } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";
import { copyText } from "@/lib/clipboard";
import {
  LEAVING_EMAIL_PLACEHOLDERS,
  type LeavingCadet,
  type LeavingEmailTemplate,
  type LeavingResponse,
  bccFor,
  cadetsToEmail,
  fillLeavingEmail,
  gmailComposeUrl,
} from "@/lib/leaving";
import { LEAVING_EMAIL_KEY, useLeavingEmail } from "@/lib/use-leaving-email";
import { useApiQuery } from "@/lib/use-api-query";

/**
 * The email to the parents of the cadets flagged in the leaving process: the
 * OC saves their wording once, then each flagged cadet gets a button that opens
 * Gmail (in the OC's own account) with that cadet's parents in the BCC and their
 * name filled in. The site deliberately doesn't send to parents — the OC does
 * that from their own account. The Cadet Records Scraper adds addresses from
 * Bader's Next Of Kin report; the OC can add more here, and the scraper never
 * removes one.
 */
export function ParentEmailsCard() {
  const [editing, setEditing] = useState(false);
  const { data: session } = useSession();
  const { data, isLoading, error } = useApiQuery<LeavingResponse>(LEAVING_KEY, "/leaving-process");
  const email = useLeavingEmail();

  // Only cadets whose parents still need the query: not everyone on file.
  const cadets = cadetsToEmail(data?.cadets ?? []);
  const bcc = bccFor(cadets);
  const missing = cadets.filter((c) => c.parentEmails.length === 0).length;

  async function copyAll() {
    if (!bcc) return;
    const ok = await copyText(bcc);
    if (ok) toast.success("Copied all parent emails");
    else toast.error("Couldn't copy — select the text and copy it by hand");
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="text-muted-foreground size-4" />
          Email the parents
          {data && (
            <Badge variant="secondary" className="ml-auto text-xs font-normal">
              {cadets.length}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          For cadets marked &ldquo;Parents not contacted&rdquo;. Each button opens Gmail with their parents in
          the BCC and your message ready to send.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <ErrorAlert message={error.message} title="Could not load parent emails" />
        ) : isLoading || !data ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <TemplateEditor
              key={email.saved ? "saved" : "default"}
              template={email.template}
              saved={email.saved}
              loadError={email.error}
            />
            {cadets.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nobody is waiting to be contacted. Cadets appear here once they&apos;ve missed eight weeks of
                parades.
              </p>
            ) : (
              <>
                <ul className="divide-y rounded-md border" aria-label="Cadets to email">
                  {cadets.map((c) => (
                    <LeaverRow
                      key={c.cin}
                      cadet={c}
                      account={session?.user?.email}
                      template={email.template}
                    />
                  ))}
                </ul>
                <div className="flex flex-wrap items-center gap-2">
                  <Button variant="outline" onClick={copyAll} disabled={!bcc}>
                    <Copy data-icon="inline-start" />
                    Copy all parent emails
                  </Button>
                  <Button variant="outline" onClick={() => setEditing(true)}>
                    <Pencil data-icon="inline-start" />
                    Edit emails
                  </Button>
                  {missing > 0 && (
                    <span className="text-warning text-xs">
                      {missing} cadet{missing !== 1 ? "s have" : " has"} no parent email
                    </span>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </CardContent>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit parent emails</DialogTitle>
            <DialogDescription>
              Separate several addresses with a semicolon. Each row saves on its own.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
            {cadets.map((c) => (
              <ParentEmailsRow
                key={c.cin}
                cin={c.cin}
                name={c.name}
                flight={c.flight}
                emails={c.parentEmails}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

/**
 * The saved wording. Remounted (via `key`) when a save or reset lands so the
 * boxes show what's stored; until then edits stay in local state.
 */
function TemplateEditor({
  template,
  saved,
  loadError,
}: {
  template: LeavingEmailTemplate;
  saved: boolean;
  loadError: Error | null;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [subject, setSubject] = useState(template.subject);
  const [body, setBody] = useState(template.body);
  const [busy, setBusy] = useState<"save" | "reset" | null>(null);
  // Saving the default wording is allowed: it pins it in case the default changes.
  const dirty = subject !== template.subject || body !== template.body || !saved;

  async function run(kind: "save" | "reset") {
    if (!session?.id_token) return;
    setBusy(kind);
    try {
      await apiRequest(
        session.id_token,
        `${API_BASE}/oc/leaving-email`,
        kind === "save" ? { method: "PUT", body: { subject, body } } : { method: "DELETE" },
        "Could not save"
      );
      await queryClient.invalidateQueries({ queryKey: LEAVING_EMAIL_KEY });
      toast.success(kind === "save" ? "Saved your message" : "Back to the standard message");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-label="Your message">
      {loadError && (
        <ErrorAlert
          message={`${loadError.message} Showing the standard message instead.`}
          title="Could not load your saved message"
        />
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="leaving-email-subject">Subject</Label>
        <Input id="leaving-email-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="leaving-email-body">Message</Label>
        <Textarea
          id="leaving-email-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-48"
        />
        <p className="text-muted-foreground text-xs">
          Type{" "}
          {LEAVING_EMAIL_PLACEHOLDERS.map((p, i) => (
            <span key={p.token}>
              {i > 0 && " or "}
              <code className="bg-muted rounded px-1">{p.token}</code> for {p.hint}
            </span>
          ))}
          . It&apos;s filled in for each cadet.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => run("save")} disabled={!dirty || busy !== null || !body.trim()}>
          {busy === "save" && <Loader2 className="animate-spin" data-icon="inline-start" />}
          Save message
        </Button>
        {saved && (
          <Button
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              confirm("Go back to the standard message? Yours will be deleted.", () => run("reset"))
            }
          >
            <RotateCcw data-icon="inline-start" />
            Use standard message
          </Button>
        )}
      </div>
      {confirmDialog}
    </section>
  );
}

/** One flagged cadet: who they are, whose inboxes it goes to, and the two ways to send. */
function LeaverRow({
  cadet,
  account,
  template,
}: {
  cadet: LeavingCadet;
  account: string | null | undefined;
  template: LeavingEmailTemplate;
}) {
  const subject = fillLeavingEmail(template.subject, cadet.name, cadet.weeksAbsent);
  const body = fillLeavingEmail(template.body, cadet.name, cadet.weeksAbsent);
  const bcc = cadet.parentEmails.join(";");

  async function copyMessage() {
    const ok = await copyText(subject ? `Subject: ${subject}\n\n${body}` : body);
    if (ok) toast.success(`Copied message for ${cadet.name}`);
    else toast.error("Couldn't copy — select the text and copy it by hand");
  }

  return (
    <li className="flex flex-col gap-2 p-3">
      <div>
        <p className="text-sm font-medium">
          {cadet.name}
          {cadet.flight && (
            <span className="text-muted-foreground font-normal"> · {cadet.flight} Flight</span>
          )}
        </p>
        {bcc ? (
          <p className="text-muted-foreground font-mono text-xs break-all">{bcc}</p>
        ) : (
          <p className="text-warning text-xs">
            No parent email on file. Use &ldquo;Edit emails&rdquo; to add one.
          </p>
        )}
      </div>
      {bcc && (
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm">
            <a
              href={gmailComposeUrl({ account, bcc, subject, body })}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open email to ${cadet.name}'s parents in Gmail`}
            >
              <ExternalLink data-icon="inline-start" />
              Open in Gmail
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={copyMessage}
            aria-label={`Copy message for ${cadet.name}`}
          >
            <Copy data-icon="inline-start" />
            Copy message
          </Button>
        </div>
      )}
    </li>
  );
}

function ParentEmailsRow({
  cin,
  name,
  flight,
  emails,
}: {
  cin: number;
  name: string;
  flight: string | null;
  emails: string[];
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const saved = emails.join("; ");
  const [value, setValue] = useState(saved);
  const [saving, setSaving] = useState(false);
  const dirty = value.trim() !== saved;

  async function save() {
    if (!session?.id_token) return;
    setSaving(true);
    try {
      const res = await apiRequest<{ parentEmails: string[] }>(
        session.id_token,
        `${API_BASE}/oc/parent-emails/${cin}`,
        { method: "PUT", body: { emails: value } },
        "Could not save"
      );
      setValue(res.parentEmails.join("; "));
      await queryClient.invalidateQueries({ queryKey: LEAVING_KEY });
      toast.success(`Saved ${name}`);
    } catch (e: unknown) {
      // The API names the bad address, so the OC can fix the typo.
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid items-center gap-2 sm:grid-cols-[12rem_1fr_auto]">
      <span className="truncate text-sm">
        {name}
        {flight && <span className="text-muted-foreground"> · {flight}</span>}
      </span>
      <Input
        aria-label={`Parent emails for ${name}`}
        value={value}
        placeholder="parent@example.com; other@example.com"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && dirty && save()}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={save}
        disabled={!dirty || saving}
        aria-label={`Save ${name}`}
      >
        {saving ? <Loader2 className="animate-spin" /> : "Save"}
      </Button>
    </div>
  );
}
