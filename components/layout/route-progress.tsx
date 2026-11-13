"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/** Whether a click on `a` is an in-app navigation to a different page. */
export function startsNavigation(a: HTMLAnchorElement, e: MouseEvent, here: string): boolean {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (a.target && a.target !== "_self") return false;
  if (a.hasAttribute("download")) return false;
  let url: URL;
  try {
    url = new URL(a.href, window.location.href);
  } catch {
    return false;
  }
  if (url.origin !== window.location.origin) return false;
  // A link to this page (or only its #hash) doesn't load anything.
  return url.pathname !== here;
}

/**
 * A thin bar along the top edge while a page loads. `loading.tsx` covers
 * a route once Next starts rendering it, but the request for a page that
 * wasn't prefetched comes first, and on parade-night 4G that gap left a
 * tapped link looking dead, so people tapped again. The bar starts on the
 * click (any same-site link to another page) and finishes when the path
 * changes; a navigation that never lands gives up after 10s.
 */
export function RouteProgress() {
  const pathname = usePathname();
  const [state, setState] = useState<"idle" | "start" | "loading" | "done">("idle");
  const giveUp = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      const a = (e.target as Element | null)?.closest?.("a");
      if (!a || !startsNavigation(a as HTMLAnchorElement, e, window.location.pathname)) return;
      setState("start");
      clearTimeout(giveUp.current);
      giveUp.current = setTimeout(() => setState("idle"), 10_000);
    }
    // Bubble phase, so a handler that cancels the click (preventDefault) is
    // seen before deciding.
    document.addEventListener("click", onClick);
    return () => {
      document.removeEventListener("click", onClick);
      clearTimeout(giveUp.current);
    };
  }, []);

  useEffect(() => {
    if (state !== "start") return;
    // One frame at zero width first, so the grow to 80% is a transition.
    const f = requestAnimationFrame(() => setState((s) => (s === "start" ? "loading" : s)));
    return () => cancelAnimationFrame(f);
  }, [state]);

  // The new page is here: run the bar to the end. Done while rendering
  // (React's "adjust state on a prop change"), not in an effect.
  const [seenPath, setSeenPath] = useState(pathname);
  if (pathname !== seenPath) {
    setSeenPath(pathname);
    if (state === "start" || state === "loading") setState("done");
  }

  useEffect(() => {
    if (state !== "done") return;
    clearTimeout(giveUp.current);
    const t = setTimeout(() => setState((s) => (s === "done" ? "idle" : s)), 250);
    return () => clearTimeout(t);
  }, [state]);

  if (state === "idle") return null;
  return (
    <div
      role="progressbar"
      aria-label="Loading page"
      aria-busy={state !== "done"}
      className="no-print pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5"
    >
      <div
        data-state={state}
        className="bg-primary h-full origin-left scale-x-0 transition-transform ease-out data-[state=done]:scale-x-100 data-[state=done]:duration-200 data-[state=loading]:scale-x-[0.8] data-[state=loading]:duration-[8000ms] motion-reduce:transition-none"
      />
    </div>
  );
}
