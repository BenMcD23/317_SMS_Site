"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Mail, RotateCcw, Send } from "lucide-react";

import { Alert, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { useConfirm } from "@/components/confirm-dialog";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type LeavingStatus = "flagged" | "waiting" | "start_leaving";

type LeavingCadet = {
  cin: number;
  name: string;
  rank: string | null;
  flight: string | null;
  email: string | null;
  lastAttended: string | null;
  gapDays: number | null;
  weeksAbsent: number | null;
  status: LeavingStatus;
  daysLeft: number | null;
  returned: boolean;
  sentAt: string | null;
  sentTo: string | null;
  replyTo: string | null;
  sentBy: string | null;
};

type LeavingResponse = {
  currentParadeNight: string | null;
  defaultReplyTo: string;
  cadets: LeavingCadet[];
};

const STATUS_LABEL: Record<LeavingStatus, string> = {
  flagged: "Not contacted",
  waiting: "Awaiting reply",
  start_leaving: "Start leaving process",
};

const STATUS_BADGE: Record<LeavingStatus, string> = {
  flagged: "border-warning/40 bg-warning/15 text-warning",
  waiting: "border-primary/40 bg-primary/10 text-primary",
  start_leaving: "border-destructive/40 bg-destructive/10 text-destructive",
};

// Order the table by what needs doing, not alphabetically.
const STATUS_ORDER: Record<LeavingStatus, number> = {
  start_leaving: 0,
  flagged: 1,
  waiting: 2,
};

export default function LeavingProcessPage() {
  const [data, setData] = useState<LeavingResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [target, setTarget] = useState<LeavingCadet | null>(null);
  const [to, setTo] = useState("");
  const [replyTo, setReplyTo] = useState("");
  const [sending, setSending] = useState(false);

  const { confirm, confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/leaving-process");
      if (!res.ok) throw new Error((await res.json())?.detail ?? "Failed to load");
      setData(await res.json());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load leaving process");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const cadets = useMemo(() => {
    const rows = [...(data?.cadets ?? [])];
    rows.sort((a, b) => {
      if (a.returned !== b.returned) return a.returned ? -1 : 1;   // returns first, they need clearing
      const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      return byStatus !== 0 ? byStatus : (b.gapDays ?? 0) - (a.gapDays ?? 0);
    });
    return rows;
  }, [data]);

  function openSend(cadet: LeavingCadet) {
    setTarget(cadet);
    setTo(cadet.email ?? "");
    setReplyTo(data?.defaultReplyTo ?? "");
  }

  async function send() {
    if (!target) return;
    setSending(true);
    try {
      const res = await fetch(`/api/leaving-process/${target.cin}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, replyTo }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.detail ?? "Failed to send");
      }
      toast.success(`Leaving-process email sent to ${to}`);
      setTarget(null);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setSending(false);
    }
  }

  function cancelProcess(cadet: LeavingCadet) {
    confirm(
      `Cancel the leaving process for ${cadet.name}? The countdown is dropped and they go back to being tracked normally.`,
      async () => {
        const res = await fetch(`/api/leaving-process/${cadet.cin}`, { method: "DELETE" });
        if (!res.ok) {
          toast.error("Could not cancel the leaving process");
          return;
        }
        toast.success(`Leaving process cancelled for ${cadet.name}`);
        await load();
      },
    );
  }

  if (error) return <ErrorAlert message={error} title="Could not load leaving process" />;

  const needsAction = cadets.filter((c) => c.status === "start_leaving" && !c.returned).length;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-16">
      <PageHeader
        title="Leaving process"
        description={
          data?.currentParadeNight
            ? `Cadets whose last parade is four weeks or more before ${formatDate(data.currentParadeNight)}.`
            : "Cadets who have stopped attending parade."
        }
      />

      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : cadets.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nobody is currently lapsed. Cadets appear here once their last parade is four
            weeks behind the current parade night.
          </CardContent>
        </Card>
      ) : (
        <>
          {needsAction > 0 && (
            <Alert>
              <AlertTriangle className="text-destructive" />
              <AlertTitle>
                {needsAction} cadet{needsAction !== 1 ? "s have" : " has"} passed the two-week
                reply window — ready to start the leaving process.
              </AlertTitle>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Mail className="h-4 w-4 text-muted-foreground" />
                Lapsed cadets
                <Badge variant="secondary" className="ml-auto text-xs font-normal">
                  {cadets.length}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-6">Cadet</TableHead>
                      <TableHead>Last parade</TableHead>
                      <TableHead>Absent</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right pr-6">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cadets.map((cadet) => (
                      <TableRow key={cadet.cin}>
                        <TableCell className="pl-6">
                          <Link
                            href={`/cadets/${cadet.cin}`}
                            className="font-medium hover:underline"
                          >
                            {cadet.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {[cadet.rank, cadet.flight && `${cadet.flight} Flight`]
                              .filter(Boolean)
                              .join(" · ") || `CIN ${cadet.cin}`}
                          </p>
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDate(cadet.lastAttended)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {cadet.weeksAbsent === null ? "—" : `${cadet.weeksAbsent} wks`}
                        </TableCell>
                        <TableCell>
                          {cadet.returned ? (
                            <Badge
                              variant="outline"
                              className="border-success/40 bg-success/10 font-normal text-success"
                            >
                              Back on parade
                            </Badge>
                          ) : (
                            <>
                              <Badge
                                variant="outline"
                                className={cn("font-normal", STATUS_BADGE[cadet.status])}
                              >
                                {STATUS_LABEL[cadet.status]}
                              </Badge>
                              {cadet.status === "waiting" && cadet.daysLeft !== null && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  {cadet.daysLeft} day{cadet.daysLeft !== 1 ? "s" : ""} left
                                </p>
                              )}
                              {cadet.sentAt && cadet.status !== "waiting" && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                  Emailed {formatDate(cadet.sentAt)}
                                </p>
                              )}
                            </>
                          )}
                        </TableCell>
                        <TableCell className="pr-6 text-right">
                          {cadet.sentAt ? (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => cancelProcess(cadet)}
                            >
                              <RotateCcw data-icon="inline-start" />
                              Cancel
                            </Button>
                          ) : (
                            <Button size="sm" onClick={() => openSend(cadet)}>
                              <Send data-icon="inline-start" />
                              Send email
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* Send dialog — the address is editable per send, prefilled from the
          cadet's scraped email and the configured reply-to. */}
      <Dialog open={!!target} onOpenChange={(open) => !open && setTarget(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send leaving-process email</DialogTitle>
            <DialogDescription>
              {target?.name} — last on parade {formatDate(target?.lastAttended)}.
              This starts a two-week countdown.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="leaving-to">Send to</Label>
              <Input
                id="leaving-to" type="email" value={to} placeholder="cadet@example.com"
                onChange={(e) => setTo(e.target.value)}
              />
              {!target?.email && (
                <p className="text-xs text-warning">
                  No email on this cadet&apos;s record — enter one to send.
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="leaving-reply">Replies go to</Label>
              <Input
                id="leaving-reply" type="email" value={replyTo} placeholder="staff@317atc.co.uk"
                onChange={(e) => setReplyTo(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The email sends from the noreply account, so replies land here instead.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setTarget(null)} disabled={sending}>
              Cancel
            </Button>
            <Button onClick={send} disabled={sending || !to.trim() || !replyTo.trim()}>
              {sending ? <Loader2 className="animate-spin" data-icon="inline-start" />
                       : <Send data-icon="inline-start" />}
              Send email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  );
}
