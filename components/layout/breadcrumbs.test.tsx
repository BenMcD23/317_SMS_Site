// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

import { HeaderBreadcrumbs } from "@/components/layout/breadcrumbs";

function trail(path: string) {
  pathname.current = path;
  return render(<HeaderBreadcrumbs />);
}

describe("HeaderBreadcrumbs", () => {
  it("hides every separator on small screens, so the page name never trails a lone '›'", () => {
    const { container } = trail("/stores/uniform/orders");
    const separators = container.querySelectorAll('[data-slot="breadcrumb-separator"]');
    expect(separators).toHaveLength(2);
    for (const sep of separators) expect(sep.className).toContain("hidden md:flex");
    // The page itself is never hidden.
    expect(screen.getByText("Orders").closest("li")?.className ?? "").not.toContain("hidden");
  });

  it("links a cadet record back to the cadet list", () => {
    trail("/cadets/2100003");
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute("href", "/cadets/overview");
  });

  it("renders nothing for a page the site map doesn't know", () => {
    const { container } = trail("/nowhere");
    expect(container).toBeEmptyDOMElement();
  });
});
