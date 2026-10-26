"use client";

import { Fragment, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiQuery } from "@/lib/use-api-query";
import { apiRequest } from "@/lib/api-fetch";
import { API_BASE, isOc } from "@/lib/config";
import { normaliseLayout, OC_SECTION_TITLES, type OcLayout, type OcSection } from "@/lib/oc-layout";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { ShieldAlert, GraduationCap, Clock, Check, LayoutList, Printer, RotateCcw } from "lucide-react";
import {
  type CommitteeRequestSummary,
  type CommitteeRequestStatus,
  STATUS_LABELS,
  STATUS_STYLE,
  formatGBP,
} from "@/lib/committee";
import { rateOf, totalOf, type StateCounts } from "@/lib/attendance";
import { formatDate } from "@/lib/format";
import { SectionHeading } from "@/components/section-heading";
import { Stat, StatGroup } from "@/components/stat";
import { OcAccessRequired } from "@/components/oc/oc-access-required";
import { SectionArranger } from "@/components/section-arranger";

const LAYOUT_KEY = ["oc-dashboard", "layout"] as const;

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

interface BadgeCoverage {
  // Cadets the coverage is counted over — the whole squadron, or everyone
  // past Junior when the filter is on.
  cadets: number;
  badges: Record<string, Record<string, number>>;
}

interface OcDashboard {
  strength: Strength;
  badge_coverage: BadgeCoverage;
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
  duke_of_edinburgh: "Duke of Edinburgh",
  first_aid: "First Aid",
  leadership: "Leadership",
  cyber: "Cyber",
  radio: "Radio",
  road_marching: "Road Marching",
  space: "Space",
  music: "Music",
  flying_badge: "Flying",
  fieldcraft: "Fieldcraft",
  shooting: "Shooting",
  presentation_skills: "Presentation Skills",
  moi: "MOI",
  swimming_proficiency: "Swimming",
  climatic_injuries: "Climatic Injuries",
};

const ACTION_STATUSES: CommitteeRequestStatus[] = ["submitted", "sent_to_committee", "sent_for_payment"];

// Ladder order, not alphabetical — matches the labels compute_stats emits.
const CLASSIFICATION_ORDER = [
  "Junior Cadet",
  "First Class Cadet",
  "Leading Cadet",
  "Senior Cadet",
  "Master Air Cadet",
] as const;

function PlaceholderCard({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
}) {
  return (
    <Card className="border-dashed">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Icon className="text-muted-foreground size-4" />
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge variant="secondary" className="ml-auto">
            Placeholder — no data yet
          </Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="bg-muted/30 text-muted-foreground flex h-24 items-center justify-center rounded-md text-sm">
          Coming soon
        </div>
      </CardContent>
    </Card>
  );
}

type TrendRow = {
  label: string;
  cadetRate: number;
  staffRate: number;
  cadetPresent: number;
  cadetTotal: number;
  staffPresent: number;
  staffTotal: number;
};

/** One series, 0–100%, so both copies of this chart compare directly by eye
 *  without needing a second colour that the theme can't separate. */
