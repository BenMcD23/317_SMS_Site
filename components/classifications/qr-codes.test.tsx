// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { LessonQrCodes } from "@/components/classifications/qr-codes";
import type { LessonCode } from "@/lib/theory";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
// The portal's address is build-time config; a getter lets one test unset it.
const config = vi.hoisted(() => ({ portal: "https://portal.test" }));
vi.mock("@/lib/config", async (original) => ({
  ...(await original<typeof import("@/lib/config")>()),
  get PORTAL_URL() {
    return config.portal;
  },
}));

const nav = { key: "nav", name: "Basic Navigation", category: "Leading", parts: 3 };
const CODES: LessonCode[] = [
  { key: "radio", name: "Blue Radio", category: "Badges", parts: 1, part: 1, code: "radio001" },
  { ...nav, part: 1, code: "navone01" },
  { ...nav, part: 2, code: "navtwo02" },
  { ...nav, part: 3, code: "navthr03" },
];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function renderTab(response: () => Response = () => json(CODES)) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response())
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <LessonQrCodes />
    </QueryClientProvider>
  );
}

describe("QR codes tab", () => {
  it("draws a code for each of a subject's three lessons, Leading first", async () => {
    config.portal = "https://portal.test";
    renderTab();
    expect(await screen.findByRole("heading", { name: "Basic Navigation" })).toBeVisible();
    for (const part of [1, 2, 3]) {
      expect(
        await screen.findByRole("img", { name: `QR code for Basic Navigation Lesson ${part}` })
      ).toBeVisible();
    }
    expect(screen.queryByRole("heading", { name: "Blue Radio" })).toBeNull();
  });

  it("badge theory has one code", async () => {
    config.portal = "https://portal.test";
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole("heading", { name: "Basic Navigation" });

    await user.click(screen.getByRole("radio", { name: "Badges" }));
    expect(await screen.findByRole("img", { name: "QR code for Blue Radio Theory" })).toBeVisible();
    expect(screen.getAllByRole("img")).toHaveLength(1);
  });

  it("copies the lesson's portal link", async () => {
    config.portal = "https://portal.test/";
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole("heading", { name: "Basic Navigation" });
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    await user.click(screen.getByRole("button", { name: "Copy link for Basic Navigation Lesson 2" }));
    expect(writeText).toHaveBeenCalledWith("https://portal.test/lesson/navtwo02");
    expect(toast.success).toHaveBeenCalledWith("Link copied.");
  });

  it("a copy the browser refuses says so instead of claiming it worked", async () => {
    config.portal = "https://portal.test";
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole("heading", { name: "Basic Navigation" });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
      configurable: true,
    });

    await user.click(screen.getByRole("button", { name: "Copy link for Basic Navigation Lesson 1" }));
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("downloads a named PNG of the code", async () => {
    config.portal = "https://portal.test";
    const user = userEvent.setup();
    renderTab();
    await screen.findByRole("heading", { name: "Basic Navigation" });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});

    await user.click(screen.getByRole("button", { name: "Download QR code for Basic Navigation Lesson 3" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    const a = click.mock.contexts[0] as HTMLAnchorElement;
    expect(a.download).toBe("basic-navigation-lesson-3.png");
    expect(a.href).toMatch(/^data:image\/png;base64,/);
  });

  it("without the portal's address it explains what to set rather than drawing dead codes", async () => {
    config.portal = "";
    renderTab();
    expect(screen.getByText("The cadet portal's address isn't set")).toBeVisible();
    expect(screen.getByText(/NEXT_PUBLIC_PORTAL_URL/)).toBeVisible();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("a 500 shows an error instead of crashing", async () => {
    config.portal = "https://portal.test";
    renderTab(() => json({ detail: "Database unavailable" }, 500));
    expect(await screen.findByText("Couldn't load the codes")).toBeVisible();
    expect(screen.getByText("Database unavailable")).toBeVisible();
  });

  it("an error body where the list should be shows no codes rather than crashing", async () => {
    config.portal = "https://portal.test";
    renderTab(() => json({ detail: "odd" }));
    await waitFor(() => expect(screen.queryByRole("img")).toBeNull());
    expect(screen.queryByRole("heading")).toBeNull();
  });
});
