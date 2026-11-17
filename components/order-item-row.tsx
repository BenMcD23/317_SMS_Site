"use client";

import { Check, ChevronDown, MoreHorizontal, type LucideIcon } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

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
 * - everything else in a "⋯" menu on a phone (edit size, stock, undo a step,
 *   delete), or as quieter buttons beside the next step on a laptop;
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
  const wide = useWideScreen();
  const canTick = !readOnly && !giving && (given || !giveDisabledReason);
  const actions = menu.filter((a): a is ItemAction => a !== "separator");

  return (
    <li
      id={id}
      className={cn(
        "flex gap-3 px-3 py-2.5 transition-colors sm:px-4 sm:py-3",
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
          "focus-visible:ring-ring/50 flex size-10 shrink-0 items-center justify-center rounded-full border-2 outline-none focus-visible:ring-2",
          given
            ? "border-success bg-success text-white"
            : "border-muted-foreground/40 hover:border-success hover:text-success/50 text-transparent",
          !canTick && !given && "opacity-40",
          readOnly && "cursor-default"
        )}
      >
        {giving ? <Spinner /> : <Check className="size-5" strokeWidth={3} aria-hidden />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span
                className={cn(
                  "min-w-0 font-medium break-words",
                  given && "text-muted-foreground line-through"
                )}
              >
                {name}
              </span>
              <Badge variant="outline" className={cn("text-xs", TONE[status.tone])}>
                {status.label}
              </Badge>
              {extra}
            </div>
            {details && (
              <div className="text-muted-foreground flex flex-col gap-0.5 text-sm break-words">{details}</div>
            )}
          </div>

          {/* On a phone, everything but the next step waits behind "⋯". */}
          {!wide && !readOnly && actions.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-muted-foreground -mt-1 -mr-1 size-9 shrink-0"
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

        {/* The next step leads; on a laptop, with room to spare, the rest sit
            beside it as quieter buttons instead of behind "⋯". */}
        {!readOnly && (next || (wide && actions.length > 0)) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {next && <ActionButton action={next} variant="outline" />}
            {wide && actions.map((a) => <ActionButton key={a.label} action={a} variant="ghost" />)}
          </div>
        )}

        {/* Notes and history share a line until there's something to show. */}
        {(notes || history) && (
          <div className="flex flex-wrap items-start gap-x-3">
            {notes}
            {history && (
              <button
                type="button"
                onClick={() => setShowHistory((s) => !s)}
                aria-expanded={showHistory}
                className="text-muted-foreground hover:text-foreground flex min-h-8 items-center gap-1 rounded px-1 text-xs"
              >
                History
                <ChevronDown
                  className={cn("size-3.5 transition-transform", showHistory && "rotate-180")}
                  aria-hidden
                />
              </button>
            )}
          </div>
        )}
        {history && showHistory && <div className="flex flex-col gap-1.5">{history}</div>}
      </div>
    </li>
  );
}

function ActionButton({ action, variant }: { action: ItemAction; variant: "outline" | "ghost" }) {
  return (
    <Button
      size="sm"
      variant={variant}
      className={cn(
        "h-9 sm:h-8",
        variant === "ghost" && "text-muted-foreground hover:text-foreground",
        action.destructive && "text-destructive hover:text-destructive hover:bg-destructive/10"
      )}
      disabled={action.disabled || action.busy}
      onClick={action.onSelect}
    >
      {action.busy ? (
        <Spinner data-icon="inline-start" />
      ) : (
        action.icon && <action.icon data-icon="inline-start" />
      )}
      {action.label}
    </Button>
  );
}

const WIDE = "(min-width: 768px)";

function subscribeWide(onChange: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const mql = window.matchMedia(WIDE);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

/**
 * Laptop-wide or more. Unlike useIsMobile, "can't tell" (the server, jsdom)
 * counts as narrow here: the compact row works anywhere, while a row of
 * every button would crowd a phone.
 */
function useWideScreen() {
  return useSyncExternalStore(
    subscribeWide,
    () => typeof window.matchMedia === "function" && window.matchMedia(WIDE).matches,
    () => false
  );
}

/** The frame the rows sit in: one bordered list split by hairlines. */
export function OrderItemList({ children }: { children: React.ReactNode }) {
  return <ul className="bg-card divide-y overflow-hidden rounded-lg border">{children}</ul>;
}

/**
 * An order's item count for its header, which becomes its hand-out progress
 * once something has been given: "3 items", then "1 of 3 given", then "All
 * given" when it's ready to complete. One badge, so the header stays on a
 * phone's width. A search that hides items says how many show.
 */
export function ItemCount({
  items,
  shown,
  completed,
}: {
  items: { givenAt: string | null }[];
  /** How many a search is showing, when it hides some. */
  shown?: number;
  completed: boolean;
}) {
  const n = items.length;
  const given = items.filter((i) => i.givenAt).length;
  const all = given === n;
  const text =
    shown !== undefined
      ? `${shown} of ${n} items`
      : completed || given === 0
        ? `${n} item${n === 1 ? "" : "s"}`
        : all
          ? "All given"
          : `${given} of ${n} given`;
  const progress = shown === undefined && !completed && given > 0;
  return (
    <Badge
      variant={progress ? "outline" : "secondary"}
      className={cn(
        "text-xs tabular-nums",
        progress && (all ? "border-success/40 bg-success/10 text-success" : "text-muted-foreground")
      )}
    >
      {text}
    </Badge>
  );
}
