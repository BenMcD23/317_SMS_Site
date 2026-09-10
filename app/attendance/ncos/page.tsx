"use client";

import { useMemo, useState } from "react";
import { ShieldUser } from "lucide-react";

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
import { ErrorAlert } from "@/components/error-alert";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { useApiQuery } from "@/lib/use-api-query";
import { formatDate, formatShortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  addCounts, countStates, EMPTY_COUNTS, rateExcludingAuthorised, rateOf, STATE_BADGE, STATE_LABEL,
  STATE_LETTER, totalOf, type AttendanceState, type StateCounts,
} from "@/lib/attendance";

// ─── Types ────────────────────────────────────────────────────────────────────

type NcoNight = {
  date: string;                 // "YYYY-MM-DD"
  registerType: string | null;
  status: string | null;
  state: AttendanceState;
};

type Nco = {
  cin: number;
  name: string;
  rank: string | null;
  nights: NcoNight[];           // newest first
};

type NcoAttendance = {
  from: string | null;
  to: string | null;
  ncos: Nco[];
};

const ALL_TYPES = "__all__";

/** Nights shown as columns at once. Wider ranges are still summed in the
 *  figures — the cap only stops a year's register becoming 50 columns. */
const COLUMN_LIMIT = 20;

// ─── Date range ───────────────────────────────────────────────────────────────

const iso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/** First and last day of the month `offset` months from this one. The page opens
 *  on the current month, which is the question it's normally asked. */
function monthRange(offset = 0) {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const last = new Date(now.getFullYear(), now.getMonth() + offset + 1, 0);
  return { from: iso(first), to: iso(last) };
}

// ─── Cells ────────────────────────────────────────────────────────────────────

/** One night for one NCO. The letter carries the state on its own, so the
 *  colour is reinforcement rather than the only signal. */
function StateCell({ night }: { night: NcoNight | undefined }) {
  if (!night) {
    return <span className="text-muted-foreground/50" title="Not on this register">·</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded border text-xs font-medium",
        STATE_BADGE[night.state],
      )}
      title={`${formatDate(night.date)} — ${night.status ?? STATE_LABEL[night.state]}`}
    >
      {STATE_LETTER[night.state]}
    </span>
  );
}

