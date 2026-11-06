// @vitest-environment jsdom
// The squadron's check-in code: the portal link it opens, copying it for an
// NFC tag, and making a new one only after a warning.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { DoorCode } from "@/components/check-in/door-code";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const portal = vi.hoisted(() => ({ url: "https://portal.test/" }));
vi.mock("@/lib/config", async (original) => ({
  ...(await original<typeof import("@/lib/config")>()),
  get PORTAL_URL() {
    return portal.url;
  },
}));
const clipboard = vi.hoisted(() => ({ copyText: vi.fn(async () => true) }));
vi.mock("@/lib/clipboard", () => clipboard);

const CODE = { code: "abc123XYZ", changed_at: "2026-11-01T18:00:00", changed_by: null };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

function api(
  code = () => json(CODE),
  make = () => json({ ...CODE, code: "fresh999", changed_by: "staff@317atc.co.uk" })
) {
  const fetchMock = vi.fn(async (_input: string, init?: RequestInit) =>
    init?.method === "POST" ? make() : code()
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function open() {
  renderWithQuery(<DoorCode />);
  await userEvent.click(screen.getByRole("button", { name: "QR code and NFC" }));
  return screen.getByRole("dialog");
}

describe("Door code", () => {
  it("shows the portal link the QR code and NFC tag open, and copies it", async () => {
    portal.url = "https://portal.test/";
    api();
    const dialog = await open();
    expect(await within(dialog).findByText("https://portal.test/check-in/abc123XYZ")).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Copy link for an NFC tag" }));
    expect(clipboard.copyText).toHaveBeenCalledWith("https://portal.test/check-in/abc123XYZ");
    expect(toast.success).toHaveBeenCalledWith("Link copied.");
  });

  it("a new code needs confirming, then replaces the link", async () => {
    portal.url = "https://portal.test";
    const fetchMock = api();
    const dialog = await open();
    await within(dialog).findByText(/abc123XYZ/);
    await userEvent.click(within(dialog).getByRole("button", { name: "New code" }));
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "POST")).toBe(false);
    const confirm = screen.getAllByRole("dialog").at(-1)!;
    expect(within(confirm).getByText(/Every printed QR code and NFC tag stops working/)).toBeVisible();
    await userEvent.click(within(confirm).getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("https://portal.test/check-in/fresh999")).toBeVisible();
    expect(screen.getByText(/by staff@317atc.co.uk/)).toBeVisible();
  });

  it("a refused new code keeps the old one and says why", async () => {
    portal.url = "https://portal.test";
    api(undefined, () => json({ detail: "Staff access required" }, 403));
    const dialog = await open();
    await within(dialog).findByText(/abc123XYZ/);
    await userEvent.click(within(dialog).getByRole("button", { name: "New code" }));
    await userEvent.click(
      within(screen.getAllByRole("dialog").at(-1)!).getByRole("button", { name: "Confirm" })
    );
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Staff access required"));
    expect(await screen.findByText(/abc123XYZ/)).toBeVisible();
  });

  it("with no portal address it says what to set instead of a code to nowhere", async () => {
    portal.url = "";
    const fetchMock = api();
    const dialog = await open();
    expect(within(dialog).getByText(/NEXT_PUBLIC_PORTAL_URL/)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a code that fails to load shows the error", async () => {
    portal.url = "https://portal.test";
    api(() => json({ detail: "Staff access required" }, 403));
    const dialog = await open();
    expect(await within(dialog).findByText("Staff access required")).toBeVisible();
  });
});
