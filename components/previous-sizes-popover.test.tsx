// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));
vi.mock("@/lib/reference", () => ({
  useReference: () => ({ issuanceCategoryByItem: { Slacks: "Slacks/Trousers", Beret: "Beret" } }),
}));

import { PreviousSizesPopover } from "@/components/previous-sizes-popover";

const ISSUED = [
  { id: 1, itemCategory: "Beret", lastGiven: "2025-03-14T00:00:00", sizeGiven: "56" },
  { id: 2, itemCategory: "Jumper", lastGiven: "2025-04-14T00:00:00", sizeGiven: "96" },
  { id: 3, itemCategory: "Slacks/Trousers", lastGiven: "2025-05-14T00:00:00", sizeGiven: "76R" },
];

function respond(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function open(props: Partial<React.ComponentProps<typeof PreviousSizesPopover>> = {}) {
  render(
    <PreviousSizesPopover
      issuancesUrl="/api/stores/issuances/42"
      recordHref="/cadets/42?tab=uniform"
      name="Amy Able"
      {...props}
    />
  );
  await userEvent.click(screen.getByRole("button", { name: "Previous sizes for Amy Able" }));
}

describe("PreviousSizesPopover", () => {
  it("doesn't fetch until it's opened, so a page of orders isn't a burst of requests", async () => {
    const fetchMock = respond(ISSUED);
    render(<PreviousSizesPopover issuancesUrl="/api/stores/issuances/42" name="Amy Able" />);
    expect(fetchMock).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Previous sizes for Amy Able" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/stores/issuances/42", expect.anything());
  });

  it("lists what's on this order first, matching item types to their size category", async () => {
    respond(ISSUED);
    await open({ itemTypes: ["Slacks", "Beret"] });
    const rows = (await screen.findAllByRole("listitem")).map((li) => li.textContent);
    expect(rows[0]).toMatch(/^Beret56/);
    expect(rows[1]).toMatch(/^Slacks\/Trousers76R/);
    expect(rows[2]).toMatch(/^Jumper96/);
  });

  it("links to the full uniform record", async () => {
    respond(ISSUED);
    await open();
    expect(await screen.findByRole("link", { name: /Open uniform record/ })).toHaveAttribute(
      "href",
      "/cadets/42?tab=uniform"
    );
  });

  it("has no record link for someone without a cadet record", async () => {
    respond(ISSUED);
    await open({ recordHref: undefined });
    await screen.findAllByRole("listitem");
    expect(screen.queryByRole("link", { name: /Open uniform record/ })).not.toBeInTheDocument();
  });

  it("says when nothing has been issued", async () => {
    respond([]);
    await open();
    expect(await screen.findByText("Nothing recorded as issued yet.")).toBeInTheDocument();
  });

  it("shows the API's reason when the lookup fails, rather than 'nothing issued'", async () => {
    respond({ detail: "Cadet not found" }, 404);
    await open();
    expect(await screen.findByText("Cadet not found")).toBeInTheDocument();
    expect(screen.queryByText("Nothing recorded as issued yet.")).not.toBeInTheDocument();
  });

  it("treats an error body in place of a list as a failure", async () => {
    respond({ detail: "weird" }, 200);
    await open();
    expect(await screen.findByText("Couldn't load their sizes.")).toBeInTheDocument();
  });
});
