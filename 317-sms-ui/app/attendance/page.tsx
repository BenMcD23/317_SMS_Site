"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CalendarCheck, ShieldUser, Users, UserCog } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { Stat } from "@/components/stat";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  addCounts, EMPTY_COUNTS, rateExcludingAuthorised, rateOf, STATE_BADGE, totalOf,
  type AttendanceState, type StateCounts,
} from "@/lib/attendance";

// ─── Types ────────────────────────────────────────────────────────────────────

type Night = {
  date: string;                 // "YYYY-MM-DD"
  registerType: string | null;
  cadets: StateCounts;
  // The NCO team, a subset of `cadets`. Optional so a backend that predates it
  // leaves the NCO filter empty rather than breaking the page.
  ncos?: StateCounts;
  staff: StateCounts;
};

type Person = {
  cin: number;
  name: string;
  rank: string | null;
  isNco: boolean;               // set by the backend, which owns the rank rule
  status: string | null;
  state: AttendanceState;
  registerType: string | null;
};

type NightDetail = {
  date: string;
  registerType: string | null;
  cadets: Person[];
  staff: Person[];
};

type Group = "all" | "cadets" | "ncos" | "staff";

const ALL_TYPES = "__all__";
const ROW_LIMIT = 200;

function countsFor(night: Night, group: Group): StateCounts {
  if (group === "cadets") return night.cadets;
  // NCOs are picked out by rank on the backend, so the one definition of the NCO
  // team serves this page and the appraisals page alike.
  if (group === "ncos") return night.ncos ?? EMPTY_COUNTS;
  if (group === "staff") return night.staff;
  return addCounts(night.cadets, night.staff);
}

/** Registers run back to 2009, so month buckets stop being readable on a long
 *  span — past three years the chart switches to one bar per year. */
function monthlyStats(nights: Night[], group: Group) {
  if (nights.length === 0) return { data: [], byYear: false };

  const times = nights.map((n) => new Date(n.date).getTime());
  const spanMonths = (Math.max(...times) - Math.min(...times)) / (1000 * 60 * 60 * 24 * 30.44);
  const byYear = spanMonths > 36;

  const buckets = new Map<string, { counts: StateCounts; nights: number }>();
  for (const night of nights) {
    const key = byYear ? night.date.slice(0, 4) : night.date.slice(0, 7);
    const bucket = buckets.get(key) ?? { counts: EMPTY_COUNTS, nights: 0 };
    buckets.set(key, {
      counts: addCounts(bucket.counts, countsFor(night, group)),
      nights: bucket.nights + 1,
    });
  }

  const data = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => ({
      label: byYear ? key : `${key.slice(5)}/${key.slice(2, 4)}`,
      rate: rateOf(bucket.counts) ?? 0,
      nights: bucket.nights,
      present: bucket.counts.present,
      total: totalOf(bucket.counts),
    }));

  return { data, byYear };
}

/** "12 / 15" plus the turnout, or a dash when nobody was on that register. */
function HeadCount({ counts }: { counts: StateCounts }) {
  const total = totalOf(counts);
  if (total === 0) return <span className="text-muted-foreground">—</span>;
  const rate = rateOf(counts);
  return (
    <span className="tabular-nums">
      <span className="font-medium">{counts.present}</span>
      <span className="text-muted-foreground">/{total}</span>
      <span className="ml-1.5 text-xs text-muted-foreground">{rate}%</span>
    </span>
  );
}

