"use client";

import type { LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "",
  primary: "border-primary/40 text-primary hover:bg-primary/10 hover:text-primary",
  success: "border-success/40 text-success hover:bg-success/10 hover:text-success",
  destructive: "text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive",
} as const;

/**
 * An order item's action that, once done, becomes its own undo: "Mark as
 * Given" turns into a faded, dashed "Undo given" (same colour and icon, so
 * the row still reads at a glance), and the next tap takes it back. Shared by the uniform and badge order pages so every
 * step undoes the same way, from the button that did it, rather than from a
 * separate Undo hidden in the history below.
 *
 * `disabled` only stops the action (no size yet, out of stock); an undo is
 * always offered while the step is done, unless `undoDisabled` says why not.
 */
export function ToggleActionButton({
  done,
  label,
  doneLabel,
  icon: Icon,
  tone = "neutral",
  busy = false,
  disabled = false,
  undoDisabled = false,
  onDo,
  onUndo,
  itemLabel,
  className,
}: {
  done: boolean;
  label: string;
  /** Says what the next tap does ("Undo given"). */
  doneLabel: string;
  icon: LucideIcon;
  tone?: keyof typeof TONES;
  busy?: boolean;
  disabled?: boolean;
  undoDisabled?: boolean;
  onDo: () => void;
  onUndo: () => void;
  /** What it acts on ("Beret"): names the undo for screen readers ("Undo given: Beret"),
   * which matters when a card has several. */
  itemLabel?: string;
  className?: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-pressed={done}
      aria-label={done && itemLabel ? `${doneLabel}: ${itemLabel}` : undefined}
      className={cn(
        "h-8 text-xs disabled:opacity-40 sm:h-7 sm:w-full",
        TONES[tone],
        // Greyed but still the same button: faded and dashed until pressed.
        done && "border-dashed opacity-60 hover:opacity-100 focus-visible:opacity-100",
        className
      )}
      disabled={busy || (done ? undoDisabled : disabled)}
      onClick={done ? onUndo : onDo}
    >
      <Icon className="mr-1 h-3 w-3" />
      {done ? doneLabel : label}
    </Button>
  );
}
