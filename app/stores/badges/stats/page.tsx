"use client";

import { useState } from "react";
import { Award } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { MonthlyOrdersCard, RankedBars, WindowToggle } from "@/components/stores/order-stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type BadgeOrderStats, DEFAULT_ORDER_STATS_WINDOW, orderStatsPath, percent } from "@/lib/order-stats";
import { gainedWhereLabel, useReference } from "@/lib/reference";
import { useApiQuery } from "@/lib/use-api-query";

export default function BadgeOrderStatsPage() {
  const [windowId, setWindowId] = useState(DEFAULT_ORDER_STATS_WINDOW);
  const { gainedWhereOptions } = useReference();
  const { data, error, isLoading } = useApiQuery<BadgeOrderStats>(
    ["badge-order-stats", windowId],
    orderStatsPath("/stores/badges/orders/stats", windowId)
  );
  const badges = data?.badges ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Badge Order Stats"
        description="Which badges are ordered most, and where they were gained"
        actions={<WindowToggle value={windowId} onChange={setWindowId} />}
      />

      <ErrorAlert
        message={error ? error.message || "The server returned an error." : null}
        title="Couldn't load order stats"
      />

      {isLoading && <Skeleton className="h-64 w-full" />}

      {data && data.total_orders === 0 && (
        <EmptyState
          icon={Award}
          title="No badge orders in this range"
          description="Try a longer range, or come back once orders have been placed."
        />
      )}

      {data && data.total_orders > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat size="lg" label="Orders" value={data.total_orders} />
            <Stat size="lg" label="Badges ordered" value={data.total_items} />
            <Stat
              size="lg"
              label="Replacements"
              value={data.replacements}
              hint={`${percent(data.replacements, data.total_items)}% of badges`}
            />
            <Stat
              size="lg"
              label="Completed"
              value={`${percent(data.completed_orders, data.total_orders)}%`}
              hint={`${data.completed_orders} of ${data.total_orders}`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Most ordered badges</CardTitle>
            </CardHeader>
            <CardContent>
              <RankedBars
                rows={badges.slice(0, 15).map((b) => ({
                  label: b.badge_name,
                  count: b.count,
                  hint: b.replacements
                    ? `${b.replacements} replacement${b.replacements === 1 ? "" : "s"}`
                    : undefined,
                }))}
                empty="No badges in these orders."
              />
              {badges.length > 15 && (
                <p className="text-muted-foreground mt-3 text-xs">Top 15 of {badges.length} badges.</p>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Where badges were gained</CardTitle>
              </CardHeader>
              <CardContent>
                <RankedBars
                  rows={data.gained_where.map((g) => ({
                    ...g,
                    label: gainedWhereLabel(gainedWhereOptions, g.label) ?? g.label,
                  }))}
                  empty="No badges here record where they were gained."
                />
              </CardContent>
            </Card>
            <MonthlyOrdersCard data={data.monthly} />
          </div>
        </>
      )}
    </div>
  );
}
