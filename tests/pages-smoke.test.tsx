// @vitest-environment jsdom
/// <reference types="vite/client" />
// Renders every page in the app twice — while its data is still loading, and
// after the API has answered every request with a 500 — and fails if either
// throws. A page that white-screens when the backend has a bad moment is the
// failure users notice most, and nothing else would catch it before they do.
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render } from "@testing-library/react";
import { Suspense, type ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// One stable object, like the real hook — pages key effects on `session`.
const SESSION = {
  data: { id_token: "tok", role: "staff", user: { email: "staff@317atc.co.uk", name: "Sam Staff" } },
  status: "authenticated",
  update: () => Promise.resolve(null),
};
vi.mock("next-auth/react", () => ({
  useSession: () => SESSION,
  signIn: vi.fn(),
  signOut: vi.fn(),
  SessionProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock("next/navigation", () => ({
  useRouter: () => router,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: "1", cin: "1001", box: "A" }),
  redirect: vi.fn(),
  notFound: vi.fn(),
}));

vi.mock("@/lib/reference", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/reference")>();
  return {
    ...real,
    useReference: () => ({
      loaded: true,
      itemTypes: ["Beret", "Tie"],
      noSizeItems: new Set(["Tie"]),
      sizes: { Beret: ["55", "56"] },
      sizingFields: {},
      issuanceCategories: ["Beret", "Tie"],
      issuanceCategoryByItem: { Beret: "Beret", Tie: "Tie" },
      badgeCategories: [{ id: "core", name: "Core", items: ["Squadron"] }],
      categoriesWithoutGainedWhere: new Set(["core"]),
      gainedWhereOptions: [{ value: "camp", label: "Camp" }],
    }),
  };
});

// Server components, layouts and the login page are out of scope here.
// Asserted rather than passed as a type argument: Next 16.3's own `import.meta.glob`
// typing is non-generic and shadows Vite's.
const PAGES = import.meta.glob(["../app/**/page.tsx", "!../app/login/**"]) as Record<
  string,
  () => Promise<{ default: ComponentType<Record<string, unknown>> }>
>;

let fetchMode: "pending" | "error";

beforeEach(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  vi.stubGlobal(
    "EventSource",
    class {
      close() {}
      addEventListener() {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
  // jsdom has no canvas; the signature pads just need something to draw on.
  HTMLCanvasElement.prototype.getContext = (() =>
    new Proxy(
      {},
      {
        get: (_t, key) => (key === "canvas" ? document.createElement("canvas") : () => ({})),
        set: () => true,
      }
    )) as never;
  window.matchMedia ??= (q: string) =>
    ({
      matches: false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }) as unknown as MediaQueryList;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(() =>
      fetchMode === "pending"
        ? new Promise<Response>(() => {})
        : Promise.resolve(new Response(JSON.stringify({ detail: "Internal Server Error" }), { status: 500 }))
    )
  );
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderPage(path: string) {
  const { default: Page } = await PAGES[path]();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const params = Promise.resolve({ id: "1", cin: "1001", box: "A" });
  let result: ReturnType<typeof render> | undefined;
  await act(async () => {
    result = render(
      <QueryClientProvider client={client}>
        <Suspense fallback={null}>
          <Page params={params} searchParams={Promise.resolve({})} />
        </Suspense>
      </QueryClientProvider>
    );
  });
  // Let every rejected/500 request settle and the page re-render with it.
  for (let i = 0; i < 5; i++) await act(async () => void (await new Promise((r) => setTimeout(r, 0))));
  return result!;
}

const paths = Object.keys(PAGES).sort();

describe("every page renders", () => {
  it("finds the pages", () => {
    expect(paths.length).toBeGreaterThan(40);
  });

  it.each(paths)("%s — while loading", async (path) => {
    fetchMode = "pending";
    const { container } = await renderPage(path);
    expect(container).toBeTruthy();
  });

  it.each(paths)("%s — when the API errors", async (path) => {
    fetchMode = "error";
    const { container } = await renderPage(path);
    expect(container).toBeTruthy();
  });
});
