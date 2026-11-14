// The 317 Sync relay (public/vp-sync-bookmarklet.js) run against a faked
// Volunteer Portal, and the read plan (collectPortalData) the sync page drives
// through it.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  BOOKMARKLET_VERSION,
  bookmarkletHref,
  collectPortalData,
  collectStaffData,
  enrolledIds,
  enrolmentPlan,
  enrolmentRequest,
  VP_ORIGIN,
  type ExamReady,
  type ExamSubject,
  type PortalError,
} from "@/lib/vp-sync";

const SMS = "https://sms.317atc.co.uk";
const SOURCE = readFileSync(path.join(__dirname, "../public/vp-sync-bookmarklet.js"), "utf8");
const tick = () => new Promise((r) => setTimeout(r, 5));

/** Runs the bookmarklet as the browser would, with the page globals faked. */
function runBookmark({
  origin = VP_ORIGIN,
  popup = true,
  csrf = "csrf-1",
  confirmed = true,
  pageToken = "rvt-page" as string | null,
  examsPageToken = "rvt-exams" as string | null,
} = {}) {
  const win = { postMessage: vi.fn() };
  let listener: ((e: unknown) => Promise<void>) | null = null;
  let inFlight = 0;
  const peak = { inFlight: 0 };
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
    if (url.endsWith("/api/antiforgery/token")) return Response.json({ token: csrf });
    if (url === "/exams") return new Response(examsPageToken ? `token:${examsPageToken}` : "<html></html>");
    peak.inFlight = Math.max(peak.inFlight, ++inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight--;
    return new Response(`body of ${new URL(url).pathname}`, { status: 200 });
  });
  const g = {
    location: { origin },
    window: { open: vi.fn(() => (popup ? win : null)) },
    fetch,
    alert: vi.fn(),
    confirm: vi.fn(() => confirmed),
    // Stands in for the browser's parser: the fake /exams page carries "token:<value>".
    DOMParser: class {
      parseFromString(html: string) {
        const value = html.startsWith("token:") ? html.slice(6) : null;
        return { querySelector: () => (value ? { value, getAttribute: () => value } : null) };
      }
    },
    addEventListener: (_: string, h: (e: unknown) => Promise<void>) => (listener = h),
    removeEventListener: () => (listener = null),
    document: {
      createElement: () => ({ style: {}, remove() {} }),
      body: { appendChild() {} },
      querySelector: (sel: string) =>
        sel.includes("RequestVerificationToken") && pageToken ? { getAttribute: () => pageToken } : null,
    },
    setTimeout: vi.fn(),
  };
  const href = bookmarkletHref(SOURCE, SMS);
  const code = decodeURIComponent(href.slice("javascript:".length));
  new Function(...Object.keys(g), code)(...Object.values(g));
  /** Delivers a message to the bookmarklet and waits for it to answer. */
  const send = async (data: unknown, from: { origin?: string; source?: unknown } = {}) => {
    await listener?.({ origin: from.origin ?? SMS, source: from.source ?? win, data });
    await tick();
  };
  const apiFetches = () => fetch.mock.calls.filter(([u]) => !u.endsWith("/antiforgery/token"));
  return { g, win, fetch, send, peak, apiFetches, listening: () => listener !== null };
}

const lastReply = (win: { postMessage: ReturnType<typeof vi.fn> }) => win.postMessage.mock.calls.at(-1);

