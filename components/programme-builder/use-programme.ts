"use client";

import { useCallback } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { useApiQuery, useSetApiQueryData } from "@/lib/use-api-query";
import { BUILT_IN_KINDS, PROGRAMME_KEYS, type Kind, type Programme } from "@/lib/programme-builder";

// Often enough that two staff building the same month see each other's
// changes, and an NCO's comment turns up, without anyone refreshing. React
// Query stops polling while the tab is hidden, so a forgotten tab costs nothing.
const POLL_MS = 20_000;

/**
 * One month's programme, kept fresh, and `run` for every change to it.
 * Each write answers with the whole month, which replaces the cached copy, so
 * the checks, comments and history on screen are always the API's own.
 * `run` toasts the API's message on failure and says whether it worked.
 */
export function useProgramme(month: string) {
  const { data: session } = useSession();
  const token = session?.id_token;
  const query = useApiQuery<Programme>(PROGRAMME_KEYS.month(month), `/programme-builder/months/${month}`, {
    refetchInterval: POLL_MS,
  });
  const set = useSetApiQueryData<Programme>(PROGRAMME_KEYS.month(month));
  const queryClient = useQueryClient();

  const run = useCallback(
    async (
      write: (token: string) => Promise<Programme | { programme: Programme }>,
      success?: string
    ): Promise<boolean> => {
      if (!token) return false;
      try {
        const result = await write(token);
        const programme = "programme" in result ? result.programme : result;
        set(() => programme);
        // The gaps moved, and the month list's counts with them.
        void queryClient.invalidateQueries({ queryKey: PROGRAMME_KEYS.suggestions(month) });
        void queryClient.invalidateQueries({ queryKey: PROGRAMME_KEYS.months });
        if (success) toast.success(success);
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Something went wrong.");
        return false;
      }
    },
    [token, set, queryClient, month]
  );

  return { ...query, token, run };
}

/** Every kind of session, as staff have them; the built-in ones until they load. */
export function useKinds(): Kind[] {
  return useApiQuery<Kind[]>(PROGRAMME_KEYS.kinds, "/programme-builder/kinds").data ?? BUILT_IN_KINDS;
}
