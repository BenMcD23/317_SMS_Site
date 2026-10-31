"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, NotebookPen, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { FlightFilter } from "@/components/flight-filter";
import { Stat, StatGroup } from "@/components/stat";
import { SwitchOnDialog } from "@/components/activity-logs/switch-on-dialog";
import { WeekGrid, WeekGridKey } from "@/components/activity-logs/week-grid";
import { GRID_WEEKS, shiftWeek, type WeekGrid as Grid } from "@/lib/activity-logs";
import { formatShortDate } from "@/lib/format";
import { useStaffUsers } from "@/lib/staff-users";
import { useApiQuery } from "@/lib/use-api-query";

type Show = "all" | "behind" | "ok" | "report";

/**
 * The DofE check: every cadet with their activity log switched on, against
 * the last eight weeks, showing which sections got their hour each week.
 * "Chase" narrows it to who still owes this week, for parade night.
 */
export default function ActivityLogsPage() {
  const router = useRouter();
  // The last week shown; null is "ending this week".
  const [end, setEnd] = useState<string | null>(null);
  const [show, setShow] = useState<Show>("all");
  const [flight, setFlight] = useState("");
  const [mine, setMine] = useState(false);
  const [switching, setSwitching] = useState(false);
  // Who "my reports" means: the staff member whose email is signed in.
  const { data: session } = useSession();
  const staff = useStaffUsers();
  const myCin = useMemo(() => {
    const email = session?.user?.email?.toLowerCase();
    const rows = Array.isArray(staff.data) ? staff.data : [];
    return (email && rows.find((u) => u.email?.toLowerCase() === email)?.cin) || null;
  }, [session?.user?.email, staff.data]);
  const { data, isLoading, error } = useApiQuery<Grid>(
    ["activity-logs", "grid", end ?? "current"],
    `/activity-logs/grid?weeks=${GRID_WEEKS}${end ? `&end=${end}` : ""}`,
    { placeholderData: (prev) => prev }
  );
  // An error body ({detail}) where the grid was expected must not crash the table.
  const grid = data && Array.isArray(data.cadets) && Array.isArray(data.weeks) ? data : null;
  const cadets = useMemo(() => grid?.cadets ?? [], [grid]);

  const behind = cadets.filter((c) => c.behind).length;
  const finished = cadets.flatMap((c) => c.sections).filter((s) => s.complete).length;
  const flights = [...new Set(cadets.map((c) => c.flight).filter((f): f is string => !!f))].sort();
  const reportsDue = cadets.filter((c) => c.report_due).length;
  const shown = cadets.filter(
    (c) =>
      (show === "all" || (show === "report" ? !!c.report_due : show === "behind" ? c.behind : !c.behind)) &&
      (!flight || c.flight === flight) &&
      (!mine || (myCin !== null && c.assessor_cin === myCin))
  );

  const first = grid?.weeks[0];
  const last = grid?.weeks[grid.weeks.length - 1];
  const atNow = !!grid && last === grid.current_week;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-16">
      <PageHeader
        title="DofE Activity Logs"
        description="Skills, Volunteering and Physical, week by week: who's done their hour and who needs chasing."
        actions={
          <Button onClick={() => setSwitching(true)}>
            <Plus />
            Switch on a cadet
          </Button>
        }
      />

      <ErrorAlert message={error?.message ?? null} title="Could not load DofE activity logs" />

      {isLoading && <ListSkeleton rows={5} />}

      {!isLoading && !error && grid && cadets.length === 0 && (
        <EmptyState
          icon={NotebookPen}
          title="No DofE activity logs switched on"
          description="Switch on a cadet doing their DofE. They'll get a DofE Activity Log page on the cadet portal."
        />
      )}

      {grid && cadets.length > 0 && (
        <>
          <StatGroup className="grid-cols-2 sm:grid-cols-4">
            <Stat label="Switched on" value={cadets.length} />
            <Stat label="Up to date this week" value={cadets.length - behind} tone="success" />
            <Stat label="To chase this week" value={behind} tone={behind ? "warning" : undefined} />
            <Stat label="Sections finished" value={finished} />
          </StatGroup>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                aria-label="Show"
                value={show}
                onValueChange={(v) => v && setShow(v as Show)}
              >
                <ToggleGroupItem value="all" className="px-3">
                  All
                </ToggleGroupItem>
                <ToggleGroupItem value="behind" className="px-3">
                  To chase
                </ToggleGroupItem>
                <ToggleGroupItem value="ok" className="px-3">
                  Up to date
                </ToggleGroupItem>
                <ToggleGroupItem value="report" className="px-3">
                  Report due{reportsDue ? ` ${reportsDue}` : ""}
                </ToggleGroupItem>
              </ToggleGroup>
              {myCin !== null && (
                <Button
                  variant={mine ? "default" : "outline"}
                  size="sm"
                  aria-pressed={mine}
                  onClick={() => setMine((m) => !m)}
                >
                  My cadets
                </Button>
              )}
              <FlightFilter flights={flights} value={flight} onChange={setFlight} />
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                aria-label="Earlier weeks"
                onClick={() => first && setEnd(shiftWeek(first, -1))}
              >
                <ChevronLeft />
              </Button>
              <span className="min-w-32 text-center text-sm font-medium tabular-nums" aria-live="polite">
                {formatShortDate(first)} – {formatShortDate(last)}
              </span>
              <Button
                variant="outline"
                size="icon"
                aria-label="Later weeks"
                disabled={atNow}
                onClick={() => last && setEnd(shiftWeek(last, GRID_WEEKS))}
              >
                <ChevronRight />
              </Button>
            </div>
          </div>

          {shown.length ? (
            <div className="flex flex-col gap-3">
              <WeekGrid weeks={grid.weeks} currentWeek={grid.current_week} cadets={shown} />
              <WeekGridKey />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              {show === "behind"
                ? "Nobody to chase. Everyone's up to date this week."
                : show === "report"
                  ? "No reports waiting."
                  : "No cadets match."}
            </p>
          )}
        </>
      )}

      <SwitchOnDialog
        open={switching}
        onOpenChange={setSwitching}
        onDone={(log) => {
          toast.success(`DofE activity log switched on for ${log.name}.`);
          router.push(`/cadets/activity-logs/${log.cin}`);
        }}
      />
    </div>
  );
}
