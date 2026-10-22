"use client";

import { useState } from "react";
import { keepPreviousData } from "@tanstack/react-query";
import { PackageCheck, PackageX, ShoppingCart } from "lucide-react";

import { CountTabs } from "@/components/count-tabs";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { CsvButton } from "@/components/stats/csv-button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDate } from "@/lib/format";
import {
  COVER_OPTIONS,
  type InsightItem,
  type InsightLine,
  type InsightStatus,
  listPhrase,
  monthsLabel,
  orderCsvRows,
  sizeLabel,
  STATUS_LABELS,
  STATUS_TONES,
  type StoresInsights,
  WINDOW_OPTIONS,
} from "@/lib/stores-insights";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

type Tab = "order" | "sizes" | "unused";

export default function UniformInsightsPage() {
  const [months, setMonths] = useState(12);
  const [cover, setCover] = useState(3);
  const [tab, setTab] = useState<Tab>("order");

  const { data, error, isPending } = useApiQuery<StoresInsights>(
    ["stores-insights", months, cover],
    `/stores/insights?months=${months}&cover=${cover}`,
    // Keep the last answer on screen while a new window loads, so switching
    // 12 → 24 months doesn't flash the whole page back to skeletons.
    { placeholderData: keepPreviousData }
  );

  const windowLabel = monthsLabel(months);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Uniform insights"
        description="What gets given out, which sizes are running low, and what to order next."
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <MonthsPicker label="Look back over" options={WINDOW_OPTIONS} value={months} onChange={setMonths} />
        <MonthsPicker label="Order enough for" options={COVER_OPTIONS} value={cover} onChange={setCover} />
      </div>

      <ErrorAlert title="Couldn't load the insights" message={error?.message} />

      {isPending && !error && <InsightsSkeleton />}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat
              size="lg"
              label="Items asked for"
              value={data.summary.requested}
              hint={`${data.summary.given} given out, last ${windowLabel}`}
            />
            <Stat
              size="lg"
              label="Cadets waiting"
              value={data.summary.waiting}
              tone={data.summary.waiting ? "warning" : undefined}
              hint={
                data.summary.awaitingSizing
                  ? `${data.summary.awaitingSizing} still to be measured`
                  : "Open orders not yet handed over"
              }
            />
            <Stat
              size="lg"
              label="To order"
              value={data.summary.unitsToOrder}
              tone={data.summary.unitsToOrder ? "destructive" : "success"}
              hint={`${data.summary.linesToOrder} item ${data.summary.linesToOrder === 1 ? "size" : "sizes"}`}
            />
            <Stat
              size="lg"
              label="Sitting unused"
              value={data.summary.unusedUnits}
              hint={`${data.summary.unusedLines} item ${data.summary.unusedLines === 1 ? "size" : "sizes"} nobody asked for`}
            />
          </div>

          <CountTabs<Tab>
            value={tab}
            onValueChange={setTab}
            tabs={[
              { value: "order", label: "To order", count: data.toOrder.length },
              { value: "sizes", label: "Popular sizes", count: data.items.length },
              { value: "unused", label: "Not given out", count: data.unused.length },
            ]}
          />

          {tab === "order" && <OrderList data={data} />}
          {tab === "sizes" && <PopularSizes items={data.items} window={windowLabel} />}
          {tab === "unused" && <UnusedList lines={data.unused} window={windowLabel} />}
        </>
      )}
    </div>
  );
}

function MonthsPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly number[];
  value: number;
  onChange: (months: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-muted-foreground text-sm">{label}</span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-label={label}
        value={String(value)}
        // Radix sends "" when the pressed item is clicked again; keep the choice.
        onValueChange={(v) => v && onChange(Number(v))}
      >
        {options.map((n) => (
          <ToggleGroupItem key={n} value={String(n)} aria-label={monthsLabel(n)} className="px-3">
            {n}m
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}

function StatusBadge({ status }: { status: InsightStatus }) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        STATUS_TONES[status]
      )}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}

