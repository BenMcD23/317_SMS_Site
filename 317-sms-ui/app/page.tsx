"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, MessageSquare, Calendar, Users } from "lucide-react";
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

const LEVEL_COLOURS: Record<string, string> = {
  None: "#e5e7eb",
  Blue: "#3b82f6",
  Bronze: "#92400e",
  Bronze_fill: "#b45309",
  Silver: "#6b7280",
  Gold: "#ca8a04",
  Basic: "#6ee7b7",
  Intermediate: "#34d399",
  Advanced: "#059669",
  Nijmegen: "#7c3aed",
  True: "#22c55e",
  False: "#e5e7eb",
};

const LEVEL_ORDER = ["None", "Blue", "Bronze", "Silver", "Gold", "Nijmegen", "Basic", "Intermediate", "Advanced"];

function levelColor(level: string): string {
  return LEVEL_COLOURS[level] ?? "#9ca3af";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

async function fetchJSON(path: string, token: string) {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

// ─── Top stat cards ───────────────────────────────────────────────────────────

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <p className="text-sm text-muted-foreground">{label}</p>
      </CardHeader>
      <CardContent className="flex items-end justify-between">
        <span className="text-3xl font-bold">{value}</span>
        {sub && <Badge variant="secondary" className="mb-1">{sub}</Badge>}
      </CardContent>
    </Card>
  );
}

// ─── Flight breakdown ─────────────────────────────────────────────────────────

const FLIGHT_ORDER = ["NCO", "A", "B", "C"];

function FlightBreakdown({ byFlight }: { byFlight: Record<string, number> }) {
  const data = FLIGHT_ORDER
    .filter((f) => byFlight[f] !== undefined)
    .map((f) => ({ flight: `${f} Flt`, count: byFlight[f] }));

  const extra = Object.entries(byFlight)
    .filter(([f]) => !FLIGHT_ORDER.includes(f))
    .map(([f, n]) => ({ flight: f, count: n }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">By Flight</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-4">
        {[...data, ...extra].map(({ flight, count }) => (
          <div key={flight} className="text-center">
            <p className="text-2xl font-bold">{count}</p>
            <p className="text-xs text-muted-foreground">{flight}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── Age bar chart ────────────────────────────────────────────────────────────

function AgeChart({ byAge }: { byAge: Record<string, number> }) {
  const data = Object.entries(byAge)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([age, count]) => ({ age, count }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Age Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={data} barSize={22}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="age" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} allowDecimals={false} width={24} />
            <Tooltip />
            <Bar dataKey="count" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ─── Rank breakdown ───────────────────────────────────────────────────────────

const RANK_ORDER = ["Cadet", "Cpl", "Sgt", "FS", "CWO"];

function RankBreakdown({ byRank }: { byRank: Record<string, number> }) {
  const data = RANK_ORDER
    .filter((r) => byRank[r] !== undefined)
    .map((r) => ({ rank: r, count: byRank[r] }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">NCO Breakdown</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap gap-4">
          {data.map(({ rank, count }) => (
            <div key={rank} className="text-center min-w-[48px]">
              <p className="text-2xl font-bold">{count}</p>
              <p className="text-xs text-muted-foreground">{rank}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Badge stat card ──────────────────────────────────────────────────────────

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

  // Sort levels for display
  const sortedLevels = LEVEL_ORDER
    .filter((l) => l !== "None" && (levels[l] ?? 0) > 0)
    .map((l) => ({ level: l, count: levels[l] ?? 0 }));

  // Build per-level history series
  const allLevels = Array.from(
    new Set(history.flatMap((h) => Object.keys(h.data.badges[badgeKey] ?? {})))
  ).filter((l) => l !== "None");

  const chartData = history.map((h) => {
    const point: Record<string, string | number> = { date: fmtDate(h.date) };
    for (const l of allLevels) {
      point[l] = h.data.badges[badgeKey]?.[l] ?? 0;
    }
    return point;
  });

  return (
    <Card>
      <CardHeader className="pb-1">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold">{label}</CardTitle>
          <Badge variant={pct > 0 ? "default" : "secondary"} className="text-xs">
            {pct}% ({completedCount}/{total})
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Level breakdown */}
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {sortedLevels.length === 0 ? (
            <span className="text-xs text-muted-foreground">No cadets hold this badge yet</span>
          ) : (
            sortedLevels.map(({ level, count }) => (
              <div key={level} className="flex items-center gap-1">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ background: levelColor(level) }}
                />
                <span className="text-xs font-medium">{level}</span>
                <span className="text-xs text-muted-foreground">{count}</span>
              </div>
            ))
          )}
        </div>

        {/* Progression chart */}
        {chartData.length >= 2 ? (
          <ResponsiveContainer width="100%" height={100}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
              <YAxis tick={{ fontSize: 10 }} allowDecimals={false} width={20} />
              <Tooltip />
              {allLevels.map((l) => (
                <Line
                  key={l}
                  type="monotone"
                  dataKey={l}
                  stroke={levelColor(l)}
                  strokeWidth={2}
                  dot={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-xs text-muted-foreground pt-1">
            Run the scraper bi-weekly to build progression charts
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Quick tools ──────────────────────────────────────────────────────────────

const QUICK_TOOLS = [
  { title: "JI/AO Generator", desc: "Generate cadet documents", href: "/ji-ao-generator", icon: FileText },
  { title: "SMS Scraper", desc: "Run qualification & event tools", href: "/scraper", icon: MessageSquare },
  { title: "Programme Updater", desc: "Push the latest programme to the website", href: "/programme-updater", icon: Calendar },
];

function QuickTools() {
  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold">Quick Access</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        {QUICK_TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href}>
              <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
                <CardHeader>
                  <Icon className="mb-2 h-5 w-5 text-primary" />
                  <CardTitle className="text-base">{t.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">{t.desc}</p>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<CurrentStats | null>(null);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.id_token) return;
    const token = session.id_token as string;

    Promise.all([
      fetchJSON("/stats/current", token),
      fetchJSON("/stats/history", token),
    ])
      .then(([cur, hist]) => {
        setStats(cur);
        setHistory(hist);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [session?.id_token]);

  const total = stats?.total_cadets ?? 0;

  return (
    <div className="mx-auto max-w-6xl space-y-10">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        {session?.user && (
          <p className="text-muted-foreground">Welcome back, {session.user.name}</p>
        )}
      </div>

      {loading ? (
        <p className="text-muted-foreground text-sm">Loading stats…</p>
      ) : (
        <>
          {/* Top-level numbers */}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total Cadets" value={total} />
            {stats && <FlightBreakdown byFlight={stats.by_flight} />}
            {stats && <RankBreakdown byRank={stats.by_rank} />}
            {stats && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4" /> Cadets Overview
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Link href="/cadets/overview" className="text-sm text-primary underline-offset-4 hover:underline">
                    View all cadets →
                  </Link>
                </CardContent>
              </Card>
            )}
          </section>

          {/* Age distribution */}
          {stats && (
            <section className="grid gap-4 lg:grid-cols-2">
              <AgeChart byAge={stats.by_age} />
            </section>
          )}

          {/* Badge progression */}
          {stats && (
            <section>
              <h2 className="mb-4 text-lg font-semibold">Badge Progression</h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
          )}
        </>
      )}

      <QuickTools />
    </div>
  );
}
