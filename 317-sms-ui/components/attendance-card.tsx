"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { CalendarCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Stat } from "@/components/stat";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { AttendanceState } from "@/lib/attendance";
import { countStates, rateExcludingAuthorised, rateOf, STATE_BADGE } from "@/lib/attendance";

export type AttendanceRecord = {
  id: number;
  date: string;           // ISO
  registerType: string | null;
  status: string | null;
  state: AttendanceState; // classified by the backend
  unit: string | null;
};

const ALL_TYPES = "__all__";

const isPresent = (record: AttendanceRecord) => record.state === "present";

/** Long histories go back to 2009, so month buckets only make sense on a short
 *  span — past three years the chart switches to one bar per year. */
function trendData(records: AttendanceRecord[]) {
  if (records.length === 0) return { data: [], byYear: false };

  const times = records.map((r) => new Date(r.date).getTime());
  const spanMonths = (Math.max(...times) - Math.min(...times)) / (1000 * 60 * 60 * 24 * 30.44);
  const byYear = spanMonths > 36;

  const buckets = new Map<string, { attended: number; total: number }>();
  for (const record of records) {
    const d = new Date(record.date);
    const key = byYear
      ? String(d.getFullYear())
      : `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const bucket = buckets.get(key) ?? { attended: 0, total: 0 };
    bucket.total += 1;
    if (isPresent(record)) bucket.attended += 1;
    buckets.set(key, bucket);
  }

  const data = [...buckets.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => ({
      label: byYear ? key : `${key.slice(5)}/${key.slice(2, 4)}`,
      attended: bucket.attended,
      total: bucket.total,
    }));

  return { data, byYear };
}

/** Rows shown at once. Filters narrow the set; the cap just stops a 2,000-night
 *  register from putting that many rows in the DOM. */
const ROW_LIMIT = 250;

interface Props {
  /** GET endpoint returning AttendanceRecord[] (e.g. /api/cadets/123/attendance) */
  baseUrl: string;
}

export function AttendanceCard({ baseUrl }: Props) {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [type, setType] = useState(ALL_TYPES);

  useEffect(() => {
    fetch(baseUrl)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: AttendanceRecord[]) => setRecords(Array.isArray(rows) ? rows : []))
      .catch(() => setRecords([]))
      .finally(() => setLoading(false));
  }, [baseUrl]);

  const registerTypes = useMemo(
    () => [...new Set(records.map((r) => r.registerType).filter(Boolean))].sort() as string[],
    [records],
  );

  const filtered = useMemo(() => records.filter((record) => {
    const day = record.date.slice(0, 10);       // ISO, so string compare is date compare
    if (from && day < from) return false;
    if (to && day > to) return false;
    if (type !== ALL_TYPES && record.registerType !== type) return false;
    return true;
  }), [records, from, to, type]);

  const counts = countStates(filtered.map((r) => r.state));
  const rate = rateOf(counts);
  // An excused absence arguably shouldn't count against someone, so show that
  // reading too rather than picking one for the user.
  const rateExclAuth = rateExcludingAuthorised(counts);

  const lastAttended = filtered.find(isPresent)?.date ?? null;   // newest first from the API
  const { data: trend, byYear } = useMemo(() => trendData(filtered), [filtered]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarCheck className="h-4 w-4 text-muted-foreground" />
          Attendance
          <Badge variant="secondary" className="ml-auto text-xs font-normal">
            {filtered.length === records.length
              ? `${records.length} records`
              : `${filtered.length} of ${records.length}`}
          </Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="space-y-5">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : records.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No attendance recorded. It is pulled in by the cadet/staff scraper.
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
              {registerTypes.length > 1 && (
                <div className="grid gap-1.5">
                  <Label className="text-xs text-muted-foreground">Register type</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger className="h-9 w-[12rem]">
                      <SelectValue />
                    </SelectTrigger>
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

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              <Stat
                label="Attendance rate"
                value={rate === null ? "—" : `${rate}%`}
                hint={
                  counts.authorised > 0 && rateExclAuth !== null
                    ? `${rateExclAuth}% excl. authorised`
                    : undefined
                }
                tone="primary"
              />
              <Stat label="Attended" value={counts.present} tone="success" />
              <Stat label="Authorised absence" value={counts.authorised} tone="warning" />
              <Stat label="Absent" value={counts.absent} tone="destructive" />
              <Stat
                label="Last attended"
                value={lastAttended ? formatDate(lastAttended) : "—"}
              />
            </div>

            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground">No records in this range.</p>
            ) : (
              <>
                {/* Trend — one series, so the title carries identity and no legend is needed */}
                <div>
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    Nights attended per {byYear ? "year" : "month"}
                  </p>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="label" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)"
                        interval="preserveStartEnd" minTickGap={16}
                      />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                      <Tooltip
                        cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                        contentStyle={{
                          background: "var(--popover)", border: "1px solid var(--border)",
                          borderRadius: "8px", fontSize: "13px",
                        }}
                        formatter={(value, _name, item) => [
                          `${value} of ${item?.payload?.total}`, "Attended",
                        ]}
                      />
                      <Bar dataKey="attended" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Register */}
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Register</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="hidden sm:table-cell">Unit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.slice(0, ROW_LIMIT).map((record) => (
                        <TableRow key={record.id}>
                          <TableCell className="whitespace-nowrap font-medium">
                            {formatDate(record.date)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {record.registerType ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn("font-normal", STATE_BADGE[record.state])}
                            >
                              {record.status ?? "Unknown"}
                            </Badge>
                          </TableCell>
                          <TableCell className="hidden text-muted-foreground sm:table-cell">
                            {record.unit ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {filtered.length > ROW_LIMIT && (
                  <p className="text-xs text-muted-foreground">
                    Showing the {ROW_LIMIT} most recent of {filtered.length} records — narrow the
                    dates to see older ones. The stats above cover the whole range.
                  </p>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
