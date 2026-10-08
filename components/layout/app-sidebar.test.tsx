// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = vi.hoisted(() => ({
  current: { data: { role: "staff", user: { email: "staff@317atc.co.uk" } }, status: "authenticated" },
}));
vi.mock("next-auth/react", () => ({ useSession: () => SESSION.current, signOut: vi.fn() }));
const pathname = vi.hoisted(() => ({ current: "/cadets/overview" }));
vi.mock("next/navigation", () => ({
  usePathname: () => pathname.current,
  useRouter: () => ({ push: vi.fn() }),
}));

import { AppSidebar } from "@/components/layout/app-sidebar";
import { SidebarProvider } from "@/components/ui/sidebar";

const KEY = "sms.sidebar.sections";

function renderSidebar(path = "/cadets/overview") {
  pathname.current = path;
  return render(
    <SidebarProvider>
      <AppSidebar />
    </SidebarProvider>
  );
}

const heading = (name: string) => screen.getByRole("button", { name });

beforeEach(() => {
  window.matchMedia ??= (q: string) =>
    ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList;
  window.localStorage.clear();
});

describe("sidebar sections", () => {
  it("opens only the section holding the current page on a first visit", () => {
    renderSidebar("/stores/uniform/orders");
    expect(heading("Stores")).toHaveAttribute("aria-expanded", "true");
    expect(heading("Cadets")).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Audit" })).not.toBeInTheDocument();
    // Top-level links have no heading and are always there.
    expect(screen.getAllByRole("link", { name: "Dashboard" }).length).toBeGreaterThan(0);
  });

  it("opens and closes a section from its heading, and remembers it next time", async () => {
    const { unmount } = renderSidebar("/");
    await userEvent.click(heading("Comms"));
    expect(screen.getByRole("link", { name: "Parade Night Texts" })).toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({ Comms: true });
    unmount();

    renderSidebar("/");
    expect(heading("Comms")).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps the current section open even if it was closed on an earlier visit", () => {
    window.localStorage.setItem(KEY, JSON.stringify({ Cadets: false }));
    renderSidebar("/cadets/2100003");
    expect(heading("Cadets")).toHaveAttribute("aria-expanded", "true");
  });

  it("still lets the current section be closed", async () => {
    renderSidebar("/cadets/overview");
    await userEvent.click(heading("Cadets"));
    expect(heading("Cadets")).toHaveAttribute("aria-expanded", "false");
  });

  it("ignores unreadable storage rather than breaking the menu", async () => {
    window.localStorage.setItem(KEY, "{not json");
    renderSidebar("/cadets/overview");
    expect(heading("Cadets")).toHaveAttribute("aria-expanded", "true");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceeded");
    });
    await act(async () => heading("Stores").click());
    expect(heading("Stores")).toHaveAttribute("aria-expanded", "true");
  });

  it("only offers headings for sections the role can see", () => {
    SESSION.current = { data: { role: "nco", user: { email: "nco@317atc.co.uk" } }, status: "authenticated" };
    try {
      renderSidebar("/session-plans");
      expect(heading("NCO Team")).toHaveAttribute("aria-expanded", "true");
      expect(screen.queryByRole("button", { name: "Stores" })).not.toBeInTheDocument();
    } finally {
      SESSION.current = {
        data: { role: "staff", user: { email: "staff@317atc.co.uk" } },
        status: "authenticated",
      };
    }
  });
});
