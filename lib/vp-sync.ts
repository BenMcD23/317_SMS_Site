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

/** The relay protocol public/vp-sync-bookmarklet.js speaks. Bump with its
 *  VERSION only when the relay itself changes — older bookmarks are then told
 *  to re-drag. What gets read lives below and changes without a re-drag. */
export const BOOKMARKLET_VERSION = 2;

// ── What the sync reads from the portal ──────────────────────────────────────
// The bookmarklet only relays GETs; this decides what to ask for. Adding a data
// set here (and to the API's DATASETS) needs no re-drag.

/** One failed portal call, shown on the sync page for testers to report. */
export type PortalError = { what: string; path: string; status: number; detail: string };
/** A relayed portal GET: HTTP status (0 = never reached the portal) and raw body. */
export type PortalFetch = (path: string) => Promise<{ status: number; body: string }>;
export type PortalCadet = { cin: number; data: Record<string, unknown> };

const PER_CADET: Record<string, (webId: string) => string> = {
  whts: (w) => `shootingmanagement/${w}/whts`,
  shooting_log: (w) => `shootingmanagement/${w}/shootinglog`,
  fieldcraft: (w) => `fieldcraftmanagement/${w}/completions`,
  classification: (w) => `person/${w}/classification`,
  flying: (w) => `person/${w}/aviation/history`,
  learning: (w) => `person/${w}/learning/history`,
  unit_history: (w) => `person/${w}/service/unithistory`,
};

const PAGE_SIZE = 100;
const MAX_ERRORS = 300;

/** "/api/…" from any of the forms the portal uses: bare, "api/…", or a full URL. */
function apiPath(path: string): string {
  return "/api/" + path.replace(/^https?:\/\/[^/]+/, "").replace(/^\/?(api\/)?/, "");
}

/** The portal wraps lists in different envelopes; the RAFAC Dashy extension checks these. */
function rows(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) return body;
  for (const k of ["data", "items", "results", "rows", "registers"]) {
    const v = (body as Record<string, unknown> | null)?.[k];
    if (Array.isArray(v)) return v;
  }
  return [];
}

/**
 * Reads every cadet in `cins` from the portal through `fetchPortal`. A failed
 * read becomes null (so the import keeps the stored copy) and an entry in
 * `errors`. Throws only if the cadet list itself can't be read.
 */
export async function collectPortalData(
  fetchPortal: PortalFetch,
  cins: Set<string>,
  errors: PortalError[],
  onProgress: (done: number, total: number) => void = () => {}
): Promise<PortalCadet[]> {
  const logError = (what: string, path: string, status: number, detail: string) => {
    if (errors.length < MAX_ERRORS) errors.push({ what, path, status, detail: detail.slice(0, 300) });
  };
  const get = async (raw: string, what: string): Promise<unknown> => {
    const path = apiPath(raw);
    const { status, body } = await fetchPortal(path);
    if (status < 200 || status >= 300) {
      logError(what, path, status, body);
      throw new Error(`${what} → ${status || body}`);
    }
    try {
      return JSON.parse(body);
    } catch {
      // A sign-in page instead of JSON means the portal session expired.
      logError(what, path, status, "not JSON (signed out of the portal?)");
      throw new Error(`${what} → not JSON`);
    }
  };

  // Both unit-wide reads at once; neither depends on the other.
  const peopleP = (async () => {
    const people: Record<string, unknown>[] = [];
    for (let page = 1; page <= 50; page++) {
      const batch = rows(
        await get(
          `persons/cadets?pageNumber=${page}&pageSize=${PAGE_SIZE}&sortBy=familyName&sortDesc=false`,
          "cadet list"
        )
      );
      people.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }
    return people;
  })();
  // Exams are listed per subject for the whole unit; split them per cadet.
  // null = "couldn't read", so the import keeps what it had.
  const examsP = get("exams/management/subjects", "exams").then(
    async (subjects) => {
      const exams = { enrolments: {} as Record<string, unknown[]>, results: {} as Record<string, unknown[]> };
      await Promise.all(
        rows(subjects).map(async (s) => {
          const id = String(s.classificationExamId);
          const tag = { courseName: s.courseName, cadetClassification: s.cadetClassification };
          const [enr, res] = await Promise.all([
            get(String(s.enrolmentsUri || `exams/management/subjects/${id}/enrolments`), "exams").then(
              rows,
              () => []
            ),
            get(String(s.resultsUri || `exams/management/subjects/${id}/results`), "exams").then(
              rows,
              () => []
            ),
          ]);
          for (const e of enr)
            (exams.enrolments[String(e.computerNumber).trim()] ??= []).push({ ...tag, ...e });
          for (const r of res) (exams.results[String(r.personnelWebId).trim()] ??= []).push({ ...tag, ...r });
        })
      );
      return exams;
    },
    () => null
  );
  examsP.catch(() => {}); // awaited below; don't let it go unhandled meanwhile

  const people = await peopleP;
  const exams = await examsP;
  const cadets = people
    .map((p) => ({
      cin: String(p.computerNumber ?? "").trim(),
      webId: String(p.personnelWebId ?? "").trim(),
    }))
    .filter((p) => p.webId && cins.has(p.cin));
  if (!cadets.length) {
    logError(
      "cadet list",
      "/api/persons/cadets",
      0,
      `the portal listed ${people.length} people but none match the ${cins.size} CINs in 317 SMS`
    );
  }

  let done = 0;
  return Promise.all(
    cadets.map(async (c) => {
      const data: Record<string, unknown> = {};
      await Promise.all(
        Object.entries(PER_CADET).map(async ([name, path]) => {
          data[name] = await get(path(c.webId), name).catch(() => null);
        })
      );
      data.exams = exams && {
        enrolments: exams.enrolments[c.cin] ?? [],
        results: exams.results[c.webId] ?? [],
      };
      onProgress(++done, cadets.length);
      return { cin: Number(c.cin), data };
    })
  );
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
    | {
        weapon: string;
        practice: string;
        outcome: string;
        date: string | null;
        score: string;
        max_score: string;
      }[]
    | null;
  fieldcraft:
    { level: string; reference: string; title: string; date: string | null; delivered_by: string }[] | null;
  classification: ClassificationStage[] | null;
  exams: {
    enrolments: { course: string; classification: string; enrolled_on: string | null }[];
    results: { course: string; classification: string; status: string; date: string | null }[];
  } | null;
  flying:
    | {
        date: string;
        activity: string;
        aircraft: string;
        sortie: string;
        unit: string;
        minutes: number | null;
      }[]
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
