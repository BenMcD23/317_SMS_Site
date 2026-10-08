// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import VolunteerPortalPage from "@/app/volunteer-portal/page";
import type { PortalOverview, PortalOverviewRow } from "@/lib/vp-sync";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam Staff" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));

const BLANK: PortalOverviewRow = {
  cin: 0, name: "", rank: null, flight: null, synced_at: null, whts: null, shooting: null,
  fieldcraft: null, exams: null, flying: null, learning: null, joined: null, classification: null,
};

const ZOE: PortalOverviewRow = {
  ...BLANK,
  cin: 111,
  name: "Zoë Ó Briain",
  flight: "A Flight",
  synced_at: "2026-10-08T19:50:33",
  whts: { L98A2: { state: "expired", expires: "2026-01-01" }, "Air Rifle": { state: "expiring", expires: "2026-11-01" } },
  shooting: { shoots: 2, last: "2026-03-01" },
  fieldcraft: { Blue: 4, Bronze: 0, Silver: 0, Gold: 0 },
  exams: { enrolled: 1, completed: 2, in_progress: 1 },
  flying: { sorties: 3, minutes: 75, last: "2026-05-01" },
  learning: { complete: 5, total: 7 },
  joined: "2024-03-27",
  classification: [{ name: "Leading Cadet", date: "2025-07-16" }],
};
// Synced, but the portal refused WHTs and flying for this login.
const PARTIAL: PortalOverviewRow = { ...BLANK, cin: 222, name: "Partial Cadet", synced_at: "2026-10-08T19:50:33" };
const NEVER: PortalOverviewRow = { ...BLANK, cin: 333, name: "Never Synced" };

function renderWith(body: unknown, status = 200) {
  vi.stubGlobal("fetch", vi.fn(async () => Response.json(body, { status })));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <VolunteerPortalPage />
    </QueryClientProvider>
  );
}

const OVERVIEW: PortalOverview = {
  weapons: ["Air Rifle", "L98A2"],
  last_synced: "2026-10-08T19:50:33",
  cadets: [ZOE, PARTIAL, NEVER],
};

describe("Volunteer Portal dashboard", () => {
  it("headlines expired and expiring WHTs across the squadron", async () => {
    renderWith(OVERVIEW);
    const expired = await screen.findByText("WHTs expired");
    expect(expired.nextElementSibling?.textContent).toBe("1");
    expect(screen.getByText("WHTs expiring ≤90 days").nextElementSibling?.textContent).toBe("1");
  });

  it("shows a dash, not a false all-clear, when no cadet's WHTs synced", async () => {
    renderWith({ ...OVERVIEW, weapons: [], cadets: [PARTIAL] });
    expect((await screen.findByText("WHTs expired")).nextElementSibling?.textContent).toBe("—");
    expect(screen.getByText("Flown in last year").nextElementSibling?.textContent).toBe("—");
  });

  it("lists only synced cadets, and says 'not synced' where the portal gave nothing", async () => {
    renderWith(OVERVIEW);
    await screen.findByRole("link", { name: "Zoë Ó Briain" });
    expect(screen.queryByText("Never Synced")).toBeNull();
    const partial = screen.getByRole("link", { name: "Partial Cadet" }).closest("tr")!;
    expect(within(partial).getAllByText("not synced").length).toBeGreaterThan(0);
  });

  it("links each cadet to their Portal tab", async () => {
    renderWith(OVERVIEW);
    const link = await screen.findByRole("link", { name: "Zoë Ó Briain" });
    expect(link.getAttribute("href")).toBe("/cadets/111?tab=portal");
  });

  it("shows flying time and the classification dates on their tabs", async () => {
    renderWith(OVERVIEW);
    await userEvent.click(await screen.findByRole("tab", { name: "Flying" }));
    expect(screen.getByText("1h 15m")).toBeTruthy();
    await userEvent.click(screen.getByRole("tab", { name: "Service" }));
    expect(screen.getByText("16 Jul 2025")).toBeTruthy();
  });

  it("explains how to sync when nothing has been synced", async () => {
    renderWith({ weapons: [], last_synced: null, cadets: [NEVER] });
    expect(await screen.findByText("Nothing synced yet")).toBeTruthy();
  });

  it("shows the API's error instead of an empty page", async () => {
    renderWith({ detail: "Staff access required" }, 403);
    expect(await screen.findByText(/Staff access required/)).toBeTruthy();
  });
});
