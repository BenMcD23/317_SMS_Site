"use client";

import { AreaTabs, useArea } from "@/components/area-tabs";
import { cn } from "@/lib/utils";

/**
 * Standard page header — title on the left, optional actions on the right,
 * and the tab row of the page's area (lib/navigation.ts) underneath when it
 * has one. Every page opens with one so the sidebar's link, the breadcrumb and
 * the heading agree on what the page is called, and so the pages of an area
 * are always one tap apart.
 */
export function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  const area = useArea();
  // The tab row draws its own bottom line, so the header doesn't draw a second.
  const tabbed = (area?.tabs?.length ?? 0) > 1;

  return (
    <div className="flex flex-col gap-4">
      <div
        className={cn(
          "flex flex-wrap items-end justify-between gap-x-6 gap-y-3",
          !tabbed && "border-b pb-5",
          className
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-balance">{title}</h1>
          {description && <p className="text-muted-foreground text-sm text-pretty">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <AreaTabs />
    </div>
  );
}
