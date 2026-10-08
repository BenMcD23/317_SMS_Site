// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CadetPortalTab } from "@/components/cadet-portal-tab";
import type { CadetPortalData } from "@/lib/vp-sync";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam Staff" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));

const NOTHING: CadetPortalData = {
  synced_at: null, whts: null, shooting_log: null, fieldcraft: null, classification: null,
  exams: null, flying: null, learning: null, unit_history: null,
};

function renderWith(body: unknown, status = 200) {
  const fetchMock = vi.fn<(url: string) => Promise<Response>>(async () => Response.json(body, { status }));
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CadetPortalTab cin="111" />
    </QueryClientProvider>
  );
  return fetchMock;
}

const card = (title: RegExp | string) => screen.getByText(title).closest("[data-slot=card]") as HTMLElement;

describe("cadet Portal tab", () => {
  it("asks the API for this cadet only", async () => {
    const fetchMock = renderWith(NOTHING);
    await screen.findByText(/Not synced from the Volunteer Portal/);
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/vp\/cadets\/111$/);
  });

  it("tells staff how to sync a cadet who never has been", async () => {
    renderWith(NOTHING);
    expect((await screen.findByRole("link", { name: "run the 317 Sync" })).getAttribute("href")).toBe("/tools/scraper");
  });

  it("separates 'the portal gave us nothing' from 'there's nothing to show'", async () => {
    renderWith({ ...NOTHING, synced_at: "2026-10-08T19:50:33", whts: null, learning: [] });
    await screen.findByText(/Synced from the Volunteer Portal/);
    expect(within(card("Weapon handling tests")).getByText(/Not synced/)).toBeTruthy();
    expect(within(card("E-learning")).getByText("None recorded.")).toBeTruthy();
  });

  it("shows exams, flying totals and fieldcraft by level", async () => {
    renderWith({
      ...NOTHING,
      synced_at: "2026-10-08T19:50:33",
      exams: {
        enrolments: [{ course: "Air Navigation", classification: "Senior", enrolled_on: "2026-09-30" }],
        results: [{ course: "Airmanship Exam", classification: "Leading", status: "completed", date: "2025-05-09" }],
      },
      flying: [
        { date: "2026-05-01", activity: "powered", aircraft: "Tutor", sortie: "1", unit: "", minutes: 25 },
        { date: "2026-04-01", activity: "gliding", aircraft: "Viking", sortie: "", unit: "", minutes: null },
      ],
      fieldcraft: [
        { level: "Blue", reference: "", title: "Camouflage", date: "2026-02-01", delivered_by: "" },
        { level: "Blue", reference: "", title: "Shelters", date: "2026-02-02", delivered_by: "" },
      ],
    });
    await screen.findByText("Classification exams");
    const exams = card("Classification exams");
    expect(within(exams).getByText("Passed")).toBeTruthy();
    expect(within(exams).getByText("Enrolled")).toBeTruthy();
    expect(screen.getByText("Flying · 2 sorties, 25m")).toBeTruthy();
    expect(within(card("Fieldcraft lessons")).getByText("2 lessons")).toBeTruthy();
  });

  it("doesn't list an exam twice once its result is in", async () => {
    renderWith({
      ...NOTHING,
      synced_at: "2026-10-08T19:50:33",
      exams: {
        enrolments: [{ course: "Rocketry", classification: "Senior", enrolled_on: "2026-09-30" }],
        results: [{ course: "Rocketry Exam", classification: "Senior", status: "in_progress", date: null }],
      },
    });
    await screen.findByText("Rocketry Exam");
    expect(screen.queryByText("Rocketry")).toBeNull();
  });

  it("shows the API's error rather than a blank tab", async () => {
    renderWith({ detail: "Cadet not found" }, 404);
    expect(await screen.findByText(/Cadet not found/)).toBeTruthy();
  });
});
