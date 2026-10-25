"use client";

import { DEFAULT_LEAVING_EMAIL, type LeavingEmailResponse, type LeavingEmailTemplate } from "@/lib/leaving";
import { useApiQuery } from "@/lib/use-api-query";

export const LEAVING_EMAIL_KEY = ["oc-leaving-email"] as const;

/**
 * The OC's saved leaver email, or the default wording until they save one.
 * Shared by the parent-emails card (where it's edited) and the leaving dialog
 * (which copies it) so both always send the same words. `saved` is false while
 * loading, on an error, and when nothing is stored: all fall back to the default.
 */
export function useLeavingEmail(): {
  template: LeavingEmailTemplate;
  saved: boolean;
  isLoading: boolean;
  error: Error | null;
} {
  const { data, isLoading, error } = useApiQuery<LeavingEmailResponse>(
    LEAVING_EMAIL_KEY,
    "/oc/leaving-email"
  );
  const saved = typeof data?.body === "string" && data.body !== "";
  return {
    template: saved ? { subject: data?.subject ?? "", body: data!.body! } : DEFAULT_LEAVING_EMAIL,
    saved,
    isLoading,
    error,
  };
}
