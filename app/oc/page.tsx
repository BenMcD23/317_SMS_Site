"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useApiQuery } from "@/lib/use-api-query";
import { isOc } from "@/lib/config";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { ShieldAlert, GraduationCap, Clock } from "lucide-react";
import {
  type CommitteeRequestSummary, type CommitteeRequestStatus,
  STATUS_LABELS, STATUS_STYLE, formatGBP,
} from "@/lib/committee";
import { rateOf, totalOf, type StateCounts } from "@/lib/attendance";
import { formatDate } from "@/lib/format";

interface StaffAttendance {
  cin: number;
  name: string;
  rank: string;
  attendance: Record<string, number>;
}

interface ExpiringQual {
  cadet_name: string;
  qual_type: string;
  date_expires: string;
  days_left: number;
}

interface Strength {
  total_cadets: number;
  total_staff: number;
  by_flight: Record<string, number>;
  by_classification: Record<string, number>;
  // badge key -> { "Blue": n, "Gold": n, "None": n, ... }
  badges: Record<string, Record<string, number>>;
}

interface TrendNight {
  date: string;
  cadets: StateCounts;
  staff: StateCounts;
}

interface QualSummary {
  total: number;
  expired: number;
  expiring_30: number;
  expiring_90: number;
}

interface OcDashboard {
  strength: Strength;
  staff_attendance: StaffAttendance[];
  attendance_trend: TrendNight[];
  qual_summary: QualSummary;
  expiring_quals: ExpiringQual[];
}

interface CommitteeList {
  requests: CommitteeRequestSummary[];
  is_oc: boolean;
}

const QUAL_LABELS: Record<string, string> = {
  duke_of_edinburgh: "Duke of Edinburgh", first_aid: "First Aid", leadership: "Leadership",
  cyber: "Cyber", radio: "Radio", road_marching: "Road Marching", space: "Space",
  music: "Music", flying_badge: "Flying", fieldcraft: "Fieldcraft", shooting: "Shooting",
  presentation_skills: "Presentation Skills", moi: "MOI",
  swimming_proficiency: "Swimming", climatic_injuries: "Climatic Injuries",
};

const ACTION_STATUSES: CommitteeRequestStatus[] = ["submitted", "sent_to_committee", "sent_for_payment"];

// Ladder order, not alphabetical — matches the labels compute_stats emits.
const CLASSIFICATION_ORDER = [
  "Junior Cadet", "First Class Cadet", "Leading Cadet", "Senior Cadet", "Master Air Cadet",
] as const;

function PlaceholderCard({
  icon: Icon, title, description,
}: {
  icon: React.ElementType; title: string; description: string;
}) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="secondary" className="ml-auto">Placeholder — no data yet</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex h-24 items-center justify-center rounded-md bg-muted/30 text-sm text-muted-foreground">
          Coming soon
        </div>
      </CardContent>
    </Card>
  );
}

type TrendRow = {
  label: string;
  cadetRate: number; staffRate: number;
  cadetPresent: number; cadetTotal: number;
  staffPresent: number; staffTotal: number;
};

/** One series, 0–100%, so both copies of this chart compare directly by eye
 *  without needing a second colour that the theme can't separate. */
function TurnoutChart({
  title, description, data, dataKey, presentKey, totalKey,
}: {
  title: string;
  description: string;
  data: TrendRow[];
  dataKey: "cadetRate" | "staffRate";
  presentKey: "cadetPresent" | "staffPresent";
  totalKey: "cadetTotal" | "staffTotal";
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No parade nights recorded yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} barSize={22} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)"
                interval="preserveStartEnd" minTickGap={12}
              />
              <YAxis
                domain={[0, 100]} unit="%" tick={{ fontSize: 11 }}
                stroke="var(--muted-foreground)"
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                contentStyle={{
                  background: "var(--popover)", border: "1px solid var(--border)",
                  borderRadius: "8px", fontSize: "13px",
                }}
                formatter={(value, _name, item) => [
                  `${value}% — ${item?.payload?.[presentKey]} of ${item?.payload?.[totalKey]}`,
                  "Turnout",
                ]}
              />
              <Bar dataKey={dataKey} fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}

