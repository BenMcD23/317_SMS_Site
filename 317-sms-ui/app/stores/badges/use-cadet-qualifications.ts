"use client";

import { useCallback, useRef, useState } from "react";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

import { CadetQualifications } from "./badge-qualification";

/**
 * Lazily loads a cadet's earned qualifications, cached by CIN for the life of
 * the page.
 *
 * The badge-orders screen needs this for whichever cadet the QM is looking at —
 * the one being ordered for, or the one whose order card was just expanded —
 * so it fetches per cadet on demand rather than pulling the whole squadron up
 * front. In-flight CINs are tracked so re-expanding a card doesn't refetch.
 */
export function useCadetQualifications(token: string | null) {
  const [byCin, setByCin] = useState<Record<number, CadetQualifications>>({});
  const [loadingCins, setLoadingCins] = useState<number[]>([]);
  // Requested CINs, whatever the outcome — a cadet with no record shouldn't be
  // refetched on every render, and a failed lookup shouldn't retry in a loop.
  const requested = useRef<Set<number>>(new Set());

  const load = useCallback(
    (cin: number) => {
      if (!token || !cin || requested.current.has(cin)) return;
      requested.current.add(cin);
      setLoadingCins((prev) => [...prev, cin]);

      (async () => {
        try {
          const res = await apiFetch(`${API_BASE}/cadets/${cin}/badge-qualifications`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error("Failed to load qualifications");
          const data: CadetQualifications = await res.json();
          setByCin((prev) => ({ ...prev, [cin]: data }));
        } catch {
          // Leave the cadet without data — every check then reads "not checked"
          // rather than wrongly reporting the badge as unearned.
        } finally {
          setLoadingCins((prev) => prev.filter((c) => c !== cin));
        }
      })();
    },
    [token]
  );

  const get = useCallback((cin: number): CadetQualifications | null => byCin[cin] ?? null, [byCin]);
  const isLoading = useCallback((cin: number) => loadingCins.includes(cin), [loadingCins]);

  return { load, get, isLoading };
}
