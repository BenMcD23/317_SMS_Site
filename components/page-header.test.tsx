// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ path: "/", role: "staff" as string | undefined }));
vi.mock("next/navigation", () => ({ usePathname: () => state.path }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: state.role ? { role: state.role } : null }),
}));

import { PageHeader } from "@/components/page-header";

function renderAt(path: string, role?: string) {
  state.path = path;
  state.role = role;
  return render(<PageHeader title="A page" />);
}

describe("PageHeader on a phone", () => {
  it("links back to the section hub the bottom bar opened, and only on a phone", () => {
    renderAt("/stores/badges/orders", "staff");
    const back = screen.getByRole("link", { name: "Stores" });
    expect(back).toHaveAttribute("href", "/m/stores");
    expect(back).toHaveClass("md:hidden");
  });

  it("goes back to More for a section that isn't on the role's bar", () => {
    renderAt("/texts/recipients", "staff");
    expect(screen.getByRole("link", { name: "More" })).toHaveAttribute("href", "/m/more");
  });

  it("uses the role's own bar: an NCO's Parade Night", () => {
    renderAt("/assessments/radio", "nco");
    expect(screen.getByRole("link", { name: "Parade Night" })).toHaveAttribute("href", "/m/parade-night");
  });

  it.each(["/", "/m/stores", "/nowhere"])("has no back link on %s", (path) => {
    renderAt(path, "staff");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "A page" })).toBeInTheDocument();
  });
});
