// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok", role: "staff" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import AuditPage from "@/app/cadets/audit/page";

afterEach(() => window.localStorage.clear());

async function show() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { status: 200 }))
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <AuditPage />
      </QueryClientProvider>
    );
  });
}

describe("audit: medical and dietary", () => {
  it("offers allergies and dietary requirements normally", async () => {
    await show();
    expect(screen.getByRole("checkbox", { name: "Include allergies / medical" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Include dietary requirements" })).toBeInTheDocument();
  });

  it("doesn't offer them at all while personal data is hidden", async () => {
    window.localStorage.setItem("sms.privacy.hide", "1");
    await show();
    expect(await screen.findByRole("heading", { name: "Audit" })).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: /allergies|dietary/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/Medical & Dietary|medical, and dietary/)).not.toBeInTheDocument();
  });
});

describe("audit: weapon handling tests", () => {
  const CADETS = [
    { cin: 1, first_name: "Amy", last_name: "Able", rank: null, flight: "A", classification: null },
    { cin: 2, first_name: "Bob", last_name: "Brown", rank: null, flight: "A", classification: null },
    { cin: 3, first_name: "Cat", last_name: "Cole", rank: null, flight: "A", classification: null },
  ];
  const CATALOG = [
    { key: "first_aid", name: "First Aid", kind: "leveled", levels: ["gold"] },
    { key: "wht:L98A2", name: "L98A2", kind: "wht", levels: ["current", "expired"] },
    {
      key: "wht:Scorpion (single shot)",
      name: "Scorpion (single shot)",
      kind: "wht",
      levels: ["current", "expired"],
    },
  ];
  function wht(level: string | null, expires: string | null = "2027-01-10") {
    return {
      qual_type: "wht:L98A2",
      display_name: "L98A2 WHT",
      kind: "wht",
      level,
      has: level !== null,
      date_achieved: level ? "2026-07-10" : null,
      date_expires: level ? expires : null,
      awarded_by: level ? "Doherty, S Flt Lt" : null,
    };
  }
  const RESULTS = [
    { ...CADETS[0], qualifications_check: [wht("current")] },
    { ...CADETS[1], qualifications_check: [wht("expired", "2025-02-02")] },
    { ...CADETS[2], qualifications_check: [wht(null)] },
  ];

  // The picker's "Select all", not the criteria card's.
  function selectAllCadets() {
    const criteria = screen.getByText("Criteria to check").closest('[data-slot="card"]')!;
    const button = screen.getAllByRole("button", { name: /Select all/ }).find((b) => !criteria.contains(b))!;
    fireEvent.click(button);
  }

  async function showAudit() {
    const sent: unknown[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.endsWith("/cadets/audit/badge-types")) return new Response(JSON.stringify(CATALOG));
        if (url.endsWith("/cadets")) return new Response(JSON.stringify(CADETS));
        if (url.endsWith("/cadets/audit/check")) {
          sent.push(JSON.parse(String(init?.body)));
          return new Response(JSON.stringify(RESULTS));
        }
        return new Response("[]");
      })
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await act(async () => {
      render(
        <QueryClientProvider client={client}>
          <AuditPage />
        </QueryClientProvider>
      );
    });
    return sent;
  }

  it("lists each weapon under Criteria to check, not in a tab of its own", async () => {
    await showAudit();
    expect(await screen.findByText("Weapon handling tests")).toBeInTheDocument();
    expect(screen.getByText("L98A2")).toBeInTheDocument();
    expect(screen.getByText("Scorpion (single shot)")).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: /WHT/ })).not.toBeInTheDocument();
  });

  it("checks the chosen weapon and shows current, expired and never tested", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const sent = await showAudit();
    await screen.findByText("Weapon handling tests");
    selectAllCadets();
    // The L98A2 row's All and None chips: every status, including never tested.
    const row = screen.getByText("L98A2").parentElement!;
    fireEvent.click(within(row).getByRole("button", { name: "All" }));
    fireEvent.click(within(row).getByRole("button", { name: "None" }));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(sent.at(-1)).toMatchObject({ qualifications: ["wht:L98A2"] });

    expect(await screen.findByRole("button", { name: /L98A2 WHT/ })).toBeInTheDocument();
    expect(screen.getByText("until 10/01/2027")).toBeInTheDocument();
    expect(screen.getByText("expired 02/02/2025")).toBeInTheDocument();
    expect(screen.getByText("Never tested")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("a chosen status hides the others", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await showAudit();
    await screen.findByText("Weapon handling tests");
    selectAllCadets();
    const row = screen.getByText("L98A2").parentElement!;
    fireEvent.click(within(row).getByRole("button", { name: "Expired" }));
    await act(async () => {
      vi.advanceTimersByTime(400);
    });
    expect(await screen.findByText("expired 02/02/2025")).toBeInTheDocument();
    expect(screen.queryByText("until 10/01/2027")).not.toBeInTheDocument();
    expect(screen.queryByText("Never tested")).not.toBeInTheDocument();
    vi.useRealTimers();
  });
});
