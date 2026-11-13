"use client";

import { cn } from "@/lib/utils";

/**
 * The action row at the foot of a long form (Submit, Reset), pinned to the
 * bottom of the screen on a phone so it's in thumb reach without scrolling
 * past every question first. On a phone it sits just above the bottom tab
 * bar (3.5rem plus the home-indicator inset); from `md`, where there is no
 * bar, it rests on the window edge. It stays in the page's flow, so on a
 * short form it simply sits where the form ends.
 */
export function StickyActions({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "no-print bg-background/95 supports-[backdrop-filter]:bg-background/85 sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-wrap items-center gap-3 border-t px-4 py-3 backdrop-blur md:bottom-0 md:mx-0 md:border-t-0 md:px-0",
        className
      )}
    >
      {children}
    </div>
  );
}