function TurnoutChart({
  title,
  description,
  data,
  dataKey,
  presentKey,
  totalKey,
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
          <p className="text-muted-foreground text-sm">No parade nights recorded yet.</p>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={data} barSize={22} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11 }}
                stroke="var(--muted-foreground)"
                interval="preserveStartEnd"
                minTickGap={12}
              />
              <YAxis domain={[0, 100]} unit="%" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  fontSize: "13px",
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
  const router = useRouter();
  const { data: session } = useSession();
  const allowed = isOc(session);

  const [excludeJuniors, setExcludeJuniors] = useState(false);
  const { data: dash, isLoading } = useApiQuery<OcDashboard>(
    ["oc-dashboard", { excludeJuniors }],
    `/oc/dashboard${excludeJuniors ? "?exclude_juniors=true" : ""}`,
    // Keep the current numbers on screen while the other view loads, rather
    // than collapsing the whole page to skeletons on every toggle.
    { enabled: allowed, placeholderData: keepPreviousData }
  );
  const { data: committee } = useApiQuery<CommitteeList>(["committee-requests"], "/committee-requests", {
    enabled: allowed,
  });
  const { data: layout, isLoading: layoutLoading } = useApiQuery<OcLayout>(
    LAYOUT_KEY,
    "/oc/dashboard/layout",
    {
      enabled: allowed,
    }
  );
  const queryClient = useQueryClient();
  const [arranging, setArranging] = useState(false);
  // Counts saves so only the latest one's answer is applied: two quick moves
  // can come back out of order, and the older reply mustn't undo the newer.
  const saveSeq = useRef(0);

  if (!allowed) return <OcAccessRequired />;

  // A failed layout read falls back to the default order rather than hiding
  // the dashboard: the order is a preference, the numbers are the point.
  const order = normaliseLayout(layout?.sections);

  // Saved on every move, shown straight away, and put back if the save fails
  // so the screen never shows an order the next visit (or the printout) won't.
  const saveLayout = async (next: OcSection[] | null) => {
    const token = session?.id_token;
    if (!token) return;
    const seq = ++saveSeq.current;
    const previous = queryClient.getQueryData<OcLayout>(LAYOUT_KEY);
    if (next) queryClient.setQueryData<OcLayout>(LAYOUT_KEY, { sections: next, customised: true });
    try {
      const saved = await apiRequest<OcLayout>(
        token,
        `${API_BASE}/oc/dashboard/layout`,
        next ? { method: "PUT", body: { sections: next } } : { method: "DELETE" },
        "Couldn't save the layout."
      );
      if (seq === saveSeq.current) queryClient.setQueryData<OcLayout>(LAYOUT_KEY, saved);
      if (!next) toast.success("Layout reset");
    } catch (e) {
      if (seq === saveSeq.current) queryClient.setQueryData<OcLayout>(LAYOUT_KEY, previous);
      toast.error(e instanceof Error ? e.message : "Couldn't save the layout.");
    }
  };

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
    label: formatDate(night.date).replace(/ \d{4}$/, ""), // "6 Aug" — the year is noise here
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
    trend.reduce(
      (acc, n) => {
        const c = pick(n);
        return { present: acc.present + c.present, total: acc.total + totalOf(c) };
      },
      { present: 0, total: 0 }
    );
  const cadetTotals = sumCounts((n) => n.cadets);
  const staffTotals = sumCounts((n) => n.staff);
  const cadetAvg = cadetTotals.total ? Math.round((cadetTotals.present / cadetTotals.total) * 100) : null;
  const staffAvg = staffTotals.total ? Math.round((staffTotals.present / staffTotals.total) * 100) : null;

  // Qualification coverage — how many cadets hold something vs nothing per badge,
  // out of the cohort the backend counted (juniors dropped when filtered).
  const badges = dash?.badge_coverage.badges ?? {};
  const totalCadets = dash?.badge_coverage.cadets ?? 0;
  const classifications = CLASSIFICATION_ORDER.filter((label) => !excludeJuniors || label !== "Junior Cadet");
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

  const sections: Record<OcSection, React.ReactNode> = {
    committee: (
      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Committee Requests"
          actions={
            <Button asChild variant="ghost" size="sm" className="no-print">
              <Link href="/committee/requests">View all</Link>
            </Button>
          }
        />
        <StatGroup className="lg:grid-cols-4">
          <Stat
            size="lg"
            label="Awaiting you"
            value={(counts.submitted ?? 0) + (counts.sent_to_committee ?? 0)}
            hint="To send or decide"
          />
          <Stat size="lg" label="Approved" value={counts.approved ?? 0} hint="Awaiting receipts" />
          <Stat size="lg" label="To pay" value={counts.sent_for_payment ?? 0} hint="Awaiting payment" />
          <Stat size="lg" label="Paid" value={counts.paid ?? 0} />
        </StatGroup>

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
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/committee/requests/${r.id}`)}
                    >
                      <TableCell className="font-medium">
                        <Link href={`/committee/requests/${r.id}`} className="hover:underline">
                          {r.reference}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-[16rem] truncate">{r.title}</TableCell>
                      <TableCell>{r.requester_name}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatGBP(r.total)}</TableCell>
                      <TableCell>
                        <Badge variant={style.variant} className={style.className}>
                          {STATUS_LABELS[r.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </section>
    ),
    strength: (
      <section className="flex flex-col gap-3">
        <SectionHeading title="Strength & Attendance" />
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <StatGroup className="lg:grid-cols-4">
              <Stat size="lg" label="Total cadets" value={dash?.strength.total_cadets ?? 0} />
              <Stat size="lg" label="Total staff" value={dash?.strength.total_staff ?? 0} />
              <Stat
                size="lg"
                label="Cadet turnout"
                value={cadetAvg === null ? "—" : `${cadetAvg}%`}
                hint={`Last ${trend.length} parade night${trend.length !== 1 ? "s" : ""}`}
              />
              <Stat
                size="lg"
                label="Staff turnout"
                value={staffAvg === null ? "—" : `${staffAvg}%`}
                hint={`Last ${trend.length} parade night${trend.length !== 1 ? "s" : ""}`}
              />
            </StatGroup>

            <StatGroup className="lg:grid-cols-4">
              {Object.entries(dash?.strength.by_flight ?? {})
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([flight, n]) => (
                  <Stat size="lg" key={flight} label={`${flight} Flight`} value={n} />
                ))}
            </StatGroup>

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
    ),
    qualifications: (
      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Qualifications"
          actions={
            <div className="flex items-center gap-2">
              <Checkbox
                id="exclude-juniors"
                checked={excludeJuniors}
                onCheckedChange={(v) => setExcludeJuniors(v === true)}
              />
              <Label htmlFor="exclude-juniors" className="text-sm font-normal">
                Exclude junior cadets
              </Label>
            </div>
          }
        />

        <StatGroup className="lg:grid-cols-4">
          <Stat size="lg" label="Total held" value={dash?.qual_summary.total ?? 0} />
          <Stat size="lg" label="Expired" value={dash?.qual_summary.expired ?? 0} hint="Already lapsed" />
          <Stat size="lg" label="Expiring in 30 days" value={dash?.qual_summary.expiring_30 ?? 0} />
          <Stat size="lg" label="Expiring in 3 months" value={dash?.qual_summary.expiring_90 ?? 0} />
        </StatGroup>

        <div className="grid gap-4 lg:grid-cols-2">
          {/* Coverage — a bar per badge is a lot of near-identical rows; a
              labelled meter reads faster and needs no colour scale. */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Badge coverage</CardTitle>
              <CardDescription>Cadets holding each badge at any level, out of {totalCadets}</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : coverage.length === 0 ? (
                <p className="text-muted-foreground text-sm">No qualification data.</p>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {coverage.map((badge) => (
                    <div key={badge.key} className="flex items-center gap-3">
                      <span className="w-36 shrink-0 truncate text-sm">{badge.label}</span>
                      <div
                        className="bg-muted h-2 flex-1 overflow-hidden rounded-full"
                        role="img"
                        aria-label={`${badge.label}: ${badge.held} of ${totalCadets} cadets`}
                      >
                        <div
                          className="h-full rounded-full bg-[var(--chart-1)]"
                          style={{ width: `${badge.pct}%` }}
                        />
                      </div>
                      <span className="text-muted-foreground w-16 shrink-0 text-right text-xs tabular-nums">
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
                  {classifications
                    .map((label) => [label, dash?.strength.by_classification?.[label] ?? 0] as const)
                    .filter(([, n]) => n > 0)
                    .map(([label, n]) => (
                      <div key={label} className="flex items-center justify-between py-2 text-sm">
                        <span>{label}</span>
                        <span className="font-medium tabular-nums">
                          {n}
                          <span className="text-muted-foreground ml-2 text-xs font-normal">
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
              <GraduationCap className="text-muted-foreground size-4" />
              <CardTitle className="text-base">Within the next 3 months</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : (dash?.expiring_quals.length ?? 0) === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing expiring in the next 3 months.</p>
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
                          <span
                            className={
                              q.days_left <= 30 ? "text-destructive font-semibold" : "text-muted-foreground"
                            }
                          >
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
    ),
    pipeline: (
      <section className="flex flex-col gap-3">
        <SectionHeading title="In the Pipeline" />
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
    ),
  };

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 pb-16">
      <PageHeader
        title="OC Dashboard"
        description="Squadron oversight at a glance"
        actions={
          <div className="no-print flex flex-wrap items-center gap-2">
            {arranging ? (
              <>
                {layout?.customised && (
                  <Button variant="ghost" size="sm" onClick={() => saveLayout(null)}>
                    <RotateCcw />
                    Reset layout
                  </Button>
                )}
                <Button size="sm" onClick={() => setArranging(false)}>
                  <Check />
                  Done
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={layoutLoading}
                  onClick={() => setArranging(true)}
                >
                  <LayoutList />
                  Arrange sections
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer />
                  Print / PDF
                </Button>
              </>
            )}
          </div>
        }
      />
      {/* Only rendered on paper: gives the printout a heading and date. The
          sections below print in the OC's saved order, as on screen. */}
      <div className="print-only mb-2">
        <h1 className="text-xl font-semibold">317 Squadron — OC Dashboard</h1>
        <p className="text-muted-foreground text-sm">Printed {formatDate(new Date().toISOString())}</p>
      </div>

      {arranging ? (
        <section className="flex flex-col gap-3">
          <SectionHeading
            title="Arrange sections"
            description="Drag a section by its handle, or use the arrows. Each move is saved, and printing follows the same order."
          />
          <SectionArranger
            label="OC dashboard sections"
            items={order.map((id) => ({ id, title: OC_SECTION_TITLES[id] }))}
            onChange={(ids) => saveLayout(normaliseLayout(ids))}
          />
        </section>
      ) : layoutLoading ? (
        <div className="flex flex-col gap-4" aria-busy>
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        order.map((id) => <Fragment key={id}>{sections[id]}</Fragment>)
      )}
    </div>
  );
}
