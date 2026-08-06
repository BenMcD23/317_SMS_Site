"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarOff, Plus, Undo2, TriangleAlert, RefreshCw } from "lucide-react";

import { useApiQuery } from "@/lib/use-api-query";
import { PageHeader } from "@/components/page-header";
import { useConfirm } from "@/components/confirm-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from "@/components/ui/empty";
import { formatDate, formatTimestamp } from "@/lib/format";
import {
  bookHoliday, cancelHoliday, holidayDays, needsSync, syncHoliday,
  type NcoHoliday, type NcoHolidayList,
} from "@/lib/nco-holidays";

type Filter = "upcoming" | "all" | "mine";

/** Today at midnight — an in-progress holiday still counts as upcoming. */
function todayStart(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export default function NcoHolidaysPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();

  const [filter, setFilter] = useState<Filter>("upcoming");
  const [bookOpen, setBookOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const { data, isLoading, error } = useApiQuery<NcoHolidayList>(
    ["nco-holidays"],
    "/nco-holidays",
  );

  const token = session?.id_token;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["nco-holidays"] });

  const holidays = useMemo(() => {
    const all = data?.holidays ?? [];
    if (filter === "mine") return all.filter((h) => h.is_mine);
    if (filter === "all") return all;
    const today = todayStart();
    return all.filter((h) => !h.cancelled && new Date(h.date_to) >= today);
  }, [data, filter]);

  const run = async (id: number, fn: () => Promise<unknown>, success: string) => {
    if (!token) return;
    setBusyId(id);
    try {
      await fn();
      toast.success(success);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusyId(null);
    }
  };

  const onCancel = (h: NcoHoliday) =>
    confirm(
      h.is_mine
        ? "This removes the entry from the NCO Holidays calendar. The booking stays on record here, showing you cancelled it."
        : `This removes ${h.booked_by_name}'s holiday from the calendar. The booking stays on record here, showing you cancelled it.`,
      () => run(h.id, () => cancelHoliday(token!, h.id), "Holiday removed from the calendar"),
    );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader
        title="NCO Holidays"
        description="Book your own holidays — they go straight onto the squadron's NCO Holidays calendar"
        actions={
          <Button size="sm" onClick={() => setBookOpen(true)}>
            <Plus /> Book Holiday
          </Button>
        }
      />

      {data && !data.calendar_configured && (
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertTitle>Calendar not connected</AlertTitle>
          <AlertDescription>
            Holidays are being recorded here but aren&apos;t reaching Google Calendar —
            <code className="mx-1">NCO_HOLIDAY_CALENDAR_ID</code> isn&apos;t set on the API.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
        <TabsList>
          <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
          <TabsTrigger value="mine">Mine</TabsTrigger>
          <TabsTrigger value="all">All (audit)</TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">Failed to load holidays: {error.message}</p>
      ) : holidays.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon"><CalendarOff /></EmptyMedia>
            <EmptyTitle>
              {filter === "upcoming" ? "No holidays booked" : "Nothing here yet"}
            </EmptyTitle>
            <EmptyDescription>
              {filter === "upcoming"
                ? "Book time off and it'll show on the squadron's NCO Holidays calendar."
                : "Bookings stay on this list once made, even after they're cancelled."}
            </EmptyDescription>
          </EmptyHeader>
          <Button size="sm" onClick={() => setBookOpen(true)}><Plus /> Book Holiday</Button>
        </Empty>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>NCO</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Added</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {holidays.map((h) => (
                <TableRow key={h.id} className={h.cancelled ? "text-muted-foreground" : undefined}>
                  <TableCell className="font-medium">
                    {h.booked_by_name}
                    {h.is_mine && (
                      <Badge variant="outline" className="ml-2 font-normal">You</Badge>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {h.date_from === h.date_to
                      ? formatDate(h.date_from)
                      : `${formatDate(h.date_from)} – ${formatDate(h.date_to)}`}
                    <span className="ml-2 text-xs text-muted-foreground">
                      {holidayDays(h)}d
                    </span>
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate">{h.reason || "—"}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {h.created_at ? formatTimestamp(h.created_at) : "—"}
                  </TableCell>
                  <TableCell>
                    {h.cancelled ? (
                      <Badge variant="outline" title={
                        `Cancelled by ${h.cancelled_by_name ?? "someone"}` +
                        (h.cancelled_at ? ` on ${formatTimestamp(h.cancelled_at)}` : "")
                      }>
                        Cancelled
                      </Badge>
                    ) : h.on_calendar ? (
                      <Badge variant="secondary">On calendar</Badge>
                    ) : null}
                    {needsSync(h) && (
                      <Badge
                        variant="destructive"
                        className={h.cancelled ? "ml-2" : undefined}
                        title={
                          h.cancelled
                            ? "Still on Google Calendar — retry to remove it"
                            : "Saved here but not on Google Calendar"
                        }
                      >
                        Not synced
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {needsSync(h) && (h.is_mine || data?.is_staff) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === h.id}
                        onClick={() => run(
                          h.id,
                          () => syncHoliday(token!, h.id),
                          h.cancelled ? "Removed from the calendar" : "Added to the calendar",
                        )}
                      >
                        <RefreshCw /> Retry
                      </Button>
                    )}
                    {h.can_cancel && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === h.id}
                        onClick={() => onCancel(h)}
                      >
                        <Undo2 /> Remove
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Cancelled rows never leave the list, so say why once rather than per row. */}
      {filter === "all" && holidays.some((h) => h.cancelled) && (
        <p className="text-xs text-muted-foreground">
          Cancelled holidays stay listed for the record — hover the status badge to see
          who removed one and when.
        </p>
      )}

      <BookHolidayDialog
        open={bookOpen}
        onOpenChange={setBookOpen}
        token={token}
        onBooked={() => { setFilter("upcoming"); refresh(); }}
      />
      {confirmDialog}
    </div>
  );
}

function BookHolidayDialog({
  open,
  onOpenChange,
  token,
  onBooked,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | undefined;
  onBooked: () => void;
}) {
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => { setDateFrom(""); setDateTo(""); setReason(""); };

  // The end date is nearly always the start date or later, so mirroring the
  // start saves a click on the common single-day booking.
  const onFromChange = (value: string) => {
    setDateFrom(value);
    if (!dateTo || dateTo < value) setDateTo(value);
  };

  const invalid = !dateFrom || !dateTo || dateTo < dateFrom;

  const submit = async () => {
    if (!token || invalid) return;
    setSubmitting(true);
    try {
      const booked = await bookHoliday(token, {
        date_from: dateFrom, date_to: dateTo, reason: reason.trim(),
      });
      toast[booked.on_calendar ? "success" : "warning"](
        booked.on_calendar
          ? "Holiday booked and added to the calendar"
          : "Holiday booked, but Google Calendar didn't respond — use Retry on the row",
      );
      reset();
      onOpenChange(false);
      onBooked();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't book that holiday.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Book a holiday</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            This books time off for you — it goes on the squadron&apos;s NCO Holidays
            calendar under your name.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="holiday-from">First day</Label>
              <Input
                id="holiday-from"
                type="date"
                value={dateFrom}
                onChange={(e) => onFromChange(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="holiday-to">Last day</Label>
              <Input
                id="holiday-to"
                type="date"
                min={dateFrom || undefined}
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="holiday-reason">Reason (optional)</Label>
            <Textarea
              id="holiday-reason"
              rows={3}
              maxLength={500}
              placeholder="e.g. family holiday, exams"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          {dateFrom && dateTo && !invalid && (
            <p className="text-sm text-muted-foreground">
              {holidayDays({ date_from: dateFrom, date_to: dateTo })} day
              {holidayDays({ date_from: dateFrom, date_to: dateTo }) === 1 ? "" : "s"} off,
              both days included.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={invalid || submitting}>
            {submitting ? "Booking…" : "Book Holiday"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
