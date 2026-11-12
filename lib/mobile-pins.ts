import type { LucideIcon } from "lucide-react";

import { flattenLinks, isLinkActive, mobileTabsFor, type NavSection } from "@/lib/navigation";

/**
 * The phone's bottom bar: four pages each person pins for themselves, and a
 * Menu with the pages they used last, a search box and everything else.
 * Built for switching back and forth between the same few pages, which is
 * most of what happens on a phone: a pinned page is one tap, a recent one two.
 *
 * Pure helpers here; the bar keeps the choices in localStorage, so they're
 * per phone and a blocked or private browser just falls back to the defaults.
 */

export const MAX_PINS = 4;
export const MAX_RECENT = 5;

export type PageLink = { label: string; href: string; icon: LucideIcon; path: string[]; keywords?: string[] };

/** Every page the user can reach, flat, from the same site map as the sidebar. */
export function reachablePages(sections: NavSection[]): PageLink[] {
  return flattenLinks(sections);
}

/**
 * The page the path is on: the deepest link that matches, so a cadet's record
 * counts as the cadet list and a box as uniform stock. Null for a page the map
 * doesn't know (Settings, a hub that isn't listed).
 */
export function pageFor(pathname: string, pages: PageLink[]): PageLink | null {
  let best: PageLink | null = null;
  for (const page of pages) {
    if (isLinkActive(pathname, page.href) && (!best || page.href.length > best.href.length)) best = page;
  }
  return best;
}

/** First pins for someone who hasn't chosen: the role's most-used pages, as the old bar ordered them. */
export function defaultPins(role: string | undefined, pages: PageLink[]): string[] {
  const reachable = new Set(pages.map((p) => p.href));
  return mobileTabsFor(role)
    .map((t) => t.href)
    .filter((href) => reachable.has(href))
    .slice(0, MAX_PINS);
}

/**
 * The pins to show: the stored choice with anything no longer reachable taken
 * out (a role change, a page that moved), or the defaults if nothing's stored.
 */
export function currentPins(stored: string[] | null, role: string | undefined, pages: PageLink[]): string[] {
  if (!stored) return defaultPins(role, pages);
  const reachable = new Set(pages.map((p) => p.href));
  return [...new Set(stored)].filter((href) => reachable.has(href)).slice(0, MAX_PINS);
}

/** Pin or unpin a page. A fifth pin is refused (returns the pins unchanged); unpin one first. */
export function togglePin(pins: string[], href: string): string[] {
  if (pins.includes(href)) return pins.filter((p) => p !== href);
  return pins.length >= MAX_PINS ? pins : [...pins, href];
}

/** Put a page at the front of the recent list, once, keeping the newest few. */
export function addRecent(recent: string[], href: string): string[] {
  return [href, ...recent.filter((r) => r !== href)].slice(0, MAX_RECENT);
}

/**
 * A pinned page's name on the bar, where there's room for a word or two. The
 * old bar's short names where it had one ("Orders", "Badges"); otherwise the
 * page's own, with its group in front when the name alone is ambiguous
 * ("Stock" is uniform or badge stock).
 */
export function pinLabel(page: PageLink, role: string | undefined, pages: PageLink[]): string {
  const short = mobileTabsFor(role).find((t) => t.href === page.href)?.label;
  return short ?? fullLabel(page, pages);
}

/**
 * A page's full name for a list away from its group (Pinned, Recent): its own
 * name, with the group in front when another page shares it ("Uniform Orders",
 * "Badges Orders").
 */
export function fullLabel(page: PageLink, pages: PageLink[]): string {
  const clash = pages.some((p) => p.href !== page.href && p.label === page.label);
  const group = page.path[page.path.length - 1];
  return clash && group ? `${group} ${page.label}` : page.label;
}

/** Pages whose name, place or keywords contain every word typed. */
export function searchPages(pages: PageLink[], query: string): PageLink[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return pages.filter((p) => {
    const text = [p.label, ...p.path, ...(p.keywords ?? [])].join(" ").toLowerCase();
    return words.every((w) => text.includes(w));
  });
}
