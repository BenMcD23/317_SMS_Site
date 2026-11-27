// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok", role: "staff", user: { email: "s@x" } }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));
const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { toast } from "sonner";

import SettingsPage from "@/app/attendance/reports/settings/page";
import { renderWithQuery } from "@/tests/render-with-query";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const SETTINGS = {
  enabled: false,
  runsAs: null,
  updatedBy: null,
  updatedAt: null,
  schedule: { days: ["wed", "fri"], hour: 21, minute: 30 },
  recipients: [{ email: "nco@x", name: "Nina Corporal", role: "nco" }],
  candidates: [{ email: "snco@x", name: "Sid Senior", role: "snco" }],
};

type Handler = (url: string, init: RequestInit) => Response;

function stub(write: Handler = () => json(SETTINGS)) {
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) =>
    (init.method ?? "GET") === "GET" ? json(SETTINGS) : write(url, init)
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

const writes = (fetch: ReturnType<typeof stub>) =>
  fetch.mock.calls
    .filter(([, init]) => init?.method && init.method !== "GET")
    .map(([url, init]) => [url, init!.method, init!.body]);

describe("Parade report settings", () => {
  it("shows the schedule, who is on the list and who can be added", async () => {
    stub();
    renderWithQuery(<SettingsPage />);
    expect(await screen.findByText(/At 21:30 on Wednesday and Friday/)).toBeInTheDocument();
    const list = screen.getByRole("list", { name: "Report recipients" });
    expect(within(list).getByText("Nina Corporal")).toBeInTheDocument();
    expect(within(list).getByText("NCO")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "Send the report after parade" })).not.toBeChecked();
  });

  it("switching it on saves and shows what the API now holds", async () => {
    const fetch = stub(() => json({ ...SETTINGS, enabled: true, runsAs: "s@x" }));
    renderWithQuery(<SettingsPage />);
    await userEvent.click(await screen.findByRole("switch", { name: "Send the report after parade" }));
    expect(writes(fetch)).toEqual([
      ["/api/parade-reports/settings", "PUT", JSON.stringify({ enabled: true })],
    ]);
    expect(await screen.findByRole("switch", { name: "Send the report after parade" })).toBeChecked();
  });

  it("switching it on without a Bader login shows the API's reason and stays off", async () => {
    stub(() =>
      json({ detail: "The report scrapes Bader with your credentials. Save them in Settings first." }, 400)
    );
    renderWithQuery(<SettingsPage />);
    await userEvent.click(await screen.findByRole("switch", { name: "Send the report after parade" }));
    expect(toast.error).toHaveBeenCalledWith(
      "The report scrapes Bader with your credentials. Save them in Settings first."
    );
    expect(screen.getByRole("switch", { name: "Send the report after parade" })).not.toBeChecked();
  });

  it("removing someone asks first, then takes them off", async () => {
    const fetch = stub(() => json({ ...SETTINGS, recipients: [] }));
    renderWithQuery(<SettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Remove Nina Corporal" }));
    expect(writes(fetch)).toEqual([]); // nothing until confirmed
    await userEvent.click(await screen.findByRole("button", { name: /confirm|remove|yes|continue/i }));
    expect(writes(fetch)).toEqual([["/api/parade-reports/recipients/nco%40x", "DELETE", undefined]]);
    expect(await screen.findByText("No one on the list")).toBeInTheDocument();
  });

  it("the add button waits for someone to be picked", async () => {
    stub();
    renderWithQuery(<SettingsPage />);
    expect(await screen.findByRole("button", { name: "Add to list" })).toBeDisabled();
  });

  it("everyone already on the list leaves nothing to pick", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ ...SETTINGS, candidates: [] }))
    );
    renderWithQuery(<SettingsPage />);
    expect(await screen.findByText("Everyone is on the list")).toBeInTheDocument();
  });

  it("building a night with no register says so and stays on the page", async () => {
    push.mockClear();
    stub(() => json({ detail: "No parade night register for that date" }, 404));
    renderWithQuery(<SettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Build report" }));
    expect(toast.error).toHaveBeenCalledWith("No parade night register for that date");
    expect(push).not.toHaveBeenCalled();
  });

  it("building a report opens it, emailing only when ticked", async () => {
    push.mockClear();
    const fetch = stub(() => json({ date: "2026-11-25" }));
    renderWithQuery(<SettingsPage />);
    const night = await screen.findByLabelText("Parade night");
    await userEvent.clear(night);
    await userEvent.type(night, "2026-11-25");
    await userEvent.click(screen.getByRole("checkbox", { name: "Email it to the list" }));
    await userEvent.click(screen.getByRole("button", { name: "Build report" }));
    expect(writes(fetch)).toEqual([
      ["/api/parade-reports", "POST", JSON.stringify({ date: "2026-11-25", email: true })],
    ]);
    expect(push).toHaveBeenCalledWith("/attendance/reports/2026-11-25");
  });

  it("someone who isn't staff gets the API's refusal, not a blank page", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json({ detail: "Staff access required" }, 403))
    );
    renderWithQuery(<SettingsPage />);
    expect(await screen.findByText("Staff access required")).toBeInTheDocument();
  });
});
