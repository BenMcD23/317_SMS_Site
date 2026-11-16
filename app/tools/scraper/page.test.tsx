// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

describe("scraper list", () => {
  it("names the cadet scraper for what it updates, parent emails included", async () => {
    renderWithHost(() => Response.json({ node: "home", on_oracle: false }));
    expect(await screen.findByText("Cadet Records Scraper")).toBeTruthy();
    expect(screen.queryByText("Cadet Qualification Scraper")).toBeNull();
    expect(screen.getByText(/parents' emails from the Next Of Kin report/)).toBeTruthy();
  });
});

describe("scraper settings tabs", () => {
  /** Answers by path; anything unlisted is `{}`. */
  function renderWith(routes: Record<string, () => Response>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const path = new URL(String(url), "http://x").pathname;
        const hit = Object.keys(routes).find((p) => path.endsWith(p));
        return hit ? routes[hit]() : Response.json({});
      })
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <ScraperPage />
      </QueryClientProvider>
    );
  }
  const open = async (tab: string) => userEvent.setup().click(await screen.findByRole("tab", { name: tab }));

  const SCHEDULE = {
    enabled: true,
    days: ["mon"],
    hour: 21,
    minute: 30,
    runs_as: null,
    updated_by: null,
    updated_at: null,
  };

  it("shows each scraper's schedule", async () => {
    renderWith({ "/scraper-schedules": () => Response.json({ "cadet-quali": SCHEDULE }) });
    await open("Schedule");
    expect(await screen.findByDisplayValue("21:30")).toBeTruthy();
  });

  // It used to store the error body as the schedules and crash reading a card.
  it("says the schedules couldn't be loaded, instead of crashing, when the API errors", async () => {
    renderWith({
      "/scraper-schedules": () => Response.json({ detail: "Schedules are down" }, { status: 500 }),
    });
    await open("Schedule");
    expect(await screen.findByText("Could not load schedules")).toBeTruthy();
    expect(screen.getByText("Schedules are down")).toBeTruthy();
  });

  it("shows a scraper the API sent no schedule for as switched off", async () => {
    renderWith({ "/scraper-schedules": () => Response.json({}) });
    await open("Schedule");
    expect((await screen.findAllByDisplayValue("22:00")).length).toBeGreaterThan(0);
  });

  it("lists the qualifications whose proof is checked", async () => {
    renderWith({ "/attachment-check-quals": () => Response.json({ quals: ["First Aid Level 2"] }) });
    await open("Attachment Checks");
    expect(await screen.findByText("First Aid Level 2")).toBeTruthy();
  });

  it("says the attachment checks couldn't be loaded, instead of crashing, when the API errors", async () => {
    renderWith({ "/attachment-check-quals": () => Response.json({ detail: "Nope" }, { status: 500 }) });
    await open("Attachment Checks");
    expect(await screen.findByText("Could not load attachment checks")).toBeTruthy();
  });
});
