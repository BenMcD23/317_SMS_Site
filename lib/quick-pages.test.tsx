// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = vi.hoisted(() => ({ current: { data: { role: "staff" } as { role?: string } | null } }));
vi.mock("next-auth/react", () => ({ useSession: () => SESSION.current }));
const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { RecentPageTracker, resetQuickPagesForTest, useQuickPages } from "@/lib/quick-pages";

const PINS = "sms.mobile.pins";
const RECENT = "sms.mobile.recent";

/** Two readers of the store, as the sidebar and the phone bar are. */
function Reader({ name }: { name: string }) {
  const { pins, togglePin } = useQuickPages();
  return (
    <div>
      <output aria-label={name}>{pins.join(",")}</output>
      <button type="button" onClick={() => togglePin("/stats")}>
        toggle {name}
      </button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  resetQuickPagesForTest();
  SESSION.current = { data: { role: "staff" } };
  pathname.current = "/";
});

describe("the shared pins", () => {
  it("change everywhere at once when one place pins a page", () => {
    window.localStorage.setItem(PINS, JSON.stringify(["/"]));
    render(
      <>
        <Reader name="a" />
        <Reader name="b" />
      </>
    );
    act(() => screen.getByRole("button", { name: "toggle a" }).click());
    expect(screen.getByRole("status", { name: "a" })).toHaveTextContent("/,/stats");
    expect(screen.getByRole("status", { name: "b" })).toHaveTextContent("/,/stats");
    expect(JSON.parse(window.localStorage.getItem(PINS)!)).toEqual(["/", "/stats"]);
  });

  it("pick up a change made in another tab", () => {
    render(<Reader name="a" />);
    act(() => {
      window.localStorage.setItem(PINS, JSON.stringify(["/stats"]));
      window.dispatchEvent(new StorageEvent("storage", { key: PINS }));
    });
    expect(screen.getByRole("status", { name: "a" })).toHaveTextContent("/stats");
  });

  it("still hold a pin for the visit when storage refuses it", () => {
    window.localStorage.setItem(PINS, JSON.stringify(["/"]));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    render(<Reader name="a" />);
    act(() => screen.getByRole("button", { name: "toggle a" }).click());
    expect(screen.getByRole("status", { name: "a" }).textContent).toContain("/stats");
  });

  it("use the role's defaults when storage can't be read at all", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    render(<Reader name="a" />);
    expect(screen.getByRole("status", { name: "a" })).toHaveTextContent(
      "/,/cadets/overview,/check-in,/stores/uniform/stock"
    );
  });
});

describe("RecentPageTracker", () => {
  it("records the page you're on, a record as its list, newest first, once", () => {
    pathname.current = "/texts/messages";
    const { rerender } = render(<RecentPageTracker />);
    pathname.current = "/stores/uniform/stock/BOX-A";
    rerender(<RecentPageTracker />);
    pathname.current = "/texts/messages";
    rerender(<RecentPageTracker />);
    expect(JSON.parse(window.localStorage.getItem(RECENT)!)).toEqual([
      "/texts/messages",
      "/stores/uniform/stock",
    ]);
  });

  it("records nothing for a page the menu doesn't list, or before sign-in", () => {
    pathname.current = "/settings";
    render(<RecentPageTracker />);
    SESSION.current = { data: null };
    pathname.current = "/stores/uniform/stock";
    render(<RecentPageTracker />);
    expect(window.localStorage.getItem(RECENT)).toBeNull();
  });
});