export default function OcDashboardPage() {
  const { data: session } = useSession();
  const allowed = isOc(session?.user?.email);

  const { data: dash, isLoading } = useApiQuery<OcDashboard>(
    ["oc-dashboard"], "/oc/dashboard", { enabled: allowed },
  );
  const { data: committee } = useApiQuery<CommitteeList>(
    ["committee-requests"], "/committee-requests", { enabled: allowed },
  );

  if (!allowed) {
    return (
      <div className="mx-auto w-full max-w-lg pt-16">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <ShieldAlert className="size-5 text-destructive" />
              <CardTitle>OC access required</CardTitle>
            </div>
            <CardDescription>
              This dashboard is only available to the Officer Commanding.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Committee request status counts + the ones needing OC action.
  const requests = committee?.requests ?? [];
  const counts = requests.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});
  const actionable = requests.filter((r) => ACTION_STATUSES.includes(r.status));

  // Turnout over the recent parade nights, as a percentage so cadets and staff
  // read on the same scale despite very different head counts.
  const trend = dash?.attendance_trend ?? [];
  const trendData = trend.map((night) => ({
    label: formatDate(night.date).replace(/ \d{4}$/, ""),   // "6 Aug" — the year is noise here
    cadetRate: rateOf(night.cadets) ?? 0,
    staffRate: rateOf(night.staff) ?? 0,
    cadetPresent: night.cadets.present,
    cadetTotal: totalOf(night.cadets),
    staffPresent: night.staff.present,
    staffTotal: totalOf(night.staff),
  }));

  // Averages across the window, weighted by head count rather than by night, so
  // a night with three cadets on the register doesn't swing it.
  const sumCounts = (pick: (n: TrendNight) => StateCounts) =>
    trend.reduce((acc, n) => {
      const c = pick(n);
      return { present: acc.present + c.present, total: acc.total + totalOf(c) };
    }, { present: 0, total: 0 });
  const cadetTotals = sumCounts((n) => n.cadets);
  const staffTotals = sumCounts((n) => n.staff);
  const cadetAvg = cadetTotals.total ? Math.round((cadetTotals.present / cadetTotals.total) * 100) : null;
  const staffAvg = staffTotals.total ? Math.round((staffTotals.present / staffTotals.total) * 100) : null;

  // Qualification coverage — how many cadets hold something vs nothing per badge.
  const badges = dash?.strength.badges ?? {};
  const totalCadets = dash?.strength.total_cadets ?? 0;
  const coverage = Object.entries(badges)
    .map(([key, levels]) => {
      const held = Object.entries(levels)
        .filter(([label]) => label !== "None")
        .reduce((sum, [, n]) => sum + n, 0);
      return {
        key,
        label: QUAL_LABELS[key] ?? key,
        held,
        pct: totalCadets ? Math.round((held / totalCadets) * 100) : 0,
      };
    })
    .sort((a, b) => b.held - a.held);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
      <PageHeader title="OC Dashboard" description="Squadron oversight at a glance" />

      {/* ── Committee requests ──────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            Committee Requests
          </h2>
          <Button asChild variant="ghost" size="sm">
            <Link href="/committee/requests">View all</Link>
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Awaiting you" value={(counts.submitted ?? 0) + (counts.sent_to_committee ?? 0)}
            detail="To send or decide" />
          <StatCard label="Approved" value={counts.approved ?? 0} detail="Awaiting receipts" />
          <StatCard label="To pay" value={counts.sent_for_payment ?? 0} detail="Awaiting payment" />
          <StatCard label="Paid" value={counts.paid ?? 0} />
        </div>

        {actionable.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Reference</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Requester</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actionable.map((r) => {
                  const style = STATUS_STYLE[r.status];
                  return (
                    <TableRow key={r.id} className="cursor-pointer"
                      onClick={() => { window.location.href = `/committee/requests/${r.id}`; }}>
                      <TableCell className="font-medium">
                        <Link href={`/committee/requests/${r.id}`} className="hover:underline">{r.reference}</Link>
                      </TableCell>
                      <TableCell className="max-w-[16rem] truncate">{r.title}</TableCell>
                      <TableCell>{r.requester_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatGBP(r.total)}</TableCell>
                      <TableCell>
                        <Badge variant={style.variant} className={style.className}>{STATUS_LABELS[r.status]}</Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      {/* ── Strength & attendance ───────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Strength &amp; Attendance
        </h2>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total cadets" value={dash?.strength.total_cadets ?? 0} />
              <StatCard label="Total staff" value={dash?.strength.total_staff ?? 0} />
              <StatCard
                label="Cadet turnout"
                value={cadetAvg === null ? "—" : `${cadetAvg}%`}
                detail={`Last ${trend.length} parade night${trend.length !== 1 ? "s" : ""}`}
              />
              <StatCard
                label="Staff turnout"
                value={staffAvg === null ? "—" : `${staffAvg}%`}
                detail={`Last ${trend.length} parade night${trend.length !== 1 ? "s" : ""}`}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(dash?.strength.by_flight ?? {})
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([flight, n]) => (
                  <StatCard key={flight} label={`${flight} Flight`} value={n} />
                ))}
            </div>

            {/* Two single-series charts rather than one with two series: the
                theme's chart ramp is three near-adjacent blues, and no pair of
                them clears the colourblind-separation threshold. Same y-scale,
                so they still read as a direct comparison. */}
            <div className="grid gap-4 lg:grid-cols-2">
              <TurnoutChart
                title="Cadet turnout"
                description="Per parade night, cadets present as a share of the register"
                data={trendData}
                dataKey="cadetRate"
                presentKey="cadetPresent"
                totalKey="cadetTotal"
              />
              <TurnoutChart
                title="Staff turnout"
                description="Per parade night, staff present as a share of the register"
                data={trendData}
                dataKey="staffRate"
                presentKey="staffPresent"
                totalKey="staffTotal"
              />
            </div>
          </>
        )}
      </section>

      {/* ── Qualifications ──────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Qualifications
        </h2>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total held" value={dash?.qual_summary.total ?? 0} />
          <StatCard
            label="Expired"
            value={dash?.qual_summary.expired ?? 0}
            detail="Already lapsed"
          />
          <StatCard
            label="Expiring in 30 days"
            value={dash?.qual_summary.expiring_30 ?? 0}
          />
          <StatCard
            label="Expiring in 3 months"
            value={dash?.qual_summary.expiring_90 ?? 0}
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Coverage — a bar per badge is a lot of near-identical rows; a
              labelled meter reads faster and needs no colour scale. */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Badge coverage</CardTitle>
              <CardDescription>
                Cadets holding each badge at any level, out of {totalCadets}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : coverage.length === 0 ? (
                <p className="text-sm text-muted-foreground">No qualification data.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {coverage.map((badge) => (
                    <div key={badge.key} className="flex items-center gap-3">
                      <span className="w-36 shrink-0 truncate text-sm">{badge.label}</span>
                      <div
                        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
                        role="img"
                        aria-label={`${badge.label}: ${badge.held} of ${totalCadets} cadets`}
                      >
                        <div
                          className="h-full rounded-full bg-[var(--chart-1)]"
                          style={{ width: `${badge.pct}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                        {badge.held} · {badge.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Classification</CardTitle>
              <CardDescription>Highest classification passed, per cadet</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : (
                <div className="divide-y">
                  {CLASSIFICATION_ORDER
                    .map((label) => [label, dash?.strength.by_classification?.[label] ?? 0] as const)
                    .filter(([, n]) => n > 0)
                    .map(([label, n]) => (
                      <div key={label} className="flex items-center justify-between py-2 text-sm">
                        <span>{label}</span>
                        <span className="font-medium tabular-nums">
                          {n}
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            {totalCadets ? Math.round((n / totalCadets) * 100) : 0}%
                          </span>
                        </span>
                      </div>
                    ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <GraduationCap className="size-4 text-muted-foreground" />
              <CardTitle className="text-base">Within the next 3 months</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (dash?.expiring_quals.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing expiring in the next 3 months.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Cadet</TableHead>
                      <TableHead>Qualification</TableHead>
                      <TableHead>Expires</TableHead>
                      <TableHead className="text-right">Time left</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dash?.expiring_quals.map((q, i) => (
                      <TableRow key={i}>
                        <TableCell>{q.cadet_name}</TableCell>
                        <TableCell>{QUAL_LABELS[q.qual_type] ?? q.qual_type}</TableCell>
                        <TableCell>{q.date_expires}</TableCell>
                        <TableCell className="text-right">
                          <span className={q.days_left <= 30 ? "font-semibold text-destructive" : "text-muted-foreground"}>
                            {q.days_left} days
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* ── Stubbed sections ────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          In the Pipeline
        </h2>
        <div className="grid gap-4 lg:grid-cols-2">
          <PlaceholderCard
            icon={Clock}
            title="Mandatory Training Reminders"
            description="Staff mandatory training (safeguarding, first aid, etc.) with expiry reminders, once that data is captured."
          />
          <PlaceholderCard
            icon={ShieldAlert}
            title="Subs at-risk radar"
            description="Cadets whose subscription payments are overdue or lapsing, once a payments feed exists."
          />
        </div>
      </section>
    </div>
  );
}
