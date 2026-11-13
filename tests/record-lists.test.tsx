// @vitest-environment jsdom
// The committee requests, session plans and appraisals lists: sortable
// tables whose rows open the record, so someone with a long list can bring
// what's waiting on them to the top.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import CommitteeRequestsPage from "@/app/committee/requests/page";
import SessionPlansPage from "@/app/session-plans/page";
import NcoAppraisalsPage from "@/app/nco-appraisals/page";
import type { AppraisalSummary } from "@/lib/nco-appraisals";
import type { CommitteeRequestSummary } from "@/lib/committee";
import type { SessionPlanSummary } from "@/lib/session-plans";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => "/" }));

const request = (over: Partial<CommitteeRequestSummary>): CommitteeRequestSummary => ({
  id: 1,
  reference: "CR-001",
  title: "Tent pegs",
  total: 12.5,
  status: "submitted",
  requester_name: "Sarah Hughes",
  requester_email: "s@example.com",
  created_at: "2026-10-01T10:00:00",
  receipt_count: 0,
  ...over,
});

const plan = (over: Partial<SessionPlanSummary>): SessionPlanSummary => ({
  id: 1,
  session_name: "Map reading",
  session_ic: "Sgt Ó Briain",
  session_date: "2026-11-20",
  status: "draft",
  author_name: "Cpl Ward",
  author_email: "w@example.com",
  created_at: null,
  updated_at: "2026-11-01T10:00:00",
  submitted_at: null,
  ...over,
});

function stubApi(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
    )
  );
}

async function show(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  });
}

const firstColumn = (table: HTMLElement) =>
  within(table)
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[0].textContent);

beforeEach(() => router.push.mockClear());

