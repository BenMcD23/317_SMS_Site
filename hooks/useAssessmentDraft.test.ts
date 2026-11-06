// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useAssessmentDraft } from "@/hooks/useAssessmentDraft";

type Form = { notes: string };
const meaningful = (s: Form) => s.notes.trim() !== "";
const KEY = "assessment_draft_radio_nco@x";

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe("useAssessmentDraft", () => {
  it("restores a saved draft for this user and type", () => {
    localStorage.setItem(KEY, JSON.stringify({ notes: "half done" }));
    const { result } = renderHook(() =>
      useAssessmentDraft<Form>("radio", { notes: "" }, "nco@x", meaningful)
    );
    expect(result.current.state).toEqual({ notes: "half done" });
    expect(result.current.draftRestored).toBe(true);
  });

  it("drops a stored draft that has nothing in it", () => {
    localStorage.setItem(KEY, JSON.stringify({ notes: "  " }));
    const { result } = renderHook(() =>
      useAssessmentDraft<Form>("radio", { notes: "" }, "nco@x", meaningful)
    );
    expect(result.current.draftRestored).toBe(false);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("survives a corrupt stored draft", () => {
    localStorage.setItem(KEY, "{not json");
    const { result } = renderHook(() =>
      useAssessmentDraft<Form>("radio", { notes: "" }, "nco@x", meaningful)
    );
    expect(result.current.state).toEqual({ notes: "" });
  });

  it("saves after a pause in typing, and removes the draft once it's emptied", () => {
    const { result } = renderHook(() =>
      useAssessmentDraft<Form>("radio", { notes: "" }, "nco@x", meaningful)
    );
    act(() => result.current.setState({ notes: "a" }));
    act(() => result.current.setState((s) => ({ notes: s.notes + "b" })));
    expect(localStorage.getItem(KEY)).toBeNull(); // debounced
    act(() => void vi.advanceTimersByTime(500));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ notes: "ab" });

    act(() => result.current.setState({ notes: "" }));
    act(() => void vi.advanceTimersByTime(500));
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  // Leaving the page mid-debounce used to leave the timer running: the work
  // landed late, after a clear on the next visit, or (in tests) in the next test.
  it("leaving the page saves straight away and leaves no timer behind", () => {
    const { result, unmount } = renderHook(() =>
      useAssessmentDraft<Form>("radio", { notes: "" }, "nco@x", meaningful)
    );
    act(() => result.current.setState({ notes: "unsaved" }));
    unmount();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ notes: "unsaved" });
    localStorage.clear();
    act(() => void vi.advanceTimersByTime(1000));
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("leaving the page after a clear doesn't bring the draft back", async () => {
    const { result, unmount } = renderHook(() =>
      useAssessmentDraft<Form>("radio", { notes: "" }, "nco@x", meaningful)
    );
    act(() => result.current.setState({ notes: "gone" }));
    await act(() => result.current.clearDraft());
    unmount();
    act(() => void vi.advanceTimersByTime(1000));
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("clearDraft removes the saved copy and cancels a pending save", () => {
    const { result } = renderHook(() =>
      useAssessmentDraft<Form>("radio", { notes: "" }, "nco@x", meaningful)
    );
    act(() => result.current.setState({ notes: "x" }));
    act(() => void result.current.clearDraft());
    act(() => void vi.advanceTimersByTime(1000));
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps drafts separate per user and per assessment type", () => {
    localStorage.setItem("assessment_draft_radio_other@x", JSON.stringify({ notes: "theirs" }));
    localStorage.setItem("assessment_draft_moi_nco@x", JSON.stringify({ notes: "moi" }));
    const { result } = renderHook(() =>
      useAssessmentDraft<Form>("radio", { notes: "" }, "nco@x", meaningful)
    );
    expect(result.current.state).toEqual({ notes: "" });
  });

  it("waits for the user's email before loading", () => {
    localStorage.setItem(KEY, JSON.stringify({ notes: "saved" }));
    const { result, rerender } = renderHook(
      ({ email }) => useAssessmentDraft<Form>("radio", { notes: "" }, email, meaningful),
      { initialProps: { email: undefined as string | undefined } }
    );
    expect(result.current.draftRestored).toBe(false);
    rerender({ email: "nco@x" });
    expect(result.current.state).toEqual({ notes: "saved" });
  });

  it("carries on when storage is unavailable", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });
    const { result } = renderHook(() =>
      useAssessmentDraft<Form>("radio", { notes: "" }, "nco@x", meaningful)
    );
    act(() => result.current.setState({ notes: "x" }));
    expect(() => act(() => void vi.advanceTimersByTime(500))).not.toThrow();
    expect(result.current.state).toEqual({ notes: "x" });
  });
});

describe("useAssessmentDraft on the server", () => {
  const EARLY = "2026-11-04T19:00:00.000Z";
  const LATE = "2026-11-04T19:30:00.000Z";

  /** Fake API for /assessment-drafts/radio. `get` is what a GET answers; a
   *  promise lets a test hold the answer back. Records every call. */
  function server({
    get = () => new Response("{}", { status: 404 }),
    put = () => new Response("{}"),
    del = () => new Response("{}"),
  }: {
    get?: () => Response | Promise<Response>;
    put?: () => Response;
    del?: () => Response;
  } = {}) {
    const fetch = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (_url, init) => {
      const method = init?.method ?? "GET";
      return method === "GET" ? get() : method === "PUT" ? put() : del();
    });
    vi.stubGlobal("fetch", fetch);
    return {
      fetch,
      calls: (method: string) => fetch.mock.calls.filter(([, init]) => (init?.method ?? "GET") === method),
      sent: (i = 0) =>
        JSON.parse(String(fetch.mock.calls.filter(([, i2]) => i2?.method === "PUT")[i][1]!.body)),
    };
  }

  const flush = () => act(async () => void (await vi.advanceTimersByTimeAsync(0)));

  function auto(token: string | null = "tok") {
    return renderHook(() =>
      useAssessmentDraft<Form>("radio", { notes: "" }, "nco@x", meaningful, { token, serverSave: "auto" })
    );
  }

  it("saves the latest form to the server a few seconds after the last change", async () => {
    const api = server();
    const { result } = auto();
    await flush();
    act(() => result.current.setState({ notes: "a" }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(1000)));
    act(() => result.current.setState({ notes: "ab" }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(2999)));
    expect(api.calls("PUT")).toHaveLength(0);
    await act(async () => void (await vi.advanceTimersByTimeAsync(1)));

    expect(api.calls("PUT")).toHaveLength(1);
    expect(api.sent().data).toEqual({ notes: "ab" });
    expect(api.sent().saved_at).toEqual(expect.any(String));
    expect(api.fetch.mock.calls[0][0]).toMatch(/\/assessment-drafts\/radio$/);
    expect(result.current.serverStatus).toEqual({ state: "saved", at: api.sent().saved_at });
  });

  it("a failed save says so, and the phone keeps its copy", async () => {
    server({ put: () => new Response("", { status: 500 }) });
    const { result } = auto();
    await flush();
    act(() => result.current.setState({ notes: "kept" }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(3000)));
    expect(result.current.serverStatus).toEqual({ state: "failed" });
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ notes: "kept" });
  });

  it("a form filling in its own defaults isn't saved, and doesn't count as newer", async () => {
    // The assessment pages put the assessor's name in on load. That mustn't
    // send an empty form over the server's, or beat a newer server copy.
    localStorage.setItem(KEY, JSON.stringify({ notes: "old" }));
    localStorage.setItem(`${KEY}:saved_at`, EARLY);
    let answer!: (r: Response) => void;
    const api = server({ get: () => new Promise((r) => (answer = r)) });
    const { result } = auto();
    act(() => result.current.setState({ notes: "old" })); // same value again
    act(() => result.current.setState({ notes: "" })); // emptied: not work
    await act(async () => void (await vi.advanceTimersByTimeAsync(5000)));
    expect(api.calls("PUT")).toHaveLength(0);

    await act(async () => answer(new Response(JSON.stringify({ data: { notes: "newer" }, saved_at: LATE }))));
    await flush();
    expect(result.current.state).toEqual({ notes: "newer" });
    expect(result.current.restoredFromServer).toBe(true);
  });

  it("holds an auto-save until the server's copy has been checked", async () => {
    let answer!: (r: Response) => void;
    const api = server({ get: () => new Promise((r) => (answer = r)) });
    const { result } = auto();
    act(() => result.current.setState({ notes: "typed early" }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(5000)));
    expect(api.calls("PUT")).toHaveLength(0);

    await act(async () => answer(new Response("{}", { status: 404 })));
    await flush();
    expect(api.calls("PUT")).toHaveLength(1);
    expect(api.sent().data).toEqual({ notes: "typed early" });
  });

  it("takes the server's copy when it was saved later than the phone's", async () => {
    localStorage.setItem(KEY, JSON.stringify({ notes: "phone" }));
    localStorage.setItem(`${KEY}:saved_at`, EARLY);
    server({ get: () => new Response(JSON.stringify({ data: { notes: "server" }, saved_at: LATE })) });
    const { result } = auto();
    await flush();
    expect(result.current.state).toEqual({ notes: "server" });
    expect(result.current.restoredFromServer).toBe(true);
    await act(async () => void (await vi.advanceTimersByTimeAsync(500)));
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual({ notes: "server" });
  });

  it("keeps the phone's copy when it was saved later than the server's", async () => {
    localStorage.setItem(KEY, JSON.stringify({ notes: "phone" }));
    localStorage.setItem(`${KEY}:saved_at`, LATE);
    server({ get: () => new Response(JSON.stringify({ data: { notes: "server" }, saved_at: EARLY })) });
    const { result } = auto();
    await flush();
    expect(result.current.state).toEqual({ notes: "phone" });
    expect(result.current.restoredFromServer).toBe(false);
  });

  it.each([
    ["errors", () => new Response("", { status: 500 })],
    ["can't be reached", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("when the server %s, the phone's copy stays", async (_, get) => {
    localStorage.setItem(KEY, JSON.stringify({ notes: "phone" }));
    server({ get: get as () => Response });
    const { result } = auto();
    await flush();
    expect(result.current.state).toEqual({ notes: "phone" });
    expect(result.current.draftRestored).toBe(true);
  });

  it("without a token, or without serverSave, nothing goes to the server", async () => {
    const api = server();
    const { result } = auto(null);
    const local = renderHook(() => useAssessmentDraft<Form>("radio", { notes: "" }, "nco@x", meaningful));
    act(() => result.current.setState({ notes: "x" }));
    act(() => local.result.current.setState({ notes: "y" }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(5000)));
    expect(api.fetch).not.toHaveBeenCalled();
  });

  it("a clear the server didn't get is retried on the next load, before anything is restored", async () => {
    server({ del: () => new Response("", { status: 503 }) });
    const first = auto();
    await flush();
    let cleared: boolean | undefined;
    await act(async () => void (cleared = await first.result.current.clearDraft()));
    expect(cleared).toBe(false);
    first.unmount();

    const api = server({ get: () => new Response(JSON.stringify({ data: { notes: "submitted already" } })) });
    const second = auto();
    await flush();
    expect(api.calls("DELETE")).toHaveLength(1);
    expect(api.calls("GET")).toHaveLength(0);
    expect(second.result.current.state).toEqual({ notes: "" });
    expect(localStorage.getItem(`${KEY}:clear_pending`)).toBeNull();
  });

  it("a save that gets through after a failed clear cancels the retry", async () => {
    // New work saved since: the retry would otherwise wipe it next load.
    server({ del: () => new Response("", { status: 503 }) });
    const { result } = auto();
    await flush();
    await act(async () => void (await result.current.clearDraft()));
    server();
    act(() => result.current.setState({ notes: "new work" }));
    await act(async () => void (await vi.advanceTimersByTimeAsync(3000)));
    expect(localStorage.getItem(`${KEY}:clear_pending`)).toBeNull();
  });
});
