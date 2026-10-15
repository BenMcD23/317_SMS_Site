"use client";

import { useId } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * One order in an orders list (uniform, badges): a header that's always
 * visible — who, when, what state — and a body that opens beneath it.
 *
 * The whole header toggles, not just the chevron: on a phone the chevron is a
 * small target at the far edge. Links, buttons and popovers inside the header
 * keep their own clicks. The chevron stays the keyboard and screen-reader
 * control, with `aria-expanded` and `aria-controls`.
 *
 * Rows sit in an `OrderList` so a long list reads as one list, not a stack of
 * cards each with a frame and a gap.
 */
export function OrderDisclosure({
  open,
  onToggle,
  label,
  title,
  meta,
  aside,
  muted,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  /** What the order is, for the toggle's name: "order for Amy Able". */
  label: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  aside?: React.ReactNode;
  /** Completed orders recede so the open ones stand out. */
  muted?: boolean;
  children: React.ReactNode;
}) {
  const bodyId = useId();

  function onHeaderClick(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as Node;
    // A popover's content is portalled out of the header but its clicks still
    // bubble here through React; only clicks on the header itself count.
    if (!e.currentTarget.contains(target)) return;
    if ((target as HTMLElement).closest?.("a, button, input, [role=combobox]")) return;
    onToggle();
  }

  return (
    <div className={cn("bg-card", muted && "text-muted-foreground")}>
      {/* Mouse convenience only; the chevron button is the accessible control. */}
      <div
        onClick={onHeaderClick}
        className="hover:bg-muted/40 flex cursor-pointer flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 transition-colors sm:px-5"
      >
        {/* Wraps on a phone: the badges drop under the name rather than
            squeezing it onto three lines. */}
        <div className="flex min-w-40 flex-1 flex-col gap-0.5">
          <div className={cn("flex items-center gap-2 font-semibold", !muted && "text-foreground")}>
            {title}
          </div>
          {meta && <div className="text-muted-foreground text-xs">{meta}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {aside}
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            onClick={onToggle}
            aria-label={`${open ? "Collapse" : "Expand"} ${label}`}
            aria-expanded={open}
            aria-controls={bodyId}
          >
            <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
          </Button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={bodyId}
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-3 px-4 pt-1 pb-4 sm:px-5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** The frame an orders list sits in: one border, rows split by hairlines. */
export function OrderList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("bg-card divide-y overflow-hidden rounded-lg border", className)}>{children}</div>
  );
}

/** An `OrderList` while it loads, row for row, so the page doesn't jump when the orders land. */
export function OrderListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <OrderList>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5" aria-hidden>
          <div className="flex flex-col gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-14" />
            <Skeleton className="size-8 rounded-md" />
          </div>
        </div>
      ))}
    </OrderList>
  );
}
