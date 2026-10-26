"use client";

import { useSession } from "next-auth/react";
import { useCallback } from "react";
import { useQuery, useQueryClient, type UseQueryOptions } from "@tanstack/react-query";

import { API_BASE } from "@/lib/config";
import { apiFetch, errorDetail } from "@/lib/api-fetch";

/** The URL a query path goes to: the site's own `/api/*` routes as they are
 * (the server adds the token), anything else on the backend API. */
export function apiQueryUrl(path: string): string {
  return path.startsWith("/api/") ? path : `${API_BASE}${path}`;
}

/**
 * Cached GET against the backend API, authenticated with the current session's
 * Google id_token. Wraps apiFetch (so 401 → sign-in still works) and React
 * Query (so results are cached and revisiting a page is instant).
 *
 * @param key   React Query cache key — unique per resource, e.g. ["cadets"].
 * @param path  API path relative to API_BASE, e.g. "/cadets", or one of the
 *              site's own routes, e.g. "/api/stores/stock".
 */
export function useApiQuery<T>(
  key: readonly unknown[],
  path: string,
  options?: Omit<UseQueryOptions<T, Error>, "queryKey" | "queryFn">
) {
  const { data: session } = useSession();
  const token = session?.id_token;

  return useQuery<T, Error>({
    queryKey: key,
    queryFn: async () => {
      const res = await apiFetch(apiQueryUrl(path), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        // errorDetail flattens FastAPI's validation lists; the proxy routes
        // answer `{error}` when they can't reach the API at all.
        throw new Error(
          errorDetail(body) ?? body?.error ?? (res.statusText || `Request failed (${res.status})`)
        );
      }
      return res.json() as Promise<T>;
    },
    ...options,
    // Don't fire until we have a token to send (kept last so a caller's
    // `enabled` narrows the gate rather than bypassing the token check).
    enabled: !!token && (options?.enabled ?? true),
  });
}

/**
 * A setter for a useApiQuery's cached data, for writes that already know the
 * result (a tick, a delete): the page updates at once without a refetch, and
 * a revisit shows the change. `update` gets undefined if nothing is cached.
 */
export function useSetApiQueryData<T>(key: readonly unknown[]) {
  const queryClient = useQueryClient();
  const hash = JSON.stringify(key);
  return useCallback(
    (update: (prev: T | undefined) => T | undefined) => queryClient.setQueryData<T>(JSON.parse(hash), update),
    [queryClient, hash]
  );
}
