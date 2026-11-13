// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VpSyncPage from "@/app/tools/scraper/vp-sync/page";
import { API_BASE } from "@/lib/config";
import { BOOKMARKLET_VERSION, VP_ORIGIN } from "@/lib/vp-sync";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam Staff" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));

const COUNTS = { matched: 1, unmatched: 0, saved: 7, failed: 1, kept: 0, theory: 3 };

// What the fake Volunteer Portal answers, by path. Anything else is [].
const PORTAL: Record<string, { status: number; body: unknown }> = {
  "/api/persons/cadets": { status: 200, body: { data: [{ computerNumber: 111, personnelWebId: "w1" }] } },
  "/api/shootingmanagement/w1/whts": { status: 403, body: "Forbidden" },
  "/api/person/w1/aviation/history": { status: 200, body: [{ aircraft: "Tutor" }] },
};

type Msg = { type: string; id?: number; path?: string; cins?: number[] };
let portal: { postMessage: ReturnType<typeof vi.fn> };
let fetchMock: ReturnType<typeof vi.fn>;

function send(data: unknown, origin = VP_ORIGIN, source: unknown = portal) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, origin, source: source as Window }));
  });
}

/** A fake bookmarklet: says hello to "ready" and answers relayed GETs from PORTAL. */
function relayBookmark(version = BOOKMARKLET_VERSION, portalData = PORTAL) {
  portal = {
    postMessage: vi.fn((m: Msg) => {
      queueMicrotask(() => {
        if (m.type === "sms-vp-ready") send({ type: "sms-vp-hello", version });
        if (m.type === "sms-vp-get") {
          const hit = portalData[m.path!.split("?")[0]] ?? { status: 200, body: [] };
          send({ type: "sms-vp-result", id: m.id, status: hit.status, body: JSON.stringify(hit.body) });
        }
      });
    }),
  };
  Object.defineProperty(window, "opener", { value: portal, configurable: true });
}

/** A bookmark from before the relay: it reads the portal itself and does nothing until "ready". */
function oldBookmark() {
  portal = { postMessage: vi.fn() };
  Object.defineProperty(window, "opener", { value: portal, configurable: true });
}

function stubApi(sync: () => Response = () => Response.json(COUNTS)) {
  fetchMock = vi.fn(async (url: string) =>
    url.endsWith("/cadets") ? Response.json([{ cin: 111 }]) : sync()
  );
  vi.stubGlobal("fetch", fetchMock);
}

const syncCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/vp-sync"));
const sentToPortal = (type: string) => portal.postMessage.mock.calls.filter(([m]) => m.type === type);
const stat = (label: string) => screen.getByText(label).nextElementSibling?.textContent;

beforeEach(() => {
  relayBookmark();
  stubApi();
});
afterEach(() => {
  Object.defineProperty(window, "opener", { value: null, configurable: true });
});

