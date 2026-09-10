"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarOff, Pencil, Plus, Undo2, TriangleAlert, RefreshCw } from "lucide-react";

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
  bookHoliday, cancelHoliday, editHoliday, holidayDays, needsSync, syncHoliday,
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
  // Null while booking a new holiday, the booking itself while editing one —
  // both use the same dialog, since it's the same three fields either way.
  const [editing, setEditing] = useState<NcoHoliday | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const openBook = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (h: NcoHoliday) => { setEditing(h); setDialogOpen(true); };

  const { data, isLoading, error } = useApiQuery<NcoHolidayList>(
    ["nco-holidays"],
    "/nco-holidays",
  );

  const token = session?.id_token;
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["nco-holidays"] });

  const holidays = useMemo(() => {
    const all = data?.holidays ?? [];
    if (filter === "mine") return all.filter((h) => h.is_mine);
    // Staff-gated, so a non-staff viewer sitting on it falls back to upcoming
    // rather than rendering the audit list without a tab to have chosen it.
    if (filter === "all" && data?.is_staff) return all;
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
        description={
          data && !data.can_book
            ? "The squadron's NCO absence, as it appears on the NCO Holidays calendar"
            : data && data.min_notice_days > 0
              ? `Book your holidays at least ${data.min_notice_days} days ahead — they go straight onto the squadron's NCO Holidays calendar`
              : "Book your holidays — they go straight onto the squadron's NCO Holidays calendar"
        }
        actions={
          data?.can_book && (
            <Button size="sm" onClick={openBook}>
              <Plus /> Book Holiday
            </Button>
          )
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
          {/* Staff have no bookings of their own, so "Mine" would always be
              empty for them; the audit view is theirs instead. */}
          {data?.can_book && <TabsTrigger value="mine">Mine</TabsTrigger>}
          {data?.is_staff && <TabsTrigger value="all">All (audit)</TabsTrigger>}
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
              {filter !== "upcoming"
                ? "Bookings stay on this list once made, even after they're cancelled."
                : data?.can_book
                  ? "Book time off and it'll show on the squadron's NCO Holidays calendar."
                  : "No NCO has booked time off yet."}
            </EmptyDescription>
          </EmptyHeader>
          {data?.can_book && (
            <Button size="sm" onClick={openBook}><Plus /> Book Holiday</Button>
          )}
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
                        {h.cancelled_at
                          ? `Cancelled ${formatDate(h.cancelled_at)}`
                          : "Cancelled"}
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
                    {h.can_edit && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busyId === h.id}
                        onClick={() => openEdit(h)}
                      >
                        <Pencil /> Edit
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
          who removed one.
        </p>
      )}

      {/* Keyed so switching between booking and editing remounts it with the
          right starting values, instead of needing an effect to reset them. */}
      <HolidayDialog
        key={editing?.id ?? "new"}
        holiday={editing}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        token={token}
        minNoticeDays={data?.min_notice_days ?? 0}
        earliestDate={data?.earliest_booking_date ?? null}
        onSaved={() => { setFilter("upcoming"); refresh(); }}
      />
      {confirmDialog}
    </div>
  );
}

/** The booking form, in both its modes: `holiday` null books a new one, a
 *  booking edits that one in place. Same three fields either way. */
function HolidayDialog({
  holiday,
  open,
  onOpenChange,
  token,
  minNoticeDays,
  earliestDate,
  onSaved,
}: {
  holiday: NcoHoliday | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string | undefined;
  minNoticeDays: number;
  earliestDate: string | null;
  onSaved: () => void;
}) {
  // The API sends timestamps; the date inputs want "YYYY-MM-DD".
  const asDate = (value: string) => value.slice(0, 10);
  const originalFrom = holiday ? asDate(holiday.date_from) : "";

  const [dateFrom, setDateFrom] = useState(originalFrom);
  const [dateTo, setDateTo] = useState(holiday ? asDate(holiday.date_to) : "");
  const [reason, setReason] = useState(holiday?.reason ?? "");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setDateFrom(originalFrom);
    setDateTo(holiday ? asDate(holiday.date_to) : "");
    setReason(holiday?.reason ?? "");
  };

  // The end date is nearly always the start date or later, so mirroring the
  // start saves a click on the common single-day booking.
  const onFromChange = (value: string) => {
    setDateFrom(value);
    if (!dateTo || dateTo < value) setDateTo(value);
  };

  // The picker's `min` stops most of these, but a typed date can still land
  // inside the notice period — so check it here rather than relying on the
  // input. Both are only a courtesy; the API is what actually enforces it.
  // Leaving an existing first day where it is never counts as too soon, so a
  // holiday that's nearly here can still have its reason fixed.
  const tooSoon =
    !!earliestDate && !!dateFrom && dateFrom < earliestDate && dateFrom !== originalFrom;
  const invalid = !dateFrom || !dateTo || dateTo < dateFrom || tooSoon;
  // Same reason: the picker mustn't forbid the day the booking already starts on.
  const minFrom = earliestDate
    ? (originalFrom && originalFrom < earliestDate ? originalFrom : earliestDate)
    : undefined;

  const submit = async () => {
    if (!token || invalid) return;
    setSubmitting(true);
    try {
      const body = { date_from: dateFrom, date_to: dateTo, reason: reason.trim() };
      const saved = holiday
        ? await editHoliday(token, holiday.id, body)
        : await bookHoliday(token, body);
      // Booking over an existing holiday extends it rather than adding a row,
      // so say which happened instead of claiming a booking that isn't there.
      const extended = !holiday && saved.date_from.slice(0, 10) !== dateFrom;
      const what = holiday
        ? "Holiday updated"
        : extended
          ? "Holiday extended"
          : "Holiday booked";
      toast[saved.on_calendar ? "success" : "warning"](
        saved.on_calendar
          ? `${what} and the calendar entry moved`
          : `${what}, but Google Calendar didn't respond — use Retry on the row`,
      );
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(
        e instanceof Error
          ? e.message
          : holiday ? "Couldn't update that holiday." : "Couldn't book that holiday.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{holiday ? "Edit holiday" : "Book a holiday"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            {holiday
              ? "Changing these moves the entry on the squadron's NCO Holidays calendar."
              : "This books time off for you — it goes on the squadron's NCO Holidays calendar under your name."}
            {minNoticeDays > 0 && earliestDate && (
              <>
                {" "}Holidays need at least {minNoticeDays} days&apos; notice, so the
                earliest you can {holiday ? "move it to" : "book from"} is{" "}
                {formatDate(earliestDate)}.
              </>
            )}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-2">
              <Label htmlFor="holiday-from">First day</Label>
              <Input
                id="holiday-from"
                type="date"
                min={minFrom}
                value={dateFrom}
                onChange={(e) => onFromChange(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="holiday-to">Last day</Label>
              <Input
                id="holiday-to"
                type="date"
                min={dateFrom || minFrom}
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
          {tooSoon && earliestDate && (
            <p className="text-sm text-destructive">
              That&apos;s inside the {minNoticeDays}-day notice period — the earliest
              you can book from is {formatDate(earliestDate)}. Speak to staff if you
              need time off sooner.
            </p>
          )}
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
            {holiday
              ? (submitting ? "Saving…" : "Save Changes")
              : (submitting ? "Booking…" : "Book Holiday")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
