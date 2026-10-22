"use client";

import { useEffect, useState } from "react";

import { breadcrumbsFor } from "@/lib/navigation";

/**
 * Which sidebar sections are expanded. The full menu is taller than a laptop
 * screen, so sections collapse; this remembers the choice per browser and makes
 * sure the section holding the current page is open.
 *
 * Only a per-viewer convenience, so localStorage is fine, and every read and
 * write is guarded: private windows and blocked storage just fall back to "only
 * the current section open".
 */
const STORAGE_KEY = "sms.sidebar.sections";

export type OpenSections = Record<string, boolean>;

/** The section label the page lives under ("Cadets" for /cadets/1234), if any. */
export function activeSectionLabel(pathname: string, sectionLabels: string[]): string | null {
  const first = breadcrumbsFor(pathname)[0]?.label;
  return first && sectionLabels.includes(first) ? first : null;
}

/**
 * The current page's section is open — so the page is never hidden in the menu,
 * however you got there (⌘K, a link, back) — unless you closed it on this very
 * page. Every other section is as you last left it, closed if never touched.
 */
export function isSectionOpen(
  label: string,
  stored: OpenSections,
  active: string | null,
  closedActiveHere: boolean
): boolean {
  if (label === active) return !closedActiveHere;
  return stored[label] ?? false;
}

function readStored(): OpenSections {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as OpenSections) : {};
  } catch {
    return {};
  }
}

function writeStored(value: OpenSections) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage blocked or full: the toggle still works for this visit.
  }
}

export function useOpenSections(pathname: string, sectionLabels: string[]) {
  const active = activeSectionLabel(pathname, sectionLabels);
  // Starts empty so the server render and the first client render agree; the
  // stored choices are applied straight after hydration.
  const [stored, setStored] = useState<OpenSections>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage only exists after mount
    setStored(readStored());
  }, []);

  // The pathname the user closed the current section on, if they did.
  const [closedActiveOn, setClosedActiveOn] = useState<string | null>(null);

  const isOpen = (label: string) => isSectionOpen(label, stored, active, closedActiveOn === pathname);
  const setOpen = (label: string, open: boolean) => {
    if (label === active) setClosedActiveOn(open ? null : pathname);
    setStored((prev) => {
      const next = { ...prev, [label]: open };
      writeStored(next);
      return next;
    });
  };

  return { isOpen, setOpen };
}
