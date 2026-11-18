"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@317/ui-common/components/ui/skeleton";
import type { TrendBarChartProps } from "@/components/charts/trend-bar-chart";

/**
 * Every chart a page draws, loaded on demand. Recharts is about 110 KB
 * gzipped, and pages such as a cadet's record had to download it before they
 * could show anything, though their chart is below the fold. Importing charts
 * from here moves Recharts to its own chunk that loads after the page is up,
 * with a skeleton of the chart's height in its place meanwhile so nothing
 * jumps when it arrives.
 *
 * Charts render in the browser only (`ssr: false`): Recharts measures its box,
 * which the server can't.
 *
 * Pages must not import `recharts` or a chart module directly;
 * `components/charts/lazy-imports.test.ts` fails if one does.
 */

function chartSkeleton(className: string) {
  function ChartSkeleton() {
    return <Skeleton className={className} aria-hidden />;
  }
  return ChartSkeleton;
}

const LazyTrendBarChart = dynamic(
  () => import("@/components/charts/trend-bar-chart").then((m) => m.TrendBarChart),
  { ssr: false, loading: chartSkeleton("h-full w-full") }
);

/** See `trend-bar-chart.tsx`. The box keeps its height while Recharts loads. */
export function TrendBarChart<Row extends { label: string }>(props: TrendBarChartProps<Row>) {
  return (
    <div style={{ height: props.height }}>
      {/* `dynamic` loses the generic, so the props go through as the base row type. */}
      <LazyTrendBarChart {...(props as unknown as TrendBarChartProps<{ label: string }>)} />
    </div>
  );
}

export const ScoreTrendChart = dynamic(
  () => import("@/components/charts/score-trend-chart").then((m) => m.ScoreTrendChart),
  { ssr: false, loading: chartSkeleton("h-40 w-full") }
);

export const PanelChart = dynamic(
  () => import("@/components/oc/custom-dashboard/panel-chart").then((m) => m.PanelChart),
  { ssr: false, loading: chartSkeleton("min-h-32 w-full flex-1") }
);

export const AnswerChart = dynamic(
  () => import("@/components/assistant/answer-chart").then((m) => m.AnswerChart),
  { ssr: false, loading: chartSkeleton("h-64 w-full") }
);

// The stats page's cards each hold a chart, so the skeleton stands in for the card.
export const StrengthChart = dynamic(() => import("@/components/stats/charts").then((m) => m.StrengthChart), {
  ssr: false,
  loading: chartSkeleton("h-80 w-full rounded-xl"),
});
export const AgeChart = dynamic(() => import("@/components/stats/charts").then((m) => m.AgeChart), {
  ssr: false,
  loading: chartSkeleton("h-64 w-full rounded-xl"),
});
export const ServiceChart = dynamic(() => import("@/components/stats/charts").then((m) => m.ServiceChart), {
  ssr: false,
  loading: chartSkeleton("h-64 w-full rounded-xl"),
});
export const ClassificationChart = dynamic(
  () => import("@/components/stats/charts").then((m) => m.ClassificationChart),
  { ssr: false, loading: chartSkeleton("h-64 w-full rounded-xl") }
);
export const BadgeTrendCard = dynamic(
  () => import("@/components/stats/charts").then((m) => m.BadgeTrendCard),
  { ssr: false, loading: chartSkeleton("h-44 w-full rounded-xl") }
);
export const ProgrammeTurnout = dynamic(
  () => import("@/components/stats/programme-turnout").then((m) => m.ProgrammeTurnout),
  { ssr: false, loading: chartSkeleton("h-80 w-full rounded-xl") }
);
export const TargetsSection = dynamic(
  () => import("@/components/stats/targets").then((m) => m.TargetsSection),
  { ssr: false, loading: chartSkeleton("h-64 w-full rounded-xl") }
);
