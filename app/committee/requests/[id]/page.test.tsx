// @vitest-environment jsdom
import { Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import CommitteeRequestDetailPage from "@/app/committee/requests/[id]/page";

const SESSION = { data: { id_token: "tok", role: "staff" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config")>()),
  API_BASE: "http://api",
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const REQ = {
  id: 7,
  reference: "CR-2026-007",
  title: "Radios",
  total: 59.98,
  status: "submitted",
  requester_name: "Sam Staff",
  requester_email: "staff@317atc.co.uk",
  created_at: "2026-10-01T10:00:00",
  receipt_count: 0,
  items: [
    { description: "Handheld radio", quantity: 2, unit_cost: 24.99, cost: 49.98 },
    { description: "Batteries", quantity: 4, unit_cost: 2.5, cost: 10 },
  ],
  justification: "For the radio badge",
  rejection_reason: null,
  sent_to_committee_at: null,
  sent_to_committee_by: null,
  decided_at: null,
  decided_by: null,
  sent_for_payment_at: null,
  paid_at: null,
  paid_marked_by: null,
  withdrawn_at: null,
  withdrawn_by: null,
  receipts: [],
  can_approve: true,
  is_requester: false,
};

/** A saved PATCH becomes what later GETs return, as on the real API. */
function stubApi(req: object, patch?: object) {
  let current = req;
  const fetch = vi.fn((url: string, init?: RequestInit) => {
    const path = new URL(url).pathname;
    if (init?.method === "PATCH") {
      current = patch ?? current;
      return Promise.resolve(new Response(JSON.stringify(current)));
    }
    const body = path === "/committee-requests/7" ? current : {};
    return Promise.resolve(new Response(JSON.stringify(body)));
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

async function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => {
    render(
      <QueryClientProvider client={client}>
        <Suspense fallback={null}>
          <CommitteeRequestDetailPage params={Promise.resolve({ id: "7" })} />
        </Suspense>
      </QueryClientProvider>
    );
  });
  await screen.findByText("CR-2026-007");
}

describe("committee request page", () => {
  it("lists each item's quantity, unit cost and total under the justification", async () => {
    stubApi(REQ);
    await renderPage();
    const table = screen.getByRole("table");
    const headings = within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent);
    expect(headings).toEqual(["Description", "Qty", "Unit cost", "Total"]);
    const radio = within(table).getByRole("row", { name: /Handheld radio/ });
    expect(
      within(radio)
        .getAllByRole("cell")
        .map((c) => c.textContent)
    ).toEqual(["Handheld radio", "2", "£24.99", "£49.98"]);
    // The justification reads before the table, as it does on the PDF.
    const justification = screen.getByText("For the radio badge");
    expect(justification.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("lets the OC edit the request and shows the saved version", async () => {
    const fetch = stubApi(REQ, { ...REQ, title: "Better radios" });
    await renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit CR-2026-007" });
    fireEvent.change(within(dialog).getByLabelText("Title"), { target: { value: "Better radios" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    expect(await screen.findByText("Better radios")).toBeTruthy();
    expect(toast.success).toHaveBeenCalledWith("Request updated.");
    expect(fetch.mock.calls.some(([, init]) => init?.method === "PATCH")).toBe(true);
  });

  it("offers no edit to staff who aren't the OC, the requester included", async () => {
    stubApi({ ...REQ, can_approve: false, is_requester: true });
    await renderPage();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it.each(["paid", "withdrawn"])("offers the OC no edit once a request is %s", async (status) => {
    stubApi({ ...REQ, status });
    await renderPage();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });
});
