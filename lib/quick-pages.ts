"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { toast } from "sonner";

import { apiFetch } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";
import {
  addRecent,
  currentPins,
  pageFor,
  reachablePages,
  togglePin as toggled,
  type PageLink,
} from "@/lib/mobile-pins";
import { visibleSections } from "@/lib/navigation";

/**
 * The pages someone pinned and the pages they used last, shared by the phone
 * bar, the sidebar's Pinned list and ⌘K, so a pin made in one shows in the
 * others straight away.
 *
 * Pins live on the account (the API's /settings/nav-pins), so they follow
 * someone from laptop to phone. This browser keeps a copy so the menu draws
 * at once and works offline; the account's list replaces it when it arrives.
 * Recent pages stay per browser: they're about where you've just been here.
 * Every storage read and write is guarded, and blocked storage just means the
 * copy lasts for the visit.
 */

const PINS_KEY = "sms.mobile.pins";
const RECENT_KEY = "sms.mobile.recent";
const PINS_URL = `${API_BASE}/settings/nav-pins`;

const listeners = new Set<() => void>();
// This tab's latest write of each list. Read before storage, so a write that
// storage refused (full, blocked) still holds for the visit rather than the
// older value storage kept winning.
const memory = new Map<string, string>();
// The token whose account pins have been fetched (or are being), so each
// sign-in loads them once however many components ask.
let loadedFor: string | null = null;

function notify() {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // Another tab's change arrives as a storage event.
  const onStorage = (e: StorageEvent) => {
    if (e.key !== PINS_KEY && e.key !== RECENT_KEY) return;
    // Another tab wrote it, so storage is newer than what this tab holds.
    memory.delete(e.key);
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function read(key: string): string | null {
  const held = memory.get(key);
  if (held !== undefined) return held;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Store a list, or null for "never chosen" (the role's defaults). */
function write(key: string, list: string[] | null) {
  const raw = JSON.stringify(list);
  memory.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // Storage blocked or full: `memory` keeps it for this visit.
  }
  notify();
}

/** The raw string, so React compares by value and doesn't re-render forever. */
function useRaw(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => read(key),
    // The server has no storage: render the defaults, as the first client render does.
    () => null
  );
}

function parseList(raw: string | null): string[] | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === "string") : null;
  } catch {
    return null;
  }
}

async function saveToAccount(token: string, pins: string[] | null): Promise<boolean> {
  try {
    const res = await apiFetch(PINS_URL, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ pins }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch the account's pins once per sign-in. The account wins over this
 * browser's copy. An account that has never chosen but a browser that has
 * (pins made before they were saved to the account) sends them up, so nobody
 * loses the pins they'd already set. A failed fetch keeps the copy.
 */
async function loadFromAccount(token: string) {
  if (loadedFor === token) return;
  loadedFor = token;
  try {
    const res = await apiFetch(PINS_URL, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const data = (await res.json().catch(() => null)) as { pins?: unknown } | null;
    if (!data || !("pins" in data)) return;
    const fromAccount = data.pins === null ? null : parseList(JSON.stringify(data.pins));
    const local = parseList(read(PINS_KEY));
    if (fromAccount === null && local !== null) {
      await saveToAccount(token, local);
      return;
    }
    write(PINS_KEY, fromAccount);
  } catch {
    // Offline or the API's down: keep this browser's copy.
  }
}

/** For tests: forget writes held in memory and which account was loaded, as a fresh visit would. */
export function resetQuickPagesForTest() {
  memory.clear();
  loadedFor = null;
}

export type QuickPages = {
  /** Every page this user can reach. */
  pages: PageLink[];
  /** Their pins, in order, already filtered to what they can reach. */
  pins: string[];
  /** Pages used last, newest first, reachable only. */
  recent: string[];
  /** The page the current path is on, or null. */
  here: PageLink | null;
  togglePin: (href: string) => void;
};

export function useQuickPages(): QuickPages {
  // Null outside the app router (a component rendered on its own in a test).
  const pathname = usePathname() ?? "";
  const { data: session } = useSession() ?? {};
  const role = session?.role;
  const email = session?.user?.email ?? undefined;
  const oc = session?.is_oc;
  const token = session?.id_token;
  const pages = useMemo(() => reachablePages(visibleSections(role, email, oc)), [role, email, oc]);
  const pinsRaw = useRaw(PINS_KEY);
  const recentRaw = useRaw(RECENT_KEY);

  useEffect(() => {
    if (token) void loadFromAccount(token);
  }, [token]);

  const pins = currentPins(parseList(pinsRaw), role, pages);
  const reachable = new Set(pages.map((p) => p.href));
  const recent = (parseList(recentRaw) ?? []).filter((h) => reachable.has(h));

  return {
    pages,
    pins,
    recent,
    here: pageFor(pathname, pages),
    togglePin: (href) => {
      const before = parseList(read(PINS_KEY));
      const next = toggled(pins, href);
      // Show it at once; the account catches up.
      write(PINS_KEY, next);
      if (!token) return;
      void saveToAccount(token, next).then((ok) => {
        if (ok) return;
        // Put it back rather than show a pin the account doesn't have.
        write(PINS_KEY, before);
        toast.error("Couldn't save your pins. Check your connection and try again.");
      });
    },
  };
}

/**
 * Records each page visited, so Recent (phone menu, ⌘K) can offer the way back.
 * Mounted once in the app shell; a record page counts as its list.
 */
export function RecentPageTracker() {
  const { here } = useQuickPages();
  const href = here?.href;
  useEffect(() => {
    if (!href) return;
    const recent = parseList(read(RECENT_KEY)) ?? [];
    if (recent[0] !== href) write(RECENT_KEY, addRecent(recent, href));
  }, [href]);
  return null;
}
