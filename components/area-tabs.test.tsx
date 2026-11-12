// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const SESSION = vi.hoisted(() => ({
  current: { data: { role: "staff", user: { email: "x@317atc.co.uk" } } as object | null },
}));
vi.mock("next-auth/react", () => ({ useSession: () => SESSION.current }));
const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { PageHeader } from "@/components/page-header";

function renderHeader(path: string, role: string | undefined = "staff", extra: object = {}) {
  pathname.current = path;
  SESSION.current = { data: role ? { role, user: { email: "x@317atc.co.uk" }, ...extra } : null };
  return render(<PageHeader title="A page" />);
}

describe("the area tab row in PageHeader", () => {
  it("links every page of the area and marks this one", () => {
    renderHeader("/stores/badges/orders");
    const tabs = screen.getByRole("navigation", { name: "Orders" });
    expect(within(tabs).getByRole("link", { name: "Uniform" })).toHaveAttribute(
      "href",
      "/stores/uniform/orders"
    );
    expect(within(tabs).getByRole("link", { name: "Badges" })).toHaveAttribute("aria-current", "page");
  });

  it("still shows on a record below one of the pages", () => {
    renderHeader("/stores/uniform/stock/BOX-A");
    const tabs = screen.getByRole("navigation", { name: "Stock" });
    expect(within(tabs).getByRole("link", { name: "Uniform" })).toHaveAttribute("aria-current", "page");
  });

  it("shows nothing on a page that stands alone", () => {
    renderHeader("/stores/catalogue");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "A page" })).toBeInTheDocument();
  });

  it("only offers the tabs the role can open", () => {
    renderHeader("/assessments/radio", "nco");
    const tabs = screen.getByRole("navigation", { name: "Assessments" });
    const names = within(tabs)
      .getAllByRole("link")
      .map((l) => l.textContent);
    expect(names).toEqual(["Leadership", "Radio", "Space", "Results"]);
  });

  it("hides a row that would hold a single tab", () => {
    // An SNCO can mark an inspection but not see the history.
    renderHeader("/assessments/inspection", "snco");
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });

  it("keeps the OC's tabs to the OC", () => {
    renderHeader("/oc/leaving", "staff", { is_oc: true });
    expect(screen.getByRole("navigation", { name: "OC" })).toBeInTheDocument();
  });

  it("copes with no session yet", () => {
    renderHeader("/texts/messages", undefined);
    expect(screen.getByRole("heading", { name: "A page" })).toBeInTheDocument();
  });
});
