// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import ScraperPage from "@/app/tools/scraper/page";

const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam Staff" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));

const WARNING = /Scrapers may not work right now/;

function renderWithHost(host: () => Response) {
  const fetchMock = vi.fn(async (url: string) =>
    String(url).endsWith("/scraper-host") ? host() : Response.json({})
  );
  vi.stubGlobal("fetch", fetchMock);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <ScraperPage />
    </QueryClientProvider>
  );
  return fetchMock;
}

const hostCalled = (fetchMock: ReturnType<typeof vi.fn>) =>
  waitFor(() => expect(fetchMock.mock.calls.some(([u]) => String(u).endsWith("/scraper-host"))).toBe(true));

describe("scraper page host warning", () => {
  it("warns that scrapers may fail while the API is on Oracle, naming the node", async () => {
    renderWithHost(() => Response.json({ node: "oracle2", on_oracle: true }));
    expect(await screen.findByText(WARNING)).toBeTruthy();
    expect(screen.getByText(/backup Oracle server \(oracle2\)/)).toBeTruthy();
  });

  it("says nothing while the API is on home", async () => {
    const fetchMock = renderWithHost(() => Response.json({ node: "home", on_oracle: false }));
    await hostCalled(fetchMock);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(WARNING)).toBeNull();
  });

  it("doesn't cry wolf when the host check itself fails", async () => {
    // An older API without /scraper-host, or a blip: no news isn't bad news.
    const fetchMock = renderWithHost(() => Response.json({ detail: "Not Found" }, { status: 404 }));
    await hostCalled(fetchMock);
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText(WARNING)).toBeNull();
  });
});
