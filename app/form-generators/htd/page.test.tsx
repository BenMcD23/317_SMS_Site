// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ email: "staff@317atc.co.uk", value: null as unknown }));
vi.mock("next-auth/react", () => ({
  useSession: () => {
    // One stable object per identity, like the real hook.
    session.value ??= {
      data: {
        id_token: "tok",
        role: "staff",
        is_oc: session.email === "oc@317atc.co.uk",
        user: { email: session.email },
      },
      status: "authenticated",
      update: () => Promise.resolve(null),
    };
    return session.value;
  },
  signIn: vi.fn(),
}));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
vi.mock("@/lib/download", () => ({ saveResponseAsFile: vi.fn(() => Promise.resolve()) }));

const me = {
  cin: 10,
  email: "staff@317atc.co.uk",
  firstName: "Sam",
  lastName: "Staff",
  rank: "Sgt",
  address: "1 Home Rd, Failsworth, Manchester, M35 0AA",
  attendance: { "2026-01": 4 },
};
const other = { ...me, cin: 11, email: "sue@317atc.co.uk", firstName: "Sue", lastName: "Second" };

type Reply = (url: string, init?: RequestInit) => Response;
function stubApi(reply: Reply) {
  // A fresh Response per call — a body can only be read once.
  const fetchMock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(reply(url, init)));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const roster =
  (people: unknown[]): Reply =>
  (url) => {
    if (url.endsWith("/form-generators/htd/staff")) return json(people);
    if (url.endsWith("/calculate-mileage")) return json({ miles: 2 });
    return new Response("docx", { status: 200 });
  };

async function renderAs(email: string) {
  session.email = email;
  session.value = null;
  vi.resetModules();
  const { default: HTDPage } = await import("@/app/form-generators/htd/page");
  return render(<HTDPage />);
}

beforeEach(() => {
  toast.error.mockClear();
});

describe("HTD claim page", () => {
  it("staff get their own claim filled in, with no one else to pick", async () => {
    const fetchMock = stubApi(roster([me]));
    await renderAs("staff@317atc.co.uk");
    expect(await screen.findByText("Personal details")).toBeTruthy();
    expect(screen.queryByRole("combobox", { name: "Staff member" })).toBeNull();
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/form-generators\/htd\/staff$/);
  });

  it("generating sends whose claim it is, so the API can check it's theirs", async () => {
    const fetchMock = stubApi(roster([me]));
    await renderAs("staff@317atc.co.uk");
    await userEvent.click(await screen.findByRole("button", { name: "Generate Word Document" }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/form-generators/htd"))).toBe(true)
    );
    const [, init] = fetchMock.mock.calls.find(([u]) => String(u).endsWith("/form-generators/htd"))!;
    expect(JSON.parse(init?.body as string).cin).toBe(10);
  });

  it("the API refusing someone else's claim is shown, not swallowed", async () => {
    stubApi((url, init) =>
      init?.method === "POST" && url.endsWith("/form-generators/htd")
        ? json({ detail: "You can only generate your own HTD claim" }, 403)
        : roster([me])(url, init)
    );
    await renderAs("staff@317atc.co.uk");
    await userEvent.click(await screen.findByRole("button", { name: "Generate Word Document" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("You can only generate your own HTD claim"));
  });

  it("someone not on the roster is told why there's nothing to fill in", async () => {
    stubApi(roster([]));
    await renderAs("new@317atc.co.uk");
    expect(await screen.findByText(/isn't linked to a staff record/)).toBeTruthy();
    expect(screen.queryByText("Personal details")).toBeNull();
  });

  it("the OC picks whoever the claim is for", async () => {
    stubApi(roster([me, other]));
    await renderAs("oc@317atc.co.uk");
    expect(await screen.findByRole("combobox", { name: "Staff member" })).toBeTruthy();
    // Nobody is chosen for the OC until they pick.
    expect(screen.queryByText("Personal details")).toBeNull();
  });

  it("a failed roster load says so", async () => {
    stubApi(() => json({ detail: "boom" }, 500));
    await renderAs("staff@317atc.co.uk");
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not load your staff record."));
  });
});
