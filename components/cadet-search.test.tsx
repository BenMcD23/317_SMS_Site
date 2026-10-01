// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import { CadetSearchInput } from "@/components/cadet-search";

// cmdk measures with ResizeObserver and scrolls items into view.
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
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => vi.useRealTimers());

const AMY = { cin: 1, first_name: "Amy", last_name: "Able", rank: "Cpl", flight: "A" };

function mockSearch(respond: (q: string) => Response) {
  const fetchMock = vi.fn(async (url: string) => respond(new URL(url).searchParams.get("q") ?? ""));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function typeQuery(text: string) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  // Open the popover unless it's already showing the search input.
  if (!screen.queryByPlaceholderText("Type a name…")) {
    await user.click(screen.getByRole("combobox", { expanded: false }));
  }
  await user.type(screen.getByPlaceholderText("Type a name…"), text);
  await act(async () => void (await vi.advanceTimersByTimeAsync(300)));
  return user;
}

describe("CadetSearchInput", () => {
  it("waits for two characters, then searches once the typing pauses", async () => {
    const fetchMock = mockSearch(() => new Response(JSON.stringify([AMY])));
    render(<CadetSearchInput token="tok" selectedCin={null} selectedName="" onSelect={vi.fn()} />);
    await typeQuery("a");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText("Type at least 2 characters.")).toBeInTheDocument();

    await typeQuery("m");
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toContain("/cadets/search?q=am");
    expect(await screen.findByText("Cpl Amy Able")).toBeInTheDocument();
    expect(screen.getByText("Flt A")).toBeInTheDocument();
  });

  it("selecting a cadet reports the CIN and name", async () => {
    mockSearch(() => new Response(JSON.stringify([AMY])));
    const onSelect = vi.fn();
    render(<CadetSearchInput token="tok" selectedCin={null} selectedName="" onSelect={onSelect} />);
    const user = await typeQuery("amy");
    await user.click(await screen.findByText("Cpl Amy Able"));
    expect(onSelect).toHaveBeenCalledWith(1, "Amy Able");
  });

  it("an error response shows 'No cadet found' instead of crashing", async () => {
    mockSearch(
      () => new Response(JSON.stringify({ detail: "Staff or NCO access required" }), { status: 403 })
    );
    render(<CadetSearchInput token="tok" selectedCin={null} selectedName="" onSelect={vi.fn()} />);
    await typeQuery("amy");
    expect(await screen.findByText("No cadet found.")).toBeInTheDocument();
  });

  it("a network failure also leaves an empty list", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<CadetSearchInput token="tok" selectedCin={null} selectedName="" onSelect={vi.fn()} />);
    await typeQuery("amy");
    expect(await screen.findByText("No cadet found.")).toBeInTheDocument();
  });

  it("shows the selection and lets it be cleared", async () => {
    const onSelect = vi.fn();
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(<CadetSearchInput token="tok" selectedCin={1} selectedName="Amy Able" onSelect={onSelect} />);
    expect(screen.getByRole("combobox", { expanded: false })).toHaveTextContent("Amy Able");
    await user.click(screen.getByRole("button", { name: "Clear selected cadet" }));
    expect(onSelect).toHaveBeenCalledWith(0, "");
  });
});
