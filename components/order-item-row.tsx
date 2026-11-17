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

/**
 * What kind of job an action is. Each kind has one colour on its button's
 * border and icon, so the ordering steps read as a set apart from stock and
 * collection. Not the status colours: those mean a state, not a kind of job.
 */
export type ActionGroup = "size" | "stock" | "order" | "collect" | "delete";

/**
 * One step an item can take, in the fixed slot it always sits in. A step
 * that's done stays in its slot, shown pressed with a tick ("Ordered"), and
 * taps back to undo it where that's allowed, so buttons never move about as
 * an item goes along.
 */
export type ItemAction = {
  key: string;
  label: string;
  group: ActionGroup;
  onSelect: () => void;
  icon?: LucideIcon;
  disabled?: boolean;
  /** Why it can't be done right now ("None in stock"), shown beside it while disabled. */
  hint?: string;
  busy?: boolean;
  done?: boolean;
  /** Shown once done: "Ordered". */
  doneLabel?: string;
  /** What undoing says in a menu: "Undo ordered". */
  undoLabel?: string;
  /** Takes the step back; without it a done step stays put. */
  onUndo?: () => void;
};

// Literal class names, one set per kind, so Tailwind sees them all.
// Dark mode needs stronger borders and tints to tell the kinds apart.
const GROUP: Record<ActionGroup, { edge: string; next: string; icon: string }> = {
  size: { edge: "border-border", next: "border-foreground/50 bg-muted", icon: "text-muted-foreground" },
  stock: {
    edge: "border-chart-3/60 dark:border-chart-3/80",
    next: "border-chart-3 bg-chart-3/15 dark:bg-chart-3/30",
    icon: "text-chart-3",
  },
  order: {
    edge: "border-chart-5/60 dark:border-chart-5/80",
    next: "border-chart-5 bg-chart-5/15 dark:bg-chart-5/30",
    icon: "text-chart-5",
  },
  collect: {
    edge: "border-primary/60 dark:border-primary/80",
    next: "border-primary bg-primary/15 dark:bg-primary/30",
    icon: "text-primary",
  },
  delete: {
    edge: "border-destructive/40 dark:border-destructive/70",
    next: "border-destructive bg-destructive/10",
    icon: "text-destructive",
  },
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
 * - its steps in fixed slots, always in the same order, each outlined in its
 *   kind's colour (ordering, stock, collection); the next one tinted, done
 *   ones ticked and tapped to undo. A laptop shows them all; a phone shows the
 *   next one and keeps the rest, same order, in "⋯";
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
  actions = [],
  nextKey = null,
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
  /** Every step the item can take, in the order they always appear. */
  actions?: ItemAction[];
  /** The step its status calls for next, tinted in its slot. */
  nextKey?: string | null;
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
  const next = actions.find((a) => a.key === nextKey && !a.done) ?? null;

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

          {/* On a phone, every step is in "⋯" in its fixed order. */}
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
              <DropdownMenuContent align="end" className="min-w-56">
                {actions.map((a, i) => (
                  <MenuEntry key={a.key} action={a} separate={a.group === "delete" && i > 0} />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* On a laptop every step sits in its own slot, always in the same
            order; on a phone only the next one shows, the rest behind "⋯". */}
        {!readOnly && (wide ? actions.length > 0 : !!next) && (
          <div className="flex flex-wrap items-center gap-1.5">
            {wide
              ? actions.map((a) => <SlotButton key={a.key} action={a} isNext={a === next} />)
              : next && <SlotButton action={next} isNext />}
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

/** One step as a button: outlined in its kind's colour, tinted when it's next, pressed once done. */
function SlotButton({ action: a, isNext }: { action: ItemAction; isNext: boolean }) {
  const g = GROUP[a.group];
  const Icon = a.done ? Check : a.icon;
  return (
    <Button
      size="sm"
      variant="outline"
      aria-pressed={a.onUndo || a.done ? !!a.done : undefined}
      title={a.done && a.undoLabel && a.onUndo ? `${a.undoLabel}?` : undefined}
      className={cn(
        "h-9 sm:h-8",
        a.done
          ? "bg-muted text-muted-foreground border-border"
          : isNext
            ? cn(g.next, "font-semibold")
            : g.edge,
        a.group === "delete" && !a.done && "text-destructive hover:text-destructive"
      )}
      disabled={a.busy || (a.done ? !a.onUndo : a.disabled)}
      onClick={a.done ? a.onUndo : a.onSelect}
    >
      {a.busy ? (
        <Spinner data-icon="inline-start" />
      ) : (
        Icon && <Icon data-icon="inline-start" className={a.done ? "text-success" : g.icon} />
      )}
      {a.done ? (a.doneLabel ?? a.label) : a.label}
      {!a.done && a.disabled && a.hint && <span className="text-xs font-normal">· {a.hint}</span>}
    </Button>
  );
}

/** One step in the phone's "⋯" menu: the same slots in the same order, done ones offering their undo. */
function MenuEntry({ action: a, separate }: { action: ItemAction; separate: boolean }) {
  const g = GROUP[a.group];
  // Done: offer the undo, or say it's done where there's no taking it back.
  const label = a.done ? (a.onUndo && a.undoLabel) || a.doneLabel || a.label : a.label;
  return (
    <>
      {separate && <DropdownMenuSeparator />}
      <DropdownMenuItem
        disabled={a.busy || (a.done ? !a.onUndo : a.disabled)}
        variant={a.group === "delete" ? "destructive" : "default"}
        onSelect={a.done ? a.onUndo : a.onSelect}
      >
        {a.icon && <a.icon className={g.icon} />}
        {label}
        {!a.done && a.disabled && a.hint && <span className="ml-auto pl-3 text-xs">{a.hint}</span>}
      </DropdownMenuItem>
    </>
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
