// @vitest-environment jsdom
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { API_OUTAGE_EVENT, ApiStatusOverlay } from "@/components/api-status-overlay";

let answers: (number | "network")[];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  answers = [];
  fetchMock = vi.fn(async () => {
    const next = answers.length > 1 ? answers.shift()! : (answers[0] ?? 200);
    if (next === "network") throw new TypeError("Failed to fetch");
    return new Response("{}", { status: next });
  });
  vi.stubGlobal("fetch", fetchMock);
  Object.defineProperty(navigator, "onLine", { value: true, configurable: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const advance = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

describe("ApiStatusOverlay", () => {
  it("shows nothing while the API is up, polling every 30s", async () => {
    answers = [200];
    const { container } = render(<ApiStatusOverlay />);
    await advance(0);
    expect(container).toBeEmptyDOMElement();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await advance(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("needs three failed checks before warning — one blip raises nothing", async () => {
    answers = [503, 503, 503];
    render(<ApiStatusOverlay />);
    await advance(0);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await advance(3_000);
    expect(screen.queryByRole("alertdialog")).toBeNull();
    await advance(3_000);
    expect(screen.getByRole("alertdialog")).toHaveTextContent("API is down");
  });

  it("a success in between resets the count", async () => {
    answers = [503, 503, 200, 503, 503, 200];
    render(<ApiStatusOverlay />);
    await advance(0);
    await advance(3_000);
    await advance(3_000);
    await advance(30_000);
    await advance(3_000);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("tells a dead connection apart from a dead API", async () => {
    answers = ["network"];
    render(<ApiStatusOverlay />);
    await advance(0);
    await advance(3_000);
    await advance(3_000);
    expect(screen.getByRole("status")).toHaveTextContent("offline");
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("skips the request entirely when the browser knows it's offline", async () => {
    Object.defineProperty(navigator, "onLine", { value: false, configurable: true });
    render(<ApiStatusOverlay />);
    await advance(0);
    await advance(3_000);
    await advance(3_000);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("can be dismissed to a banner, and clears itself on recovery", async () => {
    answers = [503, 503, 503, 503, 200];
    render(<ApiStatusOverlay />);
    await advance(0);
    await advance(3_000);
    await advance(3_000);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText(/The API is down/)).toBeInTheDocument();

    await advance(5_000); // still down, polls faster while down
    expect(screen.getByText(/The API is down/)).toBeInTheDocument();
    await advance(5_000);
    expect(screen.queryByText(/The API is down/)).toBeNull();
  });

  it("an outage hint from a failed request brings the next check forward", async () => {
    answers = [200];
    render(<ApiStatusOverlay />);
    await advance(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    act(() => void window.dispatchEvent(new Event(API_OUTAGE_EVENT)));
    await advance(3_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("Check again probes immediately", async () => {
    answers = [503, 503, 503, 200];
    render(<ApiStatusOverlay />);
    await advance(0);
    await advance(3_000);
    await advance(3_000);
    const calls = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Check again/ }));
    await advance(0);
    expect(fetchMock.mock.calls.length).toBe(calls + 1);
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("stops polling once unmounted", async () => {
    answers = [200];
    const { unmount } = render(<ApiStatusOverlay />);
    await advance(0);
    unmount();
    await advance(120_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
