"use client";

import { Suspense, useMemo } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SectionHeading } from "@/components/section-heading";
import { BadgeGlance } from "@/components/stats/badge-glance";
import { AgeChart, BadgeTrendCard, ClassificationChart, StrengthChart } from "@/components/stats/charts";
import { SquadronKpis } from "@/components/stats/kpis";
import { ExpiringQuals, RecentAwards } from "@/components/stats/qual-lists";
import { TimeRangePicker } from "@/components/stats/time-range-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDate, formatShortDate } from "@/lib/format";
import {
  type Award,
  BADGE_SORTS,
  type BadgeSort,
  badgeHistoryFor,
  cohortOf,
  type ExpiringQual,
  flightLabel,
  orderedFlights,
  DEFAULT_RANGE,
  parseTimeRange,
  QUICK_RANGES,
  rangeIncludesToday,
  rangeLabel,
  rangePhrase,
  rangeQuery,
  type SquadronStats,
  sortBadges,
  type StatsPoint,
  strengthHistory,
} from "@/lib/stats";
import { useApiQuery } from "@/lib/use-api-query";

// "All time" for the awards feed, which otherwise defaults to 30 days.
const ALL_AWARDS = "days=36500";
const ALL_FLIGHTS = "all";

/** useSearchParams needs a Suspense boundary or the page fails to prerender. */
export default function StatsPage() {
  return (
    <Suspense fallback={<StatsSkeleton />}>
      <Stats />
    </Suspense>
  );
}

function StatsSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <Skeleton className="h-16" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}

