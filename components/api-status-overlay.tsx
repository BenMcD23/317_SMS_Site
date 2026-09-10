"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Button } from "@/components/ui/button";
import { API_BASE } from "@/lib/config";

const UP_INTERVAL = 30_000;   // normal polling cadence
const DOWN_INTERVAL = 5_000;  // poll faster while down so recovery shows quickly
const PING_TIMEOUT = 5_000;

/** Fired by apiFetch when a request fails in a way that suggests an outage,
 *  so the overlay re-checks immediately instead of waiting for the next poll. */
export const API_OUTAGE_EVENT = "sms:api-outage-suspected";

async function pingApi(): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/ping`, {
      cache: "no-store",
      signal: AbortSignal.timeout(PING_TIMEOUT),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Global "API is down" warning. Polls the backend's unauthenticated /ping;
 * when it stops responding a full-screen popup appears. Dismissing the popup
 * leaves a persistent red banner until the API is reachable again.
 */
export function ApiStatusOverlay() {
  const [down, setDown] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [checking, setChecking] = useState(false);
  const downRef = useRef(down);
  useEffect(() => {
    downRef.current = down;
  }, [down]);

  const check = useCallback(async (): Promise<boolean> => {
    setChecking(true);
    const ok = await pingApi();
    setChecking(false);
    if (!ok && !downRef.current) setDismissed(false); // new outage → re-show popup
    setDown(!ok);
    return ok;
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    const loop = async () => {
      // Don't burn requests while the tab is hidden; re-check on focus below.
      let isDown = downRef.current;
      if (!document.hidden) isDown = !(await check());
      if (!cancelled) {
        timer = setTimeout(loop, isDown ? DOWN_INTERVAL : UP_INTERVAL);
      }
    };
    loop();

    const recheck = () => void check();
    window.addEventListener(API_OUTAGE_EVENT, recheck);
    window.addEventListener("focus", recheck);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener(API_OUTAGE_EVENT, recheck);
      window.removeEventListener("focus", recheck);
    };
  }, [check]);

  if (!down) return null;

  if (dismissed) {
    return (
      <div className="fixed inset-x-0 top-0 z-[100] flex items-center justify-center gap-3 bg-destructive px-4 py-2 text-sm font-medium text-white">
        <AlertTriangle className="size-4 shrink-0" />
        <span>The API is down — data can&apos;t be loaded or saved right now.</span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
          onClick={() => void check()}
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
        className="w-full max-w-md rounded-xl border-2 border-destructive bg-background p-8 text-center shadow-2xl"
      >
        <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-full bg-destructive/15">
          <AlertTriangle className="size-9 text-destructive" />
        </div>
        <h2 id="api-down-title" className="text-2xl font-bold text-destructive">
          API is down
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">
          The backend can&apos;t be reached, so nothing can be loaded or saved.
          This page will keep checking and the warning will clear automatically
          once it&apos;s back.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Button variant="outline" onClick={() => setDismissed(true)}>
            Dismiss
          </Button>
          <Button variant="destructive" onClick={() => void check()} disabled={checking}>
            <RefreshCw className={checking ? "animate-spin" : ""} />
            {checking ? "Checking…" : "Check again"}
          </Button>
        </div>
      </div>
    </div>
  );
}
