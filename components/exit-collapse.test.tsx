// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { EXIT_MS, ExitCollapse, useExitCollapse } from "@/components/exit-collapse";

function List({ onCommit }: { onCommit?: () => void }) {
  const [ids, setIds] = useState(["a", "b"]);
  const { isLeaving, exit } = useExitCollapse();
  return (
    <div>
      {ids.map((id) => (
        <ExitCollapse key={id} id={id} leaving={isLeaving(id)}>
          <p>Card {id}</p>
          <button
            onClick={() =>
              exit(id, () => {
                onCommit?.();
                setIds((prev) => prev.filter((x) => x !== id));
              })
            }
          >
            Remove {id}
          </button>
        </ExitCollapse>
      ))}
    </div>
  );
}

function stubReducedMotion(reduce: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches: reduce }))
  );
}

const wrapperOf = (text: string) => screen.getByText(text).closest("[data-exit-id]") as HTMLElement;

beforeEach(() => {
  vi.useFakeTimers();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("useExitCollapse", () => {
  it("collapses the card first and only removes it once the animation has run", () => {
    stubReducedMotion(false);
    const commit = vi.fn();
    render(<List onCommit={commit} />);

    act(() => screen.getByRole("button", { name: "Remove a" }).click());
    expect(commit).not.toHaveBeenCalled();
    expect(wrapperOf("Card a")).toHaveClass("grid-rows-[0fr]", "opacity-0");
    // A leaving card can't be clicked again — its order is already gone server-side.
    expect(wrapperOf("Card a")).toHaveAttribute("inert");
    expect(wrapperOf("Card b")).toHaveClass("grid-rows-[1fr]");

    act(() => vi.advanceTimersByTime(EXIT_MS));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Card a")).not.toBeInTheDocument();
    expect(screen.getByText("Card b")).toBeInTheDocument();
  });

  it("with reduced motion the card goes straight away", () => {
    stubReducedMotion(true);
    render(<List />);
    act(() => screen.getByRole("button", { name: "Remove a" }).click());
    expect(screen.queryByText("Card a")).not.toBeInTheDocument();
  });

  it("scrolls back to the card's top when you'd scrolled past it, so the next card lands in view", () => {
    stubReducedMotion(false);
    render(<List />);
    vi.spyOn(wrapperOf("Card a"), "getBoundingClientRect").mockReturnValue({ top: -400 } as DOMRect);
    act(() => screen.getByRole("button", { name: "Remove a" }).click());
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
  });

  it("leaves the scroll alone when the card's top is already on screen", () => {
    stubReducedMotion(false);
    render(<List />);
    vi.spyOn(wrapperOf("Card a"), "getBoundingClientRect").mockReturnValue({ top: 300 } as DOMRect);
    act(() => screen.getByRole("button", { name: "Remove a" }).click());
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });

  it("an id with no card on the page commits immediately rather than waiting on nothing", () => {
    stubReducedMotion(false);
    const commit = vi.fn();
    function Lonely() {
      const { exit } = useExitCollapse();
      return <button onClick={() => exit("missing", commit)}>Go</button>;
    }
    render(<Lonely />);
    act(() => screen.getByRole("button", { name: "Go" }).click());
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("unmounting mid-animation cancels the pending removal", () => {
    stubReducedMotion(false);
    const commit = vi.fn();
    const { unmount } = render(<List onCommit={commit} />);
    act(() => screen.getByRole("button", { name: "Remove a" }).click());
    unmount();
    act(() => vi.advanceTimersByTime(EXIT_MS));
    expect(commit).not.toHaveBeenCalled();
  });
});
