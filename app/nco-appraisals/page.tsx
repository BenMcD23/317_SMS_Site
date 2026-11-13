"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, BellPlus, CalendarClock, ClipboardList, Plus, Trash2 } from "lucide-react";

import { SearchableSelect } from "@/components/searchable-select";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { useConfirm } from "@/components/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";
import {
  deleteReminder,
  saveReminder,
  todayInput,
  type AppraisalOverview,
  type AppraisalSummary,
  type UpcomingReview,
} from "@/lib/nco-appraisals";
import { EmptyState } from "@/components/empty-state";
import { DataTable, dataTableColumns } from "@/components/data-table";

/** How the countdown to a review is worded. "Due in 9 days" is more use at a
 *  glance than the date alone, and overdue has to be unmissable. */
function dueLabel(row: UpcomingReview): string {
  if (row.overdue) {
    const days = Math.abs(row.days_until);
    return days === 0 ? "Due today" : `${days} day${days === 1 ? "" : "s"} overdue`;
  }
  if (row.days_until === 0) return "Due today";
  if (row.days_until <= 31) return `In ${row.days_until} day${row.days_until === 1 ? "" : "s"}`;
  return `In ${Math.round(row.days_until / 30)} months`;
}

const appraisalCol = dataTableColumns<AppraisalSummary>();

const appraisalColumns = appraisalCol.columns([
  appraisalCol.accessor("nco_name", {
    header: "NCO",
    sortFn: "text",
    cell: ({ row }) => (
      <Link href={`/nco-appraisals/${row.original.id}`} className="font-medium hover:underline">
        {row.original.nco_name}
      </Link>
    ),
  }),
  appraisalCol.accessor((a) => a.appraisal_date ?? "", {
    id: "appraisal_date",
    header: "Date",
    sortFn: "text",
    cell: ({ row }) => formatDate(row.original.appraisal_date),
  }),
  appraisalCol.accessor((a) => a.next_review_date ?? "", {
    id: "next_review_date",
    header: "Next review",
    sortFn: "text",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {formatDate(row.original.next_review_date)}
        <span className="ml-1 text-xs">({row.original.next_review_months}m)</span>
      </span>
    ),
  }),
  // Flagged appraisals sort to the top: cause for concern above an extension.
  appraisalCol.accessor((a) => (a.cause_for_concern ? 2 : 0) + (a.extend_probation ? 1 : 0), {
    id: "flags",
    header: "Flags",
    sortFn: "basic",
    cell: ({ row }) => {
      const a = row.original;
      return (
        <div className="flex flex-wrap gap-1">
          {a.cause_for_concern && (
            <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
              Cause for concern
            </Badge>
          )}
          {a.extend_probation && (
            <Badge variant="outline" className="border-warning/40 bg-warning/15 text-warning">
              Probation extended
            </Badge>
          )}
          {!a.cause_for_concern && !a.extend_probation && (
            <span className="text-muted-foreground text-sm">—</span>
          )}
        </div>
      );
    },
  }),
  appraisalCol.accessor("author_name", {
    header: "Written by",
    sortFn: "text",
    cell: ({ getValue }) => <span className="text-muted-foreground">{getValue()}</span>,
  }),
  appraisalCol.accessor((a) => a.emailed_at ?? "", {
    id: "emailed_at",
    header: "Sent",
    sortFn: "text",
    cell: ({ row }) => (
      <span className="text-muted-foreground">
        {row.original.emailed_at ? formatDate(row.original.emailed_at) : "Not sent"}
      </span>
    ),
  }),
]);