describe("Volunteer Portal sync page", () => {
  it("drives the bookmark's relay, imports what it read and tells the bookmark it's done", async () => {
    render(<VpSyncPage />);
    expect(await screen.findByText(/Sync complete|finished with problems/)).toBeTruthy();

    // Every relayed request goes to the portal origin only.
    for (const [, target] of portal.postMessage.mock.calls) expect(target).toBe(VP_ORIGIN);
    expect(sentToPortal("sms-vp-get").map(([m]) => m.path)).toContain("/api/person/w1/aviation/history");

    const [url, init] = syncCalls()[0];
    expect(url).toBe(`${API_BASE}/vp-sync`);
    expect(init.headers.Authorization).toBe("Bearer tok");
    const [cadet] = JSON.parse(init.body).cadets;
    expect(cadet.cin).toBe(111);
    expect(cadet.data.flying).toEqual([{ aircraft: "Tutor" }]);
    expect(cadet.data.whts).toBeNull();

    expect([stat("Cadets updated"), stat("Records saved"), stat("Theory lessons ticked")]).toEqual([
      "1",
      "7",
      "3",
    ]);
    await waitFor(() => expect(sentToPortal("sms-vp-done")).toHaveLength(1));
  });

  it("lists every failed portal read, grouped, so a tester can report them", async () => {
    render(<VpSyncPage />);
    expect(await screen.findByText(/finished with problems/)).toBeTruthy();
    const whts = screen.getByRole("region", { name: "whts" });
    expect(whts.textContent).toContain("403 · your portal login lacks this permission · ×1");
    expect(whts.textContent).toContain("/api/shootingmanagement/w1/whts");
  });

  it("copies every problem for sending on", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<VpSyncPage />);
    await screen.findByText(/finished with problems/);
    act(() => screen.getByRole("button", { name: /Copy all/ }).click());
    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith('whts\t403\t/api/shootingmanagement/w1/whts\t"Forbidden"')
    );
  });

  it("stops with the reason when the portal's cadet list can't be read", async () => {
    relayBookmark(BOOKMARKLET_VERSION, { "/api/persons/cadets": { status: 401, body: "" } });
    render(<VpSyncPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("cadet list → 401");
    expect(screen.getByText(/signed out of the portal/)).toBeTruthy();
    expect(syncCalls()).toHaveLength(0);
    await waitFor(() => expect(sentToPortal("sms-vp-done")).toHaveLength(1));
  });

  it.each([
    ["another site", "https://evil.example", undefined],
    ["a portal window that didn't open us", VP_ORIGIN, {}],
  ])("ignores a hello from %s", async (_, origin, source) => {
    oldBookmark();
    render(<VpSyncPage />);
    await waitFor(() => expect(sentToPortal("sms-vp-ready")).toHaveLength(1));
    send({ type: "sms-vp-hello", version: BOOKMARKLET_VERSION }, origin, source ?? portal);
    await new Promise((r) => setTimeout(r, 20));
    expect(sentToPortal("sms-vp-get")).toHaveLength(0);
  });

  it("starts one sync even if the bookmark says hello twice", async () => {
    render(<VpSyncPage />);
    await screen.findByText(/finished with problems/);
    send({ type: "sms-vp-hello", version: BOOKMARKLET_VERSION });
    await new Promise((r) => setTimeout(r, 20));
    expect(syncCalls()).toHaveLength(1);
  });

  it("doesn't nag a current bookmark to re-drag", async () => {
    render(<VpSyncPage />);
    await screen.findByText(/finished with problems/);
    expect(screen.queryByText(/bookmark is out of date/)).toBeNull();
  });

  it("asks for a re-drag when the relay is older than the site expects", async () => {
    relayBookmark(BOOKMARKLET_VERSION - 1);
    render(<VpSyncPage />);
    expect(await screen.findByText(/bookmark is out of date/)).toBeTruthy();
  });

  it("still imports from a bookmark dragged before the relay, and asks for a re-drag", async () => {
    oldBookmark();
    render(<VpSyncPage />);
    await waitFor(() => expect(sentToPortal("sms-vp-ready")).toHaveLength(1));
    // The old bookmark reads the CINs from "ready" and filters itself.
    expect(sentToPortal("sms-vp-ready")[0][0].cins).toEqual([111]);
    send({ type: "sms-vp-data", cadets: [{ cin: 111, data: { whts: [] } }], errors: [] });

    expect(await screen.findByText(/Sync complete/)).toBeTruthy();
    expect(screen.getByText(/bookmark is out of date/)).toBeTruthy();
    expect(JSON.parse(syncCalls()[0][1].body)).toEqual({ cadets: [{ cin: 111, data: { whts: [] } }] });
  });

  it("shows an old bookmark's failure with its problems", async () => {
    oldBookmark();
    render(<VpSyncPage />);
    await waitFor(() => expect(sentToPortal("sms-vp-ready")).toHaveLength(1));
    send({
      type: "sms-vp-error",
      message: "cadet list → 401",
      errors: [{ what: "cadet list", path: "/api/persons/cadets", status: 401, detail: "" }],
    });
    expect(await screen.findByText("Reading the Volunteer Portal failed: cadet list → 401")).toBeTruthy();
    expect(screen.getByText(/bookmark is out of date/)).toBeTruthy();
    expect(screen.getByText(/signed out of the portal/)).toBeTruthy();
  });

  it("shows the API's reason when the import is refused", async () => {
    stubApi(() => Response.json({ detail: "Staff access required" }, { status: 403 }));
    render(<VpSyncPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("Staff access required");
  });

  it("explains how to start a sync when opened directly", async () => {
    Object.defineProperty(window, "opener", { value: null, configurable: true });
    render(<VpSyncPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("317 Sync bookmark");
  });

  it("says so when our cadet list can't be loaded, rather than waiting forever", async () => {
    fetchMock = vi.fn(async () => Response.json({ detail: "boom" }, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<VpSyncPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("boom");
    expect(portal.postMessage).not.toHaveBeenCalled();
  });
});

// ── staff and exam enrolment ─────────────────────────────────────────────────

const EXAM_PATH = "/api/exams/management/subjects/e-nav/enrolments";
const ENROL_PORTAL: Record<string, { status: number; body: unknown }> = {
  ...PORTAL,
  "/api/persons/staff": { status: 200, body: { data: [{ computerNumber: 3000, personnelWebId: "s1" }] } },
  "/api/person/s1/security/dbs": { status: 200, body: { dateValidFrom: "2025-01-01" } },
  "/api/exams/management/subjects": {
    status: 200,
    body: [{ classificationExamId: "e-nav", courseName: "Navigation on Land Exam" }],
  },
  [EXAM_PATH]: {
    status: 200,
    body: [{ computerNumber: "111", personnelId: 501, enrolled: false, dateEnrolled: "0001-01-01T00:00:00" }],
  },
};
const READY = [
  {
    exam_id: "e-nav",
    course_name: "Navigation on Land Exam",
    lesson_key: "acp_32_2",
    lesson_name: "Basic Navigation",
    cadets: [{ cin: 111, name: "Zoë Ó Briain", rank: null, flight: "A" }],
  },
];

type EnrolMsg = Msg & { body?: unknown; label?: string };

/** The relay plus enrolling: answers `sms-vp-enrol` with `reply`, and afterwards shows them enrolled if it worked. */
function enrollingBookmark(reply = { status: 200, body: "{}" }, version = BOOKMARKLET_VERSION) {
  let enrolledNow = false;
  portal = {
    postMessage: vi.fn((m: EnrolMsg) => {
      queueMicrotask(() => {
        if (m.type === "sms-vp-ready") send({ type: "sms-vp-hello", version });
        if (m.type === "sms-vp-get") {
          const bare = m.path!.split("?")[0];
          let hit = ENROL_PORTAL[bare] ?? { status: 200, body: [] };
          if (bare === EXAM_PATH && enrolledNow) {
            hit = {
              status: 200,
              body: [{ computerNumber: "111", personnelId: 501, enrolled: true, dateEnrolled: "2026-11-13" }],
            };
          }
          send({ type: "sms-vp-result", id: m.id, status: hit.status, body: JSON.stringify(hit.body) });
        }
        if (m.type === "sms-vp-enrol") {
          enrolledNow = reply.status === 200;
          send({ type: "sms-vp-result", id: m.id, ...reply });
        }
      });
    }),
  };
  Object.defineProperty(window, "opener", { value: portal, configurable: true });
}

function stubEnrolApi(ready: unknown = READY) {
  fetchMock = vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    if (path.endsWith("/cadets")) return Response.json([{ cin: 111 }]);
    if (path.endsWith("/staff")) return Response.json([{ cin: 3000 }]);
    if (path.endsWith("/vp-sync/exam-ready")) return Response.json(ready);
    if (path.endsWith("/vp-sync/enrolments")) return Response.json({ logged: true }, { status: 201 });
    return Response.json({ ...COUNTS, staff: 1 });
  });
  vi.stubGlobal("fetch", fetchMock);
}

const callsTo = (suffix: string) => fetchMock.mock.calls.filter(([u]) => String(u).endsWith(suffix));

describe("Volunteer Portal sync: staff", () => {
  it("sends our staff's DBS, BPSS and training with the cadets", async () => {
    enrollingBookmark();
    stubEnrolApi([]);
    render(<VpSyncPage />);
    await screen.findByText(/Sync complete|finished with problems/);
    const body = JSON.parse(syncCalls()[0][1].body);
    expect(body.staff).toEqual([
      { cin: 3000, data: { dbs: { dateValidFrom: "2025-01-01" }, bpss: [], training: {} } },
    ]);
    expect(stat("Staff updated")).toBe("1");
  });

  it("still syncs the cadets when the staff roster can't be read", async () => {
    enrollingBookmark();
    fetchMock = vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/cadets")) return Response.json([{ cin: 111 }]);
      if (path.endsWith("/staff")) return Response.json({ detail: "boom" }, { status: 500 });
      return Response.json(path.endsWith("/exam-ready") ? [] : COUNTS);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<VpSyncPage />);
    await screen.findByText(/Sync complete|finished with problems/);
    expect(JSON.parse(syncCalls()[0][1].body).staff).toEqual([]);
  });
});