/** "9 / 10" plus the turnout, or a dash when they were on no register at all. */
function Turnout({ counts }: { counts: StateCounts }) {
  const total = totalOf(counts);
  if (total === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="tabular-nums">
      <span className="font-medium">{counts.present}</span>
      <span className="text-muted-foreground">/{total}</span>
      <span className="ml-1.5 text-xs text-muted-foreground">{rateOf(counts)}%</span>
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function NcoAttendancePage() {
  const [{ from, to }, setRange] = useState(() => monthRange());
  const [type, setType] = useState(ALL_TYPES);
  const [selected, setSelected] = useState<Nco | null>(null);

  // The range is a server-side filter, so it belongs in the cache key — going
  // back to a month already looked at is then instant.
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const query = params.toString();

  const { data, isLoading, error } = useApiQuery<NcoAttendance>(
    ["attendance-ncos", from, to],
    `/attendance/ncos${query ? `?${query}` : ""}`,
  );

  const ncos = useMemo(() => data?.ncos ?? [], [data]);

  const registerTypes = useMemo(() => [...new Set(
    ncos.flatMap((nco) => nco.nights.map((n) => n.registerType)).filter(Boolean),
  )].sort() as string[], [ncos]);

  // Register type is the one filter applied here rather than by the backend —
  // it only makes sense against the types actually in the range.
  const rows = useMemo(() => ncos.map((nco) => {
    const nights = type === ALL_TYPES
      ? nco.nights
      : nco.nights.filter((n) => n.registerType === type);
    const counts = countStates(nights.map((n) => n.state));
    return {
      nco,
      counts,
      rateExclAuth: rateExcludingAuthorised(counts),
      // Keyed by night so the grid can look each column up without scanning.
      byNight: new Map(nights.map((n) => [`${n.date}|${n.registerType ?? ""}`, n])),
    };
  }), [ncos, type]);

  // Columns are every night any NCO was marked on, oldest first so the grid
  // reads left to right like a calendar.
  const nights = useMemo(() => {
    const seen = new Map<string, { date: string; registerType: string | null }>();
    for (const row of rows) {
      for (const [key, night] of row.byNight) {
        if (!seen.has(key)) seen.set(key, { date: night.date, registerType: night.registerType });
      }
    }
    return [...seen.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, night]) => ({ key, ...night }));
  }, [rows]);

  // Only the last `COLUMN_LIMIT` nights are drawn; the figures still cover all.
  const columns = nights.slice(-COLUMN_LIMIT);

  const teamCounts = useMemo(
    () => rows.reduce((acc, row) => addCounts(acc, row.counts), EMPTY_COUNTS),
    [rows],
  );
  const teamRate = rateOf(teamCounts);
  const teamRateExclAuth = rateExcludingAuthorised(teamCounts);

  const selectedNights = useMemo(() => {
    if (!selected) return [];
    return type === ALL_TYPES
      ? selected.nights
      : selected.nights.filter((n) => n.registerType === type);
  }, [selected, type]);

  if (error) return <ErrorAlert message={error.message} title="Could not load NCO attendance" />;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-16">
      <PageHeader
        title="NCO Attendance"
        description="Night by night for each NCO, over whichever dates you pick. Select an NCO to see their register."
      />

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="nco-att-from" className="text-xs text-muted-foreground">From</Label>
          <Input
            id="nco-att-from" type="date" value={from} max={to || undefined}
            onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))}
            className="h-9 w-[9.5rem]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="nco-att-to" className="text-xs text-muted-foreground">To</Label>
          <Input
            id="nco-att-to" type="date" value={to} min={from || undefined}
            onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))}
            className="h-9 w-[9.5rem]"
          />
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
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setRange(monthRange())}>
            This month
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRange(monthRange(-1))}>
            Last month
          </Button>
          <Button variant="outline" size="sm" onClick={() => setRange({ from: "", to: "" })}>
            All time
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : ncos.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nobody holds an NCO rank at the moment — the team comes from the rank on each
          cadet&apos;s record, same as the appraisals page.
        </p>
      ) : (
        <>
          {/* Team totals */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat
              label="Team turnout"
              value={teamRate === null ? "—" : `${teamRate}%`}
              hint={
                teamCounts.authorised > 0 && teamRateExclAuth !== null
                  ? `${teamRateExclAuth}% excl. authorised`
                  : undefined
              }
              tone="primary"
            />
            <Stat label="NCOs" value={ncos.length} />
            <Stat label="Nights" value={nights.length} hint="in this range" />
            <Stat label="Attended" value={teamCounts.present} tone="success" />
            <Stat label="Authorised absence" value={teamCounts.authorised} tone="warning" />
            <Stat label="Absent" value={teamCounts.absent} tone="destructive" />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ShieldUser className="h-4 w-4 text-muted-foreground" />
                Per NCO
                <span className="ml-auto flex items-center gap-3 text-xs font-normal text-muted-foreground">
                  {(["present", "authorised", "absent"] as AttendanceState[]).map((state) => (
                    <span key={state} className="flex items-center gap-1.5">
                      <span className={cn(
                        "inline-flex h-4 w-4 items-center justify-center rounded border text-[10px] font-medium",
                        STATE_BADGE[state],
                      )}>
                        {STATE_LETTER[state]}
                      </span>
                      {STATE_LABEL[state]}
                    </span>
                  ))}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {nights.length === 0 ? (
                <p className="px-6 pb-6 text-sm text-muted-foreground">
                  No nights on record for the NCO team in this range.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-6">NCO</TableHead>
                        <TableHead className="whitespace-nowrap">Attended</TableHead>
                        <TableHead className="whitespace-nowrap">Excl. authorised</TableHead>
                        {columns.map((night) => (
                          <TableHead
                            key={night.key}
                            className="whitespace-nowrap text-center text-xs font-normal"
                            title={night.registerType ?? "Register"}
                          >
                            {formatShortDate(night.date)}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((row) => (
                        <TableRow
                          key={row.nco.cin}
                          onClick={() => setSelected(row.nco)}
                          className="cursor-pointer"
                        >
                          <TableCell className="pl-6 whitespace-nowrap">
                            <span className="font-medium">{row.nco.name}</span>
                            {row.nco.rank && (
                              <span className="ml-2 text-xs text-muted-foreground">{row.nco.rank}</span>
                            )}
                          </TableCell>
                          <TableCell><Turnout counts={row.counts} /></TableCell>
                          <TableCell className="tabular-nums">
                            {row.rateExclAuth === null
                              ? <span className="text-muted-foreground">—</span>
                              : `${row.rateExclAuth}%`}
                          </TableCell>
                          {columns.map((night) => (
                            <TableCell key={night.key} className="text-center">
                              <StateCell night={row.byNight.get(night.key)} />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {nights.length > columns.length && (
            <p className="text-xs text-muted-foreground">
              Showing the {columns.length} most recent of {nights.length} nights as columns — narrow
              the dates to see earlier ones, or select an NCO for their whole register. The figures
              cover the whole range.
            </p>
          )}
        </>
      )}

      {/* Per-NCO register */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selected ? [selected.rank, selected.name].filter(Boolean).join(" ") : ""}
            </DialogTitle>
            <DialogDescription>
              {from || to
                ? `${from ? formatDate(from) : "the start"} to ${to ? formatDate(to) : "today"}`
                : "Every night on record"}
            </DialogDescription>
          </DialogHeader>
          {selectedNights.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing on the register in this range.</p>
          ) : (
            <div className="divide-y rounded-md border">
              {selectedNights.map((night) => (
                <div
                  key={`${night.date}-${night.registerType}`}
                  className="flex items-center gap-3 px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{formatDate(night.date)}</p>
                    <p className="text-xs text-muted-foreground">{night.registerType ?? "Register"}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className={cn("shrink-0 font-normal", STATE_BADGE[night.state])}
                  >
                    {night.status ?? STATE_LABEL[night.state]}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
