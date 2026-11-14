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
 *  to re-drag. What gets read lives below and changes without a re-drag.
 *  3 added exam enrolment (`sms-vp-enrol`). */
export const BOOKMARKLET_VERSION = 3;
/** The first relay version that can enrol cadets on an exam. */
export const ENROL_VERSION = 3;

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
  onProgress: (done: number, total: number) => void = () => {},
  /** Filled with each exam subject and its enrolment rows, for enrolling ready cadets after the sync. */
  subjectsOut?: ExamSubject[]
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
          subjectsOut?.push({ examId: id, courseName: String(s.courseName ?? ""), enrolments: enr });
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

// ── Staff: DBS, BPSS and mandatory training ──────────────────────────────────

export type PortalStaff = { cin: number; data: { dbs: unknown; bpss: unknown; training: unknown } };

/**
 * Reads DBS, BPSS and mandatory training for each member of staff in `cins`.
 * Never throws: a failed staff list is one entry in `errors` and no staff, so
 * the cadets' sync still goes through. A failed read is null (keep what we
 * have); someone missing from the training tracker gets `{}`.
 */
export async function collectStaffData(
  fetchPortal: PortalFetch,
  cins: Set<string>,
  errors: PortalError[]
): Promise<PortalStaff[]> {
  const logError = (what: string, p: string, status: number, detail: string) => {
    if (errors.length < MAX_ERRORS) errors.push({ what, path: p, status, detail: detail.slice(0, 300) });
  };
  const get = async (raw: string, what: string): Promise<unknown> => {
    const p = apiPath(raw);
    const { status, body } = await fetchPortal(p);
    if (status < 200 || status >= 300) {
      logError(what, p, status, body);
      throw new Error(`${what} → ${status || body}`);
    }
    try {
      return JSON.parse(body);
    } catch {
      logError(what, p, status, "not JSON (signed out of the portal?)");
      throw new Error(`${what} → not JSON`);
    }
  };
  if (!cins.size) return [];

  const trackerP = get("trackers/mandatorytraining", "staff training").then(rows, () => null);
  let people: Record<string, unknown>[] = [];
  try {
    for (let page = 1; page <= 20; page++) {
      const batch = rows(
        await get(
          `persons/staff?pageNumber=${page}&pageSize=${PAGE_SIZE}&sortBy=familyName&sortDesc=false`,
          "staff list"
        )
      );
      people.push(...batch);
      if (batch.length < PAGE_SIZE) break;
    }
  } catch {
    people = [];
  }
  const tracker = await trackerP;
  // Someone with appointments in two units is listed once per unit.
  const seen = new Set<string>();
  const staff = people
    .map((p) => ({
      cin: String(p.computerNumber ?? "").trim(),
      webId: String(p.personnelWebId ?? "").trim(),
    }))
    .filter((p) => p.webId && cins.has(p.cin) && !seen.has(p.cin) && seen.add(p.cin));

  return Promise.all(
    staff.map(async (p) => {
      const [dbs, bpss] = await Promise.all([
        get(`person/${p.webId}/security/dbs`, "staff dbs").catch(() => null),
        get(`person/${p.webId}/security/bpss`, "staff bpss").catch(() => null),
      ]);
      const row =
        tracker?.find(
          (t) =>
            String(t.personnelWebId ?? "").trim() === p.webId ||
            String(t.serviceNumber ?? "").trim() === p.cin
        ) ?? {};
      return { cin: Number(p.cin), data: { dbs, bpss, training: tracker === null ? null : row } };
    })
  );
}

// ── Exam enrolment ───────────────────────────────────────────────────────────

/** One portal exam subject and its enrolment rows, as the sync read them. */
export type ExamSubject = { examId: string; courseName: string; enrolments: Record<string, unknown>[] };
/** POST /vp-sync/exam-ready's answer for one subject. */
export type ExamReady = {
  exam_id: string;
  course_name: string;
  lesson_key: string | null;
  lesson_name: string | null;
  cadets: { cin: number; name: string; rank: string | null; flight: string | null }[];
};
export type EnrolCandidate = { cin: number; name: string; personnelId: string };
export type EnrolGroup = {
  examId: string;
  courseName: string;
  lessonName: string;
  toEnrol: EnrolCandidate[];
  alreadyEnrolled: string[];
  /** Ready in 317 SMS, but not on the portal's list for this exam (wrong classification there, or not visible). */
  notOnPortal: string[];
};

const isEnrolled = (row: Record<string, unknown>) =>
  row.enrolled === true && !String(row.dateEnrolled ?? "").startsWith("0001-01-01");

/**
 * Who to offer for each exam: ready in 317 SMS (taught here, not passed on the
 * portal) and listed by the portal for that exam, but not yet enrolled. The
 * portal's list gives the personnelId the enrolment call needs. Subjects
 * nobody is ready for are left out.
 */
export function enrolmentPlan(subjects: ExamSubject[], ready: ExamReady[]): EnrolGroup[] {
  const byId = new Map(subjects.map((s) => [s.examId, s]));
  const groups: EnrolGroup[] = [];
  for (const r of ready) {
    const subject = byId.get(r.exam_id);
    if (!subject || !r.lesson_name || !r.cadets.length) continue;
    const rowsByCin = new Map(subject.enrolments.map((e) => [String(e.computerNumber ?? "").trim(), e]));
    const group: EnrolGroup = {
      examId: r.exam_id,
      courseName: r.course_name,
      lessonName: r.lesson_name,
      toEnrol: [],
      alreadyEnrolled: [],
      notOnPortal: [],
    };
    for (const c of r.cadets) {
      const row = rowsByCin.get(String(c.cin));
      const personnelId = row ? String(row.personnelId ?? "").trim() : "";
      if (!row || !/^\d+$/.test(personnelId)) group.notOnPortal.push(c.name);
      else if (isEnrolled(row)) group.alreadyEnrolled.push(c.name);
      else group.toEnrol.push({ cin: c.cin, name: c.name, personnelId });
    }
    groups.push(group);
  }
  return groups;
}

/** The personnelIds an enrolment list shows as enrolled, to check a POST landed. */
export function enrolledIds(enrolments: unknown): Set<string> {
  return new Set(
    rows(enrolments)
      .filter(isEnrolled)
      .map((e) => String(e.personnelId ?? "").trim())
  );
}

/** The portal path and body for enrolling `candidates` on `examId`; what the bookmarklet allows. */
export function enrolmentRequest(examId: string, candidates: EnrolCandidate[]) {
  return {
    path: `/api/exams/management/subjects/${examId}/enrolments`,
    body: { examId, actions: Object.fromEntries(candidates.map((c) => [c.personnelId, true])) },
  };
}
