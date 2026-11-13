import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toast = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { deleteWithUndo, UNDO_MS } from "@/lib/undo-delete";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function start(commit = vi.fn(async () => {})) {
  const hide = vi.fn();
  const restore = vi.fn();
  deleteWithUndo({ message: "Note deleted", hide, restore, commit });
  const undo = () => toast.mock.calls.at(-1)![1].action.onClick();
  return { hide, restore, commit, undo };
}

describe("deleteWithUndo", () => {
  it("hides the item at once but only deletes once the Undo has gone", async () => {
    const { hide, commit, restore } = start();
    expect(hide).toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith("Note deleted", expect.objectContaining({ duration: UNDO_MS }));
    await vi.advanceTimersByTimeAsync(UNDO_MS - 1);
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(commit).toHaveBeenCalledOnce();
    expect(restore).not.toHaveBeenCalled();
  });

  it("Undo puts it back and never sends the delete", async () => {
    const { commit, restore, undo } = start();
    undo();
    expect(restore).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(UNDO_MS * 2);
    expect(commit).not.toHaveBeenCalled();
  });

  it("a refused delete brings the item back and says why", async () => {
    const { restore } = start(vi.fn(async () => Promise.reject(new Error("Not yours to delete"))));
    await vi.advanceTimersByTimeAsync(UNDO_MS);
    expect(restore).toHaveBeenCalledOnce();
    expect(toast.error).toHaveBeenCalledWith("Not yours to delete");
  });
});
