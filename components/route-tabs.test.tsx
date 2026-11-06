// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { isTabActive, RouteTabs } from "@/components/route-tabs";

const path = vi.hoisted(() => ({ current: "/area/b" }));
vi.mock("next/navigation", () => ({ usePathname: () => path.current }));

describe("isTabActive", () => {
  it("matches the page and anything under it", () => {
    expect(isTabActive("/area/b", { label: "B", href: "/area/b" })).toBe(true);
    expect(isTabActive("/area/b/12", { label: "B", href: "/area/b" })).toBe(true);
    expect(isTabActive("/area/bc", { label: "B", href: "/area/b" })).toBe(false);
  });

  it("an exact tab (an area's index) only matches itself", () => {
    expect(isTabActive("/area", { label: "A", href: "/area", exact: true })).toBe(true);
    expect(isTabActive("/area/b", { label: "A", href: "/area", exact: true })).toBe(false);
  });
});

describe("RouteTabs", () => {
  it("is a named navigation of links, marking the current page", () => {
    path.current = "/area/b";
    render(
      <RouteTabs
        label="Area"
        tabs={[
          { label: "A", href: "/area", exact: true },
          { label: "B", href: "/area/b" },
        ]}
      />
    );
    expect(screen.getByRole("navigation", { name: "Area" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "B" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "A" })).not.toHaveAttribute("aria-current");
  });
});

describe("RouteTabs on a narrow screen", () => {
  it("scrolls the current tab into view", () => {
    path.current = "/area/b";
    const scrolled: string[] = [];
    const original = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (this: Element) {
      scrolled.push(this.textContent ?? "");
    };
    try {
      render(
        <RouteTabs
          label="Area"
          tabs={[
            { label: "A", href: "/area", exact: true },
            { label: "B", href: "/area/b" },
          ]}
        />
      );
    } finally {
      Element.prototype.scrollIntoView = original;
    }
    expect(scrolled).toEqual(["B"]);
  });
});
