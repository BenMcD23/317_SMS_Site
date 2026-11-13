"use client";

import { Button } from "@/components/ui/button";
import { todayLocal } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The day before `iso` (YYYY-MM-DD), in local time. */
export function dayBefore(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d - 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * One-tap dates beside a date field: Today, and Yesterday for something that
 * happened last night. Most dates people type are one of those, and a phone's
 * date picker is three taps and a scroll for each. A shortcut that's already
 * the value isn't shown, so the row only offers a change.
 */
export function DateShortcuts({
  value,
  onChange,
  yesterday = false,
  className,
}: {
  value: string;
  onChange: (iso: string) => void;
  /** Also offer Yesterday: for logging something after the event. */
  yesterday?: boolean;
  className?: string;
}) {
  const today = todayLocal();
  const options = [
    { label: "Today", iso: today },
    ...(yesterday ? [{ label: "Yesterday", iso: dayBefore(today) }] : []),
  ].filter((o) => o.iso !== value);
  if (!options.length) return null;
  return (
    <div className={cn("flex flex-wrap gap-1", className)}>
      {options.map((o) => (
        <Button
          key={o.label}
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground h-8 px-2"
          onClick={() => onChange(o.iso)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}