describe("317 Sync relay bookmarklet", () => {
  it("bakes this site's origin into the bookmark", () => {
    expect(decodeURIComponent(bookmarkletHref(SOURCE, SMS))).toContain(`"${SMS}"`);
    expect(bookmarkletHref(SOURCE, SMS)).not.toContain("__SMS_ORIGIN__");
  });

  it("declares the same relay version the sync page expects", () => {
    // Bump both together, or every fresh bookmark is told it's out of date.
    expect(SOURCE).toContain(`const VERSION = ${BOOKMARKLET_VERSION};`);
  });

  it("says hello with its version when its 317 SMS tab is ready", async () => {
    const b = runBookmark();
    await b.send({ type: "sms-vp-ready", cins: [] });
    expect(lastReply(b.win)).toEqual([{ type: "sms-vp-hello", version: BOOKMARKLET_VERSION }, SMS]);
  });

  it("relays a portal API GET with the CSRF token and returns status and body", async () => {
    const b = runBookmark();
    await b.send({ type: "sms-vp-get", id: 7, path: "/api/person/w1/aviation/history" });
    const [url, init] = b.apiFetches()[0];
    expect(url).toBe(`${VP_ORIGIN}/api/person/w1/aviation/history`);
    expect(init?.headers).toMatchObject({ "X-CSRF-TOKEN": "csrf-1" });
    expect(init?.method ?? "GET").toBe("GET");
    expect(lastReply(b.win)).toEqual([
      { type: "sms-vp-result", id: 7, status: 200, body: "body of /api/person/w1/aviation/history" },
      SMS,
    ]);
  });

  it.each([
    ["another host", "https://evil.example/api/x"],
    ["a protocol-relative host", "//evil.example/api/x"],
    ["a non-API path", "/Account/Logout"],
    ["dot segments", "/api/../Account/Logout"],
    ["encoded dot segments", "/api/%2e%2e/Account/Logout"],
    ["a non-string", 42],
  ])("refuses %s without fetching", async (_, badPath) => {
    const b = runBookmark();
    await b.send({ type: "sms-vp-get", id: 1, path: badPath });
    expect(b.apiFetches()).toHaveLength(0);
    expect(lastReply(b.win)?.[0]).toMatchObject({ type: "sms-vp-result", id: 1, status: 0 });
  });

  it.each([
    ["another site", { origin: "https://evil.example" }],
    ["another window on our site", { source: {} }],
  ])("ignores requests from %s", async (_, from) => {
    const b = runBookmark();
    await b.send({ type: "sms-vp-get", id: 1, path: "/api/persons/cadets" }, from);
    await b.send({ type: "sms-vp-ready" }, from);
    expect(b.apiFetches()).toHaveLength(0);
    expect(b.win.postMessage).not.toHaveBeenCalled();
  });

  it("keeps at most 8 portal requests in flight", async () => {
    const b = runBookmark();
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        b.send({ type: "sms-vp-get", id: i, path: `/api/person/w${i}/summary` })
      )
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(b.apiFetches()).toHaveLength(20);
    expect(b.peak.inFlight).toBeGreaterThan(1);
    expect(b.peak.inFlight).toBeLessThanOrEqual(8);
  });

  it("stops relaying once the page says it's done", async () => {
    const b = runBookmark();
    await b.send({ type: "sms-vp-done", text: "done" });
    expect(b.listening()).toBe(false);
  });

  it("answers 'not signed in' instead of calling the portal without a token", async () => {
    const b = runBookmark({ csrf: "" });
    await b.send({ type: "sms-vp-get", id: 3, path: "/api/persons/cadets" });
    expect(b.apiFetches()).toHaveLength(0);
    expect(lastReply(b.win)?.[0]).toMatchObject({
      id: 3,
      status: 0,
      body: expect.stringMatching(/not signed in/),
    });
  });

  it("does nothing off the Volunteer Portal", () => {
    const b = runBookmark({ origin: "https://example.com" });
    expect(b.g.alert).toHaveBeenCalled();
    expect(b.g.window.open).not.toHaveBeenCalled();
    expect(b.fetch).not.toHaveBeenCalled();
  });

  it("stops and says so when the pop-up is blocked", () => {
    const b = runBookmark({ popup: false });
    expect(b.g.alert).toHaveBeenCalledWith(expect.stringMatching(/pop-ups/));
    expect(b.fetch).not.toHaveBeenCalled();
  });
});