function OrderList({ data }: { data: StoresInsights }) {
  const lines = data.toOrder;
  return (
    <Card>
      <CardHeader>
        <CardTitle>What to order</CardTitle>
        <CardDescription>
          Enough for {monthsLabel(data.coverMonths)} at the rate they went out over the last{" "}
          {monthsLabel(data.months)}, plus every cadet still waiting, less what&apos;s on the shelf. Cadets
          already waiting come first.
          {data.notOnOrderList && data.notOnOrderList.length > 0 && (
            <> Not listed, as they&apos;re topped up as needed: {listPhrase(data.notOnOrderList)}.</>
          )}
        </CardDescription>
        {lines.length > 0 && (
          <CardAction>
            <CsvButton filename="uniform-to-order.csv" rows={() => orderCsvRows(lines)} />
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {lines.length === 0 ? (
          <EmptyState
            icon={PackageCheck}
            title="Nothing to order"
            description="The shelves cover everyone waiting and the next few months of demand."
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="hidden sm:table-cell">Why</TableHead>
                <TableHead className="hidden text-right sm:table-cell">Waiting</TableHead>
                <TableHead className="hidden text-right sm:table-cell">On shelf</TableHead>
                <TableHead className="text-right">Order</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={`${l.itemType}|${l.size}`}>
                  <TableCell className="font-medium">
                    {l.itemType}
                    {/* On a phone the reason and the counts sit under the item
                        rather than in their own columns, so the order quantity
                        stays on screen. */}
                    <span className="text-muted-foreground mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal sm:hidden">
                      <StatusBadge status={l.status} />
                      {l.inStock} on shelf{l.waiting > 0 && ` · ${l.waiting} waiting`}
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">{sizeLabel(l.size)}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <StatusBadge status={l.status} />
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">
                    {l.waiting || "—"}
                  </TableCell>
                  <TableCell className="hidden text-right tabular-nums sm:table-cell">{l.inStock}</TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">{l.toOrder}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function PopularSizes({ items, window }: { items: InsightItem[]; window: string }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShoppingCart}
        title="No uniform orders yet"
        description={`Nothing was asked for in the last ${window}, and nothing is on the shelves.`}
      />
    );
  }
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {items.map((item) => (
        <SizeCard key={item.itemType} item={item} />
      ))}
    </div>
  );
}

function SizeCard({ item }: { item: InsightItem }) {
  // Bars are scaled to this item's busiest size, so a beret's spread is
  // readable even when shirts are asked for ten times as often.
  const most = Math.max(1, ...item.sizes.map((s) => s.requested));
  return (
    <Card role="region" aria-label={item.itemType}>
      <CardHeader>
        <CardTitle>{item.itemType}</CardTitle>
        <CardDescription>
          {item.requested} asked for
          {item.topSize !== null && ` · most often ${sizeLabel(item.topSize)}`}
          {item.awaitingSizing > 0 && ` · ${item.awaitingSizing} still to be measured`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {item.sizes.length === 0 ? (
          <p className="text-muted-foreground text-sm">No sizes recorded yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            <li className="text-muted-foreground grid grid-cols-[5.5rem_1fr_3rem_5.5rem] gap-2 text-[11px]">
              <span>Size</span>
              <span>Asked for</span>
              <span className="text-right">Shelf</span>
              <span className="sr-only">Status</span>
            </li>
            {item.sizes.map((s) => (
              <SizeRow key={s.size} line={s} most={most} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// What the last column of a size bar says when there's nothing to order.
const SIZE_ROW_NOTE: Partial<Record<InsightStatus, string>> = {
  ok: "OK",
  rare: "When needed",
  unused: "Unused",
};

function SizeRow({ line, most }: { line: InsightLine; most: number }) {
  const flagged = line.status === "short" || line.status === "out" || line.status === "low";
  return (
    <li
      className="grid grid-cols-[5.5rem_1fr_3rem_5.5rem] items-center gap-2 text-sm"
      aria-label={`${sizeLabel(line.size)}: ${line.requested} asked for, ${line.inStock} on the shelf, ${STATUS_LABELS[line.status]}`}
    >
      <span className="truncate tabular-nums">{sizeLabel(line.size)}</span>
      <span className="flex items-center gap-2">
        <span className="bg-muted h-2.5 flex-1 overflow-hidden rounded-full">
          <span
            className="bg-primary block h-full rounded-full"
            style={{ width: `${(line.requested / most) * 100}%` }}
          />
        </span>
        <span className="w-6 text-right tabular-nums">{line.requested}</span>
      </span>
      <span className={cn("text-right tabular-nums", flagged && "text-destructive font-semibold")}>
        {line.inStock}
      </span>
      <span
        className={cn(
          "text-right text-[11px]",
          flagged ? "text-destructive" : line.status === "ok" ? "text-success" : "text-muted-foreground"
        )}
      >
        {SIZE_ROW_NOTE[line.status] ?? `Order ${line.toOrder}`}
      </span>
    </li>
  );
}

function UnusedList({ lines, window }: { lines: InsightLine[]; window: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>On the shelf but not given out</CardTitle>
        <CardDescription>
          Nobody asked for these in the last {window}. Worth not reordering, swapping with another squadron,
          or checking the count is right.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {lines.length === 0 ? (
          <EmptyState
            icon={PackageX}
            title="Everything on the shelf gets used"
            description={`Every item and size in stock was asked for in the last ${window}.`}
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Item</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">On shelf</TableHead>
                <TableHead>Last asked for</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {lines.map((l) => (
                <TableRow key={`${l.itemType}|${l.size}`}>
                  <TableCell className="font-medium">{l.itemType}</TableCell>
                  <TableCell className="tabular-nums">{sizeLabel(l.size)}</TableCell>
                  <TableCell className="text-right tabular-nums">{l.inStock}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(l.lastRequested, "Never")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function InsightsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading insights">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-9 w-80" />
      <Skeleton className="h-72" />
    </div>
  );
}
