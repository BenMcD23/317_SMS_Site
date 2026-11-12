"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

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
 * others straight away. Kept in this browser's localStorage (keys kept from
 * when only the phone had them, so existing pins carry over); every read and
 * write is guarded, and blocked storage just means the defaults for the visit.
 */

const PINS_KEY = "sms.mobile.pins";
const RECENT_KEY = "sms.mobile.recent";

const listeners = new Set<() => void>();
// This tab's latest write of each list. Read before storage, so a write that
// storage refused (full, blocked) still holds for the visit rather than the
// older value storage kept winning.
const memory = new Map<string, string>();

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

function write(key: string, list: string[]) {
  const raw = JSON.stringify(list);
  memory.set(key, raw);
  try {
    window.localStorage.setItem(key, raw);
  } catch {
    // Storage blocked or full: `memory` keeps it for this visit.
  }
  for (const l of listeners) l();
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

/** For tests: forget writes held in memory, as a fresh visit would. */
export function resetQuickPagesForTest() {
  memory.clear();
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
  const pages = useMemo(() => reachablePages(visibleSections(role, email, oc)), [role, email, oc]);
  const pinsRaw = useRaw(PINS_KEY);
  const recentRaw = useRaw(RECENT_KEY);

  const pins = currentPins(parseList(pinsRaw), role, pages);
  const reachable = new Set(pages.map((p) => p.href));
  const recent = (parseList(recentRaw) ?? []).filter((h) => reachable.has(h));

  return {
    pages,
    pins,
    recent,
    here: pageFor(pathname, pages),
    togglePin: (href) => write(PINS_KEY, toggled(pins, href)),
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