describe("317 Sync bookmarklet: enrolling on an exam", () => {
  const PATH = "/api/exams/management/subjects/e-1/enrolments";
  const BODY = { examId: "e-1", actions: { "501": true, "502": true } };
  const posts = (b: ReturnType<typeof runBookmark>) =>
    b.fetch.mock.calls.filter(([, init]) => init?.method === "POST");

  it("asks on the portal first, then posts with the portal's write headers", async () => {
    const b = runBookmark();
    await b.send({
      type: "sms-vp-enrol",
      id: 9,
      path: PATH,
      body: BODY,
      label: "Navigation (Leading Cadet)",
    });
    expect(b.g.confirm).toHaveBeenCalledWith(
      expect.stringContaining("enrol 2 cadets on Navigation (Leading Cadet)")
    );
    const [[url, init]] = posts(b);
    expect(url).toBe(`${VP_ORIGIN}${PATH}`);
    expect(init?.headers).toMatchObject({
      "X-CSRF-TOKEN": "csrf-1",
      RequestVerificationToken: "rvt-page",
      "X-Requested-With": "XMLHttpRequest",
      "Content-Type": "application/json",
    });
    expect(JSON.parse(String(init?.body))).toEqual(BODY);
    expect(lastReply(b.win)).toEqual([
      { type: "sms-vp-result", id: 9, status: 200, body: `body of ${PATH}` },
      SMS,
    ]);
  });

  it("finds the write token on the Exams page when this page doesn't carry one", async () => {
    const b = runBookmark({ pageToken: null });
    await b.send({ type: "sms-vp-enrol", id: 1, path: PATH, body: BODY, label: "x" });
    expect(posts(b)[0][1]?.headers).toMatchObject({ RequestVerificationToken: "rvt-exams" });
  });

  it("doesn't post without the write token", async () => {
    const b = runBookmark({ pageToken: null, examsPageToken: null });
    await b.send({ type: "sms-vp-enrol", id: 1, path: PATH, body: BODY, label: "x" });
    expect(posts(b)).toHaveLength(0);
    expect(lastReply(b.win)?.[0]).toMatchObject({ status: 0, body: expect.stringMatching(/tokens/) });
  });

  it("sends nothing when the person on the portal says no", async () => {
    const b = runBookmark({ confirmed: false });
    await b.send({ type: "sms-vp-enrol", id: 2, path: PATH, body: BODY, label: "x" });
    expect(posts(b)).toHaveLength(0);
    expect(lastReply(b.win)?.[0]).toMatchObject({ id: 2, status: 0, body: "cancelled on the portal" });
  });

  it.each([
    ["another portal path", "/api/person/w1/summary", BODY],
    ["another host", "https://evil.example/api/exams/management/subjects/e-1/enrolments", BODY],
    ["a path with extra on the end", `${PATH}/../../Account/Logout`, BODY],
    ["an exam id that doesn't match the path", PATH, { examId: "e-2", actions: { "501": true } }],
    ["an un-enrolment", PATH, { examId: "e-1", actions: { "501": false } }],
    ["a mix of enrol and un-enrol", PATH, { examId: "e-1", actions: { "501": true, "502": false } }],
    ["nobody", PATH, { examId: "e-1", actions: {} }],
    ["an id that isn't a number", PATH, { examId: "e-1", actions: { abc: true } }],
    [
      "more than 100 people",
      PATH,
      {
        examId: "e-1",
        actions: Object.fromEntries(Array.from({ length: 101 }, (_, i) => [String(i + 1), true])),
      },
    ],
    ["no body", PATH, null],
  ])("refuses %s without asking or posting", async (_, path, body) => {
    const b = runBookmark();
    await b.send({ type: "sms-vp-enrol", id: 4, path, body, label: "x" });
    expect(b.g.confirm).not.toHaveBeenCalled();
    expect(posts(b)).toHaveLength(0);
    expect(lastReply(b.win)?.[0]).toMatchObject({ id: 4, status: 0, body: expect.stringMatching(/refused/) });
  });

  it("ignores an enrolment request from anywhere but its own 317 SMS tab", async () => {
    const b = runBookmark();
    await b.send(
      { type: "sms-vp-enrol", id: 1, path: PATH, body: BODY, label: "x" },
      { origin: "https://evil.example" }
    );
    await b.send({ type: "sms-vp-enrol", id: 1, path: PATH, body: BODY, label: "x" }, { source: {} });
    expect(b.g.confirm).not.toHaveBeenCalled();
    expect(posts(b)).toHaveLength(0);
  });

  it("no longer enrols once the page has said it's done", async () => {
    const b = runBookmark();
    await b.send({ type: "sms-vp-done", text: "done" });
    await b.send({ type: "sms-vp-enrol", id: 1, path: PATH, body: BODY, label: "x" });
    expect(posts(b)).toHaveLength(0);
  });
});

