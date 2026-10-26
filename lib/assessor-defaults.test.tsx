// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { useState, type ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const SESSION = { data: { id_token: "tok", user: { name: "Google Name" } }, status: "authenticated" };
vi.mock("next-auth/react", () => ({ useSession: () => SESSION, signIn: vi.fn() }));

import { useAssessorName, useFillAssessorName, useSavedSignature } from "@/lib/assessor-defaults";

function makeWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function stubApi(routes: Record<string, () => Response>) {
  const fetch = vi.fn(async (url: string) => {
    const path = new URL(url).pathname;
    return routes[path]?.() ?? new Response("{}", { status: 404 });
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  // jsdom's FileReader can't read Node's Blob; stand in for the data URL.
  vi.stubGlobal(
    "FileReader",
    class {
      result = "data:image/png;base64,cG5n";
      onloadend: (() => void) | null = null;
      readAsDataURL() {
        queueMicrotask(() => this.onloadend?.());
      }
    }
  );
});

describe("assessor defaults", () => {
  it("uses the name set in Settings", async () => {
    stubApi({
      "/settings/assessor-name": () => new Response(JSON.stringify({ assessor_name: "Sgt Smith" })),
    });
    const { result } = renderHook(() => useAssessorName(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current).toBe("Sgt Smith"));
  });

  it("falls back to the Google name when none is set", async () => {
    stubApi({ "/settings/assessor-name": () => new Response(JSON.stringify({ assessor_name: null })) });
    const { result } = renderHook(() => useAssessorName(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current).toBe("Google Name"));
  });

  it("a failed lookup gives no name, so a typed one isn't blanked", async () => {
    stubApi({ "/settings/assessor-name": () => new Response("{}", { status: 500 }) });
    const setName = vi.fn();
    renderHook(() => useFillAssessorName(setName), { wrapper: makeWrapper() });
    await new Promise((r) => setTimeout(r, 20));
    expect(setName).not.toHaveBeenCalled();
  });

  it("fills the form once even when the setter is new every render", async () => {
    stubApi({
      "/settings/assessor-name": () => new Response(JSON.stringify({ assessor_name: "Sgt Smith" })),
    });
    const calls: string[] = [];
    const { result } = renderHook(
      () => {
        const [name, setName] = useState("");
        // A fresh function each render, like useAssessmentDraft's setter.
        const fill = useFillAssessorName((n) => {
          calls.push(n);
          setName(`${n}`);
        });
        return { name, fill };
      },
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.name).toBe("Sgt Smith"));
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toEqual(["Sgt Smith"]);
    // "Start again" fills it again on demand.
    result.current.fill();
    expect(calls).toEqual(["Sgt Smith", "Sgt Smith"]);
  });

  it("the saved signature comes back as a data URL", async () => {
    stubApi({ "/get-signature": () => new Response("png", { headers: { "Content-Type": "image/png" } }) });
    const { result } = renderHook(() => useSavedSignature(), { wrapper: makeWrapper() });
    await waitFor(() =>
      expect(result.current).toEqual({ signature: "data:image/png;base64,cG5n", loading: false })
    );
  });

  it("no saved signature reads as none, not an error", async () => {
    stubApi({});
    const { result } = renderHook(() => useSavedSignature(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current).toEqual({ signature: null, loading: false }));
  });

  it("an unreachable API stops loading rather than spinning forever", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch")))
    );
    const { result } = renderHook(() => useSavedSignature(), { wrapper: makeWrapper() });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.signature).toBeNull();
  });

  it("two sheets open in one session share one lookup", async () => {
    const fetch = stubApi({
      "/settings/assessor-name": () => new Response(JSON.stringify({ assessor_name: "Sgt Smith" })),
    });
    const wrapper = makeWrapper();
    const a = renderHook(() => useAssessorName(), { wrapper });
    await waitFor(() => expect(a.result.current).toBe("Sgt Smith"));
    const b = renderHook(() => useAssessorName(), { wrapper });
    expect(b.result.current).toBe("Sgt Smith");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
