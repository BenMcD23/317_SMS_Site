"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { flightBadgeClass } from "@/lib/cadet-format";
import { formatDate } from "@/lib/format";
import { type Award, BADGE_LABELS, type ExpiringQual, levelColor } from "@/lib/stats";
import { cn } from "@/lib/utils";

/**
 * Named lists behind the stats: badges recently gained and qualifications about
 * to lapse. Long lists collapse to `limit` rows so they don't push the charts
 * off the page; printing always shows the lot.
 */

function useCollapse<T>(items: T[], limit: number) {
  const [open, setOpen] = useState(false);
  const toggle =
    items.length > limit ? (
      <Button variant="ghost" size="sm" className="no-print self-start" onClick={() => setOpen((o) => !o)}>
        {open ? "Show fewer" : `Show all ${items.length}`}
      </Button>
    ) : null;
  return { shown: open ? items : items.slice(0, limit), hidden: open ? [] : items.slice(limit), toggle };
}

function FlightChip({ flight }: { flight: string }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 text-[11px]",
        flightBadgeClass(flight === "Unknown" ? null : flight)
      )}
    >
      {flight === "Unknown" ? "—" : flight}
    </span>
  );
}

export function RecentAwards({
  awards,
  limit = 8,
  empty,
}: {
  awards: Award[];
  limit?: number;
  empty: string;
}) {
  const { shown, hidden, toggle } = useCollapse(awards, limit);
  if (awards.length === 0) return <p className="text-muted-foreground text-sm">{empty}</p>;
  const row = (a: Award, extra?: string) => (
    <li
      key={`${a.cin}-${a.badge}-${a.level}-${a.date}`}
      className={cn("flex items-center gap-2 text-sm", extra)}
    >
      <span
        className="inline-block size-2 shrink-0 rounded-full"
        style={{ background: levelColor(a.level) }}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{a.name}</span>
        <span className="text-muted-foreground truncate text-xs">
          {a.level} {BADGE_LABELS[a.badge] ?? a.badge}
        </span>
      </span>
      <FlightChip flight={a.flight} />
      <span className="text-muted-foreground w-20 shrink-0 text-right text-xs tabular-nums">
        {formatDate(a.date)}
      </span>
    </li>
  );
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2.5">
        {shown.map((a) => row(a))}
        {hidden.map((a) => row(a, "print-only"))}
      </ul>
      {toggle}
    </div>
  );
}

export function ExpiringQuals({ quals, limit = 8 }: { quals: ExpiringQual[]; limit?: number }) {
  const { shown, hidden, toggle } = useCollapse(quals, limit);
  if (quals.length === 0)
    return <p className="text-muted-foreground text-sm">Nothing lapses in the next three months.</p>;
  const row = (q: ExpiringQual, extra?: string) => (
    <li
      key={`${q.cin}-${q.qual_type}-${q.date_expires}`}
      className={cn("flex items-center gap-2 text-sm", extra)}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{q.name}</span>
        <span className="text-muted-foreground truncate text-xs">{q.qual_type}</span>
      </span>
      <FlightChip flight={q.flight} />
      <Badge
        variant="outline"
        className={cn(
          "w-20 justify-center tabular-nums",
          q.days_left <= 30 && "border-warning/40 text-warning"
        )}
        title={formatDate(q.date_expires)}
      >
        {q.days_left === 0 ? "today" : `${q.days_left} days`}
      </Badge>
    </li>
  );
  return (
    <div className="flex flex-col gap-2">
      <ul className="flex flex-col gap-2.5">
        {shown.map((q) => row(q))}
        {hidden.map((q) => row(q, "print-only"))}
      </ul>
      {toggle}
    </div>
  );
}
