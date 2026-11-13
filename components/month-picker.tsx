"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** A month as the pages pass it around: 1–12 and the full year. */
export type MonthValue = { month: number; year: number };

/** The month after (or before, with -1) the given one, across year ends. */
export function shiftMonth({ month, year }: MonthValue, by: number): MonthValue {
  const index = year * 12 + (month - 1) + by;
  return { month: (index % 12) + 1, year: Math.floor(index / 12) };
}

export function monthName(month: number): string {
  return MONTH_NAMES[month - 1] ?? "";
}

/**
 * One control for picking a month: ‹ November 2026 ›, and "This month" when
 * you've moved away. The pages that work a month at a time (texts, the
 * programme, newsletters) had a Month dropdown and a Year dropdown, two
 * menus to move one step; the arrows make the usual move, the next or last
 * month, one tap. `min`/`max` stop the arrows at the months there's anything
 * for.
 */
export function MonthPicker({
  value,
  onChange,
  label = "Month",
  min,
  max,
  className,
}: {
  value: MonthValue;
  onChange: (next: MonthValue) => void;
  label?: string;
  min?: MonthValue;
  max?: MonthValue;
  className?: string;
}) {
  const now = new Date();
  const thisMonth = { month: now.getMonth() + 1, year: now.getFullYear() };
  const key = (m: MonthValue) => m.year * 12 + m.month;
  const prev = shiftMonth(value, -1);
  const next = shiftMonth(value, 1);
  const isThisMonth = key(value) === key(thisMonth);

  return (
    <div role="group" aria-label={label} className={cn("flex flex-wrap items-center gap-1", className)}>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9"
        aria-label={`${monthName(prev.month)} ${prev.year}`}
        disabled={!!min && key(prev) < key(min)}
        onClick={() => onChange(prev)}
      >
        <ChevronLeft />
      </Button>
      {/* Announced as it changes, so a screen reader hears where the arrows went. */}
      <output aria-live="polite" className="min-w-36 px-2 text-center text-sm font-medium tabular-nums">
        {monthName(value.month)} {value.year}
      </output>
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="size-9"
        aria-label={`${monthName(next.month)} ${next.year}`}
        disabled={!!max && key(next) > key(max)}
        onClick={() => onChange(next)}
      >
        <ChevronRight />
      </Button>
      {!isThisMonth && (
        <Button type="button" variant="ghost" size="sm" className="h-9" onClick={() => onChange(thisMonth)}>
          This month
        </Button>
      )}
    </div>
  );
}
