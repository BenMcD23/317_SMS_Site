// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ email: "", value: null as unknown }));
vi.mock("next-auth/react", () => ({
  useSession: () =>
    (session.value ??= {
      data: {
        id_token: "tok",
        role: "staff",
        is_oc: session.email === "oc@317atc.co.uk",
        user: { email: session.email },
      },
      status: "authenticated",
    }),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }), useParams: () => ({ id: "10" }) }));

async function renderAs(email: string, page: "overview" | "detail") {
  session.email = email;
  session.value = null;
  vi.resetModules();
  const { default: Page } =
    page === "overview" ? await import("@/app/staff/overview/page") : await import("@/app/staff/[id]/page");
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>
  );
}

describe("Staff pages", () => {
  it.each(["overview", "detail"] as const)(
    "the %s page turns away staff who aren't the OC, without loading anything",
    async (page) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      await renderAs("staff@317atc.co.uk", page);
      expect(screen.getByText("OC access required")).toBeTruthy();
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it("the OC sees the roster", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response(
            JSON.stringify([
              { cin: 10, email: "a@x", firstName: "Sam", lastName: "Staff", rank: "Sgt", userId: null },
            ]),
            { status: 200 }
          )
        )
      )
    );
    await renderAs("oc@317atc.co.uk", "overview");
    expect(await screen.findByText(/Sam Staff/)).toBeTruthy();
    expect(screen.queryByText("OC access required")).toBeNull();
  });

  const SAM = { cin: 10, email: "a@x", firstName: "Sam", lastName: "Staff", rank: "Sgt", userId: null };

  it("the detail page shows the member named in the URL", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([SAM]), { status: 200 }))
    );
    await renderAs("oc@317atc.co.uk", "detail");
    expect(await screen.findByRole("heading", { name: "Sam Staff" })).toBeTruthy();
  });

  it("the detail page says when nobody has that CIN", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify([{ ...SAM, cin: 11 }]), { status: 200 }))
    );
    await renderAs("oc@317atc.co.uk", "detail");
    expect(await screen.findByText("Staff member not found.")).toBeTruthy();
  });

  it("the detail page shows the API's error instead of 'not found' when the list fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ detail: "Database unavailable" }), { status: 500 }))
    );
    await renderAs("oc@317atc.co.uk", "detail");
    expect(await screen.findByText("Database unavailable")).toBeTruthy();
    expect(screen.queryByText("Staff member not found.")).toBeNull();
  });
});
