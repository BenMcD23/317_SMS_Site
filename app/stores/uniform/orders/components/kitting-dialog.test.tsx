// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));

import { KittingDialog } from "@/app/stores/uniform/orders/components/kitting-dialog";
import { KIT_ITEMS } from "@/app/stores/uniform/orders/components/draft-item";
import { renderWithQuery } from "@/tests/render-with-query";

const AMY = { cin: 7, first_name: "Amy", last_name: "Able", rank: "Cdt", flight: "C" };

let post: (body: unknown) => Response;
let posted: unknown[];

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
  posted = [];
  post = () => new Response(JSON.stringify({ id: "o9" }), { status: 201 });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body));
        posted.push(body);
        return post(body);
      }
      return new Response(JSON.stringify([AMY]));
    })
  );
});

function Harness({ onCreated = vi.fn(), onError = vi.fn() }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Add cadet to kitting</button>
      <KittingDialog open={open} onOpenChange={setOpen} token="tok" onCreated={onCreated} onError={onError} />
    </>
  );
}

async function openAndPick(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: "Add cadet to kitting" }));
  await user.click(screen.getByRole("combobox", { name: "Search cadet" }));
  await user.type(screen.getByPlaceholderText("Type a name…"), "amy");
  await user.click(await screen.findByText("Cdt Amy Able"));
}

describe("C Flight kitting dialog", () => {
  it("won't add anyone until a cadet is picked", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await user.click(screen.getByRole("button", { name: "Add cadet to kitting" }));
    expect(screen.getByRole("button", { name: "Add cadet" })).toBeDisabled();
  });

  it.each(["male", "female"] as const)("adds one of each %s kit item, sizes left for later", async (kit) => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    renderWithQuery(<Harness onCreated={onCreated} />);
    await openAndPick(user);
    await user.click(screen.getByRole("button", { name: kit }));
    await user.click(screen.getByRole("button", { name: "Add cadet" }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: "o9" }));
    expect(posted).toEqual([
      {
        cadetCin: 7,
        kitting: true,
        items: KIT_ITEMS[kit].map((itemType) => ({
          itemType,
          size: "",
          needSizing: false,
          sizingDetails: "",
        })),
      },
    ]);
    // Closed once it's added.
    await waitFor(() => expect(screen.queryByRole("button", { name: "Add cadet" })).toBeNull());
  });

  it("reports a refused add to the page and stays open to try again", async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    post = () => new Response(JSON.stringify({ detail: "No" }), { status: 500 });
    renderWithQuery(<Harness onError={onError} />);
    await openAndPick(user);
    await user.click(screen.getByRole("button", { name: "Add cadet" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith("Failed to create kitting"));
    expect(screen.getByRole("button", { name: "Add cadet" })).toBeEnabled();
  });

  it("starts empty every time it opens", async () => {
    const user = userEvent.setup();
    renderWithQuery(<Harness />);
    await openAndPick(user);
    await user.click(screen.getByRole("button", { name: "female" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await act(async () => {});
    await user.click(screen.getByRole("button", { name: "Add cadet to kitting" }));
    expect(await screen.findByRole("combobox", { name: "Search cadet" })).toBeInTheDocument();
    expect(screen.getByText(new RegExp(KIT_ITEMS.male.join(", ")))).toBeInTheDocument();
  });
});
