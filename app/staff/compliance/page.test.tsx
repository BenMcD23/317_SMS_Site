// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import StaffCompliancePage from "@/app/staff/compliance/page";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));

const ITEMS = [
  { key: "dbs", name: "DBS", kind: "vetting", achieved: "2024-03-01", expires: "2027-03-01", status: "ok" },
  {
    key: "training:1",
    name: "Safeguarding",
    kind: "training",
    achieved: "2024-01-01",
    expires: "2026-12-20",
    status: "expiring",
  },
  { key: "training:2", name: "Prevent", kind: "training", achieved: null, expires: null, status: "missing" },
];
const person = (cin: number, name: string, status: string | null, items: unknown[] | null) => ({
  cin,
  name,
  rank: "CI",
  items,
  status,
  synced_at: status ? "2026-11-10T09:00:00" : null,
});

function api(body: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(body), { status }))
  );
}

describe("DBS & Training page", () => {
  it("the OC sees everyone, worst first, with what each must do", async () => {
    api({
      everyone: true,
      due_within_days: 60,
      staff: [
        person(1, "Ann Fine", "ok", [ITEMS[0]]),
        person(2, "Órla Due", "missing", ITEMS),
        person(3, "Pat Never", null, null),
      ],
    });
    renderWithQuery(<StaffCompliancePage />);
    const rows = await screen.findAllByRole("listitem");
    const people = rows.filter((r) => r.parentElement?.parentElement?.tagName !== "LI");
    expect(people.map((r) => r.textContent?.split("CI ")[1]?.slice(0, 8))).toEqual([
      "Órla Due",
      "Ann Fine",
      "Pat Neve",
    ]);
    expect(screen.getByText("No record on the portal")).toBeTruthy();
    expect(screen.getByText("Expires 20 Dec 2026")).toBeTruthy();
    // Up-to-date items aren't listed in the OC's view; only what needs doing.
    expect(screen.queryByText("Expires 1 Mar 2027")).toBeNull();
    expect(screen.getByText("Not synced from the portal")).toBeTruthy();
    expect(screen.getByText("Lapsed or not done").nextElementSibling?.textContent).toBe("1");
    expect(screen.getByText(/Last read from the portal/)).toBeTruthy();
  });

  it("anyone else sees their own record in full, with no squadron figures", async () => {
    api({ everyone: false, due_within_days: 60, staff: [person(1, "Sam Staff", "expiring", ITEMS)] });
    renderWithQuery(<StaffCompliancePage />);
    expect(await screen.findByText("Expires 1 Mar 2027")).toBeTruthy();
    expect(screen.queryByText("Lapsed or not done")).toBeNull(); // no squadron figures strip
    expect(screen.getByText(/Your DBS, BPSS and mandatory training/)).toBeTruthy();
  });

  it("a staff member not on the roster is told why there's nothing", async () => {
    api({ everyone: false, due_within_days: 60, staff: [] });
    renderWithQuery(<StaffCompliancePage />);
    expect(await screen.findByText("You're not on the staff roster")).toBeTruthy();
  });

  it("an API error is an error", async () => {
    api({ detail: "Staff access required" }, 403);
    renderWithQuery(<StaffCompliancePage />);
    expect(await screen.findByText("Staff access required")).toBeTruthy();
  });
});
