"use client";

import { EyeOff } from "lucide-react";

import { usePersonalDataHidden } from "@/lib/privacy";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * Wraps a piece of personal data (email, phone, date of birth, address,
 * medical, bank details) so "Hide personal data" can mask it. One component so
 * every page masks the same way and the list of what's personal lives in the
 * call sites, not in a dozen ad-hoc `hidden ? … : …` checks.
 */
export function Private({ children, className }: { children: React.ReactNode; className?: string }) {
  const [hidden] = usePersonalDataHidden();
  if (!hidden) return <>{children}</>;
  return <span className={cn("text-muted-foreground italic", className)}>Hidden</span>;
}

/** For text built into a string (a page description, a subtitle). */
export function usePrivateText() {
  const [hidden] = usePersonalDataHidden();
  return (value: string | null | undefined) => (hidden && value ? "Hidden" : value);
}

/** Header switch for the mode; pressed state is what screen readers announce. */
export function PrivacyToggle() {
  const [hidden, setHidden] = usePersonalDataHidden();
  return (
    <Button
      variant={hidden ? "secondary" : "ghost"}
      size="icon"
      onClick={() => setHidden(!hidden)}
      aria-pressed={hidden}
      aria-label="Hide personal data"
      title={hidden ? "Personal data hidden — click to show" : "Hide personal data"}
    >
      <EyeOff />
    </Button>
  );
}
