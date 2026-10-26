// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok", role: "staff", user: { email: "s@x" } }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import NewsletterManagementPage from "@/app/tools/newsletter-updater/page";
import { renderWithQuery } from "@/tests/render-with-query";

const issue = (n: number) => ({
  id: `n${n}`,
  title: `Issue ${n} news`,
  date: "October 2026",
  issue: n,
  description: "",
  pdfPath: `/newsletters/issue-${n}.pdf`,
});

function stubApi(list: unknown, del = () => new Response(JSON.stringify({ ok: true }), { status: 200 })) {
  const fetch = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "DELETE") return del();
    return new Response(JSON.stringify(list), { status: Array.isArray(list) ? 200 : 500 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

describe("Newsletter updater", () => {
  it("lists the newest issue first, marked current", async () => {
    stubApi([issue(2), issue(4), issue(3)]);
    renderWithQuery(<NewsletterManagementPage />);
    const items = await screen.findAllByRole("listitem");
    expect(items.map((li) => within(li).getByText(/Issue \d news/).textContent)).toEqual([
      "Issue 4 news",
      "Issue 3 news",
      "Issue 2 news",
    ]);
    expect(within(items[0]).getByText("Current")).toBeInTheDocument();
  });

  it("deleting an issue takes it off the list without reloading it", async () => {
    const fetch = stubApi([issue(1), issue(2)]);
    renderWithQuery(<NewsletterManagementPage />);
    const [first] = await screen.findAllByRole("listitem");
    await userEvent.click(within(first).getByRole("button", { name: "Delete" }));
    await userEvent.click(within(first).getByRole("button", { name: "Confirm" }));
    await vi.waitFor(() => expect(screen.queryByText("Issue 2 news")).toBeNull());
    expect(screen.getByText("Issue 1 news")).toBeInTheDocument();
    expect(fetch.mock.calls.filter(([, init]) => !init?.method || init.method === "GET")).toHaveLength(1);
  });

  it("a failed delete keeps the issue", async () => {
    stubApi([issue(1)], () => new Response(JSON.stringify({ detail: "GitHub said no" }), { status: 502 }));
    renderWithQuery(<NewsletterManagementPage />);
    const [first] = await screen.findAllByRole("listitem");
    await userEvent.click(within(first).getByRole("button", { name: "Delete" }));
    await userEvent.click(within(first).getByRole("button", { name: "Confirm" }));
    const { toast } = await import("sonner");
    await vi.waitFor(() => expect(toast.error).toHaveBeenCalledWith("GitHub said no"));
    expect(screen.getByText("Issue 1 news")).toBeInTheDocument();
  });

  it("an error body where the list should be is an error, not 'no newsletters'", async () => {
    stubApi({ detail: "GitHub token expired" });
    renderWithQuery(<NewsletterManagementPage />);
    expect(await screen.findByText("GitHub token expired")).toBeInTheDocument();
    expect(screen.queryByText("No newsletters yet")).toBeNull();
  });
});