export default function NcoAppraisalsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const token = session?.id_token;

  const { data, isLoading, error } = useApiQuery<AppraisalOverview>(["nco-appraisals"], "/nco-appraisals");

  const [reminderOpen, setReminderOpen] = useState(false);
  const [reminderCin, setReminderCin] = useState("");
  const [reminderDate, setReminderDate] = useState(todayInput());
  const [reminderNote, setReminderNote] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["nco-appraisals"] });

  const upcoming = data?.upcoming ?? [];
  const appraisals = data?.appraisals ?? [];

  // Reminders only make sense for NCOs with no appraisal — anyone appraised
  // already has a next-review date driving the list.
  const remindable = useMemo(() => (data?.ncos ?? []).filter((n) => !n.last_appraisal_id), [data]);
  const overdueCount = upcoming.filter((row) => row.overdue).length;

  function openReminder(cin?: number) {
    setReminderCin(cin ? String(cin) : "");
    setReminderDate(todayInput());
    setReminderNote("");
    setReminderOpen(true);
  }

  async function submitReminder() {
    if (!token || !reminderCin) return;
    setSaving(true);
    try {
      await saveReminder(token, {
        cadet_id: Number(reminderCin),
        due_date: reminderDate,
        note: reminderNote,
      });
      toast.success("Reminder added to the upcoming list.");
      setReminderOpen(false);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the reminder.");
    } finally {
      setSaving(false);
    }
  }

  function removeReminder(id: number, name: string) {
    confirm(`Remove the appraisal reminder for ${name}?`, async () => {
      if (!token) return;
      try {
        await deleteReminder(token, id);
        toast.success("Reminder removed.");
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Couldn't remove the reminder.");
      }
    });
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="NCO Appraisals"
        description="Write, keep and issue the squadron's NCO appraisals."
        actions={
          <>
            <Button variant="outline" onClick={() => openReminder()}>
              <BellPlus className="size-4" />
              Add reminder
            </Button>
            <Button asChild>
              <Link href="/nco-appraisals/new">
                <Plus className="size-4" />
                New appraisal
              </Link>
            </Button>
          </>
        }
      />

      <ErrorAlert message={error?.message} />

      {isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <>
          <Card>
            <CardHeader className="flex-row items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarClock className="size-4" />
                Coming up
              </CardTitle>
              {overdueCount > 0 && (
                <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                  {overdueCount} overdue
                </Badge>
              )}
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <EmptyState
                  icon={CalendarClock}
                  title="Nothing scheduled"
                  description="Reviews appear here once an appraisal sets a next-review date. For an NCO who hasn't had one yet, add a reminder."
                />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NCO</TableHead>
                      <TableHead>Due</TableHead>
                      <TableHead>When</TableHead>
                      <TableHead>Last appraisal</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {upcoming.map((row) => (
                      <TableRow key={`${row.cin}-${row.source}`}>
                        <TableCell className="font-medium">
                          {row.nco_name}
                          {row.source === "reminder" && (
                            <Badge variant="outline" className="ml-2 gap-1 font-normal">
                              <BellPlus className="size-3" />
                              Reminder
                            </Badge>
                          )}
                          {row.note && <p className="text-muted-foreground mt-0.5 text-xs">{row.note}</p>}
                        </TableCell>
                        <TableCell>{formatDate(row.due_date)}</TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "text-sm",
                              row.overdue
                                ? "text-destructive font-medium"
                                : row.days_until <= 31
                                  ? "text-warning"
                                  : "text-muted-foreground"
                            )}
                          >
                            {dueLabel(row)}
                          </span>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.last_appraisal_date ? formatDate(row.last_appraisal_date) : "Never"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/nco-appraisals/new?cin=${row.cin}`}>Appraise</Link>
                            </Button>
                            {row.reminder_id && (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Remove reminder for ${row.nco_name}`}
                                onClick={() => removeReminder(row.reminder_id!, row.nco_name)}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {remindable.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="text-warning size-4" />
                  Never appraised
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {remindable.map((nco) => (
                  <div
                    key={nco.cin}
                    className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                  >
                    <span>{nco.nco_name}</span>
                    {nco.reminder_id ? (
                      <Badge variant="outline" className="text-muted-foreground font-normal">
                        Reminder set
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2"
                        onClick={() => openReminder(nco.cin)}
                      >
                        Remind me
                      </Button>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* A framed table on its own, not a card around a table: one frame, not two. */}
          <section className="flex flex-col gap-2" aria-labelledby="all-appraisals">
            <h2 id="all-appraisals" className="flex items-center gap-2 text-base font-semibold">
              <ClipboardList className="size-4" />
              All appraisals
            </h2>
            {appraisals.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="No appraisals yet"
                description="Write the first one and it'll be kept here, ready to download or email to the NCO."
              />
            ) : (
              <DataTable
                label="All appraisals"
                data={appraisals}
                columns={appraisalColumns}
                rowKey={(a) => a.id}
                rowHref={(a) => `/nco-appraisals/${a.id}`}
                initialSort={{ id: "appraisal_date", desc: true }}
                columnClassName={{
                  next_review_date: "hidden sm:table-cell",
                  author_name: "hidden md:table-cell",
                  emailed_at: "hidden md:table-cell",
                }}
              />
            )}
          </section>
        </>
      )}

      <ResponsiveDialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <ResponsiveDialogContent>
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Add an appraisal reminder</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              For an NCO who hasn&apos;t been appraised yet. They&apos;ll show on the upcoming list from this
              date until an appraisal is written.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reminder-nco">NCO</Label>
              <SearchableSelect
                id="reminder-nco"
                value={reminderCin}
                onValueChange={setReminderCin}
                placeholder="Choose an NCO…"
                searchPlaceholder="Find an NCO…"
                options={remindable.map((nco) => ({ value: String(nco.cin), label: nco.nco_name }))}
              />
              {remindable.length === 0 && (
                <p className="text-muted-foreground text-xs">
                  Every NCO has an appraisal already, so their next review date is set from it.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reminder-date">Due date</Label>
              <Input
                id="reminder-date"
                type="date"
                value={reminderDate}
                onChange={(e) => setReminderDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reminder-note">Note (optional)</Label>
              <Textarea
                id="reminder-note"
                value={reminderNote}
                onChange={(e) => setReminderNote(e.target.value)}
                rows={3}
                placeholder="e.g. First appraisal since promotion — pair with the FS."
              />
            </div>
          </div>
          <ResponsiveDialogFooter>
            <Button variant="outline" onClick={() => setReminderOpen(false)}>
              Cancel
            </Button>
            <Button onClick={submitReminder} disabled={saving || !reminderCin || !reminderDate}>
              {saving ? "Saving…" : "Add reminder"}
            </Button>
          </ResponsiveDialogFooter>
        </ResponsiveDialogContent>
      </ResponsiveDialog>

      {confirmDialog}
    </div>
  );
}
