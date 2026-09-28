"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";

const UP_INTERVAL = 30_000; // normal polling cadence
const DOWN_INTERVAL = 5_000; // poll faster while down so recovery shows quickly
const RECHECK_INTERVAL = 3_000; // minimum gap between checks while confirming a failure
const FAILURES_TO_CONFIRM = 3; // consecutive failed checks before any warning shows
// A phone's connection is often still waking up when the tab comes back, so
// give it a moment rather than probing (and failing) straight away.
const REFOCUS_DELAY = 1_500;
// Longer than the status route's own backend timeout, so a slow backend comes
// back as that route's 503 rather than tripping this and reading as "offline".
const CHECK_TIMEOUT = 8_000;

/** Fired by apiFetch when a request fails in a way that suggests an outage,
 *  so the overlay re-checks soon instead of waiting for the next poll. */
export const API_OUTAGE_EVENT = "sms:api-outage-suspected";

type Status = "up" | "down" | "offline";

/**
 * Asks our own /api/status, where Vercel's server checks the backend. That
 * splits the two failures the browser can't tell apart on its own: no answer
 * at all means *this device* is offline; an answer that isn't 200 means we
 * reached Vercel fine and the API itself is down.
 */
async function probeStatus(): Promise<Status> {
  // onLine === false is reliable (true isn't), so skip a request we know will fail.
  if (!navigator.onLine) return "offline";
  try {
    const res = await fetch("/api/status", {
      cache: "no-store",
      signal: AbortSignal.timeout(CHECK_TIMEOUT),
    });
    return res.ok ? "up" : "down";
  } catch {
    return "offline";
  }
}

/**
 * Global "API is down" warning. Polls the same-origin /api/status and only
 * warns after several consecutive failed checks a few seconds apart, so one
 * dropped request or a phone waking up doesn't raise a false alarm. A confirmed
 * API outage shows a full-screen popup (dismissable to a persistent red
 * banner); a confirmed loss of the user's own connection shows only a small
 * "offline" notice, since there's nothing wrong with the API.
 */
export function ApiStatusOverlay() {
  const [status, setStatus] = useState<Status>("up");
  const [dismissed, setDismissed] = useState(false);
  const [checking, setChecking] = useState(false);
  const checkNowRef = useRef<() => void>(() => {});

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let nextAt = Infinity;
    let lastCheckAt = 0;
    let inFlight = false;
    let cancelled = false;
    let failures = 0;
    let confirmed: Status = "up";

    const schedule = (at: number) => {
      clearTimeout(timer);
      nextAt = at;
      timer = setTimeout(() => void run(), Math.max(0, at - Date.now()));
    };

    // Focus changes and failed page requests only bring the next check
    // forward — never closer than RECHECK_INTERVAL to the last one — so a burst
    // of failing requests can't collapse the confirmation checks into one
    // instant and raise the alarm on a single blip.
    const requestCheck = (delay = 0) => {
      const at = Math.max(Date.now() + delay, lastCheckAt + RECHECK_INTERVAL);
      if (at < nextAt) schedule(at);
    };

    const run = async (manual = false) => {
      clearTimeout(timer);
      nextAt = Infinity;
      if (inFlight) return;
      // Don't burn requests while the tab is hidden; visibility/focus re-checks.
      if (document.hidden && !manual) {
        schedule(Date.now() + (confirmed === "up" ? UP_INTERVAL : DOWN_INTERVAL));
        return;
      }

      inFlight = true;
      setChecking(true);
      const result = await probeStatus();
      inFlight = false;
      lastCheckAt = Date.now();
      if (cancelled) return;
      setChecking(false);

      if (result === "up") {
        // One success is enough to clear — a false "all clear" costs nothing.
        failures = 0;
        confirmed = "up";
      } else {
        failures++;
        // Once a problem is confirmed, follow the latest reading so the notice
        // can switch between "offline" and "API down" as the picture changes.
        if (confirmed !== "up" || failures >= FAILURES_TO_CONFIRM) {
          if (result === "down" && confirmed !== "down") setDismissed(false); // new outage → show popup
          confirmed = result;
        }
      }
      setStatus(confirmed);

      let delay = UP_INTERVAL;
      if (confirmed !== "up") delay = DOWN_INTERVAL;
      else if (failures > 0) delay = RECHECK_INTERVAL;
      schedule(lastCheckAt + delay);
    };

    checkNowRef.current = () => void run(true);
    schedule(Date.now());

    const onSuspectedOutage = () => requestCheck();
    const onRefocus = () => {
      if (!document.hidden) requestCheck(REFOCUS_DELAY);
    };
    const onConnectivityChange = () => requestCheck();
    window.addEventListener(API_OUTAGE_EVENT, onSuspectedOutage);
    window.addEventListener("focus", onRefocus);
    document.addEventListener("visibilitychange", onRefocus);
    window.addEventListener("online", onConnectivityChange);
    window.addEventListener("offline", onConnectivityChange);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener(API_OUTAGE_EVENT, onSuspectedOutage);
      window.removeEventListener("focus", onRefocus);
      document.removeEventListener("visibilitychange", onRefocus);
      window.removeEventListener("online", onConnectivityChange);
      window.removeEventListener("offline", onConnectivityChange);
    };
  }, []);

  const checkNow = () => checkNowRef.current();

  if (status === "up") return null;

  if (status === "offline") {
    return (
      <div
        role="status"
        className="bg-background text-muted-foreground fixed bottom-4 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-2 rounded-full border px-4 py-2 text-sm shadow-lg"
      >
        <WifiOff className="text-warning size-4 shrink-0" />
        <span>You&apos;re offline — retrying…</span>
      </div>
    );
  }

  if (dismissed) {
    return (
      <div className="bg-destructive fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 px-4 py-2 text-sm font-medium text-white">
        <AlertTriangle className="size-4 shrink-0" />
        <span>The API is down — data can&apos;t be loaded or saved right now.</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
          onClick={checkNow}
          disabled={checking}
        >
          <RefreshCw className={checking ? "animate-spin" : ""} />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="api-down-title"
        className="border-destructive bg-background w-full max-w-md rounded-xl border-2 p-8 text-center shadow-2xl"
      >
        <div className="bg-destructive/15 mx-auto mb-4 flex size-16 items-center justify-center rounded-full">
          <AlertTriangle className="text-destructive size-9" />
        </div>
        <h2 id="api-down-title" className="text-destructive text-2xl font-bold">
          API is down
        </h2>
        <p className="text-muted-foreground mt-3 text-sm">
          The backend can&apos;t be reached, so nothing can be loaded or saved. This page will keep checking
          and the warning will clear automatically once it&apos;s back.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
          <Button variant="destructive" onClick={checkNow} disabled={checking}>
            <RefreshCw className={checking ? "animate-spin" : ""} />
            {checking ? "Checking…" : "Check again"}
          </Button>
        </div>
      </div>
    </div>
  );
}
