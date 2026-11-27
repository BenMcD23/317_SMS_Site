// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ContactAuditPage from "@/app/cadets/contact-audit/page";
import { renderWithQuery } from "@/tests/render-with-query";
import type { ContactAuditCadet, ContactAuditResponse } from "@/lib/contact-audit";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
const toastError = vi.hoisted(() => vi.fn());
vi.mock("sonner", () => ({ toast: { error: toastError, success: vi.fn() } }));
const saved = vi.hoisted(() => vi.fn());
vi.mock("@/lib/download", () => ({ saveResponseAsFile: saved }));

const ALL_GOOD = {
  cadet_email: "good",
  cadet_phone: "good",
  email_differs: "good",
  phone_differs: "good",
  has_contact: "good",
  contacts_complete: "good",
} as const;

function cadet(over: Partial<ContactAuditCadet>): ContactAuditCadet {
  return {
    cin: 1,
    first_name: "Amy",
    last_name: "Able",
    rank: "Cdt",
    flight: "A",
    emails: ["amy@317atc.co.uk"],
    phones: ["07700900001"],
    contacts: [
      {
        name: "Sarah Able",
        title: "Mrs",
        relationship: "Mother",
        next_of_kin: true,
        emails: ["sarah@example.com"],
        phones: ["07700900111"],
      },
    ],
    checks: { ...ALL_GOOD },
    result: "good",
    problems: [],
    contacts_checked_at: "2026-11-20T19:30:00",
    ...over,
  };
}

const AUDIT: ContactAuditResponse = {
  checks: [
    { key: "cadet_email", label: "Cadet has email" },
    { key: "cadet_phone", label: "Cadet has phone" },
    { key: "email_differs", label: "Cadet email not a parent's" },
    { key: "phone_differs", label: "Cadet phone not a parent's" },
    { key: "has_contact", label: "Has a parent contact" },
    { key: "contacts_complete", label: "Every parent has email and phone" },
  ],
  cadets: [
    cadet({}),
    cadet({
      cin: 2,
      first_name: "Ben",
      last_name: "Zed",
      flight: "B",
      phones: [],
      checks: { ...ALL_GOOD, cadet_phone: "bad", phone_differs: "n/a" },
      result: "bad",
      problems: ["No phone for the cadet"],
    }),
    cadet({
      cin: 3,
      first_name: "Cal",
      last_name: "Cole",
      emails: [],
      phones: [],
      contacts: [],
      checks: Object.fromEntries(Object.keys(ALL_GOOD).map((k) => [k, "not_checked"])),
      result: "not_checked",
      contacts_checked_at: null,
    }),
  ],
};

