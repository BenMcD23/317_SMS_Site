// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { parseView, useListView } from "@/lib/list-view";

describe("useListView", () => {
  it("starts with nothing remembered", () => {
    const { result } = renderHook(() => useListView("cadets"));
    expect(result.current[0]).toEqual({});
  });

  it("remembers a list's sort and filters for the next visit", () => {
    const first = renderHook(() => useListView("cadets"));
    act(() => first.result.current[1]({ sort: { id: "rank", desc: true } }));
    act(() => first.result.current[1]({ filters: { flight: "B" } }));
    first.unmount();

    const next = renderHook(() => useListView("cadets"));
    expect(next.result.current[0]).toEqual({ sort: { id: "rank", desc: true }, filters: { flight: "B" } });
  });

  it("keeps each list's view to itself", () => {
    const cadets = renderHook(() => useListView("cadets"));
    act(() => cadets.result.current[1]({ filters: { flight: "B" } }));
    const recruits = renderHook(() => useListView("recruits"));
    expect(recruits.result.current[0]).toEqual({});
  });

  it("forgets the view entirely once it's back to the defaults", () => {
    const { result } = renderHook(() => useListView("cadets"));
    act(() => result.current[1]({ filters: { flight: "B" } }));
    act(() => result.current[1]({ filters: { flight: "" } }));
    expect(window.localStorage.getItem("sms.view.cadets")).toBeNull();
  });

  it("follows a change made in another tab", () => {
    const { result } = renderHook(() => useListView("cadets"));
    act(() => {
      window.localStorage.setItem("sms.view.cadets", JSON.stringify({ filters: { flight: "C" } }));
      window.dispatchEvent(new StorageEvent("storage", { key: "sms.view.cadets" }));
    });
    expect(result.current[0].filters).toEqual({ flight: "C" });
  });

  // Private browsing, or storage switched off: the list still works, it just can't remember.
  it("works with the defaults when storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    const { result } = renderHook(() => useListView("cadets"));
    expect(result.current[0]).toEqual({});
    expect(() => act(() => result.current[1]({ filters: { flight: "B" } }))).not.toThrow();
  });
});

describe("parseView", () => {
  it.each([
    ["nothing stored", null],
    ["not JSON", "{oops"],
    ["not an object", "42"],
    ["null", "null"],
  ])("gives an empty view for %s", (_, raw) => {
    expect(parseView(raw)).toEqual({});
  });

  it("drops the parts that aren't the right shape", () => {
    expect(parseView(JSON.stringify({ sort: { id: 5 }, filters: { flight: "B", bad: 3 } }))).toEqual({
      filters: { flight: "B" },
    });
  });
});
