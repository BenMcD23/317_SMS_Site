// Runs the real bookmarklet (public/vp-sync-bookmarklet.js) against a faked
// Volunteer Portal: what it reads, what it refuses, and where its data goes.
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { bookmarkletHref, formatMinutes, timeSince, VP_ORIGIN } from "@/lib/vp-sync";

const SMS = "https://sms.317atc.co.uk";
const SOURCE = readFileSync(path.join(__dirname, "../public/vp-sync-bookmarklet.js"), "utf8");

const PORTAL: Record<string, unknown> = {
  "/api/antiforgery/token": { token: "csrf-1" },
  "/api/persons/cadets": {
    data: [
      { computerNumber: 111, personnelWebId: "w1" },
      { computerNumber: 222, personnelWebId: "w2" }, // on the portal, not in 317 SMS
    ],
  },
  "/api/exams/management/subjects": [
    { classificationExamId: "e1", courseName: "Leading Cadet", cadetClassification: "Leading" },
  ],
  "/api/exams/management/subjects/e1/enrolments": [{ computerNumber: "111", enrolled: true }],
  "/api/exams/management/subjects/e1/results": [{ personnelWebId: "w1", status: 2 }],
  "/api/person/w1/aviation/history": [{ aircraft: "Tutor" }],
};

/** Runs the bookmarklet as the browser would, with the page globals faked. */
async function run({
  origin = VP_ORIGIN,
  popup = true,
  failing = ["/api/shootingmanagement/w1/whts"],
  cins = [111],
} = {}) {
  const win = { postMessage: vi.fn() };
  const listeners: ((e: unknown) => void)[] = [];
  let inFlight = 0;
  const peak = { inFlight: 0 };
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
    peak.inFlight = Math.max(peak.inFlight, ++inFlight);
    await new Promise((r) => setTimeout(r, 1));
    inFlight--;
    const p = url.split("?")[0];
    if (failing.includes(p)) return new Response("no", { status: 500 });
    return Response.json(p in PORTAL ? PORTAL[p] : []);
  });
  const g = {
    location: { origin },
    window: { open: vi.fn(() => (popup ? win : null)) },
    fetch,
    alert: vi.fn(),
    addEventListener: (_: string, h: (e: unknown) => void) => listeners.push(h),
    removeEventListener: vi.fn(),
    document: { createElement: () => ({ style: {}, remove() {} }), body: { appendChild() {} }, querySelector: () => null },
    setTimeout: (fn: () => void, ms: number) => (ms > 1000 ? 0 : setTimeout(fn, ms)),
  };
  const href = bookmarkletHref(SOURCE, SMS);
  const code = decodeURIComponent(href.slice("javascript:".length)).trim().replace(/;$/, "");
  const done = new Function(...Object.keys(g), `return (\n${code}\n);`)(...Object.values(g)) as Promise<void>;
  // Anyone but the opened 317 SMS tab saying "ready" must be ignored.
  listeners.forEach((h) => h({ origin: "https://evil.example", source: win, data: { type: "sms-vp-ready", cins: [222] } }));
  listeners.forEach((h) => h({ origin: SMS, source: {}, data: { type: "sms-vp-ready", cins: [222] } }));
  listeners.forEach((h) => h({ origin: SMS, source: win, data: { type: "sms-vp-ready", cins } }));
  await done;
  return { g, win, fetch, peak };
}

describe("317 Sync bookmarklet", () => {
  it("bakes this site's origin into the bookmark", () => {
    expect(decodeURIComponent(bookmarkletHref(SOURCE, SMS))).toContain(`"${SMS}"`);
    expect(bookmarkletHref(SOURCE, SMS)).not.toContain("__SMS_ORIGIN__");
  });

  it("reads only the cadets 317 SMS holds and posts them to 317 SMS alone", async () => {
    const { win, fetch } = await run();

    expect(win.postMessage).toHaveBeenCalledTimes(1);
    const [msg, target] = win.postMessage.mock.calls[0];
    expect(target).toBe(SMS);
    expect(msg.type).toBe("sms-vp-data");
    expect(msg.cadets.map((c: { cin: number }) => c.cin)).toEqual([111]);
    expect(fetch.mock.calls.some(([u]) => String(u).includes("/w2/"))).toBe(false);

    const data = msg.cadets[0].data;
    expect(data.flying).toEqual([{ aircraft: "Tutor" }]);
    expect(data.exams).toEqual({
      enrolments: [{ courseName: "Leading Cadet", cadetClassification: "Leading", computerNumber: "111", enrolled: true }],
      results: [{ courseName: "Leading Cadet", cadetClassification: "Leading", personnelWebId: "w1", status: 2 }],
    });
  });

  it("sends a failed portal call as null so the import keeps the old copy", async () => {
    const { win } = await run();
    expect(win.postMessage.mock.calls[0][0].cadets[0].data.whts).toBeNull();
  });

  it("tells 317 SMS exactly which calls failed and what the portal said", async () => {
    const { win } = await run();
    expect(win.postMessage.mock.calls[0][0].errors).toEqual([
      { what: "whts", path: "/api/shootingmanagement/w1/whts", status: 500, detail: "no" },
    ]);
  });

  it("flags a cadet list that matches none of our CINs", async () => {
    const { win } = await run({ cins: [999] });
    expect(win.postMessage.mock.calls[0][0].errors[0].detail).toMatch(/none match the 1 CINs/);
  });

  it("keeps at most 8 portal requests in flight", async () => {
    const { peak } = await run();
    expect(peak.inFlight).toBeGreaterThan(1); // reads run in parallel…
    expect(peak.inFlight).toBeLessThanOrEqual(8); // …but capped
  });

  it("sends exams as null when the subject list can't be read", async () => {
    const { win } = await run({ failing: ["/api/exams/management/subjects"] });
    expect(win.postMessage.mock.calls[0][0].cadets[0].data.exams).toBeNull();
  });

  it("sends the portal's CSRF token on every API call", async () => {
    const { fetch } = await run();
    const apiCalls = fetch.mock.calls.filter(([u]) => !String(u).includes("antiforgery"));
    expect(apiCalls.length).toBeGreaterThan(0);
    for (const [, init] of apiCalls) expect(init?.headers).toMatchObject({ "X-CSRF-TOKEN": "csrf-1" });
  });

  it("does nothing off the Volunteer Portal", async () => {
    const { g, fetch } = await run({ origin: "https://example.com" });
    expect(g.alert).toHaveBeenCalled();
    expect(g.window.open).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stops and says so when the pop-up is blocked", async () => {
    const { g, fetch } = await run({ popup: false });
    expect(g.alert).toHaveBeenCalledWith(expect.stringMatching(/pop-ups/));
    expect(fetch).not.toHaveBeenCalled();
  });

  it("reports a portal failure to the 317 SMS tab instead of hanging it", async () => {
    const { win } = await run({ failing: ["/api/persons/cadets"] });
    expect(win.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({ type: "sms-vp-error", errors: [expect.objectContaining({ what: "cadet list", status: 500 })] }),
      SMS
    );
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
