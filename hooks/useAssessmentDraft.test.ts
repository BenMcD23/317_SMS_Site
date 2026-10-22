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

  it("clearDraft removes the saved copy and cancels a pending save", () => {
    const { result } = renderHook(() =>
      useAssessmentDraft<Form>("radio", { notes: "" }, "nco@x", meaningful)
    );
    act(() => result.current.setState({ notes: "x" }));
    act(() => result.current.clearDraft());
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