// ── the read plan ────────────────────────────────────────────────────────────

const PORTAL: Record<string, unknown> = {
  "/api/persons/cadets": {
    data: [
      { computerNumber: 111, personnelWebId: "w1" },
      { computerNumber: 222, personnelWebId: "w2" }, // on the portal, not in 317 SMS
    ],
  },
  "/api/exams/management/subjects": [
    {
      classificationExamId: "e1",
      courseName: "Leading Cadet",
      cadetClassification: "Leading",
      resultsUri: "https://volunteers.bader.mod.uk/api/exams/management/subjects/e1/results",
    },
  ],
  "/api/exams/management/subjects/e1/enrolments": [{ computerNumber: "111", enrolled: true }],
  "/api/exams/management/subjects/e1/results": [{ personnelWebId: "w1", status: 2 }],
  "/api/person/w1/aviation/history": [{ aircraft: "Tutor" }],
};

function fakePortal(failing: string[] = ["/api/shootingmanagement/w1/whts"]) {
  return vi.fn(async (p: string) => {
    const bare = p.split("?")[0];
    if (failing.includes(bare)) return { status: 403, body: "Forbidden" };
    return { status: 200, body: JSON.stringify(bare in PORTAL ? PORTAL[bare] : []) };
  });
}

describe("collectPortalData", () => {
  it("reads only the cadets 317 SMS holds", async () => {
    const portal = fakePortal();
    const cadets = await collectPortalData(portal, new Set(["111"]), []);
    expect(cadets.map((c) => c.cin)).toEqual([111]);
    expect(portal.mock.calls.some(([p]) => p.includes("/w2/"))).toBe(false);
    expect(cadets[0].data.flying).toEqual([{ aircraft: "Tutor" }]);
  });

  it("splits unit-wide exam lists per cadet, following the portal's own URIs", async () => {
    const [cadet] = await collectPortalData(fakePortal(), new Set(["111"]), []);
    expect(cadet.data.exams).toEqual({
      enrolments: [
        {
          courseName: "Leading Cadet",
          cadetClassification: "Leading",
          computerNumber: "111",
          enrolled: true,
        },
      ],
      results: [
        { courseName: "Leading Cadet", cadetClassification: "Leading", personnelWebId: "w1", status: 2 },
      ],
    });
  });

  it("sends a failed read as null and records exactly what failed", async () => {
    const errors: PortalError[] = [];
    const [cadet] = await collectPortalData(fakePortal(), new Set(["111"]), errors);
    expect(cadet.data.whts).toBeNull();
    expect(errors).toEqual([
      { what: "whts", path: "/api/shootingmanagement/w1/whts", status: 403, detail: "Forbidden" },
    ]);
  });

  it("treats a sign-in page instead of JSON as a failed read", async () => {
    const errors: PortalError[] = [];
    const ok = fakePortal([]);
    const portal = vi.fn(async (p: string) =>
      p.includes("aviation") ? { status: 200, body: "<html>Sign in</html>" } : ok(p)
    );
    const [cadet] = await collectPortalData(portal, new Set(["111"]), errors);
    expect(cadet.data.flying).toBeNull();
    expect(errors[0]).toMatchObject({ what: "flying", detail: expect.stringMatching(/not JSON/) });
  });

  it("sends exams as null when the subject list can't be read", async () => {
    const [cadet] = await collectPortalData(
      fakePortal(["/api/exams/management/subjects"]),
      new Set(["111"]),
      []
    );
    expect(cadet.data.exams).toBeNull();
  });

  it("flags a cadet list that matches none of our CINs", async () => {
    const errors: PortalError[] = [];
    expect(await collectPortalData(fakePortal(), new Set(["999"]), errors)).toEqual([]);
    expect(errors[0].detail).toMatch(/listed 2 people but none match the 1 CINs/);
  });

  it("fails loudly, with the reason recorded, when the cadet list can't be read", async () => {
    const errors: PortalError[] = [];
    await expect(
      collectPortalData(fakePortal(["/api/persons/cadets"]), new Set(["111"]), errors)
    ).rejects.toThrow(/cadet list → 403/);
    expect(errors[0]).toMatchObject({ what: "cadet list", status: 403 });
  });

  it("reports progress per cadet", async () => {
    const onProgress = vi.fn();
    await collectPortalData(fakePortal(), new Set(["111"]), [], onProgress);
    expect(onProgress).toHaveBeenCalledWith(1, 1);
  });
});