describe("committee requests list", () => {
  const requests = [
    request({ id: 1, reference: "CR-001", total: 12.5, status: "paid", created_at: "2026-09-01T10:00:00" }),
    request({
      id: 2,
      reference: "CR-002",
      total: 300,
      status: "submitted",
      created_at: "2026-11-01T10:00:00",
    }),
    request({ id: 3, reference: "CR-003", total: 45, status: "approved", created_at: "2026-10-01T10:00:00" }),
  ];

  it("lists the newest request first", async () => {
    stubApi({ requests, is_oc: true });
    await show(<CommitteeRequestsPage />);
    expect(firstColumn(await screen.findByRole("table", { name: "Committee requests" }))).toEqual([
      "CR-002",
      "CR-003",
      "CR-001",
    ]);
  });

  it("sorts by total and by where a request is in its life, not alphabetically", async () => {
    stubApi({ requests, is_oc: true });
    await show(<CommitteeRequestsPage />);
    const table = await screen.findByRole("table", { name: "Committee requests" });
    // Figures sort largest first: the biggest spend is what an OC looks for.
    fireEvent.click(within(table).getByRole("button", { name: "Total" }));
    expect(firstColumn(table)).toEqual(["CR-002", "CR-003", "CR-001"]);
    expect(within(table).getByRole("columnheader", { name: /Total/ })).toHaveAttribute(
      "aria-sort",
      "descending"
    );
    fireEvent.click(within(table).getByRole("button", { name: "Total" }));
    expect(firstColumn(table)).toEqual(["CR-001", "CR-003", "CR-002"]);
    // Status follows a request's life (Submitted → Approved → Paid), so
    // "Approved" lands between them rather than first alphabetically.
    fireEvent.click(within(table).getByRole("button", { name: "Status" }));
    expect(firstColumn(table)).toEqual(["CR-001", "CR-003", "CR-002"]);
    fireEvent.click(within(table).getByRole("button", { name: "Status" }));
    expect(firstColumn(table)).toEqual(["CR-002", "CR-003", "CR-001"]);
  });

  it("opens a request from anywhere on its row", async () => {
    stubApi({ requests, is_oc: true });
    await show(<CommitteeRequestsPage />);
    fireEvent.click(await screen.findByText("£300.00"));
    expect(router.push).toHaveBeenCalledWith("/committee/requests/2");
  });

  it("shows the empty state when there are no requests", async () => {
    stubApi({ requests: [], is_oc: false });
    await show(<CommitteeRequestsPage />);
    expect(await screen.findByText("No committee requests yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("an API error is an error, not an empty list", async () => {
    stubApi({ detail: "Boom" }, 500);
    await show(<CommitteeRequestsPage />);
    expect(await screen.findByText("Could not load requests")).toBeInTheDocument();
  });
});

describe("session plans list", () => {
  it("names an untitled plan and opens it from its row", async () => {
    stubApi({ plans: [plan({ id: 4, session_name: "" })], is_staff: false });
    await show(<SessionPlansPage />);
    const table = await screen.findByRole("table", { name: "Session plans" });
    expect(within(table).getByRole("link", { name: "Untitled plan" })).toHaveAttribute(
      "href",
      "/session-plans/4"
    );
    fireEvent.click(within(table).getByText("Sgt Ó Briain"));
    expect(router.push).toHaveBeenCalledWith("/session-plans/4");
  });

  it("sorts by session date, with an undated plan first", async () => {
    stubApi({
      plans: [
        plan({ id: 1, session_name: "Later", session_date: "2026-12-01" }),
        plan({ id: 2, session_name: "Undated", session_date: null }),
        plan({ id: 3, session_name: "Sooner", session_date: "2026-11-15" }),
      ],
      is_staff: false,
    });
    await show(<SessionPlansPage />);
    const table = await screen.findByRole("table", { name: "Session plans" });
    fireEvent.click(within(table).getByRole("button", { name: "Date" }));
    expect(firstColumn(table)).toEqual(["Undated", "Sooner", "Later"]);
  });
});

describe("all appraisals list", () => {
  const appraisal = (over: Partial<AppraisalSummary>): AppraisalSummary => ({
    id: 1,
    cadet_id: 1,
    nco_name: "Cpl Ward",
    rank: "CPL",
    appraisal_date: "2026-06-01",
    next_review_months: 6,
    next_review_date: "2026-12-01",
    cause_for_concern: false,
    extend_probation: false,
    author_name: "Sarah Hughes",
    emailed_at: null,
    emailed_to: null,
    created_at: null,
    updated_at: null,
    ...over,
  });
  const overview = (appraisals: AppraisalSummary[]) => ({
    ncos: [],
    appraisals,
    reminders: [],
    upcoming: [],
    unscheduled: [],
    next_review_options: [3, 6, 12],
    ai_available: false,
  });

  it("lists the latest first and brings flagged appraisals to the top on Flags", async () => {
    stubApi(
      overview([
        appraisal({ id: 1, nco_name: "Cpl Ward", appraisal_date: "2026-01-10" }),
        appraisal({
          id: 2,
          nco_name: "Sgt Ní Bhriain",
          appraisal_date: "2026-09-10",
          extend_probation: true,
        }),
        appraisal({ id: 3, nco_name: "Cpl Okafor", appraisal_date: "2026-05-10", cause_for_concern: true }),
      ])
    );
    await show(<NcoAppraisalsPage />);
    const table = await screen.findByRole("table", { name: "All appraisals" });
    expect(firstColumn(table)).toEqual(["Sgt Ní Bhriain", "Cpl Okafor", "Cpl Ward"]);
    fireEvent.click(within(table).getByRole("button", { name: "Flags" }));
    // Cause for concern above an extended probation above nothing.
    expect(firstColumn(table)).toEqual(["Cpl Okafor", "Sgt Ní Bhriain", "Cpl Ward"]);
    fireEvent.click(within(table).getAllByText("Not sent")[0]);
    expect(router.push).toHaveBeenCalledWith("/nco-appraisals/3");
  });

  it("shows the empty state instead of an empty table", async () => {
    stubApi(overview([]));
    await show(<NcoAppraisalsPage />);
    expect(await screen.findByText("No appraisals yet")).toBeInTheDocument();
    expect(screen.queryByRole("table", { name: "All appraisals" })).not.toBeInTheDocument();
  });
});
