// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VpSyncPage from "@/app/tools/scraper/vp-sync/page";
import { API_BASE } from "@/lib/config";
import { VP_ORIGIN } from "@/lib/vp-sync";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam Staff" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));

const COUNTS = { matched: 2, unmatched: 1, saved: 14, failed: 1, kept: 0, theory: 3 };
const CADETS = [{ cin: 111, data: { whts: [] } }];

let portal: { postMessage: ReturnType<typeof vi.fn> };
let fetchMock: ReturnType<typeof vi.fn>;

function stubApi(sync: () => Response = () => Response.json(COUNTS)) {
  fetchMock = vi.fn(async (url: string) =>
    url.endsWith("/cadets") ? Response.json([{ cin: 111 }, { cin: 222 }]) : sync()
  );
  vi.stubGlobal("fetch", fetchMock);
}

function send(data: unknown, origin = VP_ORIGIN, source: unknown = portal) {
  act(() => {
    window.dispatchEvent(new MessageEvent("message", { data, origin, source: source as Window }));
  });
}

const syncCalls = () => fetchMock.mock.calls.filter(([u]) => String(u).endsWith("/vp-sync"));

beforeEach(() => {
  portal = { postMessage: vi.fn() };
  Object.defineProperty(window, "opener", { value: portal, configurable: true });
  stubApi();
});
afterEach(() => {
  Object.defineProperty(window, "opener", { value: null, configurable: true });
});

describe("Volunteer Portal sync page", () => {
  it("tells the portal which CINs we hold, addressed to the portal only", async () => {
    render(<VpSyncPage />);
    await waitFor(() => expect(portal.postMessage).toHaveBeenCalled());
    expect(portal.postMessage).toHaveBeenCalledWith({ type: "sms-vp-ready", cins: [111, 222] }, VP_ORIGIN);
  });

  it("imports the portal's data with the user's token and shows the result", async () => {
    render(<VpSyncPage />);
    await waitFor(() => expect(portal.postMessage).toHaveBeenCalled());
    send({ type: "sms-vp-data", cadets: CADETS });

    expect(await screen.findByText(/Sync complete/)).toBeTruthy();
    const stat = (label: string) => screen.getByText(label).nextElementSibling?.textContent;
    expect([stat("Cadets updated"), stat("Records saved"), stat("Theory lessons ticked")]).toEqual(["2", "14", "3"]);
    expect(screen.getByText(/1 people weren't in 317 SMS/)).toBeTruthy();
    const [url, init] = syncCalls()[0];
    expect(url).toBe(`${API_BASE}/vp-sync`);
    expect(init.headers.Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body)).toEqual({ cadets: CADETS });
  });

  it.each([
    ["another site", "https://evil.example", undefined],
    ["a portal window that didn't open us", VP_ORIGIN, {}],
  ])("ignores data from %s", async (_, origin, source) => {
    render(<VpSyncPage />);
    await waitFor(() => expect(portal.postMessage).toHaveBeenCalled());
    send({ type: "sms-vp-data", cadets: CADETS }, origin, source ?? portal);
    await new Promise((r) => setTimeout(r, 20));
    expect(syncCalls()).toHaveLength(0);
  });

  it("lists every failed portal call, grouped, so a tester can report them", async () => {
    render(<VpSyncPage />);
    await waitFor(() => expect(portal.postMessage).toHaveBeenCalled());
    const errors = [
      { what: "whts", path: "/api/shootingmanagement/w1/whts", status: 403, detail: "Forbidden" },
      { what: "whts", path: "/api/shootingmanagement/w2/whts", status: 403, detail: "" },
      { what: "flying", path: "/api/person/w1/aviation/history", status: 500, detail: "boom" },
    ];
    send({ type: "sms-vp-data", cadets: CADETS, errors });

    expect(await screen.findByText(/finished with problems/)).toBeTruthy();
    expect(screen.getByText("Problems (3)")).toBeTruthy();
    const whts = screen.getByRole("region", { name: "whts" });
    expect(whts.textContent).toContain("403 · your portal login lacks this permission · ×2");
    expect(whts.textContent).toContain("/api/shootingmanagement/w2/whts");
    expect(screen.getByRole("region", { name: "flying" }).textContent).toContain("boom");
  });

  it("copies every problem for sending on", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<VpSyncPage />);
    await waitFor(() => expect(portal.postMessage).toHaveBeenCalled());
    send({ type: "sms-vp-data", cadets: CADETS, errors: [{ what: "whts", path: "/api/x", status: 403, detail: "no" }] });
    act(() => screen.getByRole("button", { name: /Copy all/ }).click());
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("whts\t403\t/api/x\tno"));
  });

  it("still shows the problems when the portal read fails outright", async () => {
    render(<VpSyncPage />);
    await waitFor(() => expect(portal.postMessage).toHaveBeenCalled());
    send({ type: "sms-vp-error", message: "cadet list → 401", errors: [{ what: "cadet list", path: "/api/persons/cadets", status: 401, detail: "" }] });
    expect((await screen.findByRole("alert")).textContent).toContain("cadet list → 401");
    expect(screen.getByText(/signed out of the portal/)).toBeTruthy();
  });

  it("shows a clean sync with no problems list", async () => {
    render(<VpSyncPage />);
    await waitFor(() => expect(portal.postMessage).toHaveBeenCalled());
    send({ type: "sms-vp-data", cadets: CADETS, errors: [] });
    expect(await screen.findByText(/Sync complete/)).toBeTruthy();
    expect(screen.queryByText(/Problems/)).toBeNull();
  });

  it("imports only once even if the portal sends twice", async () => {
    render(<VpSyncPage />);
    await waitFor(() => expect(portal.postMessage).toHaveBeenCalled());
    send({ type: "sms-vp-data", cadets: CADETS });
    send({ type: "sms-vp-data", cadets: CADETS });
    await screen.findByText(/Sync complete/);
    expect(syncCalls()).toHaveLength(1);
  });

  it("shows the API's reason when the import is refused", async () => {
    stubApi(() => Response.json({ detail: "Staff access required" }, { status: 403 }));
    render(<VpSyncPage />);
    await waitFor(() => expect(portal.postMessage).toHaveBeenCalled());
    send({ type: "sms-vp-data", cadets: CADETS });
    expect((await screen.findByRole("alert")).textContent).toContain("Staff access required");
  });

  it("shows the portal's failure when the bookmarklet couldn't read it", async () => {
    render(<VpSyncPage />);
    await waitFor(() => expect(portal.postMessage).toHaveBeenCalled());
    send({ type: "sms-vp-error", message: "persons/cadets → 401" });
    expect((await screen.findByRole("alert")).textContent).toContain("persons/cadets → 401");
  });

  it("explains how to start a sync when opened directly", async () => {
    Object.defineProperty(window, "opener", { value: null, configurable: true });
    render(<VpSyncPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("317 Sync bookmark");
  });

  it("says so when the cadet list can't be loaded, rather than waiting forever", async () => {
    fetchMock = vi.fn(async () => Response.json({ detail: "boom" }, { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<VpSyncPage />);
    expect((await screen.findByRole("alert")).textContent).toContain("boom");
    expect(portal.postMessage).not.toHaveBeenCalled();
  });
});
