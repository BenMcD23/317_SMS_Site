"use client";

import { Suspense, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { ChevronLeft, ChevronRight, Printer, ZoomOut } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { SectionHeading } from "@/components/section-heading";
import { BadgeGlance } from "@/components/stats/badge-glance";
import { CadetDrilldown, type Drill } from "@/components/stats/cadet-drilldown";
import {
  AgeChart,
  BadgeTrendCard,
  ClassificationChart,
  ServiceChart,
  StrengthChart,
} from "@/components/stats/charts";
import { CsvButton } from "@/components/stats/csv-button";
import { SquadronKpis } from "@/components/stats/kpis";
import { ClassificationFunnel, IntakeRetention } from "@/components/stats/progression";
import { ExpiringQuals, RecentAwards } from "@/components/stats/qual-lists";
import { TargetsSection } from "@/components/stats/targets";
import { BlueFlyingCard, ClassificationExamsCard } from "@/components/stats/training";
import { TimeRangePicker } from "@/components/stats/time-range-picker";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDate, formatShortDate } from "@/lib/format";
import {
  type Award,
  BADGE_LABELS,
  BADGE_SORTS,
  type BadgeSort,
  badgeHistoryFor,
  cohortOf,
  type ExpiringQual,
  flightLabel,
  type Funnel,
  type RetentionRow,
  shiftRange,
  type StatsTarget,
  type TimeRange,
  type TrainingProgress,
  zoomOutRange,
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
  const { data: retentionData } = useApiQuery<RetentionRow[]>(["stats", "retention"], "/stats/retention");
  const { data: targetsData } = useApiQuery<StatsTarget[]>(["stats", "targets"], "/stats/targets");
  const { data: badgeLevels } = useApiQuery<Record<string, string[]>>(
    ["stats", "badge-levels"],
    "/stats/badge-levels",
    { staleTime: Infinity }
  );
  const { data: session } = useSession();
  const isStaff = session?.role === "staff";
  const [drill, setDrill] = useState<Drill>(null);

  // An error body in place of a list would otherwise crash the charts.
  const history = useMemo(() => (Array.isArray(historyData) ? historyData : []), [historyData]);
  const flights = orderedFlights(Object.keys(stats?.flights ?? stats?.by_flight ?? {}));
  // A stale ?flight= (a flight since renamed or emptied) falls back to everyone.
  const flight = flightParam && flights.includes(flightParam) ? flightParam : null;
  const { data: funnelData } = useApiQuery<Funnel>(
    ["stats", "funnel", flight],
    flight ? `/stats/funnel?flight=${encodeURIComponent(flight)}` : "/stats/funnel"
  );

  // Training progress is live and follows the flight and junior filters.
  const progressQuery = new URLSearchParams({
    ...(flight ? { flight } : {}),
    ...(excludeJuniors ? { exclude_juniors: "true" } : {}),
  }).toString();
  const { data: progressData } = useApiQuery<TrainingProgress>(
    ["stats", "progress", progressQuery],
    progressQuery ? `/stats/progress?${progressQuery}` : "/stats/progress"
  );
  // An error body in place of the object would otherwise crash the cards.
  const progress = progressData && Array.isArray(progressData.exams) ? progressData : null;

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
  const applyRange = (r: TimeRange) =>
    r.kind === "quick" ? setQuick(r.id) : set({ from: r.from, to: r.to, range: null });
  const earlier = shiftRange(range, -1);
  const later = shiftRange(range, 1);
  const wider = zoomOutRange(range);

  // Click-through from the badge cards follows the page's filters, and a past
  // range lists cadets as they stood at its end.
  const drillSlice = (query: Record<string, string>, title: string) =>
    setDrill({
      query: {
        ...query,
        ...(flight ? { flight } : {}),
        ...(excludeJuniors ? { exclude_juniors: "true" } : {}),
        ...(!live && range.kind === "absolute" ? { on: range.to } : {}),
      },
      title,
    });
  // The classification chart and funnel are squadron-wide, today.
  const drillNow = (query: Record<string, string>, title: string) => setDrill({ query, title });
  // Training progress: today, under the page's flight and junior filters.
  const drillProgress = (query: Record<string, string>, title: string) =>
    setDrill({
      query: {
        ...query,
        ...(flight ? { flight } : {}),
        ...(excludeJuniors ? { exclude_juniors: "true" } : {}),
      },
      title,
    });

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
          <div className="flex items-center">
            <Button
              variant="outline"
              size="icon"
              className="size-8 rounded-r-none"
              aria-label="Earlier time range"
              title="Same length, earlier"
              disabled={!earlier}
              onClick={() => earlier && applyRange(earlier)}
            >
              <ChevronLeft />
            </Button>
            <TimeRangePicker
              value={range}
              onQuick={setQuick}
              onAbsolute={(from, to) => set({ from, to, range: null })}
              className="rounded-none border-x-0"
            />
            <Button
              variant="outline"
              size="icon"
              className="size-8 rounded-none border-r-0"
              aria-label="Later time range"
              title="Same length, later"
              disabled={!later}
              onClick={() => later && applyRange(later)}
            >
              <ChevronRight />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-8 rounded-l-none"
              aria-label="Zoom out"
              title="Twice as long"
              disabled={!wider}
              onClick={() => wider && applyRange(wider)}
            >
              <ZoomOut />
            </Button>
          </div>
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

            <StrengthChart data={strength} flights={strengthFlights} onZoom={applyRange} />

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-3">
              <AgeChart byAge={stats.by_age} />
              <ClassificationChart byClassification={stats.by_classification ?? {}} onDrill={drillNow} />
              {progress && <ServiceChart service={progress.service} onDrill={drillProgress} />}
            </div>

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <ClassificationFunnel funnel={funnelData} flight={flight} onDrill={drillNow} />
              <IntakeRetention rows={Array.isArray(retentionData) ? retentionData : []} />
            </div>

            {progress && (
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <BlueFlyingCard progress={progress} onDrill={drillProgress} />
                <ClassificationExamsCard progress={progress} onDrill={drillProgress} />
              </div>
            )}

            <TargetsSection
              targets={Array.isArray(targetsData) ? targetsData : []}
              stats={stats}
              history={history}
              live={live}
              flights={flights}
              badgeLevels={badgeLevels ?? {}}
              canEdit={isStaff}
            />

            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Badges at a glance</CardTitle>
                  <CardAction>
                    <CsvButton
                      filename="badges-at-a-glance.csv"
                      label="Download badges at a glance as CSV"
                      rows={() =>
                        order.map((k) => ({
                          badge: BADGE_LABELS[k] ?? k,
                          cadets: cohort.total_cadets,
                          ...cohort.badges[k],
                        }))
                      }
                    />
                  </CardAction>
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
                    <CardAction>
                      <CsvButton
                        filename="badges-gained.csv"
                        label="Download badges gained as CSV"
                        rows={() =>
                          awards.map((a) => ({
                            date: a.date,
                            name: a.name,
                            flight: flightLabel(a.flight),
                            badge: BADGE_LABELS[a.badge] ?? a.badge,
                            level: a.level,
                          }))
                        }
                      />
                    </CardAction>
                  </CardHeader>
                  <CardContent>
                    <RecentAwards awards={awards} empty={`No badges gained ${rangePhrase(range)}.`} />
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Expiring in the next 3 months</CardTitle>
                    <CardAction>
                      <CsvButton
                        filename="expiring-qualifications.csv"
                        label="Download expiring qualifications as CSV"
                        rows={() =>
                          expiring.map((q) => ({
                            name: q.name,
                            flight: flightLabel(q.flight),
                            qualification: q.qual_type,
                            expires: q.date_expires,
                            "days left": q.days_left,
                          }))
                        }
                      />
                    </CardAction>
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
                  <div className="flex items-center gap-1">
                    <CsvButton
                      filename="badge-progression.csv"
                      label="Download badge progression as CSV"
                      // Long format, one row per date, badge and level: easy to pivot.
                      rows={() =>
                        badgeHistory.flatMap((p) =>
                          order.flatMap((k) =>
                            Object.entries(p.data.badges[k] ?? {}).map(([level, n]) => ({
                              date: p.date.slice(0, 10),
                              badge: BADGE_LABELS[k] ?? k,
                              level,
                              cadets: n,
                              of: p.data.total_cadets,
                            }))
                          )
                        )
                      }
                    />
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
                  </div>
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
                    onDrill={drillSlice}
                    onZoom={applyRange}
                  />
                ))}
              </div>
            </section>
          </>
        )
      )}
      <CadetDrilldown drill={drill} onClose={() => setDrill(null)} canOpenRecords={isStaff} />
    </div>
  );
}
