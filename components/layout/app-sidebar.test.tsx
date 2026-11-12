// @vitest-environment jsdom
import { act, render, screen, within } from "@testing-library/react";
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
import { resetQuickPagesForTest } from "@/lib/quick-pages";

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
  resetQuickPagesForTest();
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

describe("pinned pages", () => {
  const PINS = "sms.mobile.pins";
  const pinnedList = () => screen.queryByRole("group", { name: "Pinned" });

  it("lists the pins at the top, without Home, which is already the first row", () => {
    window.localStorage.setItem(PINS, JSON.stringify(["/", "/stores/badges/orders", "/texts/messages"]));
    renderSidebar("/texts/messages");
    const list = pinnedList()!;
    expect(
      within(list)
        .getAllByRole("link")
        .map((l) => l.getAttribute("href"))
    ).toEqual(["/stores/badges/orders", "/texts/messages"]);
    // Lit on its own page, however the sections are folded.
    expect(within(list).getByRole("link", { name: "Parade Night Texts" })).toHaveAttribute(
      "data-active",
      "true"
    );
  });

  it("shows nothing when only Home is pinned, or nothing is", () => {
    window.localStorage.setItem(PINS, JSON.stringify(["/"]));
    renderSidebar();
    expect(pinnedList()).not.toBeInTheDocument();
  });

  it("pins a page from its row and unpins it from the Pinned list", async () => {
    window.localStorage.setItem(PINS, JSON.stringify(["/"]));
    renderSidebar("/stores/uniform/orders");
    await userEvent.click(screen.getByRole("button", { name: "Pin Uniform Orders" }));
    const list = pinnedList()!;
    expect(within(list).getByRole("link", { name: "Uniform Orders" })).toHaveAttribute(
      "href",
      "/stores/uniform/orders"
    );
    expect(JSON.parse(window.localStorage.getItem(PINS)!)).toEqual(["/", "/stores/uniform/orders"]);
    await userEvent.click(within(list).getByRole("button", { name: "Unpin Uniform Orders" }));
    expect(pinnedList()).not.toBeInTheDocument();
  });

  it("says which rows are pinned, and takes as many as you like", async () => {
    renderSidebar("/stores/uniform/orders");
    // The staff defaults are four; a fifth and sixth go on the end.
    expect(screen.getAllByRole("button", { name: "Unpin Dashboard" })[0]).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    await userEvent.click(screen.getByRole("button", { name: "Pin Uniform Orders" }));
    await userEvent.click(screen.getByRole("button", { name: "Pin Uniform Insights" }));
    expect(JSON.parse(window.localStorage.getItem(PINS)!)).toHaveLength(6);
    expect(within(pinnedList()!).getByRole("link", { name: "Insights" })).toBeInTheDocument();
  });

  it("never shows an NCO a staff page pinned on a shared computer", () => {
    window.localStorage.setItem(PINS, JSON.stringify(["/stores/uniform/orders", "/session-plans"]));
    SESSION.current = { data: { role: "nco", user: { email: "nco@317atc.co.uk" } }, status: "authenticated" };
    try {
      renderSidebar("/session-plans");
      const list = pinnedList()!;
      expect(
        within(list)
          .getAllByRole("link")
          .map((l) => l.getAttribute("href"))
      ).toEqual(["/session-plans"]);
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
