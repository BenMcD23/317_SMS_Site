// @vitest-environment jsdom
/* eslint-disable @next/next/no-html-link-for-pages -- plain anchors model what <Link> renders, without a router */
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RouteProgress } from "@/components/layout/route-progress";

const nav = vi.hoisted(() => ({ pathname: "/cadets/overview" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));

function setup() {
  return render(
    <>
      <RouteProgress />
      <a href="/stats">Stats</a>
      <a href="/cadets/overview#flight-a">Flight A</a>
      <a href="https://example.com/">Elsewhere</a>
      <a href="/stats" target="_blank">
        New tab
      </a>
      <a href="/api/export" download>
        Export
      </a>
    </>
  );
}

// jsdom can't follow a link; cancel it on window, after RouteProgress's
// document listener has already seen the click.
const stopNavigation = (e: Event) => e.preventDefault();

beforeEach(() => {
  window.addEventListener("click", stopNavigation);
  vi.useFakeTimers();
  nav.pathname = "/cadets/overview";
  window.history.replaceState(null, "", "/cadets/overview");
});
afterEach(() => {
  window.removeEventListener("click", stopNavigation);
  vi.useRealTimers();
});

// A link whose own handler cancels the click (a confirm-before-leaving, say).
const clickCancelled = (name: string) => {
  const link = screen.getByRole("link", { name });
  link.addEventListener("click", (e) => e.preventDefault(), { once: true });
  fireEvent.click(link);
};

describe("RouteProgress", () => {
  it("shows while a tapped link loads and goes once the new page is in", () => {
    const view = setup();
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", { name: "Stats" }));
    expect(screen.getByRole("progressbar", { name: "Loading page" })).toHaveAttribute("aria-busy", "true");

    nav.pathname = "/stats";
    view.rerender(<RouteProgress />);
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-busy", "false");
    act(() => vi.advanceTimersByTime(300));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("ignores links that don't load another page here", () => {
    setup();
    fireEvent.click(screen.getByRole("link", { name: "Flight A" }));
    fireEvent.click(screen.getByRole("link", { name: "Elsewhere" }));
    fireEvent.click(screen.getByRole("link", { name: "New tab" }));
    fireEvent.click(screen.getByRole("link", { name: "Export" }));
    fireEvent.click(screen.getByRole("link", { name: "Stats" }), { ctrlKey: true });
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("ignores a link whose click a handler cancelled", () => {
    setup();
    clickCancelled("Stats");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("gives up after 10s if the page never arrives", () => {
    setup();
    fireEvent.click(screen.getByRole("link", { name: "Stats" }));
    act(() => vi.advanceTimersByTime(10_001));
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });
});
