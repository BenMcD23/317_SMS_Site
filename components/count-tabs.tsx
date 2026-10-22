"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type CountTab<T extends string> = { value: T; label: string; count: number };

/**
 * The site's standard tabs with a count on each — "Active 4 · Completed 12".
 * The stores order pages each used to hand-build their own underline bar for
 * this; sharing the shadcn tabs means they look and behave (keyboard arrows,
 * scrolling on a phone) like every other tabbed page. Counts are hidden while
 * loading rather than showing a misleading 0.
 */
export function CountTabs<T extends string>({
  tabs,
  value,
  onValueChange,
  loading = false,
}: {
  tabs: CountTab<T>[];
  value: T;
  onValueChange: (value: T) => void;
  loading?: boolean;
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onValueChange(v as T)}>
      <TabsList>
        {tabs.map((tab) => (
          <TabsTrigger key={tab.value} value={tab.value}>
            {tab.label}
            {/* A space for screen readers ("Active 4", not "Active4"); the flex
                gap already spaces it visually, so it takes no room. */}
            {!loading && " "}
            {!loading && (
              <span className="bg-muted-foreground/15 inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold tabular-nums">
                {tab.count}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
