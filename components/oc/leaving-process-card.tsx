"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { AlertTriangle, Check, Copy, Loader2, RotateCcw, Send, UserMinus } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorAlert } from "@/components/error-alert";
import { useConfirm } from "@/components/confirm-dialog";
import { Private } from "@/components/private";
import { apiRequest } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";
import { copyText } from "@/lib/clipboard";
import { formatDate } from "@/lib/format";
import { type LeavingCadet, type LeavingResponse, STATUS_LABEL, leaverQueryDraft } from "@/lib/leaving";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

export const LEAVING_KEY = ["oc-leaving"] as const;

const STATUS_BADGE: Record<LeavingCadet["status"], string> = {
  flagged: "border-warning/40 bg-warning/15 text-warning",
  waiting: "border-primary/40 bg-primary/10 text-primary",
  start_leaving: "border-destructive/40 bg-destructive/10 text-destructive",
};

// Order by what needs doing: returns to clear, then ready to remove, then new.
const STATUS_ORDER: Record<LeavingCadet["status"], number> = { start_leaving: 0, flagged: 1, waiting: 2 };

/**
 * Cadets who haven't paraded for eight weeks. Click one to copy their parents'
 * addresses (the OC sends the query from their own account), record that it
 * went — which starts the two weeks' notice — and then ask the adjutant, by
 * email from here, to remove them.
 */
