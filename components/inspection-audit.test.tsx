// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { InspectionAuditTab, type Audit } from "@/components/inspection-audit";

const SESSION = { data: { id_token: "tok", role: "staff" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));

const SUMMARY = {
  sheets: 6,
  cadets: 40,
  present: 200,
  absent: 20,
  awol: 3,
  attendance_pct: 90.9,
  score_avg: 7.2,
  faults: 80,
  faults_per_cadet: 0.4,
  positives: 12,
};

const AUDIT: Audit = {
  scope: "squadron",
  subject: "Squadron",
  dates: ["2026-08-03", "2026-10-05"],
  summary: SUMMARY,
  baseline: null,
  faults: [
    {
      region: "Shoes",
      occurrences: 30,
      cadets: 14,
      share_pct: 35,
      persistent_cadets: 6,
      texts: [
        { text: "not bulled", count: 9 },
        { text: "dull toecaps", count: 1 },
      ],
      uniforms: { blues: 30 },
      earlier_pct: 8,
      recent_pct: 22,
      trend: "worse",
    },
    {
      region: "Beret / Headdress",
      occurrences: 10,
      cadets: 9,
      share_pct: 22.5,
      persistent_cadets: 0,
      texts: [],
      uniforms: { blues: 10 },
      earlier_pct: null,
      recent_pct: null,
      trend: null,
    },
  ],
  positives: [{ region: "Trousers", count: 4 }],
  flights: [{ ...SUMMARY, flight: "B", score_avg: 6.1, top_fault: "Shoes" }],
  cadets_to_watch: [
    {
      cin: 9,
      name: "Ben Baker",
      flight: "B",
      score_avg: 4.5,
      present: 5,
      awol: 1,
      attendance_pct: 83,
      top_faults: ["Shoes"],
    },
  ],
  markers: [],
  notes: ["Average scores differ by 2.0 between inspectors."],
};

const SHEETS = [
  { id: 12, date: "2026-10-05", uniform: "mtp" },
  { id: 11, date: "2026-09-28", uniform: "blues" },
];
const CADETS = [
  { cin: 1, flight: "A" },
  { cin: 2, flight: "B" },
];

type Reply = [unknown, number?];
type Handler = (url: URL, init?: RequestInit) => Reply;

function stubApi(audit: Handler, write?: Handler) {
  const fetch = vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    let reply: Reply = [{ detail: "not stubbed" }, 404];
    if (url.pathname === "/inspections/sheets") reply = [SHEETS];
    else if (url.pathname === "/cadets") reply = [CADETS];
    else if (url.pathname === "/inspections/audit" && init?.method === "POST") reply = write!(url, init);
    else if (url.pathname === "/inspections/audit") reply = audit(url, init);
    const [body, status = 200] = reply;
    return new Response(JSON.stringify(body), { status });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const auditCalls = (fetch: ReturnType<typeof stubApi>) =>
  fetch.mock.calls
    .map(([u, init]) => ({ url: new URL(u as string), init: init as RequestInit | undefined }))
    .filter(({ url }) => url.pathname === "/inspections/audit");

function renderTab() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <InspectionAuditTab />
    </QueryClientProvider>
  );
}

