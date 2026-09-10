"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, FileDown, FileText, Mail, Pencil, Save, Sparkles, Trash2, X,
} from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { AppraisalForm } from "@/components/nco-appraisals/appraisal-form";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatDate, formatTimestamp } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";
import {
  APPRAISAL_SECTIONS, deleteAppraisal, downloadAppraisal, draftFrom, emailAppraisal,
  updateAppraisal, type Appraisal, type AppraisalDraft,
} from "@/lib/nco-appraisals";

export default function AppraisalDetailPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const token = session?.id_token;

  // `draft` is seeded from the saved appraisal when edit mode opens, so
  // cancelling and re-opening never resurrects abandoned edits — and a
  // background refetch mid-edit can't overwrite what's being typed.
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<AppraisalDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState<"docx" | "pdf" | null>(null);

  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [sending, setSending] = useState(false);

  function startEditing(appraisal: Appraisal) {
    setDraft(draftFrom(appraisal));
    setEditing(true);
  }

  const { data, isLoading, error } = useApiQuery<Appraisal>(
    ["nco-appraisal", id],
    `/nco-appraisals/${id}`,
    { enabled: Number.isFinite(id) },
  );
  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["nco-appraisal", id] });
    queryClient.invalidateQueries({ queryKey: ["nco-appraisals"] });
  };

  async function save() {
    if (!token || !draft) return;
    setSaving(true);
    try {
      await updateAppraisal(token, id, draft);
      toast.success("Appraisal updated.");
      setEditing(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the appraisal.");
    } finally {
      setSaving(false);
    }
  }

  async function download(format: "docx" | "pdf") {
    if (!token) return;
    setDownloading(format);
    try {
      await downloadAppraisal(token, id, format);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't build the document.");
    } finally {
      setDownloading(null);
    }
  }

  function openEmail() {
    setEmailTo(data?.cadet_email ?? "");
    setEmailOpen(true);
  }

  async function send() {
    if (!token) return;
    setSending(true);
    try {
      await emailAppraisal(token, id, { to: emailTo.trim() || undefined });
      toast.success("Appraisal emailed as a PDF.");
      setEmailOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't send the appraisal.");
    } finally {
      setSending(false);
    }
  }

  function remove() {
    confirm(
      `Delete the appraisal for ${data?.nco_name ?? "this NCO"}? This can't be undone.`,
      async () => {
        if (!token) return;
        try {
          await deleteAppraisal(token, id);
          queryClient.invalidateQueries({ queryKey: ["nco-appraisals"] });
          toast.success("Appraisal deleted.");
          router.push("/nco-appraisals");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Couldn't delete the appraisal.");
        }
      },
    );
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-4">
        <ErrorAlert message={error?.message ?? "Appraisal not found"} />
        <Button asChild variant="outline" className="self-start">
          <Link href="/nco-appraisals">
            <ArrowLeft className="size-4" />
            Back to appraisals
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={data.nco_name || "NCO Appraisal"}
        description={`Appraised ${formatDate(data.appraisal_date)} by ${data.author_name}`}
        actions={
          editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                <X className="size-4" />
                Cancel
              </Button>
              <Button onClick={save} disabled={saving}>
                <Save className="size-4" />
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </>
          ) : (
            <>
              <Button asChild variant="outline">
                <Link href="/nco-appraisals">
                  <ArrowLeft className="size-4" />
                  Back
                </Link>
              </Button>
              <Button variant="outline" onClick={() => startEditing(data)}>
                <Pencil className="size-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                onClick={() => download("docx")}
                disabled={downloading !== null}
              >
                <FileText className="size-4" />
                {downloading === "docx" ? "Building…" : "Word"}
              </Button>
              <Button
                variant="outline"
                onClick={() => download("pdf")}
                disabled={downloading !== null}
              >
                <FileDown className="size-4" />
                {downloading === "pdf" ? "Building…" : "PDF"}
              </Button>
              <Button onClick={openEmail}>
                <Mail className="size-4" />
                Email to NCO
              </Button>
            </>
          )
        }
      />

      {editing && draft ? (
        <>
          <AppraisalForm
            draft={draft}
            setDraft={setDraft}
            // The NCO is fixed here, so the picker is disabled and the list
            // it would populate is never read.
            ncos={[]}
            token={token}
            lockedNco
          />
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={save} disabled={saving}>
              <Save className="size-4" />
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </div>
        </>
      ) : (
        <>
          <Card>
            <CardContent className="grid gap-4 sm:grid-cols-3">
              <Field label="Age" value={data.age} />
              <Field label="Attendance" value={data.attendance} />
              <Field
                label="Next NCO review"
                value={`${formatDate(data.next_review_date)} (${data.next_review_months} months)`}
              />
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-2">
            {data.cause_for_concern && (
              <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                Cause for concern
              </Badge>
            )}
            {data.extend_probation && (
              <Badge variant="outline" className="border-warning/40 bg-warning/15 text-warning">
                Extend probation
              </Badge>
            )}
            {data.generated_by && (
              <Badge variant="outline" className="gap-1">
                <Sparkles className="size-3" />
                Drafted by {data.generated_by_label}
              </Badge>
            )}
            {data.emailed_at && (
              <Badge variant="outline" className="gap-1 text-muted-foreground">
                <Mail className="size-3" />
                Sent to {data.emailed_to} on {formatTimestamp(data.emailed_at)}
              </Badge>
            )}
          </div>

          {APPRAISAL_SECTIONS.map((section) => (
            <Card key={section.key}>
              <CardHeader>
                <CardTitle className="text-base">{section.label}</CardTitle>
              </CardHeader>
              <CardContent>
                {data[section.key].trim() ? (
                  <p className="whitespace-pre-wrap text-sm leading-relaxed">
                    {data[section.key]}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">Not filled in.</p>
                )}
              </CardContent>
            </Card>
          ))}

          <div className="flex justify-end border-t pt-4">
            <Button variant="outline" className="text-destructive" onClick={remove}>
              <Trash2 className="size-4" />
              Delete appraisal
            </Button>
          </div>
        </>
      )}

      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Email this appraisal</DialogTitle>
            <DialogDescription>
              Sends the appraisal as a PDF attachment. Replies come back to you, not
              to the noreply mailbox.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="appraisal-email-to">Send to</Label>
            <Input
              id="appraisal-email-to"
              type="email"
              value={emailTo}
              onChange={(e) => setEmailTo(e.target.value)}
              placeholder="cadet@317atc.co.uk"
            />
            {!data.cadet_email && (
              <p className="text-xs text-muted-foreground">
                This NCO has no email address on record, so you&apos;ll need to type one.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEmailOpen(false)}>Cancel</Button>
            <Button onClick={send} disabled={sending || !emailTo.trim()}>
              <Mail className="size-4" />
              {sending ? "Sending…" : "Send PDF"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );
}
