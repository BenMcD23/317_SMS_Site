"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, BellPlus, CalendarClock, ClipboardList, Plus, Trash2,
} from "lucide-react";

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
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from "@/components/ui/empty";
import { formatDate } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";
import {
  deleteReminder, saveReminder, todayInput,
  type AppraisalOverview, type UpcomingReview,
} from "@/lib/nco-appraisals";

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

export default function NcoAppraisalsPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const token = session?.id_token;

  const { data, isLoading, error } = useApiQuery<AppraisalOverview>(
    ["nco-appraisals"],
    "/nco-appraisals",
  );

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
  const remindable = useMemo(
    () => (data?.ncos ?? []).filter((n) => !n.last_appraisal_id),
    [data],
  );
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
    <div className="flex flex-col gap-6">
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
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><CalendarClock /></EmptyMedia>
                    <EmptyTitle>Nothing scheduled</EmptyTitle>
                    <EmptyDescription>
                      Reviews appear here once an appraisal sets a next-review date.
                      For an NCO who hasn&apos;t had one yet, add a reminder.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
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
                          {row.note && (
                            <p className="mt-0.5 text-xs text-muted-foreground">{row.note}</p>
                          )}
                        </TableCell>
                        <TableCell>{formatDate(row.due_date)}</TableCell>
                        <TableCell>
                          <span
                            className={cn(
                              "text-sm",
                              row.overdue
                                ? "font-medium text-destructive"
                                : row.days_until <= 31
                                  ? "text-warning"
                                  : "text-muted-foreground",
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
                  <AlertTriangle className="size-4 text-warning" />
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
                      <Badge variant="outline" className="font-normal text-muted-foreground">
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="size-4" />
                All appraisals
              </CardTitle>
            </CardHeader>
            <CardContent>
              {appraisals.length === 0 ? (
                <Empty>
                  <EmptyHeader>
                    <EmptyMedia variant="icon"><ClipboardList /></EmptyMedia>
                    <EmptyTitle>No appraisals yet</EmptyTitle>
                    <EmptyDescription>
                      Write the first one and it&apos;ll be kept here, ready to download
                      or email to the NCO.
                    </EmptyDescription>
                  </EmptyHeader>
                </Empty>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>NCO</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Next review</TableHead>
                      <TableHead>Flags</TableHead>
                      <TableHead>Written by</TableHead>
                      <TableHead>Sent</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {appraisals.map((appraisal) => (
                      <TableRow key={appraisal.id}>
                        <TableCell className="font-medium">
                          <Link
                            href={`/nco-appraisals/${appraisal.id}`}
                            className="hover:underline"
                          >
                            {appraisal.nco_name}
                          </Link>
                        </TableCell>
                        <TableCell>{formatDate(appraisal.appraisal_date)}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(appraisal.next_review_date)}
                          <span className="ml-1 text-xs">
                            ({appraisal.next_review_months}m)
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {appraisal.cause_for_concern && (
                              <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">
                                Cause for concern
                              </Badge>
                            )}
                            {appraisal.extend_probation && (
                              <Badge variant="outline" className="border-warning/40 bg-warning/15 text-warning">
                                Probation extended
                              </Badge>
                            )}
                            {!appraisal.cause_for_concern && !appraisal.extend_probation && (
                              <span className="text-sm text-muted-foreground">—</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {appraisal.author_name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {appraisal.emailed_at ? formatDate(appraisal.emailed_at) : "Not sent"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}

      <Dialog open={reminderOpen} onOpenChange={setReminderOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add an appraisal reminder</DialogTitle>
            <DialogDescription>
              For an NCO who hasn&apos;t been appraised yet. They&apos;ll show on the
              upcoming list from this date until an appraisal is written.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="reminder-nco">NCO</Label>
              <Select value={reminderCin} onValueChange={setReminderCin}>
                <SelectTrigger id="reminder-nco" className="w-full">
                  <SelectValue placeholder="Choose an NCO…" />
                </SelectTrigger>
                <SelectContent>
                  {remindable.map((nco) => (
                    <SelectItem key={nco.cin} value={String(nco.cin)}>
                      {nco.nco_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {remindable.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Every NCO has an appraisal already, so their next review date is
                  set from it.
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
          <DialogFooter>
            <Button variant="outline" onClick={() => setReminderOpen(false)}>Cancel</Button>
            <Button onClick={submitReminder} disabled={saving || !reminderCin || !reminderDate}>
              {saving ? "Saving…" : "Add reminder"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {confirmDialog}
    </div>
  );
}
