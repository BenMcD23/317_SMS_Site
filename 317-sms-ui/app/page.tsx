"use client";

import { useEffect } from "react";
import Link from "next/link";
import { signIn, useSession } from "next-auth/react";
import { useApiQuery } from "@/lib/use-api-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { FLIGHT_ORDER, RANK_ORDER } from "@/lib/cadet-format";
import { ArrowRight, FileText, DatabaseZap, Calendar, Newspaper } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CurrentStats {
  total_cadets: number;
  by_flight: Record<string, number>;
  by_age: Record<string, number>;
  by_rank: Record<string, number>;
  badges: Record<string, Record<string, number>>;
}

interface HistoryPoint {
  date: string;
  data: CurrentStats;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const BADGE_LABELS: Record<string, string> = {
  duke_of_edinburgh: "Duke of Edinburgh",
  first_aid: "First Aid",
  leadership: "Leadership",
  cyber: "Cyber",
  radio: "Radio",
  road_marching: "Road Marching",
  space: "Space",
  music: "Music",
  flying_badge: "Flying Badge",
  fieldcraft: "Fieldcraft",
  shooting: "Shooting",
  swimming_proficiency: "Swimming",
};

// Badge level colours are domain colours (bronze/silver/gold), not theme colours
const LEVEL_COLOURS: Record<string, string> = {
  None: "var(--muted-foreground)",
  Blue: "#3b82f6",
  Bronze: "#b45309",
  Silver: "#6b7280",
  Gold: "#ca8a04",
  Basic: "#6ee7b7",
  Intermediate: "#34d399",
  Advanced: "#059669",
  Nijmegen: "#7c3aed",
};

const LEVEL_ORDER = ["None", "Blue", "Bronze", "Silver", "Gold", "Nijmegen", "Basic", "Intermediate", "Advanced"];

function levelColor(level: string): string {
  return LEVEL_COLOURS[level] ?? "#9ca3af";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

// ─── Stat cards ───────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: React.ReactNode;
  detail?: React.ReactNode;
}) {
  return (
    <Card className="gap-2 py-5">
      <CardHeader className="pb-0">
        <CardDescription>{label}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-1.5">
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
        {detail && <div className="text-xs text-muted-foreground">{detail}</div>}
      </CardContent>
    </Card>
  );
}

function breakdownLine(counts: Record<string, number>, order: string[]): string {
  const known = order.filter((k) => counts[k] !== undefined).map((k) => `${counts[k]} ${k}`);
  const extra = Object.keys(counts)
    .filter((k) => !order.includes(k))
    .map((k) => `${counts[k]} ${k}`);
  return [...known, ...extra].join(" · ");
}

// ─── Age bar chart ────────────────────────────────────────────────────────────

