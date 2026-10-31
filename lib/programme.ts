/**
 * Types and helpers for the programme record: the parade-night programme
 * the API imports from the monthly doc, set against attendance
 * (/programme/stats). Shared by the stats page's programme section and the
 * Programme page's import controls.
 */

export type ProgrammeCategory = {
  key: string;
  label: string;
  nights: number;
  rate: number | null;
  authorised_rate: number | null;
  cadet_nights: number;
};

export type ProgrammeActivity = {
  name: string;
  category: string;
  label: string;
  times: number;
  rate: number | null;
};

export type NightSession = { period: number; flights: string; activity: string; category: string };

export type ProgrammeNightTurnout = {
  date: string;
  rate: number | null;
  present: number;
  total: number;
  uniform: string | null;
  sessions: NightSession[];
};

export type ProgrammeStats = {
  days: number;
  nights: ProgrammeNightTurnout[];
  categories: ProgrammeCategory[];
  activities: ProgrammeActivity[];
  categories_all: { key: string; label: string }[];
};

export type ImportedMonth = { month: string; nights: number; sessions: number; imported_at: string | null };

export type ImportResult = { month: string; nights: number; sessions: number; skipped?: string };

/** Turnout over every night in the period, weighted by who was registered. */
export function overallRate(nights: ProgrammeNightTurnout[]): number | null {
  const total = nights.reduce((n, x) => n + x.total, 0);
  if (!total) return null;
  return Math.round((1000 * nights.reduce((n, x) => n + x.present, 0)) / total) / 10;
}

/** Kinds of night, lowest turnout first: the ones worth looking at lead. */
export function kindsByTurnout(categories: ProgrammeCategory[]): ProgrammeCategory[] {
  return [...categories]
    .filter((c) => c.rate !== null)
    .sort((a, b) => (a.rate ?? 0) - (b.rate ?? 0) || a.label.localeCompare(b.label));
}

/**
 * A night's sessions as short lines for a tooltip or list: "1st · A, B ·
 * Drill". Whole-squadron sessions read "All".
 */
export function sessionLines(sessions: NightSession[]): string[] {
  return sessions.map((s) => {
    const who = s.flights === "C, A, B" ? "All" : s.flights;
    return `${s.period === 1 ? "1st" : "2nd"} · ${who} · ${s.activity}`;
  });
}

/** "October 2026" from "2026-10". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

/** "1 night, 9 sessions" / "No nights in the doc": one import's outcome. */
export function importSummary(r: ImportResult): string {
  if (r.skipped) return `${monthLabel(r.month)}: not imported (${r.skipped})`;
  return `${monthLabel(r.month)}: ${r.nights} night${r.nights === 1 ? "" : "s"}, ${r.sessions} session${
    r.sessions === 1 ? "" : "s"
  }`;
}
