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

/** "5 Jan" — for column headings and chips, where the year is already implied
 *  by the range being looked at. */
export function formatShortDate(iso: string | null | undefined, fallback = "—"): string {
  if (!iso) return fallback;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
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

/** Today as "YYYY-MM-DD" in the user's local time — the value a date <input>
 *  wants. `toISOString()` is UTC, so between midnight and 1am in summer it
 *  hands back yesterday. */
export function todayLocal(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