function answer(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) =>
      Promise.resolve(
        url.endsWith("/export")
          ? new Response("xlsx", { status: 200 })
          : new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })
      )
    )
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("Contact audit page", () => {
  it("opens on the cadets who need fixing, with the counts", async () => {
    answer(AUDIT);
    renderWithQuery(<ContactAuditPage />);
    expect(await screen.findByText("Ben Zed")).toBeTruthy();
    expect(screen.queryByText("Amy Able")).toBeNull();
    expect(screen.getByText("Need fixing", { selector: "p" }).nextSibling?.textContent).toBe("1");
    expect(screen.getByText("Cdt · B Flight · 1 problem")).toBeTruthy();
  });

  it("Everyone shows every cadet, and a flight narrows it", async () => {
    answer(AUDIT);
    renderWithQuery(<ContactAuditPage />);
    await screen.findByText("Ben Zed");
    fireEvent.click(screen.getByRole("radio", { name: "Everyone" }));
    expect(screen.getByText("Amy Able")).toBeTruthy();
    expect(screen.getByText("Cal Cole")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "B Flight" }));
    expect(screen.queryByText("Amy Able")).toBeNull();
    expect(screen.getByText("Ben Zed")).toBeTruthy();
  });

  it("opening a cadet shows each check, the problem and the parents' details", async () => {
    answer(AUDIT);
    renderWithQuery(<ContactAuditPage />);
    await screen.findByText("Ben Zed");
    fireEvent.click(screen.getByRole("button", { name: "Expand contact details for Ben Zed" }));
    expect(screen.getByText("No phone for the cadet")).toBeTruthy();
    const checks = screen.getByRole("list", { name: "Checks" });
    expect(within(checks).getByText("Cadet has phone").parentElement?.textContent).toContain("Bad");
    expect(within(checks).getByText("Cadet phone not a parent's").parentElement?.textContent).toContain(
      "N/A"
    );
    expect(screen.getByText("sarah@example.com")).toBeTruthy();
    expect(screen.getByText("07700900111")).toBeTruthy();
  });

  it("a cadet the scraper hasn't read says so rather than 'nobody listed'", async () => {
    answer(AUDIT);
    renderWithQuery(<ContactAuditPage />);
    await screen.findByText("Ben Zed");
    fireEvent.click(screen.getByRole("radio", { name: "Not checked" }));
    fireEvent.click(screen.getByRole("button", { name: "Expand contact details for Cal Cole" }));
    expect(screen.getAllByText("Not read from Bader yet.")).toHaveLength(2);
    expect(screen.queryByText("Nobody listed on Bader.")).toBeNull();
  });

  it("hide personal data takes the emails and phones off but keeps the names and checks", async () => {
    window.localStorage.setItem("sms.privacy.hide", "1");
    answer(AUDIT);
    renderWithQuery(<ContactAuditPage />);
    await screen.findByText("Ben Zed");
    fireEvent.click(screen.getByRole("button", { name: "Expand contact details for Ben Zed" }));
    expect(screen.queryByText("sarah@example.com")).toBeNull();
    expect(screen.queryByText("07700900111")).toBeNull();
    expect(screen.getByText("Sarah Able")).toBeTruthy();
    expect(screen.getByText("No phone for the cadet")).toBeTruthy();
  });

  it("nothing to fix opens on everyone", async () => {
    answer({ ...AUDIT, cadets: [cadet({})] });
    renderWithQuery(<ContactAuditPage />);
    expect(await screen.findByText("Amy Able")).toBeTruthy();
  });

  it("no cadets shows the empty state", async () => {
    answer({ ...AUDIT, cadets: [] });
    renderWithQuery(<ContactAuditPage />);
    expect(await screen.findByText("No cadets to check")).toBeTruthy();
  });

  it("an API error shows the error, not an empty list", async () => {
    answer({ detail: "Staff only" }, 403);
    renderWithQuery(<ContactAuditPage />);
    expect(await screen.findByText("Staff only")).toBeTruthy();
    expect(screen.queryByText("No cadets to check")).toBeNull();
  });

  it("an error body where the audit was expected doesn't crash the page", async () => {
    answer({ detail: "nope" });
    renderWithQuery(<ContactAuditPage />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Export to Excel/ })).toBeTruthy());
    expect(screen.queryByText("No cadets to check")).toBeNull();
  });

  it("Export to Excel downloads the API's sheet", async () => {
    answer(AUDIT);
    renderWithQuery(<ContactAuditPage />);
    await screen.findByText("Ben Zed");
    fireEvent.click(screen.getByRole("button", { name: /Export to Excel/ }));
    await waitFor(() => expect(saved).toHaveBeenCalled());
    const [url, init] = vi.mocked(fetch).mock.calls.at(-1)!;
    expect(url).toMatch(/\/cadets\/audit\/contacts\/export$/);
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });

  it("a failed export says why", async () => {
    answer(AUDIT);
    renderWithQuery(<ContactAuditPage />);
    await screen.findByText("Ben Zed");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({ detail: "Database down" }), { status: 503 })))
    );
    fireEvent.click(screen.getByRole("button", { name: /Export to Excel/ }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Database down"));
    expect(saved).not.toHaveBeenCalled();
  });
});
