// @vitest-environment jsdom
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok", user: { email: "nco@317atc.co.uk" } }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { OutboxIndicator, OutboxSync } from "@/components/outbox";
import { queueWrite, readOutbox } from "@/lib/outbox";

const ME = "nco@317atc.co.uk";

function queue(label: string, extra: object = {}, owner = ME) {
  const item = queueWrite({ url: "http://api.test/x", method: "POST", body: { label }, label, owner });
  if (Object.keys(extra).length) {
    localStorage.setItem(
      "sms:outbox",
      JSON.stringify(readOutbox().map((i) => (i.id === item.id ? { ...i, ...extra } : i)))
    );
  }
  return item;
}

const indicator = () => screen.queryByRole("button", { name: /waiting to send/ });

beforeEach(() => {
  localStorage.clear();
  toast.error.mockReset();
  toast.success.mockReset();
});

describe("outbox indicator", () => {
  it("is not there when nothing is waiting", () => {
    render(<OutboxIndicator />);
    expect(indicator()).not.toBeInTheDocument();
  });

  it("ignores another person's queue on a shared phone", () => {
    queue("Their sheet", {}, "other@317atc.co.uk");
    render(<OutboxIndicator />);
    expect(indicator()).not.toBeInTheDocument();
  });

  it("appears the moment something is queued and lists it", async () => {
    render(<OutboxIndicator />);
    act(() => void queue("Radio assessment — Cdt Ava Smith"));
    expect(indicator()).toHaveAccessibleName("1 submission waiting to send");
    await userEvent.click(indicator()!);
    expect(screen.getByText("Radio assessment — Cdt Ava Smith")).toBeInTheDocument();
    expect(screen.getByText(/Saved \d{2} \w{3} \d{4}/)).toBeInTheDocument();
  });

  it("Send now sends and the indicator goes away", async () => {
    queue("Sheet A");
    queue("Sheet B");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 201 }))
    );
    render(<OutboxIndicator />);
    expect(indicator()).toHaveAccessibleName("2 submissions waiting to send");
    await userEvent.click(indicator()!);
    await userEvent.click(screen.getByRole("button", { name: "Send now" }));
    expect(toast.success).toHaveBeenCalledWith("Sent 2 submissions");
    await waitFor(() => expect(indicator()).not.toBeInTheDocument());
  });

  it("Send now with still no signal says it'll keep trying", async () => {
    queue("Sheet A");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    render(<OutboxIndicator />);
    await userEvent.click(indicator()!);
    await userEvent.click(screen.getByRole("button", { name: "Send now" }));
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining("keep trying"));
    expect(readOutbox()).toHaveLength(1);
  });

  it("a refused sheet shows why, and can be discarded after a confirm", async () => {
    queue("Inspection — 22 Oct 2026", { error: "Date is in the future" });
    render(<OutboxIndicator />);
    await userEvent.click(indicator()!);
    expect(screen.getByText("Not accepted: Date is in the future")).toBeInTheDocument();
    // Nothing left that could send, so no Send now.
    expect(screen.queryByRole("button", { name: "Send now" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Discard Inspection — 22 Oct 2026" }));
    expect(screen.getByText(/It was never saved on the server/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(readOutbox()).toEqual([]);
    await waitFor(() => expect(indicator()).not.toBeInTheDocument());
  });
});

describe("outbox sync", () => {
  it("sends what's waiting as soon as it mounts with a session", async () => {
    queue("Sheet A");
    const fetch = vi.fn(async () => new Response("{}", { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    render(<OutboxSync />);
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Sent 1 saved submission from this phone")
    );
    expect(fetch).toHaveBeenCalledWith("http://api.test/x", expect.objectContaining({ method: "POST" }));
    expect(readOutbox()).toEqual([]);
  });

  it("tries again when the phone comes back online", async () => {
    queue("Sheet A");
    let online = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        if (!online) throw new TypeError("Failed to fetch");
        return new Response("{}", { status: 201 });
      })
    );
    render(<OutboxSync />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(readOutbox()).toHaveLength(1);

    online = true;
    act(() => void window.dispatchEvent(new Event("online")));
    await waitFor(() => expect(readOutbox()).toEqual([]));
  });

  it("tells the person when the server refuses a queued sheet", async () => {
    queue("Radio assessment — Cdt Ava Smith");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Cadet not found" }), { status: 404 }))
    );
    render(<OutboxSync />);
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Radio assessment — Cdt Ava Smith wasn't accepted: Cadet not found"
      )
    );
    expect(readOutbox()[0].error).toBe("Cadet not found");
  });

  it("does nothing when nothing is waiting", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    render(<OutboxSync />);
    act(() => void window.dispatchEvent(new Event("online")));
    expect(fetch).not.toHaveBeenCalled();
  });
});