describe("collectPortalData's exam subjects", () => {
  it("hands back each subject with its enrolment rows for enrolling later", async () => {
    const subjects: ExamSubject[] = [];
    await collectPortalData(fakePortal(), new Set(["111"]), [], () => {}, subjects);
    expect(subjects).toEqual([
      { examId: "e1", courseName: "Leading Cadet", enrolments: [{ computerNumber: "111", enrolled: true }] },
    ]);
  });
});

// ── staff ────────────────────────────────────────────────────────────────────

const STAFF_PORTAL: Record<string, unknown> = {
  "/api/persons/staff": {
    data: [
      { computerNumber: 3000, personnelWebId: "s1" },
      { computerNumber: 3000, personnelWebId: "s1" }, // a second unit's appointment
      { computerNumber: 3001, personnelWebId: "s2" },
      { computerNumber: 9999, personnelWebId: "s9" }, // not on our roster
    ],
  },
  "/api/trackers/mandatorytraining": {
    rows: [
      { personnelWebId: "s1", mandatoryTraining: [{ displayName: "Safeguarding" }] },
      { serviceNumber: "3001", mandatoryTraining: [{ displayName: "Prevent" }] },
    ],
  },
  "/api/person/s1/security/dbs": { dateValidFrom: "2025-01-01" },
  "/api/person/s1/security/bpss": [{ checkDate: "2019-01-01" }],
};

function staffPortal(failing: string[] = []) {
  return vi.fn(async (p: string) => {
    const bare = p.split("?")[0];
    if (failing.includes(bare)) return { status: 403, body: "Forbidden" };
    return { status: 200, body: JSON.stringify(bare in STAFF_PORTAL ? STAFF_PORTAL[bare] : []) };
  });
}

describe("collectStaffData", () => {
  it("reads each of our staff once, with their row of the training tracker", async () => {
    const staff = await collectStaffData(staffPortal(), new Set(["3000", "3001"]), []);
    expect(staff).toEqual([
      {
        cin: 3000,
        data: {
          dbs: { dateValidFrom: "2025-01-01" },
          bpss: [{ checkDate: "2019-01-01" }],
          training: { personnelWebId: "s1", mandatoryTraining: [{ displayName: "Safeguarding" }] },
        },
      },
      {
        cin: 3001,
        data: {
          dbs: [],
          bpss: [],
          training: { serviceNumber: "3001", mandatoryTraining: [{ displayName: "Prevent" }] },
        },
      },
    ]);
  });

  it("sends a failed read as null so the import keeps what it had, and records it", async () => {
    const errors: PortalError[] = [];
    const [me] = await collectStaffData(
      staffPortal(["/api/person/s1/security/dbs", "/api/trackers/mandatorytraining"]),
      new Set(["3000"]),
      errors
    );
    expect(me.data.dbs).toBeNull();
    expect(me.data.training).toBeNull();
    expect(errors.map((e) => e.what)).toEqual(expect.arrayContaining(["staff dbs", "staff training"]));
  });

  it("someone missing from the tracker gets an empty record, not a failure", async () => {
    const portal = vi.fn(async (p: string) => {
      const bare = p.split("?")[0];
      if (bare === "/api/trackers/mandatorytraining") return { status: 200, body: "[]" };
      return { status: 200, body: JSON.stringify(STAFF_PORTAL[bare] ?? []) };
    });
    const [me] = await collectStaffData(portal, new Set(["3000"]), []);
    expect(me.data.training).toEqual({});
  });

  it("an unreadable staff list costs only the staff, never throws", async () => {
    const errors: PortalError[] = [];
    const staff = await collectStaffData(staffPortal(["/api/persons/staff"]), new Set(["3000"]), errors);
    expect(staff).toEqual([]);
    expect(errors[0]).toMatchObject({ what: "staff list", status: 403 });
  });

  it("asks the portal nothing when 317 SMS has no staff", async () => {
    const portal = staffPortal();
    expect(await collectStaffData(portal, new Set(), [])).toEqual([]);
    expect(portal).not.toHaveBeenCalled();
  });
});

