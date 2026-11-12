// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OWNER_EMAIL } from "@/lib/config";

const state = vi.hoisted(() => ({
  section: "stores" as string | undefined,
  session: { data: { role: "staff", user: { email: "s@317atc.co.uk" } } as object | null },
}));
vi.mock("next/navigation", () => ({
  usePathname: () => `/m/${state.section}`,
  useParams: () => ({ section: state.section }),
}));
vi.mock("next-auth/react", () => ({ useSession: () => state.session }));

import SectionHubPage from "@/app/m/[section]/page";

function renderHub(section: string | undefined, role: string | null, extra: object = {}) {
  state.section = section;
  state.session = { data: role ? { role, user: { email: "s@317atc.co.uk" }, ...extra } : null };
  return render(<SectionHubPage />);
}

const linkNames = (el: HTMLElement) =>
  within(el)
    .getAllByRole("link")
    .map((l) => [l.textContent, l.getAttribute("href")]);

describe("a section hub", () => {
  it("lists every page in the section, an area's pages under its name", () => {
    renderHub("stores", "staff");
    expect(screen.getByRole("heading", { level: 1, name: "Stores" })).toBeInTheDocument();
    expect(linkNames(screen.getByRole("list", { name: "Uniform" }))).toEqual([
      ["Stock", "/stores/uniform/stock"],
      ["Orders", "/stores/uniform/orders"],
      ["Insights", "/stores/uniform/insights"],
    ]);
    expect(linkNames(screen.getByRole("list", { name: "Badges" }))).toEqual([
      ["Stock", "/stores/badges/stock"],
      ["Orders", "/stores/badges/orders"],
    ]);
    expect(screen.getByRole("link", { name: "Catalogue" })).toHaveAttribute("href", "/stores/catalogue");
  });

  it("lists only what the role can open", () => {
    renderHub("parade-night", "nco");
    const names = screen.getAllByRole("link").map((l) => l.textContent);
    expect(names).toContain("Check-in");
    expect(names).toContain("Results");
    // Staff only, or SNCO and up.
    expect(names).not.toContain("Tonight");
    expect(names).not.toContain("MOI");
    expect(names).not.toContain("Mark");
  });

  it("shows an SNCO the inspection sheet but not its staff-only history", () => {
    renderHub("parade-night", "snco");
    expect(linkNames(screen.getByRole("list", { name: "Inspections" }))).toEqual([
      ["Mark", "/assessments/inspection"],
    ]);
  });

  it.each([
    ["an unknown section", "nowhere", "staff"],
    ["a section the role can't see", "stores", "nco"],
    ["no section at all", undefined, "staff"],
  ])("says there's nothing here for %s, with the way home", (_, section, role) => {
    renderHub(section, role);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go home" })).toHaveAttribute("href", "/");
  });
});

describe("More", () => {
  it("lists the sections not on the bar, each named, and Settings, but not Home", () => {
    renderHub("more", "staff");
    expect(screen.getByRole("heading", { level: 1, name: "More" })).toBeInTheDocument();
    for (const name of ["NCO Team", "Comms", "Admin", "Account"])
      expect(screen.getByRole("heading", { level: 2, name })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Stats" })).toHaveAttribute("href", "/stats");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings");
    expect(screen.queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
    // Stores is on staff's bar, so not here.
    expect(screen.queryByRole("region", { name: "Stores" })).not.toBeInTheDocument();
  });

  it("keeps owner and OC pages to the owner and the OC", () => {
    renderHub("more", "staff");
    expect(screen.queryByRole("link", { name: "Backups" })).not.toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "OC" })).not.toBeInTheDocument();
  });

  it("gives the owner Backups and the OC their area", () => {
    state.section = "more";
    state.session = { data: { role: "staff", user: { email: OWNER_EMAIL }, is_oc: true } };
    render(<SectionHubPage />);
    expect(screen.getByRole("link", { name: "Backups" })).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "OC" })).toBeInTheDocument();
  });

  it("before the session loads, still offers Settings rather than nothing", () => {
    renderHub("more", null);
    expect(screen.getByRole("link", { name: "Settings" })).toBeInTheDocument();
  });
});
