"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight, NotebookPen, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { DataTable, dataTableColumns } from "@/components/data-table";
import { FlightFilter } from "@/components/flight-filter";
import { Stat, StatGroup } from "@/components/stat";
import { SwitchOnDialog } from "@/components/activity-logs/switch-on-dialog";
import { WeekStatusBadge } from "@/components/activity-logs/week-status-badge";
import { SECTIONS, shiftWeek, type WeeklyCadet, type WeeklyDashboard } from "@/lib/activity-logs";
import { formatShortDate } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";

type Show = "all" | "behind" | "ok";

const col = dataTableColumns<WeeklyCadet>();

// Sorts "needs chasing" first: nothing logged, then under an hour, then the rest.
const STATUS_ORDER = { none: 0, not_set_up: 1, some: 2, not_started: 3, done: 4, complete: 5 };

const sectionColumns = SECTIONS.map(({ key, label }) =>
  col.accessor((c) => STATUS_ORDER[c.sections.find((s) => s.section === key)!.status], {
    id: key,
    header: label,
    sortFn: "basic",
    cell: ({ row }) => {
      const s = row.original.sections.find((x) => x.section === key)!;
      return (
        <div className="flex flex-col items-start gap-1">
          <WeekStatusBadge status={s.status} />
          {s.weeks_needed !== null && (
            <span className="text-muted-foreground text-xs tabular-nums">
              {s.minutes ? `${s.minutes} min · ` : ""}
              {s.weeks_done}/{s.weeks_needed} wks
              {s.missed && s.status !== "complete" ? ` · ${s.missed} missed` : ""}
            </span>
          )}
        </div>
      );
    },
  })
);

const columns = col.columns([
  col.accessor((c) => c.name.split(" ").slice(-1)[0], {
    id: "name",
    header: "Cadet",
    sortFn: "text",
    cell: ({ row }) => {
      const c = row.original;
      return (
        <div className="flex min-w-0 flex-col">
          <Link href={`/cadets/activity-logs/${c.cin}`} className="font-medium hover:underline">
            {[c.rank, c.name].filter(Boolean).join(" ")}
          </Link>
          <span className="text-muted-foreground text-xs">{c.level}</span>
        </div>
      );
    },
  }),
  col.accessor((c) => c.flight ?? "", { id: "flight", header: "Flight", sortFn: "text" }),
  // On a phone the three section columns don't fit; this one sums them up.
  col.accessor((c) => (c.behind ? 0 : 1), {
    id: "summary",
    header: "This week",
    sortFn: "basic",
    cell: ({ row }) => {
      const c = row.original;
      const due = c.sections.filter((s) => !["complete", "not_started", "not_set_up"].includes(s.status));
      const done = due.filter((s) => s.status === "done").length;
      return (
        <div className="flex flex-col items-start gap-1">
          <WeekStatusBadge
            status={c.behind ? "some" : "done"}
            label={c.behind ? "Needs chasing" : "Up to date"}
          />
          <span className="text-muted-foreground text-xs">
            {done} of {due.length} due
          </span>
        </div>
      );
    },
  }),
  ...sectionColumns,
]);

/**
 * The DofE weekly check: every cadet with their activity log switched on, and
 * whether they've logged an hour for each section this week. Filter to the
 * ones who haven't, to chase them on parade night.
 */
export default function ActivityLogsPage() {
  const router = useRouter();
  const [week, setWeek] = useState<string | null>(null);
  const [show, setShow] = useState<Show>("all");
  const [flight, setFlight] = useState("");
  const [switching, setSwitching] = useState(false);
  const { data, isLoading, error } = useApiQuery<WeeklyDashboard>(
    ["activity-logs", "weekly", week ?? "current"],
    `/activity-logs/weekly${week ? `?week=${week}` : ""}`,
    { placeholderData: (prev) => prev }
  );
  // An error body ({detail}) where the dashboard was expected must not crash the table.
  const cadets = useMemo(() => (Array.isArray(data?.cadets) ? data.cadets : []), [data]);

  const behind = cadets.filter((c) => c.behind).length;
  const finished = cadets.flatMap((c) => c.sections).filter((s) => s.status === "complete").length;
  const flights = [...new Set(cadets.map((c) => c.flight).filter((f): f is string => !!f))].sort();
  const shown = cadets.filter(
    (c) => (show === "all" || (show === "behind") === c.behind) && (!flight || c.flight === flight)
  );

  const weekTitle = data
    ? `${data.is_current_week ? "This week" : "Week of"} ${formatShortDate(data.week_start)}–${formatShortDate(data.week_end)}`
    : "This week";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Activity Logs"
        description="DofE Skills, Volunteering and Physical: who has logged an hour this week, and who hasn't."
        actions={
          <Button onClick={() => setSwitching(true)}>
            <Plus />
            Switch on a cadet
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous week"
          disabled={!data}
          onClick={() => data && setWeek(shiftWeek(data.week_start, -1))}
        >
          <ChevronLeft />
        </Button>
        <span className="min-w-40 text-center text-sm font-medium" aria-live="polite">
          {weekTitle}
        </span>
        <Button
          variant="outline"
          size="icon"
          aria-label="Next week"
          disabled={!data || data.is_current_week}
          onClick={() => data && setWeek(shiftWeek(data.week_start, 1))}
        >
          <ChevronRight />
        </Button>
        {data && !data.is_current_week && (
          <Button variant="ghost" onClick={() => setWeek(null)}>
            Back to this week
          </Button>
        )}
      </div>

      <ErrorAlert message={error?.message ?? null} title="Could not load activity logs" />

      {isLoading && <ListSkeleton rows={5} />}

      {!isLoading && !error && cadets.length === 0 && (
        <EmptyState
          icon={NotebookPen}
          title="No activity logs switched on"
          description="Switch on a cadet doing their DofE. They'll get an Activity Log page on the cadet portal."
        />
      )}

      {cadets.length > 0 && (
        <>
          <StatGroup className="grid-cols-2 sm:grid-cols-4">
            <Stat label="Switched on" value={cadets.length} />
            <Stat label="Up to date" value={cadets.length - behind} tone="success" />
            <Stat label="Need chasing" value={behind} tone={behind ? "warning" : undefined} />
            <Stat label="Sections finished" value={finished} />
          </StatGroup>

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
                Need chasing
              </ToggleGroupItem>
              <ToggleGroupItem value="ok" className="px-3">
                Up to date
              </ToggleGroupItem>
            </ToggleGroup>
            <FlightFilter flights={flights} value={flight} onChange={setFlight} />
          </div>

          {shown.length ? (
            <DataTable
              label="Activity logs this week"
              data={shown}
              columns={columns}
              rowKey={(c) => c.cin}
              rowHref={(c) => `/cadets/activity-logs/${c.cin}`}
              columnClassName={{
                flight: "hidden md:table-cell",
                summary: "sm:hidden",
                skills: "hidden sm:table-cell",
                volunteering: "hidden sm:table-cell",
                physical: "hidden sm:table-cell",
              }}
            />
          ) : (
            <p className="text-muted-foreground text-sm">
              {show === "behind" ? "Nobody to chase. Everyone's up to date." : "No cadets match."}
            </p>
          )}
        </>
      )}

      <SwitchOnDialog
        open={switching}
        onOpenChange={setSwitching}
        onDone={(log) => {
          toast.success(`Activity log switched on for ${log.name}.`);
          router.push(`/cadets/activity-logs/${log.cin}`);
        }}
      />
    </div>
  );
}
