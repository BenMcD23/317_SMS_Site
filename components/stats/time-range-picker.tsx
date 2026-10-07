"use client";

import { useState } from "react";
import { CalendarRange, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { todayLocal } from "@/lib/format";
import { QUICK_RANGES, type QuickRangeId, rangeLabel, type TimeRange } from "@/lib/stats";
import { cn } from "@/lib/utils";

/**
 * Grafana-style time picker: one button naming the current range, opening an
 * absolute from/to on one side and the quick ranges on the other. Native date
 * inputs, so phones get their own date wheel and there's no picker library.
 */
export function TimeRangePicker({
  value,
  onQuick,
  onAbsolute,
}: {
  value: TimeRange;
  onQuick: (id: QuickRangeId) => void;
  onAbsolute: (from: string, to: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const today = todayLocal();
  // The draft starts from whatever's showing, so nudging one end is one edit.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const invalid = !from || !to ? "Pick both dates" : from > to ? "From must be on or before To" : null;

  const openWith = (next: boolean) => {
    if (next) {
      setFrom(value.kind === "absolute" ? value.from : "");
      setTo(value.kind === "absolute" ? value.to : today);
    }
    setOpen(next);
  };

  return (
    <Popover open={open} onOpenChange={openWith}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Time range: ${rangeLabel(value)}`}>
          <CalendarRange />
          <span className="max-w-[16rem] truncate">{rangeLabel(value)}</span>
          <ChevronDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(calc(100vw-2rem),32rem)] p-0">
        <div className="grid sm:grid-cols-[1fr_11rem]">
          <form
            className="flex flex-col gap-3 border-b p-4 sm:border-r sm:border-b-0"
            onSubmit={(e) => {
              e.preventDefault();
              if (invalid) return;
              onAbsolute(from, to);
              setOpen(false);
            }}
          >
            <p className="text-sm font-medium">Absolute time range</p>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="range-from" className="text-xs">
                From
              </Label>
              <Input
                id="range-from"
                type="date"
                value={from}
                max={to || today}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="range-to" className="text-xs">
                To
              </Label>
              <Input
                id="range-to"
                type="date"
                value={to}
                min={from || undefined}
                max={today}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
            {invalid && from && to && (
              <p className="text-destructive text-xs" role="alert">
                {invalid}
              </p>
            )}
            <Button type="submit" size="sm" disabled={!!invalid} className="self-start">
              Apply time range
            </Button>
          </form>
          <div className="flex flex-col p-2">
            <p className="px-2 py-1.5 text-sm font-medium">Quick ranges</p>
            <ul className="grid grid-cols-2 gap-0.5 sm:grid-cols-1">
              {QUICK_RANGES.map((r) => {
                const active = value.kind === "quick" && value.id === r.id;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      aria-pressed={active}
                      className={cn(
                        "hover:bg-accent w-full rounded-md px-2 py-1.5 text-left text-sm",
                        active && "bg-accent font-medium"
                      )}
                      onClick={() => {
                        onQuick(r.id);
                        setOpen(false);
                      }}
                    >
                      {r.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
