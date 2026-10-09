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
