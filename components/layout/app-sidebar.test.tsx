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
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";

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
  it("opens every section on a first visit, so nothing is hidden behind a heading", () => {
    renderSidebar("/stores/uniform/orders");
    expect(heading("Stores")).toHaveAttribute("aria-expanded", "true");
    expect(heading("Cadets")).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Audit" })).toBeInTheDocument();
    // Top-level links have no heading and are always there.
    expect(screen.getAllByRole("link", { name: "Home" }).length).toBeGreaterThan(0);
  });

  it("unfolds the area you're in to show its pages, with this one lit", () => {
    renderSidebar("/stores/badges/orders");
    const orders = screen.getByRole("button", { name: "Orders" });
    expect(orders).toHaveAttribute("aria-expanded", "true");
    expect(orders).toHaveAttribute("data-active", "true");
    const pages = screen.getByRole("link", { name: "Badges" });
    expect(pages).toHaveAttribute("href", "/stores/badges/orders");
    expect(pages).toHaveAttribute("data-active", "true");
    expect(screen.getByRole("link", { name: "Uniform" })).toHaveAttribute("data-active", "false");
  });

  it("keeps other areas folded to one line, and opens one by hand", async () => {
    renderSidebar("/stores/badges/orders");
    const texts = screen.getByRole("button", { name: "Texts" });
    expect(texts).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("link", { name: "Recipients" })).not.toBeInTheDocument();
    await userEvent.click(texts);
    expect(screen.getByRole("link", { name: "Recipients" })).toHaveAttribute("href", "/texts/recipients");
  });

  it("folds and unfolds a section from its heading, and remembers it next time", async () => {
    const { unmount } = renderSidebar("/");
    await userEvent.click(heading("Comms"));
    expect(screen.queryByRole("button", { name: "Texts" })).not.toBeInTheDocument();
    expect(JSON.parse(window.localStorage.getItem(KEY)!)).toEqual({ Comms: false });
    unmount();

    renderSidebar("/");
    expect(heading("Comms")).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(heading("Comms"));
    expect(screen.getByRole("button", { name: "Texts" })).toBeInTheDocument();
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
    expect(heading("Stores")).toHaveAttribute("aria-expanded", "false");
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

describe("on a phone", () => {
  it("Settings in the account menu closes the sidebar sheet, like every other link", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: true,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }));
    vi.stubGlobal(
      "ResizeObserver",
      class {
        observe() {}
        unobserve() {}
        disconnect() {}
      }
    );
    pathname.current = "/";
    function OpenSheet() {
      const { openMobile, setOpenMobile } = useSidebar();
      return (
        <button type="button" onClick={() => setOpenMobile(true)}>
          {openMobile ? "sheet open" : "sheet closed"}
        </button>
      );
    }
    render(
      <SidebarProvider>
        <OpenSheet />
        <AppSidebar />
      </SidebarProvider>
    );
    await userEvent.click(screen.getByRole("button", { name: "sheet closed" }));
    await userEvent.click(screen.getByRole("button", { name: /Signed out|staff/i }));
    await userEvent.click(await screen.findByRole("menuitem", { name: "Settings" }));
    expect(screen.getByRole("button", { name: "sheet closed" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});