function RosterList({ people, icon: Icon, title }: {
  people: Person[];
  icon: React.ElementType;
  title: string;
}) {
  const present = people.filter((p) => p.state === "present").length;
  return (
    <div>
      <p className="mb-2 flex items-center gap-2 text-sm font-medium">
        <Icon className="h-4 w-4 text-muted-foreground" />
        {title}
        <span className="ml-auto text-xs font-normal text-muted-foreground tabular-nums">
          {present} of {people.length}
        </span>
      </p>
      {people.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nobody on this register.</p>
      ) : (
        <div className="divide-y rounded-md border">
          {people.map((person) => (
            <div key={person.cin} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{person.name}</p>
                {person.rank && (
                  <p className="text-xs text-muted-foreground">{person.rank}</p>
                )}
              </div>
              <Badge variant="outline" className={cn("shrink-0 font-normal", STATE_BADGE[person.state])}>
                {person.status ?? "Unknown"}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AttendancePage() {
  const [nights, setNights] = useState<Night[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState(ALL_TYPES);
  const [group, setGroup] = useState<Group>("all");

  // `detail` is cleared when a night is picked, so "no detail yet" is the
  // loading state — no separate flag to keep in step.
  const [selected, setSelected] = useState<Night | null>(null);
  const [detail, setDetail] = useState<NightDetail | null>(null);

  useEffect(() => {
    fetch("/api/attendance/nights")
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json())?.detail ?? "Failed to load attendance");
        return res.json();
      })
      .then((rows: Night[]) => setNights(Array.isArray(rows) ? rows : []))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Failed to load attendance"))
      .finally(() => setLoading(false));
  }, []);

  // Each night is (date, register type), so the drill-in needs both.
  useEffect(() => {
    if (!selected) return;
    const query = selected.registerType
      ? `?registerType=${encodeURIComponent(selected.registerType)}`
      : "";
    fetch(`/api/attendance/nights/${selected.date}${query}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setDetail)
      .catch(() => setDetail(null));
  }, [selected]);

  const registerTypes = useMemo(
    () => [...new Set(nights.map((n) => n.registerType).filter(Boolean))].sort() as string[],
    [nights],
  );

  const filtered = useMemo(() => nights.filter((night) => {
    if (from && night.date < from) return false;      // ISO, so string compare is date compare
    if (to && night.date > to) return false;
    if (type !== ALL_TYPES && night.registerType !== type) return false;
    return totalOf(countsFor(night, group)) > 0;      // hide nights the group wasn't on
  }), [nights, from, to, type, group]);

  const totals = useMemo(
    () => filtered.reduce((acc, night) => addCounts(acc, countsFor(night, group)), EMPTY_COUNTS),
    [filtered, group],
  );
  const { data: monthly, byYear } = useMemo(() => monthlyStats(filtered, group), [filtered, group]);

  const rate = rateOf(totals);
  const rateExclAuth = rateExcludingAuthorised(totals);
  const avgPerNight = filtered.length ? Math.round(totals.present / filtered.length) : 0;

  if (error) return <ErrorAlert message={error} title="Could not load attendance" />;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-16">
      <PageHeader
        title="Attendance"
        description="Turnout per night across the squadron. Select a night to see who was on the register."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link href="/attendance/ncos">
              <ShieldUser className="h-4 w-4" />
              Per NCO
            </Link>
          </Button>
        }
      />

      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : nights.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No attendance recorded yet. It is pulled in by the cadet and staff scrapers.
        </p>
      ) : (
        <>
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="att-from" className="text-xs text-muted-foreground">From</Label>
              <Input
                id="att-from" type="date" value={from} max={to || undefined}
                onChange={(e) => setFrom(e.target.value)} className="h-9 w-[9.5rem]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="att-to" className="text-xs text-muted-foreground">To</Label>
              <Input
                id="att-to" type="date" value={to} min={from || undefined}
                onChange={(e) => setTo(e.target.value)} className="h-9 w-[9.5rem]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs text-muted-foreground">Who</Label>
              <Select value={group} onValueChange={(v) => setGroup(v as Group)}>
                <SelectTrigger className="h-9 w-[10rem]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Cadets &amp; staff</SelectItem>
                  <SelectItem value="cadets">Cadets only</SelectItem>
                  <SelectItem value="ncos">NCOs only</SelectItem>
                  <SelectItem value="staff">Staff only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {registerTypes.length > 1 && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-muted-foreground">Register type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger className="h-9 w-[12rem]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL_TYPES}>All types</SelectItem>
                    {registerTypes.map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat
              label="Average turnout"
              value={rate === null ? "—" : `${rate}%`}
              hint={
                totals.authorised > 0 && rateExclAuth !== null
                  ? `${rateExclAuth}% excl. authorised`
                  : undefined
              }
              tone="primary"
            />
            <Stat label="Nights" value={filtered.length} />
            <Stat label="Avg attending" value={avgPerNight} hint="per night" />
            <Stat label="Attended" value={totals.present} tone="success" />
            <Stat label="Authorised absence" value={totals.authorised} tone="warning" />
            <Stat label="Absent" value={totals.absent} tone="destructive" />
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No nights match these filters.</p>
          ) : (
            <>
              {/* Monthly trend — one series, so no legend; the title names it */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Turnout per {byYear ? "year" : "month"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={monthly} margin={{ top: 4, right: 4, bottom: 0, left: -16 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)"
                        interval="preserveStartEnd" minTickGap={16}
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
                          `${value}% — ${item?.payload?.present} of ${item?.payload?.total} across ${item?.payload?.nights} night(s)`,
                          "Turnout",
                        ]}
                      />
                      <Bar dataKey="rate" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Per-night table */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <CalendarCheck className="h-4 w-4 text-muted-foreground" />
                    Nights
                    <Badge variant="secondary" className="ml-auto text-xs font-normal">
                      {filtered.length}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-6">Date</TableHead>
                          <TableHead>Register</TableHead>
                          {/* The cadet column follows the filter, so "NCOs only"
                              reads as the NCO turnout rather than the whole flight. */}
                          <TableHead>{group === "ncos" ? "NCOs" : "Cadets"}</TableHead>
                          <TableHead>Staff</TableHead>
                          <TableHead className="text-right">Turnout</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.slice(0, ROW_LIMIT).map((night) => {
                          const nightRate = rateOf(countsFor(night, group));
                          return (
                            <TableRow
                              key={`${night.date}-${night.registerType}`}
                              onClick={() => { setDetail(null); setSelected(night); }}
                              className="cursor-pointer"
                            >
                              <TableCell className="pl-6 whitespace-nowrap font-medium">
                                {formatDate(night.date)}
                              </TableCell>
                              <TableCell className="text-muted-foreground">
                                {night.registerType ?? "—"}
                              </TableCell>
                              <TableCell>
                                <HeadCount counts={countsFor(night, group === "ncos" ? "ncos" : "cadets")} />
                              </TableCell>
                              <TableCell><HeadCount counts={night.staff} /></TableCell>
                              <TableCell className="text-right tabular-nums font-medium">
                                {nightRate === null ? "—" : `${nightRate}%`}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
              {filtered.length > ROW_LIMIT && (
                <p className="text-xs text-muted-foreground">
                  Showing the {ROW_LIMIT} most recent of {filtered.length} nights — narrow the dates
                  to see older ones. The stats and chart above cover the whole range.
                </p>
              )}
            </>
          )}
        </>
      )}

      {/* Per-night drill-in */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selected ? formatDate(selected.date) : ""}</DialogTitle>
            <DialogDescription>
              {selected?.registerType ?? "Register"}
            </DialogDescription>
          </DialogHeader>
          {!detail ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              {group === "ncos" ? (
                <RosterList
                  people={detail.cadets.filter((p) => p.isNco)}
                  icon={ShieldUser}
                  title="NCOs"
                />
              ) : (
                <>
                  {group !== "staff" && (
                    <RosterList people={detail.cadets} icon={Users} title="Cadets" />
                  )}
                  {group !== "cadets" && (
                    <RosterList people={detail.staff} icon={UserCog} title="Staff" />
                  )}
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
