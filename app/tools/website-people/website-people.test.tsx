// @vitest-environment jsdom
// The Staff & NCO Photos page: what the website shows, adding someone, a
// promotion or new photo, taking someone off, and the API saying no.
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WebsitePeoplePage from "@/app/tools/website-people/page";
import type { WebsitePeople } from "@/lib/website-people";
import { renderWithQuery } from "@/tests/render-with-query";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const PEOPLE: WebsitePeople = {
  staff: [
    { rank: "Flt Lt", name: "Simon Doherty", image: "Flt_Lt_Doherty.webp" },
    {
      rank: "CI",
      sortAs: "Wg Cdr (Ret'd)",
      name: "Roy Catterall (Wg Cdr Ret'd)",
      image: "CI_Catterall.webp",
    },
    { rank: "CI", name: "Graham Boxall", image: "Placeholder.webp" },
  ],
  ncos: [
    { rank: "FS", name: "M Beverley", image: "FS Beverley.webp" },
    { rank: "Cpl", name: "S Ó Briain", image: "cpl-s-o-briain.webp" },
  ],
  ranks: {
    staff: ["Sqn Ldr", "Flt Lt", "Wg Cdr (Ret'd)", "Fg Off", "CI"],
    ncos: ["CWO", "FS", "Sgt", "Cpl"],
  },
};

type Call = { url: string; method: string; body: FormData | null };
let calls: Call[];
// What the list GET and the writes answer; tests override one or the other.
let list: () => Response;
let reply: (call: Call) => Response;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  calls = [];
  list = () => json(PEOPLE);
  reply = () => json({});
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = { url, method: init.method ?? "GET", body: (init.body as FormData) ?? null };
      calls.push(call);
      // A fresh Response every call: a body can only be read once.
      return call.method === "GET" ? list() : reply(call);
    })
  );
  // Radix Select uses these, which jsdom lacks.
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.releasePointerCapture = vi.fn();
  toast.success.mockReset();
  toast.error.mockReset();
});

const writes = () => calls.filter((c) => c.method !== "GET");

async function choose(label: string, option: string) {
  const dialog = screen.getByRole("dialog");
  await userEvent.click(within(dialog).getByLabelText(label));
  await userEvent.click(await screen.findByRole("option", { name: option }));
}

