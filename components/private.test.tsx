// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// One stable object per role; pages key effects on the session.
const SESSIONS = {
  staff: { data: { role: "staff" }, status: "authenticated" },
  snco: { data: { role: "snco" }, status: "authenticated" },
  nco: { data: { role: "nco" }, status: "authenticated" },
} as const;
let session: (typeof SESSIONS)[keyof typeof SESSIONS] = SESSIONS.staff;
vi.mock("next-auth/react", () => ({ useSession: () => session }));

import { PersonalDataSetting, Private, usePrivateText } from "@/components/private";
import { setPersonalDataHidden } from "@/lib/privacy";

// localStorage isn't one of the globals the config restores, so each test
// starts from "shown" itself.
afterEach(() => {
  window.localStorage.clear();
  session = SESSIONS.staff;
});

const toggle = () => screen.getByRole("switch", { name: /^Hide personal data/ });

function Subtitle({ email }: { email: string | null }) {
  const privateText = usePrivateText();
  return <p>{["Cpl", privateText(email)].filter(Boolean).join(" · ")}</p>;
}

function Page() {
  return (
    <>
      <PersonalDataSetting />
      <p>Amy Able</p>
      <Private>amy@example.com</Private>
      <Subtitle email="amy@example.com" />
    </>
  );
}

describe("hide personal data", () => {
  it("shows personal data until the toggle is pressed, and names throughout", async () => {
    render(<Page />);
    expect(toggle()).not.toBeChecked();
    expect(screen.getByText("amy@example.com")).toBeInTheDocument();

    await userEvent.click(toggle());
    expect(toggle()).toBeChecked();
    expect(screen.queryByText(/amy@example\.com/)).not.toBeInTheDocument();
    // Gone, not replaced: nothing on screen says there was anything there.
    expect(screen.queryByText(/Hidden/)).not.toBeInTheDocument();
    expect(screen.getByText("Cpl")).toBeInTheDocument();
    expect(screen.getByText("Amy Able")).toBeInTheDocument();

    await userEvent.click(toggle());
    expect(screen.getByText("amy@example.com")).toBeInTheDocument();
  });

  it("can be switched by tapping anywhere on its row, not just the switch", async () => {
    render(<Page />);
    await userEvent.click(screen.getByText("Hide personal data"));
    expect(toggle()).toBeChecked();
  });

  it("is remembered after a reload", async () => {
    const { unmount } = render(<Page />);
    await userEvent.click(toggle());
    unmount();

    render(<Page />);
    expect(toggle()).toBeChecked();
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
    await userEvent.click(toggle());
    // Nowhere to keep the choice, so it can't take effect — but nothing broke.
    expect(screen.getByText("amy@example.com")).toBeInTheDocument();
  });

  it.each(["snco", "nco"] as const)(
    "is ignored for an %s, so a choice left by staff in a shared browser doesn't mask their own details",
    (role) => {
      act(() => setPersonalDataHidden(true));
      session = SESSIONS[role];
      render(<Subtitle email="nina@317atc.co.uk" />);
      expect(screen.getByText("Cpl · nina@317atc.co.uk")).toBeInTheDocument();
    }
  );

  it("is ignored while signed out", () => {
    act(() => setPersonalDataHidden(true));
    session = { data: null, status: "unauthenticated" } as never;
    render(<Subtitle email="amy@example.com" />);
    expect(screen.getByText("Cpl · amy@example.com")).toBeInTheDocument();
  });
});
