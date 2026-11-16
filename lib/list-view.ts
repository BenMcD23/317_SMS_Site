"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * A list's remembered view: how it's sorted and what it's narrowed to (a
 * flight, say), so the cadet list opens the way it was left instead of
 * starting over every visit. Searches aren't kept: they're for a moment.
 *
 * Per list and per browser, in localStorage, like "Hide personal data": a
 * phone on parade night and a laptop at home each keep their own. Every read
 * and write is guarded; blocked storage just means the defaults every time.
 */
export type ListView = {
  sort?: { id: string; desc: boolean };
  filters?: Record<string, string>;
};

const PREFIX = "sms.view.";
// The `storage` event only fires in *other* tabs, so this tab's own changes
// are broadcast with an event of our own.
const CHANGE_EVENT = "sms-list-view-change";

function readRaw(key: string): string | null {
  try {
    return window.localStorage.getItem(PREFIX + key);
  } catch {
    return null;
  }
}

/** A stored view, or an empty one if it's missing or not something we wrote. */
export function parseView(raw: string | null): ListView {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    if (!v || typeof v !== "object") return {};
    const { sort, filters } = v as ListView;
    const view: ListView = {};
    if (sort && typeof sort.id === "string") view.sort = { id: sort.id, desc: !!sort.desc };
    if (filters && typeof filters === "object") {
      view.filters = Object.fromEntries(Object.entries(filters).filter(([, f]) => typeof f === "string"));
    }
    return view;
  } catch {
    return {};
  }
}

function write(key: string, view: ListView) {
  try {
    const empty = !view.sort && !Object.values(view.filters ?? {}).some(Boolean);
    if (empty) window.localStorage.removeItem(PREFIX + key);
    else window.localStorage.setItem(PREFIX + key, JSON.stringify(view));
  } catch {
    // Storage blocked: the view works for this visit but can't be kept.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key?.startsWith(PREFIX)) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * The view remembered for `key` ("cadets", "recruits"), and a setter that
 * merges a change into it. The server renders the defaults (it can't see
 * localStorage); these lists load their rows after hydration anyway.
 */
export function useListView(key: string): [ListView, (change: Partial<ListView>) => void] {
  // The raw string is the snapshot: a primitive, so React sees no change
  // unless the stored text changed.
  const raw = useSyncExternalStore(
    subscribe,
    () => readRaw(key),
    () => null
  );
  const view = useMemo(() => parseView(raw), [raw]);
  const update = useCallback(
    (change: Partial<ListView>) => {
      const current = parseView(readRaw(key));
      write(key, {
        ...current,
        ...change,
        filters: change.filters ? { ...current.filters, ...change.filters } : current.filters,
      });
    },
    [key]
  );
  return [view, update];
}
