// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { EditCommitteeRequestDialog } from "@/components/committee/edit-request-dialog";
import type { CommitteeRequestDetail } from "@/lib/committee";

const SESSION = { data: { id_token: "tok" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION }));
vi.mock("@/lib/config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/config")>()),
  API_BASE: "http://api",
}));

const REQ = {
  id: 7,
  reference: "CR-2026-007",
  title: "Radios",
  justification: "For the radio badge",
  status: "submitted",
  rejection_reason: null,
  items: [{ description: "Radio", quantity: 2, unit_cost: 25, cost: 50 }],
} as unknown as CommitteeRequestDetail;

function stubFetch(reply: () => Promise<Response>) {
  const fetch = vi.fn(reply);
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status }));

function open(req = REQ) {
  const onSaved = vi.fn();
  const onOpenChange = vi.fn();
  render(<EditCommitteeRequestDialog req={req} open onOpenChange={onOpenChange} onSaved={onSaved} />);
  return { onSaved, onOpenChange };
}
const save = () => fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

describe("EditCommitteeRequestDialog", () => {
  it("opens on the request as it stands and PATCHes every edited field", async () => {
    const saved = { ...REQ, title: "Better radios" };
    const fetch = stubFetch(() => json(saved));
    const { onSaved, onOpenChange } = open();

    expect(screen.getByLabelText("Title")).toHaveProperty("value", "Radios");
    expect(screen.getByLabelText("Justification")).toHaveProperty("value", "For the radio badge");
    expect(screen.getByLabelText("Total")).toHaveProperty("value", "50");
    // Only a rejected request has a reason to edit.
    expect(screen.queryByLabelText("Reason for rejection")).toBeNull();

    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Better radios" } });
    fireEvent.change(screen.getByLabelText("Justification"), { target: { value: "Ours broke" } });
    fireEvent.change(screen.getByLabelText("Item 1"), { target: { value: "Handheld radio" } });
    fireEvent.change(screen.getByLabelText("Qty"), { target: { value: "3" } });
    save();

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api/committee-requests/7");
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body as string)).toEqual({
      title: "Better radios",
      justification: "Ours broke",
      items: [{ description: "Handheld radio", quantity: 3, unit_cost: 25, cost: 75 }],
    });
  });

  it("sends the edited rejection reason on a rejected request", async () => {
    const fetch = stubFetch(() => json(REQ));
    const { onSaved } = open({ ...REQ, status: "rejected", rejection_reason: "Too dear" });
    const reason = screen.getByLabelText("Reason for rejection");
    expect(reason).toHaveProperty("value", "Too dear");
    fireEvent.change(reason, { target: { value: "Over budget" } });
    save();
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    const init = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init[1].body as string).rejection_reason).toBe("Over budget");
  });

  it("shows the API's refusal and stays open", async () => {
    stubFetch(() => json({ detail: "A paid or withdrawn request can no longer be edited" }, 409));
    const { onSaved, onOpenChange } = open();
    save();
    expect(await screen.findByText("A paid or withdrawn request can no longer be edited")).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it("flattens a validation list into words, not [object Object]", async () => {
    stubFetch(() => json({ detail: [{ msg: "Input should be a valid integer" }] }, 422));
    open();
    save();
    expect(await screen.findByText("Input should be a valid integer")).toBeTruthy();
  });

  it("says the server is unreachable when the request never lands", async () => {
    stubFetch(() => Promise.reject(new TypeError("fetch failed")));
    const { onSaved } = open();
    save();
    expect(await screen.findByText(/unreachable/i)).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("doesn't send a request whose title was cleared", async () => {
    const fetch = stubFetch(() => json(REQ));
    open();
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: " " } });
    save();
    expect(await screen.findByText("Give the request a title")).toBeTruthy();
    expect(fetch).not.toHaveBeenCalled();
  });
});