function AgeChart({ byAge }: { byAge: Record<string, number> }) {
  const data = Object.entries(byAge)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([age, count]) => ({ age, count }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Age distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={data} barSize={22}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
            <XAxis dataKey="age" tick={{ fontSize: 12 }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={24} tickLine={false} axisLine={false} />
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              contentStyle={{
                background: "var(--popover)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius)",
                color: "var(--popover-foreground)",
                fontSize: 12,
              }}
            />
            <Bar dataKey="count" fill="var(--chart-1)" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Badge progression card ───────────────────────────────────────────────────

function BadgeStatCard({
  badgeKey,
  levels,
  total,
  history,
}: {
  badgeKey: string;
  levels: Record<string, number>;
  total: number;
  history: HistoryPoint[];
}) {
  const label = BADGE_LABELS[badgeKey] ?? badgeKey;
  const noneCount = levels["None"] ?? 0;
  const completedCount = total - noneCount;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const sortedLevels = LEVEL_ORDER
    .filter((l) => l !== "None" && (levels[l] ?? 0) > 0)
    .map((l) => ({ level: l, count: levels[l] ?? 0 }));

  const allLevels = Array.from(
    new Set(history.flatMap((h) => Object.keys(h.data.badges[badgeKey] ?? {})))
  ).filter((l) => l !== "None");

  // Track the held levels plus a "None" series (cadets without the badge) over time.
  const chartLevels = [...allLevels, "None"];

  const chartData = history.map((h) => {
    const point: Record<string, string | number> = { date: fmtDate(h.date) };
    for (const l of chartLevels) {
      point[l] = h.data.badges[badgeKey]?.[l] ?? 0;
    }
    return point;
  });

  return (
    <Card className="gap-3">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm">{label}</CardTitle>
          <Badge variant={pct > 0 ? "secondary" : "outline"} className="tabular-nums">
            {completedCount}/{total}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {sortedLevels.length === 0 ? (
            <span className="text-xs text-muted-foreground">Not yet held by any cadet</span>
          ) : (
            sortedLevels.map(({ level, count }) => (
              <div key={level} className="flex items-center gap-1.5">
                <span
                  className="inline-block size-2 rounded-full"
                  style={{ background: levelColor(level) }}
                />
                <span className="text-xs font-medium">{level}</span>
                <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
              </div>
            ))
          )}
        </div>

        {chartData.length >= 2 && (
          <ResponsiveContainer width="100%" height={90}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={20} tickLine={false} axisLine={false} />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
              />
              {chartLevels.map((l) => (
                <Line
                  key={l}
                  type="monotone"
                  dataKey={l}
                  stroke={levelColor(l)}
                  strokeWidth={2}
                  dot={false}
                  strokeDasharray={l === "None" ? "4 3" : undefined}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Quick links (staff tools) ────────────────────────────────────────────────

const QUICK_TOOLS = [
  { title: "JI/AO Generator", desc: "Generate joining instructions and admin orders", href: "/tools/ji-ao-generator", icon: FileText },
  { title: "Bader Scrapers", desc: "Sync cadet and event data from SMS", href: "/tools/scraper", icon: DatabaseZap },
  { title: "Programme", desc: "Publish the monthly programme to the website", href: "/tools/programme-updater", icon: Calendar },
  { title: "Newsletter", desc: "Manage published newsletters", href: "/tools/newsletter-updater", icon: Newspaper },
];

function QuickTools() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Tools</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {QUICK_TOOLS.map((t) => (
          <Link key={t.href} href={t.href} className="group">
            <Card className="h-full gap-2 py-5 transition-colors group-hover:border-primary/40">
              <CardHeader className="pb-0">
                <div className="flex items-center justify-between">
                  <t.icon className="size-4 text-muted-foreground" />
                  <ArrowRight className="size-3.5 text-muted-foreground/0 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent className="flex flex-col gap-0.5">
                <p className="text-sm font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">{t.desc}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <Skeleton className="h-64" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {[...Array(6)].map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const { data: session } = useSession({ required: true });

  useEffect(() => {
    if (session?.error) {
      signIn("google", { callbackUrl: "/" });
    }
  }, [session?.error]);

  const { data: stats = null } = useApiQuery<CurrentStats>(
    ["stats", "current"],
    "/stats/current"
  );
  const { data: history = [], isLoading: loading } = useApiQuery<HistoryPoint[]>(
    ["stats", "history"],
    "/stats/history"
  );

  const total = stats?.total_cadets ?? 0;
  const ncoCount = stats
    ? Object.entries(stats.by_rank)
        .filter(([rank]) => rank !== "Cadet" && rank !== "Unknown")
        .reduce((sum, [, n]) => sum + n, 0)
    : 0;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <PageHeader title="Dashboard" description="Squadron overview and badge progression" />

      {loading ? (
        <DashboardSkeleton />
      ) : (
        stats && (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <StatCard label="Cadets on strength" value={total} />
              <StatCard
                label="Flights"
                value={Object.keys(stats.by_flight).length}
                detail={breakdownLine(stats.by_flight, FLIGHT_ORDER)}
              />
              <StatCard
                label="NCOs"
                value={ncoCount}
                detail={breakdownLine(
                  Object.fromEntries(Object.entries(stats.by_rank).filter(([r]) => r !== "Cadet" && r !== "Unknown")),
                  RANK_ORDER,
                )}
              />
            </section>

            <AgeChart byAge={stats.by_age} />

            <section className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Badge progression
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Object.keys(BADGE_LABELS).map((key) => (
                  <BadgeStatCard
                    key={key}
                    badgeKey={key}
                    levels={stats.badges[key] ?? {}}
                    total={total}
                    history={history}
                  />
                ))}
              </div>
            </section>
          </>
        )
      )}

      {session?.role === "staff" && <QuickTools />}
    </div>
  );
}
