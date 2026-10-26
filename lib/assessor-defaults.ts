"use client";

import { useCallback, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useQuery } from "@tanstack/react-query";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

/**
 * The assessor's saved name and signature, which every assessment sheet starts
 * from. Shared by the four sheets (they each fetched both on every visit) and
 * cached, so moving between sheets doesn't refetch; Settings invalidates these
 * keys when either is changed there.
 */
export const ASSESSOR_NAME_KEY = ["settings", "assessor-name"] as const;
export const SIGNATURE_KEY = ["settings", "signature"] as const;
// Only Settings changes them, and it invalidates the keys when it does.
const STALE_MS = 30 * 60 * 1000;

/** The name to put on a sheet: the one set in Settings, else the Google
 * account's name. `null` until known, and when the lookup failed, so a caller
 * never overwrites what's typed with a blank. */
export function useAssessorName(): string | null {
  const { data: session } = useSession();
  const token = session?.id_token;
  const { data } = useQuery<string | null>({
    queryKey: ASSESSOR_NAME_KEY,
    enabled: !!token,
    staleTime: STALE_MS,
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/settings/assessor-name`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      const body = await res.json().catch(() => null);
      return (body?.assessor_name as string | undefined) ?? "";
    },
  });
  if (data === undefined || data === null) return null;
  return data || session?.user?.name || "";
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

/** The saved signature as a data URL (what the API takes back, and an <img>
 * shows), or null when there isn't one. A failed lookup reads as "none": the
 * assessor can still draw one on the sheet. */
export function useSavedSignature(): { signature: string | null; loading: boolean } {
  const { data: session } = useSession();
  const token = session?.id_token;
  const { data, isPending, isError } = useQuery<string | null>({
    queryKey: SIGNATURE_KEY,
    enabled: !!token,
    staleTime: STALE_MS,
    queryFn: async () => {
      const res = await apiFetch(`${API_BASE}/get-signature`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return null;
      return blobToDataUrl(await res.blob());
    },
  });
  return { signature: data ?? null, loading: isPending && !isError };
}

/**
 * Put the assessor's name on the form once it's known, and again whenever
 * `fill` is called (a sheet's "start again"). `setName` writes it into the
 * form. It's read through a ref, so a setter that's new each render (the
 * draft hook's is) can't re-run the fill and loop.
 */
export function useFillAssessorName(setName: (name: string) => void): () => void {
  const name = useAssessorName();
  const setNameRef = useRef(setName);
  useEffect(() => {
    setNameRef.current = setName;
  });
  const fill = useCallback(() => {
    if (name !== null) setNameRef.current(name);
  }, [name]);
  useEffect(fill, [fill]);
  return fill;
}
