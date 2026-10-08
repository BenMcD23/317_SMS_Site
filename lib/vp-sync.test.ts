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
  formatMinutes,
  timeSince,
  VP_ORIGIN,
  type PortalError,
} from "@/lib/vp-sync";

const SMS = "https://sms.317atc.co.uk";
const SOURCE = readFileSync(path.join(__dirname, "../public/vp-sync-bookmarklet.js"), "utf8");
const tick = () => new Promise((r) => setTimeout(r, 5));

/** Runs the bookmarklet as the browser would, with the page globals faked. */
function runBookmark({ origin = VP_ORIGIN, popup = true, csrf = "csrf-1" } = {}) {
  const win = { postMessage: vi.fn() };
  let listener: ((e: unknown) => Promise<void>) | null = null;
  let inFlight = 0;
  const peak = { inFlight: 0 };
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
    if (url.endsWith("/api/antiforgery/token")) return Response.json({ token: csrf });
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
    addEventListener: (_: string, h: (e: unknown) => Promise<void>) => (listener = h),
    removeEventListener: () => (listener = null),
    document: {
      createElement: () => ({ style: {}, remove() {} }),
      body: { appendChild() {} },
      querySelector: () => null,
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

describe("portal display helpers", () => {
  it("formats flying minutes", () => {
    expect(formatMinutes(45)).toBe("45m");
    expect(formatMinutes(200)).toBe("3h 20m");
  });

  it("measures time since a date in years and months", () => {
    const now = new Date("2026-10-08");
    expect(timeSince("2024-03-27", now)).toBe("2y 6m");
    expect(timeSince("2026-09-10", now)).toBe("0m");
    expect(timeSince(null, now)).toBeNull();
    expect(timeSince("2027-01-01", now)).toBeNull(); // a future date isn't "time since"
  });
});
