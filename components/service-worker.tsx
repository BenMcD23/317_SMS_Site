"use client";

import { useEffect } from "react";

import { SW_URL } from "@/lib/push";

/**
 * Registers public/sw.js, which gives the installed app its offline page and
 * shows push notifications. Once per page load; the browser keeps it up to
 * date by itself after that. Renders nothing.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register(SW_URL, { scope: "/" }).catch((e: unknown) => {
      // The app works without it, just without the offline page and push.
      console.warn("[sw] registration failed:", e);
    });
  }, []);
  return null;
}
