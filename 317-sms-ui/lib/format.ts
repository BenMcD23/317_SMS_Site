// Shared date/time formatting — one implementation instead of a copy per page.

/** "5 Jan 2026", or the fallback when the date is missing. */
export function formatDate(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "05 Jan 2026, 19:30" — used on order timelines. */
export function formatTimestamp(ts: string): string {
  return new Date(ts).toLocaleString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
