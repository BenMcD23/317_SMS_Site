// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Private, PrivacyToggle, usePrivateText } from "@/components/private";
import { setPersonalDataHidden } from "@/lib/privacy";

// localStorage isn't one of the globals the config restores, so each test
// starts from "shown" itself.
afterEach(() => window.localStorage.clear());

function Subtitle({ email }: { email: string | null }) {
  const privateText = usePrivateText();
  return <p>{["Cpl", privateText(email)].filter(Boolean).join(" · ")}</p>;
}

function Page() {
  return (
    <>
      <PrivacyToggle />
      <p>Amy Able</p>
      <Private>amy@example.com</Private>
      <Subtitle email="amy@example.com" />
    </>
  );
}

describe("hide personal data", () => {
  it("shows personal data until the toggle is pressed, and names throughout", async () => {
    render(<Page />);
    const toggle = screen.getByRole("button", { name: "Hide personal data" });
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("amy@example.com")).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByText(/amy@example\.com/)).not.toBeInTheDocument();
    expect(screen.getByText("Hidden")).toBeInTheDocument();
    expect(screen.getByText("Cpl · Hidden")).toBeInTheDocument();
    expect(screen.getByText("Amy Able")).toBeInTheDocument();

    await userEvent.click(toggle);
    expect(screen.getByText("amy@example.com")).toBeInTheDocument();
  });

  it("is remembered after a reload", async () => {
    const { unmount } = render(<Page />);
    await userEvent.click(screen.getByRole("button", { name: "Hide personal data" }));
    unmount();

    render(<Page />);
    expect(screen.getByRole("button", { name: "Hide personal data" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.queryByText(/amy@example\.com/)).not.toBeInTheDocument();
  });

  it("follows a toggle made in another tab", () => {
    render(<Page />);
    act(() => {
      window.localStorage.setItem("sms.privacy.hide", "1");
      window.dispatchEvent(new StorageEvent("storage", { key: "sms.privacy.hide" }));
    });
    expect(screen.queryByText(/amy@example\.com/)).not.toBeInTheDocument();
  });

  it("leaves an empty value empty, so 'not set' placeholders still read right", () => {
    act(() => setPersonalDataHidden(true));
    render(<Subtitle email={null} />);
    expect(screen.getByText("Cpl")).toBeInTheDocument();
  });

  it("shows the data rather than crashing when storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    render(<Page />);
    expect(screen.getByText("amy@example.com")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Hide personal data" }));
    // Nowhere to keep the choice, so it can't take effect — but nothing broke.
    expect(screen.getByText("amy@example.com")).toBeInTheDocument();
  });
});