export function LeavingProcessCard() {
  const { data, isLoading, error } = useApiQuery<LeavingResponse>(LEAVING_KEY, "/leaving-process");
  const [openCin, setOpenCin] = useState<number | null>(null);

  const cadets = [...(data?.cadets ?? [])].sort((a, b) => {
    if (a.returned !== b.returned) return a.returned ? -1 : 1;
    const byStatus = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    return byStatus !== 0 ? byStatus : (b.gapDays ?? 0) - (a.gapDays ?? 0);
  });
  const selected = cadets.find((c) => c.cin === openCin) ?? null;
  const ready = cadets.filter((c) => c.status === "start_leaving" && !c.returned && !c.adjRequestedAt).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserMinus className="text-muted-foreground size-4" />
          Leaving process
          {data && (
            <Badge variant="secondary" className="ml-auto text-xs font-normal">
              {cadets.length}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {data?.currentParadeNight
            ? `Cadets whose last parade is eight weeks or more before ${formatDate(data.currentParadeNight)}. Click one to take it forward.`
            : "Cadets who haven't been to parade for eight weeks."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 p-0">
        {error ? (
          <div className="px-6 pb-6">
            <ErrorAlert message={error.message} title="Could not load the leaving process" />
          </div>
        ) : isLoading || !data ? (
          <div className="px-6 pb-6">
            <Skeleton className="h-32 w-full" />
          </div>
        ) : cadets.length === 0 ? (
          <p className="text-muted-foreground px-6 pb-6 text-sm">
            Nobody has missed eight weeks of parades. Cadets appear here once their last parade is two months
            behind the current parade night.
          </p>
        ) : (
          <>
            {ready > 0 && (
              <div className="px-6">
                <Alert>
                  <AlertTriangle className="text-destructive" />
                  <AlertTitle>
                    {ready} cadet{ready !== 1 ? "s have" : " has"} had their two weeks&apos; notice — ready to
                    ask the adjutant to remove.
                  </AlertTitle>
                </Alert>
              </div>
            )}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-6">Cadet</TableHead>
                    <TableHead>Last parade</TableHead>
                    <TableHead>Absent</TableHead>
                    <TableHead className="pr-6">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cadets.map((c) => (
                    <TableRow key={c.cin}>
                      <TableCell className="pl-6">
                        <button
                          type="button"
                          className="text-left font-medium hover:underline"
                          onClick={() => setOpenCin(c.cin)}
                        >
                          {c.name}
                        </button>
                        <p className="text-muted-foreground text-xs">
                          {[c.rank, c.flight && `${c.flight} Flight`].filter(Boolean).join(" · ") ||
                            `CIN ${c.cin}`}
                        </p>
                      </TableCell>
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {formatDate(c.lastAttended)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap tabular-nums">
                        {c.weeksAbsent === null ? "—" : `${c.weeksAbsent} wks`}
                      </TableCell>
                      <TableCell className="pr-6">
                        <StatusBadge cadet={c} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(open) => !open && setOpenCin(null)}>
        <DialogContent className="sm:max-w-xl">
          {selected && (
            <LeavingDialogBody
              cadet={selected}
              adjutantConfigured={data?.adjutantConfigured ?? false}
              onGone={() => setOpenCin(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function StatusBadge({ cadet }: { cadet: LeavingCadet }) {
  if (cadet.returned) {
    return (
      <Badge variant="outline" className="border-success/40 bg-success/10 text-success font-normal">
        Back on parade
      </Badge>
    );
  }
  if (cadet.adjRequestedAt) {
    return (
      <>
        <Badge variant="outline" className="font-normal">
          Adjutant asked
        </Badge>
        <p className="text-muted-foreground mt-1 text-xs">{formatDate(cadet.adjRequestedAt)}</p>
      </>
    );
  }
  return (
    <>
      <Badge variant="outline" className={cn("font-normal", STATUS_BADGE[cadet.status])}>
        {STATUS_LABEL[cadet.status]}
      </Badge>
      {cadet.status === "waiting" && cadet.daysLeft !== null && (
        <p className="text-muted-foreground mt-1 text-xs">
          {cadet.daysLeft} day{cadet.daysLeft !== 1 ? "s" : ""} left
        </p>
      )}
    </>
  );
}

function LeavingDialogBody({
  cadet,
  adjutantConfigured,
  onGone,
}: {
  cadet: LeavingCadet;
  adjutantConfigured: boolean;
  onGone: () => void;
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [busy, setBusy] = useState<string | null>(null);

  const bcc = cadet.parentEmails.join(";");
  const notified = !!cadet.notifiedAt;

  async function call(label: string, path: string, method: "POST" | "DELETE", done: string) {
    if (!session?.id_token) return false;
    setBusy(label);
    try {
      await apiRequest(session.id_token, `${API_BASE}/leaving-process/${cadet.cin}${path}`, { method });
      await queryClient.invalidateQueries({ queryKey: LEAVING_KEY });
      toast.success(done);
      return true;
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Something went wrong.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function copy(text: string, what: string) {
    if (await copyText(text)) toast.success(`Copied ${what}`);
    else toast.error("Couldn't copy — select the text and copy it by hand");
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{cadet.name}</DialogTitle>
        <DialogDescription>
          Last on parade {formatDate(cadet.lastAttended)}
          {cadet.weeksAbsent !== null && ` — ${cadet.weeksAbsent} weeks ago`}.
        </DialogDescription>
      </DialogHeader>

      {cadet.returned && (
        <Alert>
          <Check className="text-success" />
          <AlertTitle>They&apos;re back on parade.</AlertTitle>
          <AlertDescription>Cancel the process to clear them from this list.</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">1. Leaver query to the parents</h3>
        <Private>
          {cadet.parentEmails.length === 0 ? (
            <p className="text-warning text-xs">
              No parent email on file — add one under &ldquo;Parent emails&rdquo; on this dashboard.
            </p>
          ) : (
            <p className="text-muted-foreground bg-muted rounded-md px-3 py-2 font-mono text-xs break-all">
              {bcc}
            </p>
          )}
        </Private>
        <div className="flex flex-wrap gap-2">
          <Private>
            <Button size="sm" variant="outline" disabled={!bcc} onClick={() => copy(bcc, "parent emails")}>
              <Copy data-icon="inline-start" />
              Copy parent emails
            </Button>
          </Private>
          <Button
            size="sm"
            variant="outline"
            onClick={() => copy(leaverQueryDraft(cadet.name, cadet.weeksAbsent), "draft email")}
          >
            <Copy data-icon="inline-start" />
            Copy draft message
          </Button>
        </div>
        {notified ? (
          <p className="text-muted-foreground text-xs">
            Marked as sent {formatDate(cadet.notifiedAt)}
            {cadet.status === "waiting" &&
              cadet.daysLeft !== null &&
              ` — ${cadet.daysLeft} day(s) of notice left`}
            .
          </p>
        ) : (
          <Button
            size="sm"
            disabled={busy !== null}
            onClick={() =>
              call("notified", "/notified", "POST", "Marked as sent — the two weeks' notice has started")
            }
          >
            {busy === "notified" ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <Check data-icon="inline-start" />
            )}
            I&apos;ve sent it — start two weeks&apos; notice
          </Button>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">2. Ask the adjutant to remove them</h3>
        {cadet.adjRequestedAt ? (
          <p className="text-muted-foreground text-xs">
            Adjutant emailed {formatDate(cadet.adjRequestedAt)}.
          </p>
        ) : (
          <>
            {!adjutantConfigured && (
              <p className="text-warning text-xs">
                No adjutant email is configured on the server, so this can&apos;t send yet.
              </p>
            )}
            <div>
              <Button
                size="sm"
                variant="destructive"
                disabled={
                  cadet.status !== "start_leaving" || cadet.returned || !adjutantConfigured || busy !== null
                }
                onClick={() =>
                  confirm(`Email the adjutant to remove ${cadet.name}?`, () =>
                    call("adj", "/request-adj", "POST", "Adjutant emailed")
                  )
                }
              >
                {busy === "adj" ? (
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                ) : (
                  <Send data-icon="inline-start" />
                )}
                Request removal
              </Button>
              {cadet.status !== "start_leaving" && (
                <p className="text-muted-foreground mt-1 text-xs">
                  {notified
                    ? "Available once the two weeks' notice is up."
                    : "Available after the parents have been given two weeks' notice."}
                </p>
              )}
            </div>
          </>
        )}
      </section>

      {notified && (
        <div className="border-t pt-3">
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null}
            onClick={() =>
              confirm(
                `Cancel the leaving process for ${cadet.name}? The countdown is dropped and they go back to being tracked normally.`,
                async () => {
                  if (await call("cancel", "", "DELETE", `Leaving process cancelled for ${cadet.name}`))
                    onGone();
                }
              )
            }
          >
            <RotateCcw data-icon="inline-start" />
            Cancel process
          </Button>
        </div>
      )}
      {confirmDialog}
    </>
  );
}
