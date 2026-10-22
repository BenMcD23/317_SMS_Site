// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
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
