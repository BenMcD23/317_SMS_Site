// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// One stable object, like the real hook; `role` is swapped per test.
const SESSION = { data: { id_token: "tok", role: "nco", user: { email: "n@x" } }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ date: "2026-11-25" }),
}));

import ParadeReportsPage from "@/app/attendance/reports/page";
import ParadeReportPage from "@/app/attendance/reports/[date]/page";
import { renderWithQuery } from "@/tests/render-with-query";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function stub(answer: (url: string) => Response) {
  const fetch = vi.fn(async (url: string) => answer(url));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const SUMMARY = {
  date: "2026-11-25",
  generatedAt: "2026-11-25T22:10:00",
  generatedBy: "schedule",
  emailedAt: "2026-11-25T22:11:00",
  counts: { present: 18, authorised: 2, absent: 3 },
};

const REPORT = {
  ...SUMMARY,
  counts: { present: 1, authorised: 1, absent: 2 },
  emailedTo: null,
  cadets: [
    { cin: 2, name: "Bob Brown", rank: "Cadet", flight: "B", status: "Absent", state: "absent" },
    { cin: 5, name: "Eve Evans", rank: "Cadet", flight: "C", status: "Absent", state: "absent" },
    {
      cin: 3,
      name: "Cat Cole",
      rank: "Cadet",
      flight: "C",
      status: "Authorised Absence",
      state: "authorised",
    },
    {
      cin: 1,
      name: "Ann Able",
      rank: "Cpl",
      flight: "A",
      status: "Present Correctly Dressed",
      state: "present",
    },
  ],
};

describe("Parade reports list", () => {
  it("lists each night with its absences and links to the report", async () => {
    stub(() => json({ canManage: false, onList: true, reports: [SUMMARY] }));
    renderWithQuery(<ParadeReportsPage />);
    const link = await screen.findByRole("link", { name: "Wednesday 25 Nov 2026" });
    expect(link).toHaveAttribute("href", "/attendance/reports/2026-11-25");
    const row = link.closest("tr")!;
    expect(within(row).getByText("3")).toBeInTheDocument(); // absent
    expect(within(row).getByText("78%")).toBeInTheDocument(); // 18 of 23
  });

  it("an NCO on the list can't reach the settings", async () => {
    stub(() => json({ canManage: false, onList: true, reports: [SUMMARY] }));
    renderWithQuery(<ParadeReportsPage />);
    await screen.findByRole("link", { name: "Wednesday 25 Nov 2026" });
    expect(screen.queryByRole("link", { name: /Manage/ })).not.toBeInTheDocument();
  });

  it("staff get a way to manage the list", async () => {
    stub(() => json({ canManage: true, onList: true, reports: [] }));
    renderWithQuery(<ParadeReportsPage />);
    expect(await screen.findByRole("link", { name: /Manage/ })).toHaveAttribute(
      "href",
      "/attendance/reports/settings"
    );
    expect(screen.getByText("No reports yet")).toBeInTheDocument();
  });

  it("an NCO not on the list is told who to ask, not shown an error or 'no reports yet'", async () => {
    stub(() => json({ canManage: false, onList: false, reports: [] }));
    renderWithQuery(<ParadeReportsPage />);
    expect(await screen.findByText("You're not on the parade report list")).toBeInTheDocument();
    expect(screen.queryByText("No reports yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Could not load parade reports")).not.toBeInTheDocument();
  });

  it("a refusal from the API still shows its reason", async () => {
    stub(() => json({ detail: "Staff or NCO access required" }, 403));
    renderWithQuery(<ParadeReportsPage />);
    expect(await screen.findByText("Staff or NCO access required")).toBeInTheDocument();
  });

  it("an unreachable API is an error, not an empty list", async () => {
    stub(() => json({ error: "API unreachable" }, 503));
    renderWithQuery(<ParadeReportsPage />);
    expect(await screen.findByText("Could not load parade reports")).toBeInTheDocument();
  });
});

describe("One parade report", () => {
  it("splits the register into absent, authorised and present with each cadet's Bader status", async () => {
    const fetch = stub(() => json(REPORT));
    renderWithQuery(<ParadeReportPage />);
    const absent = await screen.findByRole("region", { name: "Absent" });
    expect(within(absent).getByRole("heading", { name: "Absent (2)" })).toBeInTheDocument();
    expect(within(absent).getByText("Bob Brown")).toBeInTheDocument();
    expect(within(absent).getByText("Eve Evans")).toBeInTheDocument();
    expect(within(absent).queryByText("Cat Cole")).not.toBeInTheDocument();

    const authorised = screen.getByRole("region", { name: "Authorised absence" });
    expect(within(authorised).getByText("Cat Cole")).toBeInTheDocument();
    expect(within(authorised).getByText("Authorised Absence")).toBeInTheDocument();

    const present = screen.getByRole("region", { name: "Present" });
    expect(within(present).getByText("Ann Able")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/parade-reports/2026-11-25", expect.anything());
  });

  it("a section with no one in it says so", async () => {
    stub(() => json({ ...REPORT, cadets: REPORT.cadets.filter((c) => c.state !== "authorised") }));
    renderWithQuery(<ParadeReportPage />);
    const authorised = await screen.findByRole("region", { name: "Authorised absence" });
    expect(within(authorised).getByText("No one.")).toBeInTheDocument();
  });

  it("says when the report wasn't emailed", async () => {
    stub(() => json({ ...REPORT, emailedAt: null, generatedBy: "staff@x" }));
    renderWithQuery(<ParadeReportPage />);
    expect(await screen.findByText(/Built by hand, not emailed/)).toBeInTheDocument();
  });

  it("a night with no report shows the API's reason", async () => {
    stub(() => json({ detail: "No report for that night" }, 404));
    renderWithQuery(<ParadeReportPage />);
    expect(await screen.findByText("No report for that night")).toBeInTheDocument();
  });
});
