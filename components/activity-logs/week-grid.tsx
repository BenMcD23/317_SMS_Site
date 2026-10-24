"use client";

import { useMemo } from "react";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { DataTable, dataTableColumns } from "@/components/data-table";
import { cn } from "@/lib/utils";
import { formatShortDate } from "@/lib/format";
import { SECTIONS, cellLabel, type CellState, type GridCadet } from "@/lib/activity-logs";

// Filled means the hour was done; every other state is an outline or nothing,
// and the letter plus the cell's accessible name say which section and what,
// so colour is never the only signal.
const SQUARE: Record<CellState, string> = {
  done: "bg-primary text-primary-foreground border-transparent",
  short: "border-warning text-warning",
  missed: "border-destructive/60 text-destructive border-dashed",
  due: "border-muted-foreground/50 text-muted-foreground border-dashed",
  off: "border-transparent text-muted-foreground/30",
};

/** S V P for one week: a square per section. */
function WeekCell({ cadet, index }: { cadet: GridCadet; index: number }) {
  const week = cadet.weeks[index];
  const label = cellLabel(week.week_start, week.cells);
  return (
    <span role="img" aria-label={label} title={label} className="inline-flex gap-0.5">
      {SECTIONS.map(({ key, label: name }) => (
        <span
          key={key}
          aria-hidden
          className={cn(
            "flex size-4 items-center justify-center rounded-sm border text-[0.6rem] font-semibold sm:size-5 sm:text-[0.65rem]",
            SQUARE[week.cells[key].state]
          )}
        >
          {week.cells[key].state === "off" ? "·" : name[0]}
        </span>
      ))}
    </span>
  );
}

/** The key under the grid: what each square means, in words. */
export function WeekGridKey() {
  const items: [CellState, string][] = [
    ["done", "hour done"],
    ["short", "under an hour"],
    ["missed", "missed"],
    ["due", "this week, not yet"],
    ["off", "nothing due"],
  ];
  return (
    <ul aria-label="Key" className="text-muted-foreground flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {items.map(([state, words]) => (
        <li key={state} className="flex items-center gap-1.5">
          <span
            aria-hidden
            className={cn(
              "flex size-4 items-center justify-center rounded-sm border text-[0.6rem] font-semibold",
              SQUARE[state]
            )}
          >
            {state === "off" ? "·" : "S"}
          </span>
          {words}
        </li>
      ))}
      <li>S Skills · V Volunteering · P Physical</li>
    </ul>
  );
}

/**
 * Cadets down the side, weeks across the top: whether each DofE section got
 * its hour, week by week. Patterns show at a glance (who logs every week, who
 * slipped a month ago, who never has), which a one-week list can't.
 * On a phone only the latest three weeks fit, so the older ones are hidden.
 */
export function WeekGrid({
  weeks,
  currentWeek,
  cadets,
}: {
  weeks: string[];
  currentWeek: string;
  cadets: GridCadet[];
}) {
  const columns = useMemo(() => {
    const col = dataTableColumns<GridCadet>();
    return col.columns([
      col.accessor((c) => c.name.split(" ").slice(-1)[0], {
        id: "name",
        header: "Cadet",
        sortFn: "text",
        cell: ({ row }) => {
          const c = row.original;
          return (
            <div className="flex flex-col">
              <Link href={`/cadets/activity-logs/${c.cin}`} className="font-medium hover:underline">
                {[c.rank, c.name].filter(Boolean).join(" ")}
              </Link>
              <span className="text-muted-foreground text-xs">
                {[c.level, c.flight && `${c.flight} Flt`].filter(Boolean).join(" · ")}
              </span>
              {/* The Chase column doesn't fit on a phone; the flag moves here. */}
              {c.behind && (
                <Badge
                  variant="outline"
                  className="border-warning/40 bg-warning/10 text-warning mt-1 w-fit sm:hidden"
                >
                  Chase
                </Badge>
              )}
            </div>
          );
        },
      }),
      ...weeks.map((week, i) =>
        col.accessor((c) => SECTIONS.filter(({ key }) => c.weeks[i]?.cells[key].state === "done").length, {
          id: `w${i}`,
          header: week === currentWeek ? "This week" : formatShortDate(week),
          sortFn: "basic",
          cell: ({ row }) => <WeekCell cadet={row.original} index={i} />,
        })
      ),
      col.accessor((c) => (c.behind ? 0 : 1), {
        id: "chase",
        header: "Chase",
        sortFn: "basic",
        cell: ({ row }) =>
          row.original.behind ? (
            <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
              Chase
            </Badge>
          ) : (
            <span className="text-muted-foreground text-xs">Up to date</span>
          ),
      }),
    ]);
  }, [weeks, currentWeek]);

  // Older weeks drop off as the screen narrows; the name stays put if the
  // weeks still need to scroll.
  const columnClassName: Record<string, string> = {
    name: "bg-card sticky left-0 z-10 max-w-32 whitespace-normal sm:max-w-none",
    ...Object.fromEntries(
      weeks.map((_, i) => [
        `w${i}`,
        i < weeks.length - 3 ? (i < weeks.length - 5 ? "hidden lg:table-cell" : "hidden sm:table-cell") : "",
      ])
    ),
    chase: "hidden sm:table-cell",
  };

  return (
    <DataTable
      label="DofE activity, week by week"
      data={cadets}
      columns={columns}
      rowKey={(c) => c.cin}
      rowHref={(c) => `/cadets/activity-logs/${c.cin}`}
      columnClassName={columnClassName}
    />
  );
}
