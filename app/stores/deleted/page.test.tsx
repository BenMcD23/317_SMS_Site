// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import StoresDeletedPage from "@/app/stores/deleted/page";
import { canAccess } from "@/lib/access";
import type { DeletedRecord } from "@/lib/deleted-records";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

function record(over: Partial<DeletedRecord>): DeletedRecord {
  return {
    id: 1,
    kind: "uniform_order",
    label: "Uniform order for Zoë Ó Briain: Beret, Tie",
    deletedAt: "2026-11-01T19:30:00",
    deletedBy: "Sam Staff",
    restoredAt: null,
    restoredBy: null,
    restoredId: null,
    ...over,
  };
}

let list: unknown;
let listStatus: number;
let restoreStatus: number;
let restoreBody: unknown;
let calls: { url: string; method: string }[];

beforeEach(() => {
  list = [];
  listStatus = 200;
  restoreStatus = 200;
  restoreBody = {};
  calls = [];
  toast.success.mockReset();
  toast.error.mockReset();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      calls.push({ url, method: init.method ?? "GET" });
      if (url.includes("/restore"))
        return new Response(JSON.stringify(restoreBody), { status: restoreStatus });
      return new Response(JSON.stringify(list), { status: listStatus });
    })
  );
});

describe("Recently deleted page", () => {
  it("lists what was deleted, by whom, and what has been put back", async () => {
    list = [
      record({ id: 2 }),
      record({
        id: 1,
        kind: "badge_order_list_entry",
        label: "Badge order list entry: ATC for Amy Adams",
        restoredAt: "2026-11-02T10:00:00",
        restoredBy: "QM Jones",
      }),
    ];
    renderWithQuery(<StoresDeletedPage />);
    const listEl = await screen.findByRole("list", { name: "Deleted records" });
    const [open, restored] = within(listEl).getAllByRole("listitem");
    expect(open).toHaveTextContent("by Sam Staff");
    expect(within(open).getByRole("button", { name: /Restore Uniform order for Zoë/ })).toBeInTheDocument();
    expect(restored).toHaveTextContent("by QM Jones");
    expect(within(restored).queryByRole("button")).toBeNull();
    expect(within(restored).getByRole("link", { name: "Badge orders" })).toHaveAttribute(
      "href",
      "/stores/badges/orders"
    );
  });

  it("restoring posts to the API, says where it went and refreshes the list", async () => {
    list = [record({ id: 7 })];
    const user = userEvent.setup();
    renderWithQuery(<StoresDeletedPage />);
    await user.click(await screen.findByRole("button", { name: /Restore/ }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Restored. It's back on Uniform orders."));
    expect(calls.find((c) => c.method === "POST")?.url).toContain("/stores/deleted/7/restore");
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(2);
  });

  it("a refused restore shows the API's reason", async () => {
    list = [record({})];
    restoreStatus = 409;
    restoreBody = { detail: "That cadet is no longer on the roster" };
    const user = userEvent.setup();
    renderWithQuery(<StoresDeletedPage />);
    await user.click(await screen.findByRole("button", { name: /Restore/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("That cadet is no longer on the roster"));
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("says when nothing has been deleted", async () => {
    renderWithQuery(<StoresDeletedPage />);
    expect(await screen.findByText("Nothing deleted")).toBeInTheDocument();
  });

  it("a failed load shows the API's reason, not an empty list", async () => {
    list = { detail: "Database unavailable" };
    listStatus = 500;
    renderWithQuery(<StoresDeletedPage />);
    expect(await screen.findByText("Database unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Nothing deleted")).toBeNull();
  });

  it("is staff only", () => {
    expect(canAccess("staff", "/stores/deleted")).toBe(true);
    for (const role of ["snco", "nco", undefined]) expect(canAccess(role, "/stores/deleted")).toBe(false);
  });
});
