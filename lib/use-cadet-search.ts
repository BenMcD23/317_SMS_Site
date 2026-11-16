"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";

/** One cadet as `/cadets/search` returns them. */
export type CadetHit = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
};

/** Below this many characters a search would match half the squadron, so none is sent. */
export const MIN_SEARCH_LENGTH = 2;

/** `value`, once it has stopped changing for `ms`. */
export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

/**
 * The server-side cadet search behind the ⌘K palette, the cadet picker and the
 * text recipients' "add a cadet". Each had its own copy; through one cached
 * query, a name searched in one is answered instantly in the others, and a
 * stale reply can't overwrite a newer one.
 *
 * Debounced, and silent on failure: an error (which answers `{detail}`, not a
 * list) or an outage gives no hits, so a search box never takes its page down.
 * `searching` is true from the first keystroke until the answer is in.
 */
export function useCadetSearch(query: string, { enabled = true }: { enabled?: boolean } = {}) {
  const { data: session } = useSession();
  const token = session?.id_token;
  const q = query.trim();
  const debounced = useDebounced(q, 200);
  const long = debounced.length >= MIN_SEARCH_LENGTH;

  const { data, isFetching } = useQuery<CadetHit[]>({
    queryKey: ["cadets", "search", debounced],
    queryFn: async ({ signal }) => {
      try {
        const res = await apiFetch(`${API_BASE}/cadets/search?q=${encodeURIComponent(debounced)}`, {
          headers: { Authorization: `Bearer ${token}` },
          signal,
        });
        const body = res.ok ? await res.json() : [];
        return Array.isArray(body) ? body : [];
      } catch {
        return [];
      }
    },
    enabled: enabled && !!token && long,
    staleTime: 30_000,
    // Keep the last list on screen while the next keystroke's answer loads.
    placeholderData: keepPreviousData,
  });

  const active = enabled && q.length >= MIN_SEARCH_LENGTH;
  return {
    hits: active && long ? (data ?? []) : [],
    // Waiting on the debounce counts as searching, so "No cadet found" doesn't flash first.
    searching: active && (q !== debounced || isFetching),
  };
}
