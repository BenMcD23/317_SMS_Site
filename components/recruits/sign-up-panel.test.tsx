// @vitest-environment jsdom
// The recruitment-evening sign-up switch and QR code on the Recruits page:
// opening it on the night, closing it, and the code parents scan.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SignupPanel } from "@/components/recruits/sign-up-panel";
import type { SignupState } from "@/lib/recruits";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn(), signOut: vi.fn() }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

const URL_ = "https://www.317atc.co.uk/enrol";
const CLOSED: SignupState = { open: false, openUntil: null, openedBy: null, url: URL_ };
const OPEN: SignupState = {
  open: true,
  openUntil: "2026-11-06T00:00:00",
  openedBy: "staff@317atc.co.uk",
  url: URL_,
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** GET answers `state`; PUT answers `put` (default: the state it asked for). */
function stub(state: () => Response, put?: (open: boolean) => Response) {
  const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "PUT") {
      const { open } = JSON.parse(String(init.body));
      return put ? put(open) : json(open ? OPEN : CLOSED);
    }
    return state();
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SignupPanel />
    </QueryClientProvider>
  );
}

const puts = (fetch: ReturnType<typeof stub>) =>
  fetch.mock.calls
    .filter(([, init]) => init?.method === "PUT")
    .map(([url, init]) => [url, JSON.parse(String(init!.body))]);

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
});

describe("Recruitment evening sign-up", () => {
  it("is shown closed, with the code parents scan already there to print", async () => {
    stub(() => json(CLOSED));
    show();
    expect(await screen.findByText("Closed")).toBeVisible();
    expect(screen.getByRole("button", { name: "Open sign-up" })).toBeVisible();
    expect(await screen.findByRole("img", { name: "QR code for the recruit sign-up page" })).toBeVisible();
    expect(screen.getByText("www.317atc.co.uk/enrol")).toBeVisible();
    expect(screen.getByText(/until then the code just says sign-ups aren't open/)).toBeVisible();
  });

  it("opening it tells the API and shows it open until midnight", async () => {
    const fetch = stub(() => json(CLOSED));
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Open sign-up" }));

    expect(await screen.findByText("Open")).toBeVisible();
    expect(puts(fetch)).toEqual([[expect.stringMatching(/\/recruits\/sign-up$/), { open: true }]]);
    expect(toast.success).toHaveBeenCalledWith("Sign-up page open until midnight.");
    expect(screen.getByRole("button", { name: "Close sign-up" })).toBeVisible();
  });

  it("closing it asks first, and a 'no' leaves it open", async () => {
    const fetch = stub(() => json(OPEN));
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Close sign-up" }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/won't be able to sign up/)).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(puts(fetch)).toEqual([]);
    expect(screen.getByText("Open")).toBeVisible();
  });

  it("confirming the close shuts it", async () => {
    const fetch = stub(() => json(OPEN));
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Close sign-up" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByRole("button", { name: "Confirm" }));

    expect(await screen.findByText("Closed")).toBeVisible();
    expect(puts(fetch).map(([, body]) => body)).toEqual([{ open: false }]);
    expect(toast.success).toHaveBeenCalledWith("Sign-up page closed.");
  });

  it("a refused switch says why and leaves it as it was", async () => {
    stub(
      () => json(CLOSED),
      () => json({ detail: "Staff access required" }, 403)
    );
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Open sign-up" }));

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Staff access required"));
    expect(screen.getByText("Closed")).toBeVisible();
    expect(screen.getByRole("button", { name: "Open sign-up" })).toBeEnabled();
  });

  it("an API that can't be reached when switching says it couldn't open", async () => {
    stub(
      () => json(CLOSED),
      () => json({}, 502)
    );
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole("button", { name: "Open sign-up" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("downloads the code as a named PNG", async () => {
    stub(() => json(CLOSED));
    const user = userEvent.setup();
    show();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await user.click(await screen.findByRole("button", { name: "Download QR code" }));

    await waitFor(() => expect(click).toHaveBeenCalled());
    const a = click.mock.contexts[0] as HTMLAnchorElement;
    expect(a.download).toBe("317-recruit-sign-up.png");
    expect(a.href).toMatch(/^data:image\/png;base64,/);
  });

  it("copies the page's link", async () => {
    stub(() => json(CLOSED));
    const user = userEvent.setup();
    show();
    await screen.findByText("Closed");
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(writeText).toHaveBeenCalledWith(URL_);
    expect(toast.success).toHaveBeenCalledWith("Link copied.");
  });

  it("a copy the browser refuses says so instead of claiming it worked", async () => {
    stub(() => json(CLOSED));
    const user = userEvent.setup();
    show();
    await screen.findByText("Closed");
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn(async () => Promise.reject(new Error("denied"))) },
      configurable: true,
    });
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(toast.error).toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("a 500 shows the error and no switch", async () => {
    stub(() => json({ detail: "Database unavailable" }, 500));
    show();
    expect(await screen.findByText("Couldn't load the sign-up page")).toBeVisible();
    expect(screen.getByText("Database unavailable")).toBeVisible();
    expect(screen.queryByRole("button", { name: /sign-up/ })).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("an error body where the state should be shows no switch or code rather than crashing", async () => {
    stub(() => json({ detail: "odd" }));
    show();
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    expect(screen.queryByRole("button", { name: /sign-up/ })).toBeNull();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
