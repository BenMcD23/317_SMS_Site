"use client";

import { Check, ChevronDown, MoreHorizontal, type LucideIcon } from "lucide-react";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/** Where an item is up to, in one word or two; the tone is never the only signal. */
export type ItemStatus = {
  label: string;
  tone: "todo" | "progress" | "ready" | "done" | "problem";
};

/** One thing that can be done to an item, as the next step or a menu entry. */
export type ItemAction = {
  label: string;
  onSelect: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  busy?: boolean;
  destructive?: boolean;
};

const TONE: Record<ItemStatus["tone"], string> = {
  todo: "border-warning/40 bg-warning/10 text-warning",
  progress: "text-muted-foreground",
  ready: "bg-primary text-primary-foreground border-transparent",
  done: "border-success/40 bg-success/10 text-success",
  problem: "border-destructive/40 bg-destructive/10 text-destructive",
};

/**
 * One item of a uniform or badge order, shared by both order pages so they
 * work the same way. Each item used to be a box of six to eight buttons with
 * no hint which came next; now it is:
 *
 * - a large tick to hand it out (the parade-night job), at the left where a
 *   thumb finds it, undone from the toast the page shows;
 * - its name, one status ("Needs sizing", "In stock", "Ready to collect")
 *   and a line or two of detail;
 * - the one next step its status calls for, as a button;
 * - everything else in a "⋯" menu: edit size, stock, undo a step, delete;
 * - its notes, and its history folded away under "History".
 */
export function OrderItemRow({
  id,
  name,
  extra,
  status,
  details,
  given,
  giveDisabledReason,
  giving = false,
  onToggleGiven,
  next,
  menu = [],
  readOnly = false,
  highlighted = false,
  notes,
  history,
}: {
  /** The element id, for jumping to the item from elsewhere on the page. */
  id?: string;
  name: string;
  /** Beside the name: "Replacement (£2)". */
  extra?: React.ReactNode;
  status: ItemStatus;
  /** Short lines under the name: size, where it is in stock, what's missing. */
  details?: React.ReactNode;
  given: boolean;
  /** Why it can't be handed out yet ("Needs a size first"); the tick is off while set. */
  giveDisabledReason?: string | null;
  giving?: boolean;
  onToggleGiven: () => void;
  next?: ItemAction | null;
  menu?: (ItemAction | "separator")[];
  /** A completed order: everything shows, nothing changes. */
  readOnly?: boolean;
  /** Briefly ringed after jumping here from the order list. */
  highlighted?: boolean;
  notes?: React.ReactNode;
  history?: React.ReactNode;
}) {
  const [showHistory, setShowHistory] = useState(false);
  const canTick = !readOnly && !giving && (given || !giveDisabledReason);

  return (
    <li
      id={id}
      className={cn(
        "flex gap-3 px-3 py-3 transition-colors sm:px-4",
        highlighted && "bg-primary/10 ring-primary/40 ring-2 ring-inset"
      )}
    >
      {/* Given/not given is a checkbox to a screen reader too. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={given}
        aria-label={`Given: ${name}`}
        title={!given && giveDisabledReason ? giveDisabledReason : undefined}
        disabled={!canTick}
        onClick={onToggleGiven}
        className={cn(
          "focus-visible:ring-ring/50 mt-0.5 flex size-11 shrink-0 items-center justify-center rounded-full border-2 outline-none focus-visible:ring-2",
          given
            ? "border-success bg-success text-white"
            : "border-muted-foreground/40 hover:border-success hover:text-success/50 text-transparent",
          !canTick && !given && "opacity-40",
          readOnly && "cursor-default"
        )}
      >
        {giving ? <Spinner /> : <Check className="size-5" strokeWidth={3} aria-hidden />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className={cn("font-medium", given && "text-muted-foreground line-through")}>{name}</span>
              <Badge variant="outline" className={cn("text-xs", TONE[status.tone])}>
                {status.label}
              </Badge>
              {extra}
            </div>
            {details && <div className="text-muted-foreground flex flex-col gap-0.5 text-sm">{details}</div>}
          </div>

          {!readOnly && menu.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground -mt-1 size-9 shrink-0"
                  aria-label={`More for ${name}`}
                >
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-52">
                {menu.map((a, i) =>
                  a === "separator" ? (
                    <DropdownMenuSeparator key={`sep-${i}`} />
                  ) : (
                    <DropdownMenuItem
                      key={a.label}
                      disabled={a.disabled || a.busy}
                      variant={a.destructive ? "destructive" : "default"}
                      onSelect={a.onSelect}
                    >
                      {a.icon && <a.icon />}
                      {a.label}
                    </DropdownMenuItem>
                  )
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {!readOnly && next && (
          <div>
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              disabled={next.disabled || next.busy}
              onClick={next.onSelect}
            >
              {next.busy ? (
                <Spinner data-icon="inline-start" />
              ) : (
                next.icon && <next.icon data-icon="inline-start" />
              )}
              {next.label}
            </Button>
          </div>
        )}

        {notes}

        {history && (
          <div>
            <button
              type="button"
              onClick={() => setShowHistory((s) => !s)}
              aria-expanded={showHistory}
              className="text-muted-foreground hover:text-foreground -ml-1 flex min-h-8 items-center gap-1 rounded px-1 text-xs"
            >
              History
              <ChevronDown
                className={cn("size-3.5 transition-transform", showHistory && "rotate-180")}
                aria-hidden
              />
            </button>
            {showHistory && <div className="mt-1 flex flex-col gap-1.5">{history}</div>}
          </div>
        )}
      </div>
    </li>
  );
}

/** The frame the rows sit in: one bordered list split by hairlines. */
export function OrderItemList({ children }: { children: React.ReactNode }) {
  return <ul className="bg-card divide-y overflow-hidden rounded-lg border">{children}</ul>;
}

/**
 * How far through handing out an order is, for its header: "1 of 3 given",
 * then "All given" once it's ready to complete. Nothing before the first
 * hand-over, or on an order already completed.
 */
export function GivenProgress({
  items,
  completed,
}: {
  items: { givenAt: string | null }[];
  completed: boolean;
}) {
  const given = items.filter((i) => i.givenAt).length;
  if (completed || given === 0) return null;
  const all = given === items.length;
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs tabular-nums",
        all ? "border-success/40 bg-success/10 text-success" : "text-muted-foreground"
      )}
    >
      {all ? "All given" : `${given} of ${items.length} given`}
    </Badge>
  );
}
