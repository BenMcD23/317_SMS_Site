"use client";

import { useCallback } from "react";

import { usePersonalDataHidden } from "@/lib/privacy";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

/**
 * Wraps personal data (email, phone, date of birth, address, medical, bank
 * details) so "Hide personal data" removes it. Nothing is left in its place —
 * no placeholder, so a shared screen doesn't even show that something's
 * missing — which is why call sites wrap the label or column along with the
 * value. One component so every page hides the same way and the list of
 * what's personal lives in the call sites, not in ad-hoc checks.
 */
export function Private({ children }: { children: React.ReactNode }) {
  const [hidden] = usePersonalDataHidden();
  return hidden ? null : <>{children}</>;
}

/**
 * For text built into a string (a page description, a subtitle): the value,
 * or `undefined` while hidden, so `[a, b].filter(Boolean)` drops it cleanly.
 */
export function usePrivateText() {
  const [hidden] = usePersonalDataHidden();
  // Stable while the setting is, so it can sit in a memo's dependencies.
  return useCallback((value: string | null | undefined) => (hidden ? undefined : value), [hidden]);
}

/** The Settings row for the mode. Staff only; Settings decides whether to show it. */
export function PersonalDataSetting() {
  const [hidden, setHidden] = usePersonalDataHidden();
  return (
    // The whole row is the label, so it's a full-width tap target on a phone.
    <Label
      htmlFor="hide-personal-data"
      className="flex min-h-9 cursor-pointer items-center justify-between gap-4 font-normal"
    >
      <span className="flex flex-col gap-1">
        <span className="text-sm font-medium">Hide personal data</span>
        <span className="text-muted-foreground text-xs">
          Takes emails, phone numbers, dates of birth, addresses, medical and bank details off every page, for
          when your screen is shared or projected. Names stay. Only this browser remembers it.
        </span>
      </span>
      <Switch id="hide-personal-data" checked={hidden} onCheckedChange={setHidden} />
    </Label>
  );
}