describe("Volunteer Portal sync: enrolling ready cadets", () => {
  it("enrols the ticked cadets through the bookmark, checks they went on, logs it, and lets go on Finish", async () => {
    enrollingBookmark();
    stubEnrolApi();
    render(<VpSyncPage />);
    const section = await screen.findByRole("region", { name: /Basic Navigation/ });
    expect(section.textContent).toContain("Zoë Ó Briain");
    // The bookmark is kept listening while there's someone to enrol.
    expect(sentToPortal("sms-vp-done")).toHaveLength(0);

    act(() => screen.getByRole("button", { name: "Enrol 1 on the portal" }).click());
    expect(await screen.findByText("Enrolled: Zoë Ó Briain")).toBeTruthy();

    const [[enrol]] = sentToPortal("sms-vp-enrol");
    expect(enrol).toMatchObject({
      path: EXAM_PATH,
      body: { examId: "e-nav", actions: { "501": true } },
      label: "Basic Navigation (Navigation on Land Exam)",
    });
    await waitFor(() => expect(callsTo("/vp-sync/enrolments")).toHaveLength(1));
    expect(JSON.parse(callsTo("/vp-sync/enrolments")[0][1].body)).toEqual({
      exam_id: "e-nav",
      course_name: "Navigation on Land Exam",
      enrolled: [111],
      failed: [],
    });

    act(() => screen.getByRole("button", { name: "Finish" }).click());
    expect(sentToPortal("sms-vp-done")).toHaveLength(1);
    expect(screen.getByText("Finished. You can close this tab.")).toBeTruthy();
  });

  it("unticking everyone leaves nothing to send", async () => {
    enrollingBookmark();
    stubEnrolApi();
    render(<VpSyncPage />);
    await screen.findByRole("region", { name: /Basic Navigation/ });
    act(() => screen.getByRole("checkbox", { name: "Zoë Ó Briain" }).click());
    expect(
      (screen.getByRole("button", { name: "Enrol 0 on the portal" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });

  it("a cancel on the portal is said plainly and nothing is logged", async () => {
    enrollingBookmark({ status: 0, body: "cancelled on the portal" });
    stubEnrolApi();
    render(<VpSyncPage />);
    await screen.findByRole("region", { name: /Basic Navigation/ });
    act(() => screen.getByRole("button", { name: "Enrol 1 on the portal" }).click());
    expect((await screen.findByText(/Not enrolled/)).textContent).toContain("cancelled on the portal");
    expect(callsTo("/vp-sync/enrolments")).toHaveLength(0);
    // They can try again.
    expect(screen.getByRole("button", { name: "Enrol 1 on the portal" })).toBeTruthy();
  });

  it("a portal that says OK but doesn't show them enrolled is flagged, not counted", async () => {
    // A 200 the read-back doesn't confirm (reply status 201 here leaves the list unchanged).
    enrollingBookmark({ status: 201, body: "{}" });
    stubEnrolApi();
    render(<VpSyncPage />);
    await screen.findByRole("region", { name: /Basic Navigation/ });
    act(() => screen.getByRole("button", { name: "Enrol 1 on the portal" }).click());
    expect((await screen.findByText(/doesn't show these as enrolled/)).textContent).toContain("Zoë Ó Briain");
    await waitFor(() => expect(callsTo("/vp-sync/enrolments")).toHaveLength(1));
    expect(JSON.parse(callsTo("/vp-sync/enrolments")[0][1].body).failed).toEqual([111]);
  });

  it("an older bookmark shows who's ready and asks for a re-drag, and is let go at once", async () => {
    enrollingBookmark(undefined, 2);
    stubEnrolApi();
    render(<VpSyncPage />);
    await screen.findByRole("region", { name: /Basic Navigation/ });
    expect(screen.getByText("Drag a fresh 317 Sync bookmark to enrol from here")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Enrol/ })).toBeNull();
    await waitFor(() => expect(sentToPortal("sms-vp-done")).toHaveLength(1));
  });

  it("when working out who's ready fails, the sync still completes and the bookmark is let go", async () => {
    enrollingBookmark();
    fetchMock = vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path.endsWith("/cadets")) return Response.json([{ cin: 111 }]);
      if (path.endsWith("/exam-ready")) return Response.json({ detail: "boom" }, { status: 500 });
      return Response.json(path.endsWith("/staff") ? [] : COUNTS);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<VpSyncPage />);
    await screen.findByText(/Sync complete|finished with problems/);
    await waitFor(() => expect(sentToPortal("sms-vp-done")).toHaveLength(1));
    expect(screen.queryByText("Ready for a classification exam")).toBeNull();
  });

  it("closing the tab mid-enrolment lets the bookmark go", async () => {
    enrollingBookmark();
    stubEnrolApi();
    render(<VpSyncPage />);
    await screen.findByRole("region", { name: /Basic Navigation/ });
    act(() => void window.dispatchEvent(new Event("pagehide")));
    expect(sentToPortal("sms-vp-done")).toHaveLength(1);
  });
});
