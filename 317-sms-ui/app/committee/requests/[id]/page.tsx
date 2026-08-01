"use client";

import { use, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import { useApiQuery } from "@/lib/use-api-query";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  ArrowLeft, Download, Send, Check, X, Loader2, Upload, Trash2,
  FileText, CircleDollarSign, BadgePoundSterling, Undo2,
} from "lucide-react";
import {
  type CommitteeRequestDetail, STATUS_LABELS, STATUS_STYLE,
  formatGBP, formatDateTime,
} from "@/lib/committee";

const RECEIPT_ACCEPT = "image/png,image/jpeg,application/pdf";
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;

interface BankProfile {
  bank_account_name: string;
  bank_sort_code: string;
  bank_account_number: string;
}

export default function CommitteeRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [busy, setBusy] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const { data: req, isLoading, error } = useApiQuery<CommitteeRequestDetail>(
    ["committee-request", id],
    `/committee-requests/${id}`,
  );

  // Requester's own bank details — gates the "Send for payment" button.
  const { data: bank } = useApiQuery<BankProfile>(["user-profile"], "/settings/user-profile");
  const hasBankDetails = !!(bank?.bank_account_name && bank?.bank_sort_code && bank?.bank_account_number);

  const token = session?.id_token;

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["committee-request", id] });
    queryClient.invalidateQueries({ queryKey: ["committee-requests"] });
    queryClient.invalidateQueries({ queryKey: ["oc-dashboard"] });
  };

  const action = async (
    label: string, path: string, body?: unknown, success?: string,
  ) => {
    if (!token) return;
    setBusy(label);
    try {
      const res = await apiFetch(`${API_BASE}/committee-requests/${id}/${path}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail ?? "Action failed.");
        return false;
      }
      toast.success(success ?? "Done.");
      refresh();
      return true;
    } catch {
      toast.error("Server unreachable.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const downloadPdf = async () => {
    if (!token || !req) return;
    setBusy("pdf");
    try {
      const res = await apiFetch(`${API_BASE}/committee-requests/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { toast.error("Failed to download PDF."); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${req.reference}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setBusy(null);
    }
  };

  const viewReceipt = async (receiptId: number) => {
    if (!token) return;
    try {
      const res = await apiFetch(`${API_BASE}/committee-requests/${id}/receipts/${receiptId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) { toast.error("Failed to open receipt."); return; }
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank");
    } catch {
      toast.error("Server unreachable.");
    }
  };

  const uploadReceipts = async (files: FileList) => {
    if (!token) return;
    const chosen = Array.from(files);
    for (const f of chosen) {
      if (f.size > MAX_RECEIPT_BYTES) {
        toast.error(`${f.name}: each receipt must be under 5 MB.`);
        return;
      }
    }
    setBusy("upload");
    try {
      const form = new FormData();
      chosen.forEach((f) => form.append("files", f));
      const res = await apiFetch(`${API_BASE}/committee-requests/${id}/receipts`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail ?? "Upload failed.");
        return;
      }
      toast.success("Receipts uploaded.");
      refresh();
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const deleteReceipt = async (receiptId: number) => {
    if (!token) return;
    setBusy(`del-${receiptId}`);
    try {
      const res = await apiFetch(`${API_BASE}/committee-requests/${id}/receipts/${receiptId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail ?? "Delete failed.");
        return;
      }
      toast.success("Receipt removed.");
      refresh();
    } catch {
      toast.error("Server unreachable.");
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
  if (error || !req) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-sm text-destructive">
          {error?.message ?? "Request not found."}
        </p>
        <Button asChild variant="ghost" size="sm" className="mt-2">
          <Link href="/committee/requests"><ArrowLeft /> Back to requests</Link>
        </Button>
      </div>
    );
  }

  const style = STATUS_STYLE[req.status];
  const isOc = req.can_approve;
  const isRequester = req.is_requester;

  const ocHasActions = isOc && ["submitted", "sent_to_committee", "sent_for_payment"].includes(req.status);
  const requesterHasActions = isRequester && req.status !== "paid" && req.status !== "withdrawn";
  const showActions = ocHasActions || requesterHasActions;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {req.reference}
            <Badge variant={style.variant} className={style.className}>
              {STATUS_LABELS[req.status]}
            </Badge>
          </span>
        }
        description={req.title}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadPdf} disabled={busy === "pdf"}>
              {busy === "pdf" ? <Loader2 className="animate-spin" /> : <Download />} PDF
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href="/committee/requests"><ArrowLeft /> Back</Link>
            </Button>
          </div>
        }
      />

      {/* ── Actions ─────────────────────────────────────────────────────────── */}
      {showActions && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {isOc && req.status === "submitted" && (
              <Button size="sm" disabled={busy !== null}
                onClick={() => action("send", "send-to-committee", undefined, "Approved — sent to the committee.")}>
                {busy === "send" ? <Loader2 className="animate-spin" /> : <Send />} Approve / Send to Committee
              </Button>
            )}
            {isOc && req.status === "sent_to_committee" && (
              <Button size="sm" disabled={busy !== null}
                onClick={() => action("approve", "approve", undefined, "Committee approval recorded — requester notified.")}>
                {busy === "approve" ? <Loader2 className="animate-spin" /> : <Check />} Committee Approved
              </Button>
            )}
            {isOc && (req.status === "submitted" || req.status === "sent_to_committee") && (
              <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="destructive" disabled={busy !== null}>
                    <X /> {req.status === "submitted" ? "Reject" : "Committee Rejected"}
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>
                      {req.status === "submitted" ? "Reject" : "Record committee rejection for"} {req.reference}
                    </DialogTitle>
                    <DialogDescription>
                      The requester will be emailed. Add an optional reason.
                    </DialogDescription>
                  </DialogHeader>
                  <Textarea
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="Reason (optional)"
                    rows={3}
                  />
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setRejectOpen(false)}>Cancel</Button>
                    <Button
                      variant="destructive"
                      disabled={busy !== null}
                      onClick={async () => {
                        const ok = await action("reject", "reject", { reason: rejectReason }, "Request rejected.");
                        if (ok) { setRejectOpen(false); setRejectReason(""); }
                      }}
                    >
                      {busy === "reject" ? <Loader2 className="animate-spin" /> : null} Reject
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
            {isOc && req.status === "sent_for_payment" && (
              <Button size="sm" disabled={busy !== null}
                onClick={() => action("paid", "mark-paid", undefined, "Marked as paid.")}>
                {busy === "paid" ? <Loader2 className="animate-spin" /> : <BadgePoundSterling />} Mark paid
              </Button>
            )}
            {isRequester && req.status === "approved" && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={RECEIPT_ACCEPT}
                  multiple
                  className="hidden"
                  onChange={(e) => { if (e.target.files?.length) uploadReceipts(e.target.files); }}
                />
                <Button size="sm" variant="outline" disabled={busy !== null}
                  onClick={() => fileInputRef.current?.click()}>
                  {busy === "upload" ? <Loader2 className="animate-spin" /> : <Upload />} Upload receipts
                </Button>
                <Button
                  size="sm"
                  disabled={busy !== null || req.receipts.length === 0 || !hasBankDetails}
                  onClick={() => action("pay", "send-for-payment", undefined, "Sent to committee for payment.")}
                >
                  {busy === "pay" ? <Loader2 className="animate-spin" /> : <CircleDollarSign />} Send for payment
                </Button>
              </>
            )}

            {/* Requester can withdraw from any non-terminal state. */}
            {isRequester && req.status !== "paid" && req.status !== "withdrawn" && (
              <Dialog open={withdrawOpen} onOpenChange={setWithdrawOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="ghost" disabled={busy !== null}
                    className="text-muted-foreground">
                    <Undo2 /> Withdraw
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Withdraw request {req.reference}?</DialogTitle>
                    <DialogDescription>
                      This cancels the request. The OC will be notified. This cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button variant="ghost" onClick={() => setWithdrawOpen(false)}>Keep it</Button>
                    <Button
                      variant="destructive"
                      disabled={busy !== null}
                      onClick={async () => {
                        const ok = await action("withdraw", "withdraw", undefined, "Request withdrawn.");
                        if (ok) setWithdrawOpen(false);
                      }}
                    >
                      {busy === "withdraw" ? <Loader2 className="animate-spin" /> : null} Withdraw
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}

            {isRequester && req.status === "approved" && !hasBankDetails && (
              <p className="w-full text-xs text-warning">
                Add your bank details in{" "}
                <Link href="/settings" className="underline underline-offset-2">Settings</Link>{" "}
                before sending for payment.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Items ───────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Items</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableBody>
              {req.items.map((item, i) => (
                <TableRow key={i}>
                  <TableCell>{item.description}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatGBP(item.cost)}</TableCell>
                </TableRow>
              ))}
              <TableRow className="font-semibold">
                <TableCell>Total</TableCell>
                <TableCell className="text-right tabular-nums">{formatGBP(req.total)}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
          {req.justification && (
            <div className="mt-4">
              <p className="text-xs text-muted-foreground">Justification</p>
              <p className="whitespace-pre-wrap text-sm">{req.justification}</p>
            </div>
          )}
          {req.status === "rejected" && req.rejection_reason && (
            <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span className="font-medium">Rejected: </span>{req.rejection_reason}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── Receipts ────────────────────────────────────────────────────────── */}
      {(req.receipts.length > 0 || (isRequester && req.status === "approved")) && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Receipts</CardTitle>
          </CardHeader>
          <CardContent>
            {req.receipts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No receipts uploaded yet.</p>
            ) : (
              <ul className="flex flex-col divide-y">
                {req.receipts.map((rec) => (
                  <li key={rec.id} className="flex items-center gap-2 py-2">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <button
                      onClick={() => viewReceipt(rec.id)}
                      className="flex-1 truncate text-left text-sm hover:underline"
                    >
                      {rec.filename}
                    </button>
                    {isRequester && req.status === "approved" && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => deleteReceipt(rec.id)}
                        disabled={busy === `del-${rec.id}`}
                        aria-label="Delete receipt"
                      >
                        {busy === `del-${rec.id}`
                          ? <Loader2 className="animate-spin" />
                          : <Trash2 className="text-muted-foreground" />}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Timeline ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">History</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <TimelineRow label="Submitted" who={req.requester_email} when={req.created_at} />
          <TimelineRow label="Sent to committee" who={req.sent_to_committee_by} when={req.sent_to_committee_at} />
          {req.status === "rejected"
            ? <TimelineRow label="Rejected" who={req.decided_by} when={req.decided_at} />
            : <TimelineRow label="Committee approved" who={req.decided_by} when={req.decided_at} />}
          <TimelineRow label="Sent for payment" who={req.requester_email} when={req.sent_for_payment_at} />
          <TimelineRow label="Paid" who={req.paid_marked_by} when={req.paid_at} />
          {req.withdrawn_at && (
            <TimelineRow label="Withdrawn" who={req.withdrawn_by} when={req.withdrawn_at} />
          )}
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
        {done ? <>{formatDateTime(when)}{who ? ` · ${who}` : ""}</> : "—"}
      </span>
    </div>
  );
}
