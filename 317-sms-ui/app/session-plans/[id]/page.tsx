"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiQuery } from "@/lib/use-api-query";
import { PageHeader } from "@/components/page-header";
import { AttachmentList } from "@/components/session-plans/attachment-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Check, Loader2, MessageSquare, Pencil, Send, Trash2, Undo2,
} from "lucide-react";
import { formatDate, formatTimestamp } from "@/lib/format";
import {
  submitPlan, reviewPlan, deletePlan, addComment, deleteComment,
} from "@/lib/session-plans-api";
import {
  HEADER_FIELDS, PLAN_SECTIONS, STATUS_LABELS, STATUS_STYLE, contentOf,
  missingForSubmit, type SessionPlanDetail, type SessionPlanSectionKey,
} from "@/lib/session-plans";

export default function SessionPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const planId = Number(id);
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [feedback, setFeedback] = useState<Partial<Record<SessionPlanSectionKey, string>>>({});
  const [amendOpen, setAmendOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [comment, setComment] = useState("");

  const { data: plan, isLoading, error } = useApiQuery<SessionPlanDetail>(
    ["session-plan", id],
    `/session-plans/${id}`,
  );

  const token = session?.id_token;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["session-plan", id] });
    queryClient.invalidateQueries({ queryKey: ["session-plans"] });
  };

  const run = async (label: string, fn: () => Promise<unknown>, success: string) => {
    if (!token) return false;
    setBusy(label);
    try {
      await fn();
      toast.success(success);
      refresh();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (error || !plan) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-sm text-destructive">{error?.message ?? "Session plan not found."}</p>
        <Button asChild variant="ghost" size="sm" className="mt-2">
          <Link href="/session-plans"><ArrowLeft /> Back to session plans</Link>
        </Button>
      </div>
    );
  }

  const style = STATUS_STYLE[plan.status];
  const content = contentOf(plan);
  const missing = missingForSubmit(content);
  const reviewBody = { note, feedback: feedback as Record<string, string> };
  const hasAmendmentDetail = !!note.trim() || Object.values(feedback).some((v) => v?.trim());

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {plan.session_name || "Untitled plan"}
            <Badge variant={style.variant} className={style.className}>
              {STATUS_LABELS[plan.status]}
            </Badge>
          </span>
        }
        description={`${plan.author_name} · ${formatDate(plan.session_date, "no date set")}`}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/session-plans"><ArrowLeft /> Back</Link>
          </Button>
        }
      />

      {/* ── What staff said ─────────────────────────────────────────────────── */}
      {plan.status === "amendments_requested" && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-medium">Amendments requested{plan.reviewed_by ? ` by ${plan.reviewed_by}` : ""}</p>
          {plan.amendment_note && <p className="whitespace-pre-wrap">{plan.amendment_note}</p>}
          {plan.is_author && (
            <p className="mt-1 text-xs text-muted-foreground">
              Comments on individual sections are shown against each one below.
            </p>
          )}
        </div>
      )}
      {plan.status === "approved" && (
        <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm">
          <p className="font-medium">
            Approved{plan.reviewed_by ? ` by ${plan.reviewed_by}` : ""}
            {plan.reviewed_at ? ` on ${formatTimestamp(plan.reviewed_at)}` : ""}
          </p>
          {plan.amendment_note && <p className="whitespace-pre-wrap">{plan.amendment_note}</p>}
        </div>
      )}

      {/* ── Author actions ──────────────────────────────────────────────────── */}
      {plan.is_author && plan.status !== "approved" && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-2">
            {plan.can_edit && (
              <>
                <Button asChild variant="outline" size="sm">
                  <Link href={`/session-plans/${id}/edit`}><Pencil /> Edit</Link>
                </Button>
                <Button
                  size="sm"
                  disabled={busy !== null || missing.length > 0}
                  onClick={() =>
                    run("submit", () => submitPlan(token!, planId),
                        "Submitted — staff have been emailed.")
                  }
                >
                  {busy === "submit" ? <Loader2 className="animate-spin" /> : <Send />}
                  {plan.status === "amendments_requested" ? "Resubmit for approval" : "Submit for approval"}
                </Button>
              </>
            )}
            {plan.status === "submitted" && (
              <p className="text-sm text-muted-foreground">
                With staff for review — you&apos;ll be emailed when they approve it or ask for changes.
              </p>
            )}

            <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-muted-foreground" disabled={busy !== null}>
                  <Trash2 /> Delete
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Delete this session plan?</DialogTitle>
                  <DialogDescription>This can&apos;t be undone.</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost" onClick={() => setDeleteOpen(false)}>Keep it</Button>
                  <Button
                    variant="destructive"
                    disabled={busy !== null}
                    onClick={async () => {
                      const ok = await run("delete", () => deletePlan(token!, planId), "Plan deleted.");
                      if (ok) { setDeleteOpen(false); router.push("/session-plans"); }
                    }}
                  >
                    {busy === "delete" ? <Loader2 className="animate-spin" /> : null} Delete
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {plan.can_edit && missing.length > 0 && (
              <p className="w-full text-xs text-muted-foreground">
                Still needed before submitting: {missing.join(", ")}.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Staff review ────────────────────────────────────────────────────── */}
      {plan.can_review && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Staff Review</CardTitle>
            <p className="text-sm text-muted-foreground">
              Comment on any section below, then approve the plan or send it back. Either way
              {" "}{plan.author_name} gets an email with what you wrote.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="review-note">Overall note</Label>
              <Textarea
                id="review-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Required when sending back for amendment; optional when approving."
                rows={3}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy !== null}
                onClick={() =>
                  run("approve", () => reviewPlan(token!, planId, "approve", reviewBody),
                      `Approved — ${plan.author_name} has been emailed.`)
                }
              >
                {busy === "approve" ? <Loader2 className="animate-spin" /> : <Check />} Approve
              </Button>
              <Dialog open={amendOpen} onOpenChange={setAmendOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline" disabled={busy !== null || !hasAmendmentDetail}>
                    <Undo2 /> Send back for amendment
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Send this plan back?</DialogTitle>
                    <DialogDescription>
                      {plan.author_name} will be emailed your note and any section comments, and can
                      edit the plan and resubmit it.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setAmendOpen(false)}>Cancel</Button>
                    <Button
                      disabled={busy !== null}
                      onClick={async () => {
                        const ok = await run(
                          "amend",
                          () => reviewPlan(token!, planId, "request-amendments", reviewBody),
                          `Sent back — ${plan.author_name} has been emailed.`,
                        );
                        if (ok) setAmendOpen(false);
                      }}
                    >
                      {busy === "amend" ? <Loader2 className="animate-spin" /> : null} Send back
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              {!hasAmendmentDetail && (
                <p className="w-full text-xs text-muted-foreground">
                  Add a note or a section comment before sending it back, so the NCO knows what to change.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── The plan ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">The Session</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {HEADER_FIELDS.map((field) => (
            <div key={field.key} className={field.multiline ? "sm:col-span-2" : undefined}>
              <p className="text-xs text-muted-foreground">{field.label}</p>
              <p className="whitespace-pre-wrap text-sm">
                {field.type === "date"
                  ? formatDate(plan.session_date)
                  : content[field.key] || "—"}
              </p>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Section Plan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {PLAN_SECTIONS.map((section) => (
            <div key={section.key} className="space-y-1.5">
              <p className="text-sm font-medium">{section.label}</p>
              <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                {plan[section.key] || "—"}
              </p>
              {/* Staff write feedback here while reviewing; everyone else sees
                  whatever the last review left behind. */}
              {plan.can_review ? (
                <Textarea
                  value={feedback[section.key] ?? ""}
                  onChange={(e) =>
                    setFeedback((f) => ({ ...f, [section.key]: e.target.value }))
                  }
                  placeholder={`Feedback on ${section.label.toLowerCase()} (optional)`}
                  rows={2}
                />
              ) : (
                plan.feedback?.[section.key] && (
                  <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                    <span className="font-medium">Staff: </span>
                    <span className="whitespace-pre-wrap">{plan.feedback[section.key]}</span>
                  </div>
                )
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {(plan.timetable.length > 0 || plan.notes || plan.attachments.length > 0) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Extras</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {plan.timetable.length > 0 && (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-28">Timing</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead className="w-40">Location</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {plan.timetable.map((row, i) => (
                      <TableRow key={i}>
                        <TableCell>{row.timing || "—"}</TableCell>
                        <TableCell>{row.event || "—"}</TableCell>
                        <TableCell>{row.location || "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {plan.notes && (
              <div>
                <p className="text-xs text-muted-foreground">Notes</p>
                <p className="whitespace-pre-wrap text-sm">{plan.notes}</p>
              </div>
            )}
            {plan.attachments.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Attachments — click one to preview it here
                </p>
                <AttachmentList planId={planId} token={token} attachments={plan.attachments} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Comments ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Comments</CardTitle>
          <p className="text-sm text-muted-foreground">
            Notes from anyone who can see this plan. They don&apos;t change its status or
            email {plan.author_name} — staff use the review box above for that.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {plan.comments.length > 0 && (
            <ul className="flex flex-col divide-y">
              {plan.comments.map((c) => (
                <li key={c.id} className="flex gap-2 py-3 first:pt-0">
                  <div className="flex-1 space-y-1">
                    <p className="text-xs text-muted-foreground">
                      {c.author_name}
                      {c.created_at ? ` · ${formatTimestamp(c.created_at)}` : ""}
                    </p>
                    <p className="whitespace-pre-wrap text-sm">{c.body}</p>
                  </div>
                  {c.can_delete && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      disabled={busy !== null}
                      aria-label="Delete comment"
                      onClick={() =>
                        run(`comment-${c.id}`,
                            () => deleteComment(token!, planId, c.id), "Comment deleted.")
                      }
                    >
                      {busy === `comment-${c.id}`
                        ? <Loader2 className="animate-spin" />
                        : <Trash2 className="text-muted-foreground" />}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="space-y-2">
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Add a note on this plan…"
              rows={2}
              disabled={busy !== null}
            />
            <Button
              size="sm"
              disabled={busy !== null || !comment.trim()}
              onClick={async () => {
                const ok = await run("comment", () => addComment(token!, planId, comment),
                                     "Comment added.");
                if (ok) setComment("");
              }}
            >
              {busy === "comment" ? <Loader2 className="animate-spin" /> : <MessageSquare />}
              Post comment
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Timeline ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <TimelineRow label="Created" who={plan.author_email} when={plan.created_at} />
          <TimelineRow label="Submitted" who={plan.author_email} when={plan.submitted_at} />
          <TimelineRow
            label={plan.status === "approved" ? "Approved" : "Reviewed"}
            who={plan.reviewed_by}
            when={plan.reviewed_at}
          />
          <TimelineRow label="Last updated" who={null} when={plan.updated_at} />
        </CardContent>
      </Card>
    </div>
  );
}

function TimelineRow({ label, who, when }: { label: string; who: string | null; when: string | null }) {
  const done = !!when;
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className={done ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className="text-right text-xs text-muted-foreground">
        {done ? <>{formatTimestamp(when!)}{who ? ` · ${who}` : ""}</> : "—"}
      </span>
    </div>
  );
}
