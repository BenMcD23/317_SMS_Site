"use client";

import { useSession } from "next-auth/react";
import { useQuery, type UseQueryOptions } from "@tanstack/react-query";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

/**
 * Cached GET against the backend API, authenticated with the current session's
 * Google id_token. Wraps apiFetch (so 401 → sign-in still works) and React
 * Query (so results are cached and revisiting a page is instant).
 *
 * @param key   React Query cache key — unique per resource, e.g. ["cadets"].
 * @param path  API path relative to API_BASE, e.g. "/cadets".
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
      const res = await apiFetch(`${API_BASE}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail ?? res.statusText);
      }
      return res.json() as Promise<T>;
    },
    ...options,
    // Don't fire until we have a token to send (kept last so a caller's
    // `enabled` narrows the gate rather than bypassing the token check).
    enabled: !!token && (options?.enabled ?? true),
  });
}
