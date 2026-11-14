// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { VpSyncCard } from "@/components/vp-sync-card";

describe("317 Sync card", () => {
  it("explains exam enrolment, folded away until asked for", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("(() => {})()"))
    );
    render(<VpSyncCard lastRan="Never" />);
    const toggle = screen.getByRole("button", { name: "How exam enrolment works" });
    expect(screen.queryByText(/Nothing is sent until you press OK/)).toBeNull();
    await userEvent.click(toggle);
    // The parts people get wrong: where "ready" comes from, which tab asks, and the old bookmark.
    expect(screen.getByText(/Nothing is sent until you press OK/)).toBeTruthy();
    expect(screen.getByText(/every lesson of the subject is ticked in/)).toBeTruthy();
    expect(screen.getByText(/drag a fresh one/)).toBeTruthy();
  });
});
