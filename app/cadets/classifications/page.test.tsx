// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ClassificationsPage from "@/app/cadets/classifications/page";
import { canAccess } from "@/lib/access";
import { flattenLinks, NAV_SECTIONS } from "@/lib/navigation";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("next/navigation", () => ({
  usePathname: () => "/cadets/classifications",
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

function json(body: unknown) {
  return new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });
}

function renderAt(search: string) {
  window.history.replaceState(null, "", `/cadets/classifications${search}`);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("/classification-day?")
        ? json({ date: "2026-10-15", weekday: "Thursday", cadets: [] })
        : json([])
    )
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ClassificationsPage />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.spyOn(window.history, "replaceState");
});

describe("Classifications page", () => {
  it("opens on tonight's plan", async () => {
    renderAt("");
    expect(await screen.findByRole("tab", { name: "Tonight", selected: true })).toBeVisible();
    expect(screen.getByLabelText("Night")).toBeVisible();
  });

  it("?tab= opens a tab directly, so the old Theory Progress link lands on Progress", async () => {
    renderAt("?tab=progress");
    expect(await screen.findByRole("tab", { name: "Progress", selected: true })).toBeVisible();
  });

  it("an unknown tab falls back to tonight", async () => {
    renderAt("?tab=nonsense");
    expect(await screen.findByRole("tab", { name: "Tonight", selected: true })).toBeVisible();
  });

  // Next re-renders useSearchParams after replaceState; the mock doesn't, so
  // each direction starts from its own URL.
  it("changing tab puts it in the URL", async () => {
    const user = userEvent.setup();
    renderAt("");
    await user.click(await screen.findByRole("tab", { name: "QR codes" }));
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, "", "/cadets/classifications?tab=qr");
  });

  it("going back to Tonight takes the tab out of the URL, keeping anything else", async () => {
    const user = userEvent.setup();
    renderAt("?tab=qr&x=1");
    await user.click(await screen.findByRole("tab", { name: "Tonight" }));
    expect(window.history.replaceState).toHaveBeenLastCalledWith(null, "", "/cadets/classifications?x=1");
  });
});

describe("who can open it", () => {
  it.each([
    ["staff", true],
    ["snco", false],
    ["nco", false],
    [undefined, false],
  ])("%s → %s", (role, allowed) => {
    expect(canAccess(role, "/cadets/classifications")).toBe(allowed);
  });

  it("is one sidebar link that replaces Theory Progress and Classification Day", () => {
    const hrefs = flattenLinks(NAV_SECTIONS).map((l) => l.href);
    expect(hrefs).toContain("/cadets/classifications");
    expect(hrefs).not.toContain("/cadets/theory");
    expect(hrefs).not.toContain("/cadets/classification-day");
  });
});
