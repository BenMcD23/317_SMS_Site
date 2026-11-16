// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok" }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ signIn: vi.fn(), useSession: () => SESSION }));

import { useCadetSearch } from "@/lib/use-cadet-search";

const AMY = { cin: 1, first_name: "Amy", last_name: "Able", rank: "Cpl", flight: "A" };

function wrapperFor(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}
const freshClient = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

function answer(make: () => Response | Promise<Response>) {
  const fn = vi.fn(async (_url: string) => make());
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("useCadetSearch", () => {
  it("finds cadets once two characters have been typed", async () => {
    const fetchMock = answer(() => new Response(JSON.stringify([AMY])));
    const { result } = renderHook(() => useCadetSearch("am"), { wrapper: wrapperFor(freshClient()) });
    await waitFor(() => expect(result.current.hits).toEqual([AMY]));
    expect(fetchMock.mock.calls[0][0]).toContain("/cadets/search?q=am");
    expect(result.current.searching).toBe(false);
  });

  it("doesn't ask the API about one character", async () => {
    const fetchMock = answer(() => new Response("[]"));
    const { result } = renderHook(() => useCadetSearch("a"), { wrapper: wrapperFor(freshClient()) });
    await new Promise((r) => setTimeout(r, 300));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current).toEqual({ hits: [], searching: false });
  });

  it("counts as searching while the typing hasn't paused, so 'No cadet found' doesn't flash", () => {
    answer(() => new Response("[]"));
    const { result } = renderHook(() => useCadetSearch("amy"), { wrapper: wrapperFor(freshClient()) });
    expect(result.current.searching).toBe(true);
  });

  // The palette and the picker share one cache: the second asks nobody.
  it("answers a name another search box just looked up without asking again", async () => {
    const fetchMock = answer(() => new Response(JSON.stringify([AMY])));
    const client = freshClient();
    const first = renderHook(() => useCadetSearch("amy"), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(first.result.current.hits).toEqual([AMY]));
    const second = renderHook(() => useCadetSearch("amy"), { wrapper: wrapperFor(client) });
    await waitFor(() => expect(second.result.current.hits).toEqual([AMY]));
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "an error body ({detail}) where a list was expected",
      () => new Response('{"detail":"boom"}', { status: 500 }),
    ],
    ["a 200 that isn't a list", () => new Response('{"detail":"odd"}')],
    ["the API being unreachable", () => Promise.reject(new TypeError("Failed to fetch"))],
  ])("gives no hits, rather than throwing, for %s", async (_, make) => {
    answer(make as () => Response);
    const { result } = renderHook(() => useCadetSearch("amy"), { wrapper: wrapperFor(freshClient()) });
    await waitFor(() => expect(result.current.searching).toBe(false));
    expect(result.current.hits).toEqual([]);
  });

  it("asks nothing while switched off", async () => {
    const fetchMock = answer(() => new Response("[]"));
    renderHook(() => useCadetSearch("amy", { enabled: false }), { wrapper: wrapperFor(freshClient()) });
    await new Promise((r) => setTimeout(r, 300));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("clears the list as soon as the box is cut back below two characters", async () => {
    answer(() => new Response(JSON.stringify([AMY])));
    const { result, rerender } = renderHook(({ q }) => useCadetSearch(q), {
      wrapper: wrapperFor(freshClient()),
      initialProps: { q: "amy" },
    });
    await waitFor(() => expect(result.current.hits).toEqual([AMY]));
    rerender({ q: "a" });
    expect(result.current.hits).toEqual([]);
  });
});