// ── enrolment plan ───────────────────────────────────────────────────────────

describe("enrolmentPlan", () => {
  const subjects: ExamSubject[] = [
    {
      examId: "e-nav",
      courseName: "Navigation on Land Exam",
      enrolments: [
        { computerNumber: "111", personnelId: 501, enrolled: false, dateEnrolled: "0001-01-01T00:00:00" },
        { computerNumber: "222", personnelId: 502, enrolled: true, dateEnrolled: "2026-10-01T00:00:00" },
        { computerNumber: "444", personnelId: null, enrolled: false },
      ],
    },
    { examId: "e-pof", courseName: "Principles of Flight Exam", enrolments: [] },
  ];
  const cadet = (cin: number, name: string) => ({ cin, name, rank: null, flight: "A" });
  const ready: ExamReady[] = [
    {
      exam_id: "e-nav",
      course_name: "Navigation on Land Exam",
      lesson_key: "acp_32_2",
      lesson_name: "Basic Navigation",
      cadets: [
        cadet(111, "Zoë Ó Briain"),
        cadet(222, "Tom Able"),
        cadet(333, "Ann Gone"),
        cadet(444, "No Id"),
      ],
    },
    {
      exam_id: "e-pof",
      course_name: "Principles of Flight Exam",
      lesson_key: "acp_33_2",
      lesson_name: "PoF",
      cadets: [],
    },
    { exam_id: "e-new", course_name: "Mystery", lesson_key: null, lesson_name: null, cadets: [] },
  ];

  it("offers the ready cadets the portal lists for the exam and hasn't enrolled", () => {
    expect(enrolmentPlan(subjects, ready)).toEqual([
      {
        examId: "e-nav",
        courseName: "Navigation on Land Exam",
        lessonName: "Basic Navigation",
        toEnrol: [{ cin: 111, name: "Zoë Ó Briain", personnelId: "501" }],
        alreadyEnrolled: ["Tom Able"],
        notOnPortal: ["Ann Gone", "No Id"],
      },
    ]);
  });

  it("is empty when nobody is ready", () => {
    expect(enrolmentPlan(subjects, [])).toEqual([]);
  });

  it("builds exactly the request the bookmark allows", () => {
    expect(enrolmentRequest("e-nav", [{ cin: 111, name: "Z", personnelId: "501" }])).toEqual({
      path: "/api/exams/management/subjects/e-nav/enrolments",
      body: { examId: "e-nav", actions: { "501": true } },
    });
  });

  it("reads who the portal shows enrolled, ignoring 'never' dates", () => {
    expect(
      enrolledIds({
        data: [
          { personnelId: 501, enrolled: true, dateEnrolled: "2026-11-13T00:00:00" },
          { personnelId: 502, enrolled: true, dateEnrolled: "0001-01-01T00:00:00" },
          { personnelId: 503, enrolled: false },
        ],
      })
    ).toEqual(new Set(["501"]));
    expect(enrolledIds({ detail: "error" })).toEqual(new Set());
  });
});