describe("the list", () => {
  it("shows staff in the website's order, with who's listed elsewhere and who has no photo", async () => {
    renderWithQuery(<WebsitePeoplePage />);
    const rows = await screen.findAllByRole("button", { name: /Flt Lt|CI / });
    expect(rows.map((r) => r.textContent)).toEqual([
      "Flt Lt Simon Doherty",
      "CI Roy Catterall (Wg Cdr Ret'd)Listed under Wg Cdr (Ret'd)",
      "CI Graham BoxallNo photo yet",
    ]);
    expect(screen.getByRole("tab", { name: "Staff 3" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "NCOs 2" })).toBeTruthy();
  });

  it("the NCOs tab shows the NCOs, non-ASCII names and all", async () => {
    renderWithQuery(<WebsitePeoplePage />);
    await userEvent.click(await screen.findByRole("tab", { name: "NCOs 2" }));
    expect(await screen.findByRole("button", { name: "Cpl S Ó Briain" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add NCO" })).toBeTruthy();
  });

  it("an API error shows why, instead of an empty list", async () => {
    list = () => json({ detail: "Could not fetch src/data/people.json" }, 500);
    renderWithQuery(<WebsitePeoplePage />);
    expect(await screen.findByText("Could not fetch src/data/people.json")).toBeTruthy();
    expect(screen.queryByText(/on the website yet/)).toBeNull();
    // Nothing to add to until the list (and its ranks) has loaded.
    expect(screen.getByRole("button", { name: "Add staff" })).toBeDisabled();
  });

  it("an empty group says so", async () => {
    list = () => json({ ...PEOPLE, ncos: [] });
    renderWithQuery(<WebsitePeoplePage />);
    await userEvent.click(await screen.findByRole("tab", { name: "NCOs 0" }));
    expect(screen.getByText("No NCOs on the website yet")).toBeTruthy();
  });
});

describe("adding", () => {
  it("staff can be added without a photo, and the list reloads", async () => {
    reply = () => json({ rank: "CI", name: "Jacob Gill", image: "Placeholder.webp" });
    renderWithQuery(<WebsitePeoplePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Add staff" }));
    await choose("Rank", "CI");
    await userEvent.type(screen.getByLabelText("Name"), "  Jacob   Gill ");
    await userEvent.click(screen.getByRole("button", { name: "Add staff" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    const [call] = writes();
    expect(call.url).toMatch(/\/website-people\/staff$/);
    expect(call.method).toBe("POST");
    expect(call.body?.get("rank")).toBe("CI");
    expect(call.body?.get("name")).toBe("Jacob Gill");
    expect(call.body?.has("file")).toBe(false);
    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(calls.filter((c) => c.method === "GET")).toHaveLength(2);
  });

  it("the retired-officer slot isn't offered as a rank someone holds", async () => {
    renderWithQuery(<WebsitePeoplePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Add staff" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByLabelText("Rank"));
    expect(screen.queryByRole("option", { name: "Wg Cdr (Ret'd)" })).toBeNull();
    expect(screen.getByRole("option", { name: "Flt Lt" })).toBeTruthy();
  });

  it("an NCO without a photo isn't sent, and the form says what's missing", async () => {
    renderWithQuery(<WebsitePeoplePage />);
    await userEvent.click(await screen.findByRole("tab", { name: "NCOs 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Add NCO" }));
    await choose("Rank", "Sgt");
    await userEvent.type(screen.getByLabelText("Name"), "C Mack");
    await userEvent.click(screen.getByRole("button", { name: "Add NCO" }));

    expect(await screen.findByText("Add a photo")).toBeTruthy();
    expect(writes()).toEqual([]);
  });

  it("an NCO with a photo is sent with it", async () => {
    renderWithQuery(<WebsitePeoplePage />);
    await userEvent.click(await screen.findByRole("tab", { name: "NCOs 2" }));
    await userEvent.click(screen.getByRole("button", { name: "Add NCO" }));
    await choose("Rank", "Sgt");
    await userEvent.type(screen.getByLabelText("Name"), "C Mack");
    const file = new File(["jpeg"], "mack.jpg", { type: "image/jpeg" });
    await userEvent.upload(screen.getByLabelText("Photo"), file);
    await userEvent.click(screen.getByRole("button", { name: "Add NCO" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].url).toMatch(/\/website-people\/ncos$/);
    expect(writes()[0].body?.get("file")).toBe(file);
  });

  it("a missing rank or name is caught before anything is sent", async () => {
    renderWithQuery(<WebsitePeoplePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Add staff" }));
    await userEvent.click(screen.getByRole("button", { name: "Add staff" }));
    expect(await screen.findByText("Choose a rank")).toBeTruthy();
    expect(screen.getByText("Enter a name")).toBeTruthy();
    expect(writes()).toEqual([]);
  });

  it("the API refusing (a duplicate) shows its message and keeps the form filled in", async () => {
    reply = () => json({ detail: "Jacob Gill is already on the website." }, 409);
    renderWithQuery(<WebsitePeoplePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Add staff" }));
    await choose("Rank", "CI");
    await userEvent.type(screen.getByLabelText("Name"), "Jacob Gill");
    await userEvent.click(screen.getByRole("button", { name: "Add staff" }));

    expect(await screen.findByText("Jacob Gill is already on the website.")).toBeTruthy();
    expect(screen.getByLabelText("Name")).toHaveValue("Jacob Gill");
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("FastAPI's validation list is shown as words, not [object Object]", async () => {
    reply = () => json({ detail: [{ msg: "Field required" }] }, 422);
    renderWithQuery(<WebsitePeoplePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Add staff" }));
    await choose("Rank", "CI");
    await userEvent.type(screen.getByLabelText("Name"), "Jacob Gill");
    await userEvent.click(screen.getByRole("button", { name: "Add staff" }));
    expect(await screen.findByText("Field required")).toBeTruthy();
  });

  it("the server being unreachable says so", async () => {
    renderWithQuery(<WebsitePeoplePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Add staff" }));
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));
    await choose("Rank", "CI");
    await userEvent.type(screen.getByLabelText("Name"), "Jacob Gill");
    await userEvent.click(screen.getByRole("button", { name: "Add staff" }));
    expect(await screen.findByText(/Couldn't reach the server/)).toBeTruthy();
  });
});

describe("editing", () => {
  it("a promotion sends the whole form to that person's address", async () => {
    renderWithQuery(<WebsitePeoplePage />);
    await userEvent.click(await screen.findByRole("tab", { name: "NCOs 2" }));
    await userEvent.click(await screen.findByRole("button", { name: "Cpl S Ó Briain" }));
    expect(screen.getByLabelText("Name")).toHaveValue("S Ó Briain");
    await choose("Rank", "Sgt");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(writes()).toHaveLength(1));
    const [call] = writes();
    expect(call.method).toBe("PATCH");
    expect(call.url).toMatch(/\/website-people\/ncos\/S%20%C3%93%20Briain$/);
    expect(call.body?.get("rank")).toBe("Sgt");
    expect(call.body?.get("name")).toBe("S Ó Briain");
    // No new photo picked, so the old one stays.
    expect(call.body?.has("file")).toBe(false);
  });

  it("someone listed under another rank keeps it unless it's changed", async () => {
    renderWithQuery(<WebsitePeoplePage />);
    await userEvent.click(await screen.findByRole("button", { name: /Roy Catterall/ }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body?.get("sort_as")).toBe("Wg Cdr (Ret'd)");
  });

  it("setting list-under back to their own rank leaves it out, which clears it", async () => {
    renderWithQuery(<WebsitePeoplePage />);
    await userEvent.click(await screen.findByRole("button", { name: /Roy Catterall/ }));
    await choose("List under", "Their own rank");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0].body?.has("sort_as")).toBe(false);
  });

  it("NCOs have no list-under option", async () => {
    renderWithQuery(<WebsitePeoplePage />);
    await userEvent.click(await screen.findByRole("tab", { name: "NCOs 2" }));
    await userEvent.click(await screen.findByRole("button", { name: "FS M Beverley" }));
    expect(screen.queryByLabelText("List under")).toBeNull();
  });
});

describe("removing", () => {
  it("asks first, then takes them off", async () => {
    renderWithQuery(<WebsitePeoplePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Flt Lt Simon Doherty" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove from website" }));
    expect(screen.getByText("Take Flt Lt Simon Doherty and their photo off the website?")).toBeTruthy();
    expect(writes()).toEqual([]);

    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(writes()).toHaveLength(1));
    expect(writes()[0]).toMatchObject({ method: "DELETE" });
    expect(writes()[0].url).toMatch(/\/website-people\/staff\/Simon%20Doherty$/);
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith(expect.stringContaining("Removed")));
  });

  it("a failed remove says why", async () => {
    reply = (c) => (c.method === "DELETE" ? json({ detail: "Ref update failed" }, 500) : json({}));
    renderWithQuery(<WebsitePeoplePage />);
    await userEvent.click(await screen.findByRole("button", { name: "Flt Lt Simon Doherty" }));
    await userEvent.click(screen.getByRole("button", { name: "Remove from website" }));
    await userEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Ref update failed"));
  });
});
