// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import {
  clearServerDraft,
  loadServerDraft,
  saveServerDraft,
  serverDraftIsNewer,
} from "@/lib/inspection-draft";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

const mark = { score: "8", comments: [] };

function stubFetch(res: () => Response) {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => res());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("serverDraftIsNewer", () => {
  it("an empty phone takes the server's sheet", () => {
    expect(serverDraftIsNewer({ marks: {} }, { marks: { 1: mark }, saved_at: "2026-11-04T19:00:00Z" })).toBe(
      true
    );
  });

  it("no server sheet, or an empty one, never replaces the phone's", () => {
    expect(serverDraftIsNewer({ marks: { 1: mark } }, null)).toBe(false);
    expect(serverDraftIsNewer({ marks: {} }, { marks: {} })).toBe(false);
  });

  it("the later save wins", () => {
    const older = { marks: { 1: mark }, saved_at: "2026-11-04T19:00:00Z" };
    const newer = { marks: { 1: mark, 2: mark }, saved_at: "2026-11-04T19:30:00Z" };
    expect(serverDraftIsNewer(older, newer)).toBe(true);
    // Marking carried on on this phone while offline: keep it.
    expect(serverDraftIsNewer(newer, older)).toBe(false);
  });

  it("a phone copy from before saved_at existed counts as oldest", () => {
    expect(
      serverDraftIsNewer({ marks: { 1: mark } }, { marks: { 2: mark }, saved_at: "2026-11-04T19:00:00Z" })
    ).toBe(true);
  });

  it("a garbled timestamp counts as oldest rather than crashing", () => {
    expect(
      serverDraftIsNewer(
        { marks: { 1: mark }, saved_at: "2026-11-04T19:00:00Z" },
        { marks: { 2: mark }, saved_at: "nonsense" }
      )
    ).toBe(false);
  });
});

describe("loadServerDraft", () => {
  it("returns the saved sheet", async () => {
    const fetch = stubFetch(
      () => new Response(JSON.stringify({ data: { marks: { 1: mark } }, updated_at: "x" }))
    );
    expect(await loadServerDraft("tok")).toEqual({ marks: { 1: mark } });
    expect(fetch.mock.calls[0][0]).toMatch(/\/inspections\/draft$/);
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer tok");
  });

  it("a 404 means nothing is saved", async () => {
    stubFetch(() => new Response(JSON.stringify({ detail: "No inspection in progress" }), { status: 404 }));
    expect(await loadServerDraft("tok")).toBeNull();
  });

  it("a server error throws instead of looking like 'nothing saved'", async () => {
    stubFetch(() => new Response("boom", { status: 500 }));
    await expect(loadServerDraft("tok")).rejects.toThrow("500");
  });
});

describe("saveServerDraft / clearServerDraft", () => {
  it("PUTs the whole sheet as JSON", async () => {
    const fetch = stubFetch(() => new Response("{}"));
    await saveServerDraft("tok", { marks: { 1: mark }, saved_at: "2026-11-04T19:00:00Z" });
    const init = fetch.mock.calls[0][1]!;
    expect(init.method).toBe("PUT");
    expect(JSON.parse(String(init.body))).toEqual({ marks: { 1: mark }, saved_at: "2026-11-04T19:00:00Z" });
  });

  it("a refused save throws so the page can say it's only on the phone", async () => {
    stubFetch(() => new Response(JSON.stringify({ detail: "x" }), { status: 422 }));
    await expect(saveServerDraft("tok", { marks: {} })).rejects.toThrow("422");
  });

  it("clearing DELETEs, and a failure throws", async () => {
    const fetch = stubFetch(() => new Response("{}"));
    await clearServerDraft("tok");
    expect(fetch.mock.calls[0][1]?.method).toBe("DELETE");
    stubFetch(() => new Response("", { status: 503 }));
    await expect(clearServerDraft("tok")).rejects.toThrow("503");
  });
});
