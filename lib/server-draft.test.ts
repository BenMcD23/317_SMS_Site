// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";

import { clearServerDraft, loadServerDraft, saveServerDraft, serverDraftIsNewer } from "@/lib/server-draft";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

function stubFetch(res: () => Response) {
  const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => res());
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const EARLY = "2026-11-04T19:00:00Z";
const LATE = "2026-11-04T19:30:00Z";

describe("serverDraftIsNewer", () => {
  it("a phone with nothing worth keeping takes the server's copy", () => {
    expect(
      serverDraftIsNewer({ meaningful: false, savedAt: LATE }, { meaningful: true, savedAt: EARLY })
    ).toBe(true);
  });

  it("no server copy, or an empty one, never replaces the phone's", () => {
    expect(serverDraftIsNewer({ meaningful: true, savedAt: EARLY }, null)).toBe(false);
    expect(
      serverDraftIsNewer({ meaningful: false, savedAt: null }, { meaningful: false, savedAt: LATE })
    ).toBe(false);
  });

  it("the later save wins", () => {
    expect(
      serverDraftIsNewer({ meaningful: true, savedAt: EARLY }, { meaningful: true, savedAt: LATE })
    ).toBe(true);
    // Work carried on on this phone while offline: keep it.
    expect(
      serverDraftIsNewer({ meaningful: true, savedAt: LATE }, { meaningful: true, savedAt: EARLY })
    ).toBe(false);
  });

  it("a copy without a time counts as oldest, and with neither the phone's stays", () => {
    expect(
      serverDraftIsNewer({ meaningful: true, savedAt: null }, { meaningful: true, savedAt: EARLY })
    ).toBe(true);
    expect(
      serverDraftIsNewer({ meaningful: true, savedAt: EARLY }, { meaningful: true, savedAt: null })
    ).toBe(false);
    expect(serverDraftIsNewer({ meaningful: true, savedAt: null }, { meaningful: true, savedAt: null })).toBe(
      false
    );
  });

  it("a garbled time counts as oldest rather than crashing", () => {
    expect(
      serverDraftIsNewer({ meaningful: true, savedAt: EARLY }, { meaningful: true, savedAt: "nonsense" })
    ).toBe(false);
  });
});

describe("loadServerDraft", () => {
  it("returns the saved sheet and when it was saved, from that sheet's own address", async () => {
    const fetch = stubFetch(() => new Response(JSON.stringify({ data: { notes: "x" }, saved_at: EARLY })));
    expect(await loadServerDraft("radio", "tok")).toEqual({ data: { notes: "x" }, saved_at: EARLY });
    expect(fetch.mock.calls[0][0]).toMatch(/\/assessment-drafts\/radio$/);
    expect(new Headers(fetch.mock.calls[0][1]?.headers).get("Authorization")).toBe("Bearer tok");
  });

  it("a 404 means nothing is saved", async () => {
    stubFetch(() => new Response(JSON.stringify({ detail: "No draft saved" }), { status: 404 }));
    expect(await loadServerDraft("moi", "tok")).toBeNull();
  });

  it("a body without data is treated as nothing saved", async () => {
    stubFetch(() => new Response(JSON.stringify([])));
    expect(await loadServerDraft("space", "tok")).toBeNull();
  });

  it("a server error throws instead of looking like 'nothing saved'", async () => {
    stubFetch(() => new Response("boom", { status: 500 }));
    await expect(loadServerDraft("radio", "tok")).rejects.toThrow("500");
  });
});

describe("saveServerDraft / clearServerDraft", () => {
  it("PUTs the sheet and its time as JSON", async () => {
    const fetch = stubFetch(() => new Response("{}"));
    await saveServerDraft("inspection", "tok", { marks: {} }, EARLY);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toMatch(/\/assessment-drafts\/inspection$/);
    expect(init!.method).toBe("PUT");
    expect(JSON.parse(String(init!.body))).toEqual({ data: { marks: {} }, saved_at: EARLY });
  });

  it("a refused save throws so the page can say it's only on the phone", async () => {
    stubFetch(() => new Response(JSON.stringify({ detail: "x" }), { status: 413 }));
    await expect(saveServerDraft("radio", "tok", {}, EARLY)).rejects.toThrow("413");
  });

  it("clearing DELETEs, and a failure throws", async () => {
    const fetch = stubFetch(() => new Response("{}"));
    await clearServerDraft("leadership", "tok");
    expect(fetch.mock.calls[0][1]?.method).toBe("DELETE");
    stubFetch(() => new Response("", { status: 503 }));
    await expect(clearServerDraft("leadership", "tok")).rejects.toThrow("503");
  });
});
