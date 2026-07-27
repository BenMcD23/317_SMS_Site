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
import { ShieldAlert, GraduationCap, GaugeCircle, Clock } from "lucide-react";
import {
  type CommitteeRequestSummary, type CommitteeRequestStatus,
  STATUS_LABELS, STATUS_STYLE, formatGBP,
} from "@/lib/committee";

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
  by_flight: Record<string, number>;
}

interface OcDashboard {
  strength: Strength;
  staff_attendance: StaffAttendance[];
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

  // Staff attendance — sum counts per month across all staff for a trend bar chart.
  const monthTotals: Record<string, number> = {};
  for (const s of dash?.staff_attendance ?? []) {
    for (const [month, count] of Object.entries(s.attendance ?? {})) {
      monthTotals[month] = (monthTotals[month] ?? 0) + (count ?? 0);
    }
  }
  const attendanceData = Object.entries(monthTotals)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, total }));

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
              {Object.entries(dash?.strength.by_flight ?? {})
                .sort(([a], [b]) => a.localeCompare(b))
                .slice(0, 3)
                .map(([flight, n]) => (
                  <StatCard key={flight} label={`${flight} Flight`} value={n} />
                ))}
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">Staff attendance</CardTitle>
                  <CardDescription>Total staff parade attendances per month</CardDescription>
                </CardHeader>
                <CardContent>
                  {attendanceData.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No attendance data.</p>
                  ) : (
                    <ResponsiveContainer width="100%" height={200}>
                      <BarChart data={attendanceData} barSize={28}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                        <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                        <YAxis allowDecimals={false} tick={{ fontSize: 12 }} stroke="var(--muted-foreground)" />
                        <Tooltip
                          contentStyle={{
                            background: "var(--popover)", border: "1px solid var(--border)",
                            borderRadius: "8px", fontSize: "13px",
                          }}
                        />
                        <Bar dataKey="total" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
              <PlaceholderCard
                icon={GaugeCircle}
                title="Cadet attendance"
                description="Per-flight cadet attendance rates once inspection sheets feed a consolidated metric."
              />
            </div>
          </>
        )}
      </section>

      {/* ── Qualifications ──────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Qualifications Expiring
        </h2>
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
