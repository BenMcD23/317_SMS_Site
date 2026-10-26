// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({
  current: {
    data: { id_token: "tok", role: "staff", is_oc: true, user: { email: "oc@317atc.co.uk" } },
    status: "authenticated",
    update: () => Promise.resolve(null),
  },
}));
vi.mock("next-auth/react", () => ({ useSession: () => session.current, signIn: vi.fn(), signOut: vi.fn() }));

async function renderPage() {
  vi.resetModules();
  const { default: OcLeavingPage } = await import("@/app/oc/leaving/page");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OcLeavingPage />
    </QueryClientProvider>
  );
}

afterEach(() => {
  window.localStorage.clear();
  session.current = {
    ...session.current,
    data: { ...session.current.data, is_oc: true, user: { email: "oc@317atc.co.uk" } },
  };
});

describe("OC leaving process page", () => {
  it("shows the leavers and parent emails to the OC", async () => {
    const fetchMock = vi.fn(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);
    await renderPage();
    expect(screen.getByRole("heading", { name: "Leaving process" })).toBeTruthy();
    expect(screen.queryByText("OC access required")).toBeNull();
  });

  it("drops the parent emails card while personal data is hidden", async () => {
    window.localStorage.setItem("sms.privacy.hide", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response(JSON.stringify({}), { status: 200 })))
    );
    await renderPage();
    expect(screen.getByRole("heading", { name: "Leaving process" })).toBeTruthy();
    expect(screen.queryByText(/Email the parents/)).toBeNull();
    expect(screen.queryByText(/email to send their parents/)).toBeNull();
  });

  it("turns away other staff without asking the API", async () => {
    session.current = {
      ...session.current,
      data: { ...session.current.data, is_oc: false, user: { email: "staff@317atc.co.uk" } },
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await renderPage();
    expect(screen.getByText("OC access required")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
