// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/reference", () => ({
  useReference: () => ({ issuanceCategories: ["Beret", "Tie", "Belt"] }),
}));

import { UniformIssuancesCard } from "@/components/uniform-issuances-card";

let posted: unknown[];
let failWrites = false;

beforeEach(() => {
  posted = [];
  failWrites = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      if (init.method === "POST") {
        if (failWrites) return new Response("{}", { status: 500 });
        const body = JSON.parse(init.body as string);
        posted.push(body);
        const item = body.items[0];
        return new Response(
          JSON.stringify([
            {
              id: 9,
              itemCategory: item.itemCategory,
              lastGiven: `${item.lastGiven}T00:00:00`,
              sizeGiven: item.sizeGiven,
            },
          ])
        );
      }
      if (init.method === "DELETE") return new Response(null, { status: failWrites ? 500 : 204 });
      return new Response(
        JSON.stringify([{ id: 1, itemCategory: "Beret", lastGiven: "2025-09-03T00:00:00", sizeGiven: "56" }])
      );
    })
  );
});

describe("UniformIssuancesCard", () => {
  it("lists every catalogue category with what was last issued", async () => {
    render(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    expect(await screen.findByText("3 Sept 2025")).toBeInTheDocument();
    expect(screen.getByText("Size: 56")).toBeInTheDocument();
    expect(screen.getAllByText("N/A")).toHaveLength(2);
  });

  it("records an issue and shows it", async () => {
    const user = userEvent.setup();
    render(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    await user.click(await screen.findByRole("button", { name: "Edit Tie" }));
    await user.type(screen.getByPlaceholderText("Size (optional)"), "Short");
    await user.click(screen.getByRole("button", { name: "Save Tie" }));
    await waitFor(() => expect(screen.getByText("Size: Short")).toBeInTheDocument());
    expect(posted[0]).toEqual({
      items: [
        { itemCategory: "Tie", sizeGiven: "Short", lastGiven: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
      ],
    });
  });

  it("a blank size is sent as null", async () => {
    const user = userEvent.setup();
    render(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    await user.click(await screen.findByRole("button", { name: "Edit Belt" }));
    await user.click(screen.getByRole("button", { name: "Save Belt" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect((posted[0] as { items: { sizeGiven: unknown }[] }).items[0].sizeGiven).toBeNull();
  });

  it("clears a record", async () => {
    const user = userEvent.setup();
    render(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    await user.click(await screen.findByRole("button", { name: "Edit Beret" }));
    await user.click(screen.getByRole("button", { name: "Clear" }));
    await waitFor(() => expect(screen.getAllByText("N/A")).toHaveLength(3));
  });

  it("shows an error and keeps the editor open when saving fails", async () => {
    failWrites = true;
    const user = userEvent.setup();
    render(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    await user.click(await screen.findByRole("button", { name: "Edit Tie" }));
    await user.click(screen.getByRole("button", { name: "Save Tie" }));
    expect(await screen.findByText("Failed to save")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save Tie" })).toBeInTheDocument();
  });

  it("a failed load shows the categories with nothing issued", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 500 }))
    );
    render(<UniformIssuancesCard baseUrl="/api/stores/issuances/1" />);
    await waitFor(() => expect(screen.getAllByText("N/A")).toHaveLength(3));
  });
});
