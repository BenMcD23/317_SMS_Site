// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok", role: "staff", user: { email: "s@x" } }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import TextMessagesPage from "@/app/texts/messages/page";
import { renderWithQuery } from "@/tests/render-with-query";

const message = (id: number, parade_date: string) => ({
  id,
  parade_date,
  uniform: "Blues",
  uniform_raw: "Blues",
  dnco: "Cpl Able",
  c_flight_raw: "",
  main_body_raw: "",
  main_message: `Message ${id}`,
  c_flight_message: "",
  status: "draft",
  generated_by_label: null,
  generated_with_fallback: false,
  generated_at: null,
  sent_at: null,
  send_results: null,
});

function stubApi(messages: () => Response) {
  const fetch = vi.fn(async (url: string) =>
    new URL(url).pathname === "/texts/messages" ? messages() : new Response("[]", { status: 200 })
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("Parade night texts", () => {
  it("loads the shown month's nights", async () => {
    const fetch = stubApi(
      () =>
        new Response(JSON.stringify([message(1, "2026-10-06"), message(2, "2026-10-08")]), { status: 200 })
    );
    renderWithQuery(<TextMessagesPage />);
    expect(await screen.findByText(/6 October 2026/)).toBeInTheDocument();
    expect(screen.getByText(/8 October 2026/)).toBeInTheDocument();
    const url = new URL(fetch.mock.calls.find(([u]) => String(u).includes("/texts/messages"))![0]);
    const now = new Date();
    expect([url.searchParams.get("month"), url.searchParams.get("year")]).toEqual([
      String(now.getMonth() + 1),
      String(now.getFullYear()),
    ]);
  });

  it("a failed load says why instead of showing an empty month silently", async () => {
    stubApi(() => new Response(JSON.stringify({ detail: "Programme doc missing" }), { status: 500 }));
    renderWithQuery(<TextMessagesPage />);
    const { toast } = await import("sonner");
    await vi.waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Failed to load messages: Programme doc missing")
    );
  });
});