describe("InspectionAuditTab", () => {
  beforeEach(() => {
    // Radix Select relies on pointer-capture and scrolling APIs jsdom lacks.
    Element.prototype.hasPointerCapture = vi.fn(() => false);
    Element.prototype.releasePointerCapture = vi.fn();
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("opens on a squadron audit of every inspection, figures only, without spending an AI call", async () => {
    const fetch = stubApi(() => [AUDIT]);
    renderTab();

    await screen.findByRole("heading", { name: "Squadron" });
    const [call] = auditCalls(fetch);
    expect(call.url.search).toBe("?scope=squadron");
    expect(call.init?.method).toBeUndefined();

    const faultRows = within(screen.getAllByRole("table")[0]).getAllByRole("row").slice(1);
    expect(faultRows.map((r) => r.textContent)).toEqual([
      "Shoes14 (35%)6Worsenot bulled ×9 · dull toecaps",
      "Beret / Headdress9 (23%)0——",
    ]);
    expect(screen.getByText("B Flight")).toBeInTheDocument();
    expect(screen.getByText("Ben Baker")).toBeInTheDocument();
    expect(screen.getByText("Average scores differ by 2.0 between inspectors.")).toBeInTheDocument();
    expect(screen.getByText("Trousers ×4")).toBeInTheDocument();
    expect(screen.getByText(/names aren't sent to it/)).toBeInTheDocument();
  });

  it("asks for a flight before auditing one, then audits the one picked against the squadron", async () => {
    const fetch = stubApi((url) => [
      url.searchParams.get("scope") === "squadron"
        ? AUDIT
        : {
            ...AUDIT,
            scope: "flight",
            subject: `${url.searchParams.get("flight")} Flight`,
            flights: [],
            baseline: { ...SUMMARY, label: "Squadron, same nights", score_avg: 7.9 },
          },
    ]);
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole("heading", { name: "Squadron" });

    await user.click(screen.getByRole("radio", { name: "Flight" }));
    expect(screen.getByText("Pick a flight")).toBeInTheDocument();
    const before = auditCalls(fetch).length;

    await user.click(await screen.findByRole("radio", { name: "B Flight" }));
    await screen.findByRole("heading", { name: "B Flight" });
    expect(auditCalls(fetch).length).toBe(before + 1);
    expect(auditCalls(fetch).at(-1)!.url.search).toBe("?scope=flight&flight=B");
    expect(screen.getByText("Squadron 7.9")).toBeInTheDocument();
  });

  it("audits one inspection, or a recent period, when chosen", async () => {
    const fetch = stubApi(() => [AUDIT]);
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole("heading", { name: "Squadron" });

    await user.click(screen.getByRole("combobox", { name: "Inspections" }));
    await user.click(await screen.findByRole("option", { name: "5 Oct 2026 · MTP" }));
    await waitFor(() => expect(auditCalls(fetch).at(-1)!.url.searchParams.get("sheet_id")).toBe("12"));

    await user.click(screen.getByRole("combobox", { name: "Inspections" }));
    await user.click(await screen.findByRole("option", { name: "Last 3 months" }));
    await waitFor(() =>
      expect(auditCalls(fetch).at(-1)!.url.searchParams.get("since")).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    );
    expect(auditCalls(fetch).at(-1)!.url.searchParams.has("sheet_id")).toBe(false);
  });

  it("asks the AI for the selection on screen and shows its priorities", async () => {
    const fetch = stubApi(
      () => [AUDIT],
      () => [
        { ...AUDIT, analysis: "### Top priorities\n1. **Shoes** in B Flight", model: "m", ai_error: null },
      ]
    );
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole("heading", { name: "Squadron" });

    await user.click(screen.getByRole("button", { name: "Ask the AI" }));
    await screen.findByRole("heading", { name: "Top priorities" });
    const post = auditCalls(fetch).find((c) => c.init?.method === "POST")!;
    expect(JSON.parse(post.init!.body as string)).toEqual({ scope: "squadron" });
    expect(screen.getByRole("button", { name: "Rewrite" })).toBeInTheDocument();
  });

  it("a new selection hides the write-up made for the old one", async () => {
    stubApi(
      () => [AUDIT],
      () => [{ ...AUDIT, analysis: "### Top priorities", model: "m", ai_error: null }]
    );
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole("heading", { name: "Squadron" });
    await user.click(screen.getByRole("button", { name: "Ask the AI" }));
    await screen.findByRole("heading", { name: "Top priorities" });

    await user.click(screen.getByRole("combobox", { name: "Inspections" }));
    await user.click(await screen.findByRole("option", { name: "Last 6 months" }));
    await waitFor(() =>
      expect(screen.queryByRole("heading", { name: "Top priorities" })).not.toBeInTheDocument()
    );
    expect(screen.getByRole("button", { name: "Ask the AI" })).toBeInTheDocument();
  });

  it("keeps the figures and says so when the AI is down", async () => {
    stubApi(
      () => [AUDIT],
      () => [
        { ...AUDIT, analysis: null, model: null, ai_error: "The AI couldn't write this audit right now." },
      ]
    );
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole("heading", { name: "Squadron" });
    await user.click(screen.getByRole("button", { name: "Ask the AI" }));
    await screen.findByText("The AI couldn't write this audit right now.");
    expect(screen.getByText("Ben Baker")).toBeInTheDocument();
  });

  it("shows the API's reason when the write-up request itself fails", async () => {
    stubApi(
      () => [AUDIT],
      () => [{ detail: [{ msg: "Value error, Pick a cadet to audit" }] }, 422]
    );
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole("heading", { name: "Squadron" });
    await user.click(screen.getByRole("button", { name: "Ask the AI" }));
    await screen.findByText("Value error, Pick a cadet to audit");
  });

  it("an audit with nothing recorded shows the reason instead of crashing", async () => {
    stubApi(() => [{ detail: "No inspections recorded for that selection" }, 404]);
    renderTab();
    await screen.findByText("No inspections recorded for that selection");
    expect(screen.getByText("Couldn't run the audit")).toBeInTheDocument();
  });

  it("a 500 from the API shows an error, not a blank tab", async () => {
    stubApi(() => [{ detail: "Internal Server Error" }, 500]);
    renderTab();
    await screen.findByText("Couldn't run the audit");
  });

  it("an empty audit says no faults were logged and hides the empty sections", async () => {
    stubApi(() => [
      {
        ...AUDIT,
        faults: [],
        positives: [],
        flights: [],
        cadets_to_watch: [],
        notes: [],
        dates: ["2026-10-05"],
      },
    ]);
    renderTab();
    await screen.findByText("No faults logged.");
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Lowest average scores")).not.toBeInTheDocument();
  });
});
