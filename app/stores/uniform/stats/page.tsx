"use client";

import { useState } from "react";
import { ShoppingCart } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { PageHeader } from "@/components/page-header";
import { SectionHeading } from "@/components/section-heading";
import { Stat } from "@/components/stat";
import { MonthlyOrdersCard, RankedBars, WindowToggle } from "@/components/stores/order-stats";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DEFAULT_ORDER_STATS_WINDOW,
  orderStatsPath,
  percent,
  type UniformOrderStats,
} from "@/lib/order-stats";
import { useApiQuery } from "@/lib/use-api-query";

export default function UniformOrderStatsPage() {
  const [windowId, setWindowId] = useState(DEFAULT_ORDER_STATS_WINDOW);
  const { data, error, isLoading } = useApiQuery<UniformOrderStats>(
    ["uniform-order-stats", windowId],
    orderStatsPath("/stores/orders/stats", windowId)
  );
  // An error body ({detail}) is thrown by the query, so `data.items` is only
  // ever read from a real response.
  const items = data?.items ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Uniform Order Stats"
        description="What gets ordered most, and the sizes it's ordered in"
        actions={<WindowToggle value={windowId} onChange={setWindowId} />}
      />

      <ErrorAlert
        message={error ? error.message || "The server returned an error." : null}
        title="Couldn't load order stats"
      />

      {isLoading && <Skeleton className="h-64 w-full" />}

      {data && data.total_orders === 0 && (
        <EmptyState
          icon={ShoppingCart}
          title="No orders in this range"
          description="Try a longer range, or come back once orders have been placed."
        />
      )}

      {data && data.total_orders > 0 && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat size="lg" label="Orders" value={data.total_orders} />
            <Stat size="lg" label="Items ordered" value={data.total_items} />
            <Stat
              size="lg"
              label="Completed"
              value={`${percent(data.completed_orders, data.total_orders)}%`}
              hint={`${data.completed_orders} of ${data.total_orders}`}
            />
            <Stat size="lg" label="Kitting orders" value={data.kitting_orders} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Most ordered items</CardTitle>
            </CardHeader>
            <CardContent>
              <RankedBars
                rows={items.map((i) => ({
                  label: i.item_type,
                  count: i.count,
                  hint: i.top_size ? `Most common size: ${i.top_size}` : undefined,
                }))}
                empty="No items in these orders."
              />
            </CardContent>
          </Card>

          <SectionHeading title="Sizes by item" description="How each item splits across sizes" />
          <div className="grid gap-4 md:grid-cols-2">
            {items.map((i) => (
              <Card key={i.item_type}>
                <CardHeader>
                  <CardTitle className="text-base">{i.item_type}</CardTitle>
                </CardHeader>
                <CardContent>
                  <RankedBars rows={i.sizes} />
                </CardContent>
              </Card>
            ))}
          </div>

          <MonthlyOrdersCard data={data.monthly} />
        </>
      )}
    </div>
  );
}
