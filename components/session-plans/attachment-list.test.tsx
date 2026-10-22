// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ signIn: vi.fn() }));

import { AttachmentList } from "@/components/session-plans/attachment-list";

const ATTACHMENTS = [
  { id: 1, filename: "map.png", mime_type: "image/png", uploaded_at: null },
  { id: 2, filename: "route.pdf", mime_type: "application/pdf", uploaded_at: null },
];

let created: number;
const revoke = vi.fn();

beforeEach(() => {
  created = 0;
  revoke.mockClear();
  Object.assign(URL, { createObjectURL: () => `blob:${++created}`, revokeObjectURL: revoke });
});

function open(name: string) {
  const details = screen.getByText(name).closest("details")!;
  details.open = true;
  fireEvent(details, new Event("toggle"));
}

describe("AttachmentList", () => {
  it("renders nothing with no attachments", () => {
    const { container } = render(<AttachmentList planId={1} token="t" attachments={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("downloads a file the first time it's opened and previews it", async () => {
    const fetchMock = vi.fn(async () => new Response("bytes"));
    vi.stubGlobal("fetch", fetchMock);
    render(<AttachmentList planId={7} token="t" attachments={ATTACHMENTS} />);

    open("map.png");
    expect(await screen.findByRole("img", { name: "map.png" })).toHaveAttribute("src", "blob:1");
    open("route.pdf");
    expect(await screen.findByTitle("route.pdf")).toHaveAttribute("src", "blob:2");
    expect(fetchMock.mock.calls.map((c) => (c as unknown[])[0])).toEqual([
      expect.stringContaining("/session-plans/7/attachments/1"),
      expect.stringContaining("/session-plans/7/attachments/2"),
    ]);

    open("map.png"); // reopening doesn't refetch
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });

  it("says when a file can't be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 404 }))
    );
    render(<AttachmentList planId={7} token="t" attachments={ATTACHMENTS} />);
    open("map.png");
    expect(await screen.findByText("Couldn't load this file.")).toBeInTheDocument();
  });

  it("frees the object URLs when the list goes away", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bytes"))
    );
    const { unmount } = render(<AttachmentList planId={7} token="t" attachments={ATTACHMENTS} />);
    open("map.png");
    await screen.findByRole("img");
    unmount();
    expect(revoke.mock.calls.map((c) => c[0])).toEqual(["blob:1"]);
  });

  it("remove buttons call back without toggling the box", () => {
    const onRemove = vi.fn();
    vi.stubGlobal("fetch", vi.fn());
    render(<AttachmentList planId={7} token="t" attachments={ATTACHMENTS} onRemove={onRemove} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove route.pdf" }));
    expect(onRemove).toHaveBeenCalledWith(2);
    expect(screen.getByText("route.pdf").closest("details")!.open).toBe(false);
  });

  it("disables removal while something is busy, and never fetches without a token", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<AttachmentList planId={7} attachments={ATTACHMENTS} onRemove={vi.fn()} busy="del-1" />);
    expect(screen.getByRole("button", { name: "Remove map.png" })).toBeDisabled();
    open("map.png");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