/** Filters live in the URL so a link (or a printout's "view this") reopens the same view. */
function useFilters() {
  const params = useSearchParams();
  const pathname = usePathname();
  const set = (changes: Record<string, string | null>) => {
    // Built from the live URL, not the last render's params: two quick changes
    // (a flight, then a range) would otherwise each drop the other. Native
    // replaceState is synchronous and Next syncs useSearchParams to it.
    const next = new URLSearchParams(window.location.search);
    for (const [key, value] of Object.entries(changes)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    const qs = next.toString();
    window.history.replaceState(null, "", qs ? `${pathname}?${qs}` : pathname);
  };
  const sort = BADGE_SORTS.find((s) => s.id === params.get("sort"))?.id ?? "catalogue";
  return {
    range: parseTimeRange(params),
    flight: params.get("flight"),
    excludeJuniors: params.get("juniors") === "0",
    sort: sort as BadgeSort,
    set,
  };
}

function Stats() {
  const { range, flight: flightParam, excludeJuniors, sort, set } = useFilters();
  const historyQuery = rangeQuery(range);
  const awardsQuery = rangeQuery(range, ALL_AWARDS);
  // A custom range in the past ends on its last snapshot, not on today's numbers.
  const live = rangeIncludesToday(range);

  const { data: stats, isLoading } = useApiQuery<SquadronStats>(["stats", "current"], "/stats/current");
  const { data: historyData } = useApiQuery<StatsPoint[]>(
    ["stats", "history", historyQuery],
    historyQuery ? `/stats/history?${historyQuery}` : "/stats/history"
  );
  const { data: awardsData } = useApiQuery<Award[]>(
    ["stats", "awards", awardsQuery],
    `/stats/awards?${awardsQuery}`
  );
  const { data: expiringData } = useApiQuery<ExpiringQual[]>(["stats", "expiring"], "/stats/expiring");

  // An error body in place of a list would otherwise crash the charts.
  const history = useMemo(() => (Array.isArray(historyData) ? historyData : []), [historyData]);
  const flights = orderedFlights(Object.keys(stats?.flights ?? stats?.by_flight ?? {}));
  // A stale ?flight= (a flight since renamed or emptied) falls back to everyone.
  const flight = flightParam && flights.includes(flightParam) ? flightParam : null;

  const inSlice = (row: { flight: string; junior: boolean }) =>
    (!flight || row.flight === flight) && (!excludeJuniors || !row.junior);
  const awards = (Array.isArray(awardsData) ? awardsData : []).filter(inSlice);
  const expiring = (Array.isArray(expiringData) ? expiringData : []).filter(inSlice);

  const badgeHistory = badgeHistoryFor(history, live ? stats : null, flight, excludeJuniors);
  // The cards show where the range ends: today, or a past range's last snapshot.
  const cohort = (live ? cohortOf(stats, flight, excludeJuniors) : badgeHistory.at(-1)?.data) ?? {
    total_cadets: 0,
    badges: {},
  };
  const order = sortBadges(sort, cohort, badgeHistory);

  const strength = strengthHistory(history, live ? stats : null);
  const strengthFlights = flight
    ? [flight]
    : orderedFlights(strength.flatMap((p) => Object.keys(p)).filter((k) => k !== "date"));
  const first = history[0];
  const last = live ? stats : history.at(-1)?.data;
  const change = first && last ? last.total_cadets - first.data.total_cadets : null;
  const strengthHint =
    change === null
      ? undefined
      : `${change >= 0 ? "+" : ""}${change} ${live ? `since ${formatShortDate(first.date)}` : rangePhrase(range)}`;
  const setQuick = (id: string) => set({ range: id === DEFAULT_RANGE ? null : id, from: null, to: null });

  const sliceLabel = [
    flight ? flightLabel(flight) : "Whole squadron",
    excludeJuniors ? "excluding junior cadets" : null,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <PageHeader
        title="Squadron stats"
        description="Strength, badge progression and qualifications over time"
        actions={
          <Button variant="outline" size="sm" className="no-print" onClick={() => window.print()}>
            <Printer />
            Print / PDF
          </Button>
        }
      />
      {/* Only rendered on paper: gives the printout a heading, date and the view it shows. */}
      <div className="print-only mb-2">
        <h1 className="text-xl font-semibold">317 Squadron — Stats</h1>
        <p className="text-muted-foreground text-sm">
          {sliceLabel} · {rangeLabel(range)} · printed {formatDate(new Date().toISOString())}
        </p>
      </div>

      <div className="no-print flex flex-wrap items-center gap-x-6 gap-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            // Nothing is pressed while a custom range is showing.
            value={range.kind === "quick" ? range.id : ""}
            onValueChange={(v) => v && setQuick(v)}
            aria-label="Quick time range"
          >
            {QUICK_RANGES.map((r) => (
              <ToggleGroupItem key={r.id} value={r.id} aria-label={r.label}>
                {r.short}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <TimeRangePicker
            value={range}
            onQuick={setQuick}
            onAbsolute={(from, to) => set({ from, to, range: null })}
          />
        </div>
        <Select
          value={flight ?? ALL_FLIGHTS}
          onValueChange={(v) => set({ flight: v === ALL_FLIGHTS ? null : v })}
        >
          <SelectTrigger size="sm" aria-label="Flight" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_FLIGHTS}>All flights</SelectItem>
            {flights.map((f) => (
              <SelectItem key={f} value={f}>
                {flightLabel(f)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2">
          <Checkbox
            id="exclude-juniors"
            checked={excludeJuniors}
            onCheckedChange={(v) => set({ juniors: v === true ? "0" : null })}
          />
          <Label htmlFor="exclude-juniors" className="text-sm font-normal">
            Exclude junior cadets
          </Label>
        </div>
      </div>

      {!live && Array.isArray(historyData) && history.length === 0 && (
        <p className="text-muted-foreground rounded-md border border-dashed px-4 py-3 text-sm" role="status">
          No snapshots were taken {rangePhrase(range)}, so there&apos;s no trend or badge breakdown to show.
          Snapshots are saved each time the qualifications scraper runs.
        </p>
      )}

      {isLoading ? (
        <StatsSkeleton />
      ) : (
        stats && (
          <>
            <SquadronKpis stats={stats} strengthHint={strengthHint} />

            <StrengthChart data={strength} flights={strengthFlights} />

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <AgeChart byAge={stats.by_age} />
              <ClassificationChart byClassification={stats.by_classification ?? {}} />
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Badges at a glance</CardTitle>
                </CardHeader>
                <CardContent>
                  {cohort.total_cadets === 0 ? (
                    <p className="text-muted-foreground text-sm">No cadets in this selection.</p>
                  ) : (
                    <BadgeGlance cohort={cohort} order={order} />
                  )}
                </CardContent>
              </Card>
              <div className="flex flex-col gap-3">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Badges gained</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <RecentAwards awards={awards} empty={`No badges gained ${rangePhrase(range)}.`} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Expiring in the next 3 months</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ExpiringQuals quals={expiring} />
                  </CardContent>
                </Card>
              </div>
            </div>

            <section className="flex flex-col gap-3">
              <SectionHeading
                title="Badge progression"
                description={
                  badgeHistory.length >= 2
                    ? `${sliceLabel} · +/− beside a level is the change in cadets holding it since ${formatShortDate(badgeHistory[0].date)}`
                    : sliceLabel
                }
                actions={
                  <Select value={sort} onValueChange={(v) => set({ sort: v === "catalogue" ? null : v })}>
                    <SelectTrigger size="sm" aria-label="Sort badges" className="no-print w-40">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {BADGE_SORTS.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                }
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {order.map((key) => (
                  <BadgeTrendCard
                    key={key}
                    badgeKey={key}
                    levels={cohort.badges[key] ?? {}}
                    total={cohort.total_cadets}
                    history={badgeHistory}
                  />
                ))}
              </div>
            </section>
          </>
        )
      )}
    </div>
  );
}
