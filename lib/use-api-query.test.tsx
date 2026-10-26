// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok" }, status: "authenticated" };
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("next-auth/react", () => ({
  useSession: () => session.current,
  signIn: vi.fn(),
}));

import { API_BASE } from "@/lib/config";
import { apiQueryUrl, useApiQuery, useSetApiQueryData } from "@/lib/use-api-query";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function stub(status: number, body: unknown) {
  const fetch = vi.fn(async () => new Response(JSON.stringify(body), { status }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

afterEach(() => {
  session.current = SESSION;
});
session.current = SESSION;

describe("useApiQuery", () => {
  it("sends the token to the backend and returns the body", async () => {
    const fetch = stub(200, [{ cin: 1 }]);
    const { result } = renderHook(() => useApiQuery(["cadets"], "/cadets"), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual([{ cin: 1 }]));
    expect(fetch).toHaveBeenCalledWith(`${API_BASE}/cadets`, { headers: { Authorization: "Bearer tok" } });
  });

  it("calls the site's own /api routes as they are", () => {
    expect(apiQueryUrl("/api/stores/stock")).toBe("/api/stores/stock");
    expect(apiQueryUrl("/stores/stock")).toBe(`${API_BASE}/stores/stock`);
  });

  it("a FastAPI validation list errors with its messages, not [object Object]", async () => {
    stub(422, { detail: [{ msg: "days must be at least 1" }, { msg: "bad flight" }] });
    const { result } = renderHook(() => useApiQuery(["x"], "/x"), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toBe("days must be at least 1, bad flight"));
  });

  it("an unreachable API through the proxy errors with its message", async () => {
    stub(503, { error: "API unreachable" });
    const { result } = renderHook(() => useApiQuery(["x"], "/api/x"), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toBe("API unreachable"));
  });

  it("a body that isn't JSON still errors with the status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 500 }))
    );
    const { result } = renderHook(() => useApiQuery(["x"], "/x"), { wrapper });
    await waitFor(() => expect(result.current.error?.message).toBe("Request failed (500)"));
  });

  it("waits for a token before fetching", async () => {
    session.current = { data: null, status: "loading" };
    const fetch = stub(200, []);
    const { result } = renderHook(() => useApiQuery(["x"], "/x"), { wrapper });
    await new Promise((r) => setTimeout(r, 20));
    expect(fetch).not.toHaveBeenCalled();
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("a write that knows its result updates the cached list without a refetch", async () => {
    const fetch = stub(200, [{ id: 1 }, { id: 2 }]);
    const { result } = renderHook(
      () => ({
        query: useApiQuery<{ id: number }[]>(["rows"], "/rows"),
        set: useSetApiQueryData<{ id: number }[]>(["rows"]),
      }),
      { wrapper }
    );
    await waitFor(() => expect(result.current.query.data).toHaveLength(2));
    act(() => {
      result.current.set((prev) => prev?.filter((r) => r.id !== 1));
    });
    await waitFor(() => expect(result.current.query.data).toEqual([{ id: 2 }]));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
