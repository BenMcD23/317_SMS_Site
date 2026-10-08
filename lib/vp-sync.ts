/**
 * Volunteer Portal sync — shared by the scrapers-page card that hands out the
 * bookmarklet and the page the bookmarklet opens, so both agree on the origin.
 */
export const VP_ORIGIN = "https://volunteers.bader.mod.uk";

/** Turns public/vp-sync-bookmarklet.js into a `javascript:` URL that posts to
 *  this site's origin (dev, prod and previews each get their own). */
export function bookmarkletHref(source: string, smsOrigin: string): string {
  return "javascript:" + encodeURIComponent(source.replaceAll("__SMS_ORIGIN__", smsOrigin));
}

// ── Shapes the API's /vp endpoints return (see core/portal_data.py) ─────────
// A data set that has never synced is null, so the UI can say "not synced"
// rather than "none".

export type WhtState = "current" | "expiring" | "expired";
export type ClassificationStage = { name: string; date: string | null };

export type PortalOverviewRow = {
  cin: number;
  name: string;
  rank: string | null;
  flight: string | null;
  synced_at: string | null;
  whts: Record<string, { state: WhtState; expires: string | null }> | null;
  shooting: { shoots: number; last: string | null } | null;
  fieldcraft: Record<string, number> | null;
  exams: { enrolled: number; completed: number; in_progress: number } | null;
  flying: { sorties: number; minutes: number; last: string | null } | null;
  learning: { complete: number; total: number } | null;
  joined: string | null;
  classification: ClassificationStage[] | null;
};

export type PortalOverview = { weapons: string[]; last_synced: string | null; cadets: PortalOverviewRow[] };

export type CadetPortalData = {
  synced_at: string | null;
  whts: { weapon: string; status: string; expires: string | null }[] | null;
  shooting_log:
    | { weapon: string; practice: string; outcome: string; date: string | null; score: string; max_score: string }[]
    | null;
  fieldcraft: { level: string; reference: string; title: string; date: string | null; delivered_by: string }[] | null;
  classification: ClassificationStage[] | null;
  exams: {
    enrolments: { course: string; classification: string; enrolled_on: string | null }[];
    results: { course: string; classification: string; status: string; date: string | null }[];
  } | null;
  flying:
    | { date: string; activity: string; aircraft: string; sortie: string; unit: string; minutes: number | null }[]
    | null;
  learning: { title: string; complete: boolean; date: string | null; platform: string }[] | null;
  unit_history: { unit: string; start: string | null; end: string | null; primary: boolean }[] | null;
};

export const FIELDCRAFT_LEVELS = ["Blue", "Bronze", "Silver", "Gold"] as const;

/** "3h 20m" from minutes; flying records give durations in minutes. */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

/** Whole years and months between an ISO date and today, e.g. "2y 4m". */
export function timeSince(iso: string | null, now: Date = new Date()): string | null {
  if (!iso) return null;
  const from = new Date(iso);
  let months = (now.getFullYear() - from.getFullYear()) * 12 + now.getMonth() - from.getMonth();
  if (now.getDate() < from.getDate()) months -= 1;
  if (months < 0) return null;
  return months >= 12 ? `${Math.floor(months / 12)}y ${months % 12}m` : `${months}m`;
}
