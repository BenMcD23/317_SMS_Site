// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import NewCommitteeRequestPage from "@/app/committee/requests/new/page";

const SESSION = { data: { id_token: "tok", role: "staff" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION }));
const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config")>()),
  API_BASE: "http://api",
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

function renderPage(reply: () => Promise<Response>) {
  const fetch = vi.fn(reply);
  vi.stubGlobal("fetch", fetch);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NewCommitteeRequestPage />
    </QueryClientProvider>
  );
  return fetch;
}

function fillIn() {
  const type = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  type("Title", "Radios");
  type("Justification", "For the radio badge");
  type("Item 1", "Handheld radio");
  type("Description", "Motorola XT420, licence-free");
  type("Qty", "2");
  type("Unit cost", "24.99");
  fireEvent.click(screen.getByRole("button", { name: "Submit request" }));
}

describe("new committee request", () => {
  it("sends quantity, unit cost and the filled-in total, then opens the request", async () => {
    const fetch = renderPage(() =>
      Promise.resolve(new Response(JSON.stringify({ id: 9, reference: "CR-2026-009" })))
    );
    fillIn();
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/committee/requests/9"));
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api/committee-requests");
    expect(JSON.parse(init.body as string)).toEqual({
      title: "Radios",
      justification: "For the radio badge",
      items: [
        {
          description: "Handheld radio",
          details: "Motorola XT420, licence-free",
          quantity: 2,
          unit_cost: 24.99,
          cost: 49.98,
        },
      ],
    });
    expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("CR-2026-009"));
  });

  it("toasts the API's refusal and stays on the form", async () => {
    renderPage(() =>
      Promise.resolve(new Response(JSON.stringify({ detail: "Add at least one item" }), { status: 400 }))
    );
    fillIn();
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("Add at least one item"));
    expect(push).not.toHaveBeenCalled();
  });
});
