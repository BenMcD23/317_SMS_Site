"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

// Long enough to read as "that card went away", short enough not to hold up the next click.
export const EXIT_MS = 250;

// The sticky app header is 3.5rem; a card whose top is above this has scrolled under it.
const HEADER_PX = 64;

function prefersReducedMotion() {
  return typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

/**
 * Lets a card in a list leave gracefully instead of vanishing. Removing a tall,
 * expanded card in one frame yanks everything below it up under the cursor and
 * leaves you scrolled into the middle of some other order. Instead the card
 * collapses in place and, if you'd scrolled past its top, the page glides back
 * to where it started — so the next card slides into the slot you were
 * looking at.
 *
 * Usage:
 *   const { isLeaving, exit } = useExitCollapse();
 *   exit(order.id, () => setOrders((prev) => prev.filter((o) => o.id !== order.id)));
 *   <ExitCollapse id={order.id} leaving={isLeaving(order.id)}>…card…</ExitCollapse>
 */
export function useExitCollapse() {
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);

  const exit = useCallback((id: string, commit: () => void) => {
    const reduced = prefersReducedMotion();
    const el = Array.from(document.querySelectorAll<HTMLElement>("[data-exit-id]")).find(
      (node) => node.dataset.exitId === id
    );
    if (el && el.getBoundingClientRect().top < HEADER_PX) {
      el.scrollIntoView?.({ behavior: reduced ? "auto" : "smooth", block: "start" });
    }
    if (reduced || !el) {
      commit();
      return;
    }
    setLeaving((prev) => new Set(prev).add(id));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      commit();
      setLeaving((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, EXIT_MS);
    timers.current.add(timer);
  }, []);

  const isLeaving = useCallback((id: string) => leaving.has(id), [leaving]);

  return { isLeaving, exit };
}

/** The wrapper `useExitCollapse` animates: collapses its height to zero and fades out. */
export function ExitCollapse({
  id,
  leaving,
  children,
}: {
  id: string;
  leaving: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-exit-id={id}
      // Inert while leaving so a second click can't land on a card that's already gone server-side.
      inert={leaving || undefined}
      aria-hidden={leaving || undefined}
      className={cn(
        "grid scroll-mt-20 transition-[grid-template-rows,opacity] duration-250 ease-out motion-reduce:transition-none",
        leaving ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100"
      )}
    >
      {/* Only clip while collapsing — clipping all the time would cut off the card's shadow. */}
      <div className={cn("min-h-0", leaving && "overflow-hidden")}>{children}</div>
    </div>
  );
}
