// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

// One stable object per role; the page keys its loading effect on the session.
const SESSIONS = {
  staff: {
    data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
    status: "authenticated",
  },
  snco: {
    data: { id_token: "tok", role: "snco", user: { email: "snco@317atc.co.uk" } },
    status: "authenticated",
  },
  nco: {
    data: { id_token: "tok", role: "nco", user: { email: "nco@317atc.co.uk" } },
    status: "authenticated",
  },
} as const;
let session: (typeof SESSIONS)[keyof typeof SESSIONS] = SESSIONS.staff;
vi.mock("next-auth/react", () => ({ useSession: () => session, signIn: vi.fn() }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import SettingsPage from "@/app/settings/page";
import { ASSESSOR_NAME_KEY } from "@/lib/assessor-defaults";
import { renderWithQuery } from "@/tests/render-with-query";

afterEach(() => {
  window.localStorage.clear();
  session = SESSIONS.staff;
});

function respond() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).endsWith("/settings/phone-number")
        ? new Response(JSON.stringify({ phone_number: "07700 900123", kind: "staff" }), { status: 200 })
        : // No signature, profile or assessor name saved: fine for these tests.
          new Response(JSON.stringify({ detail: "Not found" }), { status: 404 })
    )
  );
}

const privacySwitch = () => screen.queryByRole("switch", { name: /^Hide personal data/ });

describe("settings: hide personal data", () => {
  it("staff get the switch, and turning it on takes their number and bank details off the page", async () => {
    respond();
    renderWithQuery(<SettingsPage />);
    await screen.findByRole("heading", { name: "Privacy" });
    expect(screen.getByDisplayValue("07700 900123")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Bank details" })).toBeInTheDocument();

    await userEvent.click(privacySwitch()!);
    expect(privacySwitch()).toBeChecked();
    expect(screen.queryByDisplayValue("07700 900123")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Parade night texts" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Bank details" })).not.toBeInTheDocument();
    // The rest of Settings is untouched.
    expect(screen.getByRole("heading", { name: "Assessor identity" })).toBeInTheDocument();

    await userEvent.click(privacySwitch()!);
    expect(screen.getByDisplayValue("07700 900123")).toBeInTheDocument();
  });

  it.each(["snco", "nco"] as const)("an %s gets no switch, and sees their own number", async (role) => {
    session = SESSIONS[role];
    // Left on by staff in this browser; it mustn't apply to someone else.
    window.localStorage.setItem("sms.privacy.hide", "1");
    respond();
    renderWithQuery(<SettingsPage />);
    expect(await screen.findByDisplayValue("07700 900123")).toHaveAttribute("type", "tel");
    expect(screen.queryByRole("heading", { name: "Privacy" })).not.toBeInTheDocument();
    expect(privacySwitch()).not.toBeInTheDocument();
  });

  it("still offers the switch when the API is down, since it needs nothing from it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Boom" }), { status: 500 }))
    );
    renderWithQuery(<SettingsPage />);
    expect(await screen.findByRole("heading", { name: "Privacy" })).toBeInTheDocument();
    expect(privacySwitch()).not.toBeChecked();
  });
});

describe("settings: assessor name", () => {
  it("saving it makes the assessment sheets pick up the new name", async () => {
    respond();
    const { client } = renderWithQuery(<SettingsPage />);
    // What an assessment sheet opened earlier left in the cache.
    client.setQueryData(ASSESSOR_NAME_KEY, "Old Name");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
    );

    const input = await screen.findByRole("textbox", { name: "Assessor display name" });
    await userEvent.type(input, "Sgt New");
    await userEvent.click(within(input.parentElement!).getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(client.getQueryState(ASSESSOR_NAME_KEY)?.isInvalidated).toBe(true));
  });
});
