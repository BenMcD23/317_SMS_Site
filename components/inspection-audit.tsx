"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ClipboardCheck, Loader2, Minus, Sparkles, ThumbsUp, TrendingDown, TrendingUp } from "lucide-react";

import { apiRequest } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";
import { flightLabel, flightsIn } from "@/lib/cadet-format";
import { formatDate, todayLocal } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";
import { AiMarkdown } from "@/components/ai-markdown";
import { CadetSearchInput } from "@/components/cadet-search";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { Stat, StatGroup } from "@/components/stat";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";

type Scope = "squadron" | "flight" | "cadet";

type Summary = {
  sheets: number;
  cadets: number;
  present: number;
  absent: number;
  awol: number;
  attendance_pct: number;
  score_avg: number | null;
  faults: number;
  faults_per_cadet: number;
  positives: number;
};
type FaultArea = {
  region: string;
  occurrences: number;
  cadets: number;
  share_pct: number;
  persistent_cadets: number;
  texts: { text: string; count: number }[];
  uniforms: Record<string, number>;
  earlier_pct: number | null;
  recent_pct: number | null;
  trend: "worse" | "better" | "steady" | null;
};
type FlightRow = Summary & { flight: string; top_fault: string | null };
type WatchCadet = {
  cin: number;
  name: string;
  flight: string;
  score_avg: number;
  present: number;
  awol: number;
  attendance_pct: number;
  top_faults: string[];
};
export type Audit = {
  scope: Scope;
  subject: string;
  dates: string[];
  summary: Summary;
  baseline: (Summary & { label: string }) | null;
  faults: FaultArea[];
  positives: { region: string; count: number }[];
  flights: FlightRow[];
  cadets_to_watch: WatchCadet[];
  markers: { marker: string; sheets: number; score_avg: number | null }[];
  notes: string[];
};
type AuditWithAi = Audit & { analysis: string | null; model: string | null; ai_error: string | null };

type SheetSummary = { id: number; date: string; uniform: string };

const PERIODS = [
  { value: "all", label: "All inspections" },
  { value: "3", label: "Last 3 months" },
  { value: "6", label: "Last 6 months" },
];

function monthsAgo(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return todayLocal(d);
}

/** The audit's query string, or null until the subject is fully picked. */
function auditParams(
  scope: Scope,
  flight: string,
  cin: number | null,
  source: string
): URLSearchParams | null {
  const p = new URLSearchParams({ scope });
  if (scope === "flight") {
    if (!flight) return null;
    p.set("flight", flight);
  }
  if (scope === "cadet") {
    if (cin == null) return null;
    p.set("cin", String(cin));
  }
  if (source.startsWith("sheet:")) p.set("sheet_id", source.slice(6));
  else if (source !== "all") p.set("since", monthsAgo(Number(source)));
  return p;
}

function score(v: number | null | undefined) {
  return v == null ? "—" : v.toFixed(1);
}

function Trend({
  trend,
  earlier,
  recent,
}: {
  trend: FaultArea["trend"];
  earlier: number | null;
  recent: number | null;
}) {
  if (!trend) return <span className="text-muted-foreground">—</span>;
  const Icon = trend === "worse" ? TrendingUp : trend === "better" ? TrendingDown : Minus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap",
        trend === "worse" && "text-destructive",
        trend === "better" && "text-success"
      )}
      title={`${earlier}% of inspections earlier, ${recent}% recently`}
    >
      <Icon className="size-4" aria-hidden />
      {trend === "worse" ? "Worse" : trend === "better" ? "Better" : "Steady"}
    </span>
  );
}

function AuditFigures({ audit }: { audit: Audit }) {
  const s = audit.summary;
  const base = audit.baseline;
  return (
    <>
      {audit.notes.length > 0 && (
        <Alert>
          <AlertDescription>
            <ul className="list-disc space-y-0.5 pl-4">
              {audit.notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      <StatGroup className="sm:grid-cols-3 lg:grid-cols-6">
        <Stat
          label="Inspections"
          value={s.sheets}
          hint={
            audit.dates.length > 1
              ? `${formatDate(audit.dates[0])} – ${formatDate(audit.dates.at(-1))}`
              : formatDate(audit.dates[0])
          }
        />
        <Stat
          label={audit.scope === "cadet" ? "Nights present" : "Cadets"}
          value={audit.scope === "cadet" ? s.present : s.cadets}
        />
        <Stat
          label="Average score"
          value={score(s.score_avg)}
          hint={base ? `Squadron ${score(base.score_avg)}` : undefined}
        />
        <Stat
          label="Attendance"
          value={`${s.attendance_pct.toFixed(0)}%`}
          hint={base ? `Squadron ${base.attendance_pct.toFixed(0)}%` : undefined}
        />
        <Stat label="AWOL" value={s.awol} tone={s.awol > 0 ? "warning" : undefined} />
        <Stat
          label="Faults per cadet inspected"
          value={s.faults_per_cadet.toFixed(2)}
          hint={base ? `Squadron ${base.faults_per_cadet.toFixed(2)}` : undefined}
        />
      </StatGroup>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Fault areas, most entrenched first</h3>
        <p className="text-muted-foreground text-xs">
          Persistent means faulted in that area on two inspections running that the cadet attended: told, and
          not fixed.
        </p>
        {audit.faults.length === 0 ? (
          <p className="text-muted-foreground text-sm">No faults logged.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Area</TableHead>
                <TableHead className="text-right">Cadets</TableHead>
                <TableHead className="text-right">Persistent</TableHead>
                <TableHead>Trend</TableHead>
                <TableHead>What was noted</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.faults.map((f) => (
                <TableRow key={f.region}>
                  <TableCell className="font-medium">{f.region}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {f.cadets} <span className="text-muted-foreground">({f.share_pct.toFixed(0)}%)</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{f.persistent_cadets}</TableCell>
                  <TableCell>
                    <Trend trend={f.trend} earlier={f.earlier_pct} recent={f.recent_pct} />
                  </TableCell>
                  <TableCell className="text-muted-foreground min-w-48 text-xs whitespace-normal">
                    {f.texts.map((t) => `${t.text}${t.count > 1 ? ` ×${t.count}` : ""}`).join(" · ") || "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>

      {audit.flights.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Flights compared</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Flight</TableHead>
                <TableHead className="text-right">Average</TableHead>
                <TableHead className="text-right">Attendance</TableHead>
                <TableHead className="text-right">AWOL</TableHead>
                <TableHead className="text-right">Faults / cadet</TableHead>
                <TableHead>Top fault</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {audit.flights.map((f) => (
                <TableRow key={f.flight}>
                  <TableCell className="font-medium">{flightLabel(f.flight)}</TableCell>
                  <TableCell className="text-right tabular-nums">{score(f.score_avg)}</TableCell>
                  <TableCell className="text-right tabular-nums">{f.attendance_pct.toFixed(0)}%</TableCell>
                  <TableCell className="text-right tabular-nums">{f.awol}</TableCell>
                  <TableCell className="text-right tabular-nums">{f.faults_per_cadet.toFixed(2)}</TableCell>
                  <TableCell>{f.top_fault ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      )}

      {audit.cadets_to_watch.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Lowest average scores</h3>
          <ul className="divide-y rounded-lg border">
            {audit.cadets_to_watch.map((c) => (
              <li key={c.cin} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-sm">
                <span className="font-medium">{c.name}</span>
                <Badge variant="outline">{c.flight}</Badge>
                <span className="tabular-nums">avg {score(c.score_avg)}</span>
                <span className="text-muted-foreground tabular-nums">
                  {c.attendance_pct.toFixed(0)}% attended{c.awol ? `, ${c.awol} AWOL` : ""}
                </span>
                {c.top_faults.length > 0 && (
                  <span className="text-muted-foreground text-xs sm:ml-auto">{c.top_faults.join(", ")}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {audit.positives.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <ThumbsUp className="text-success size-4" aria-hidden />
            Positives logged
          </h3>
          <div className="flex flex-wrap gap-2">
            {audit.positives.map((p) => (
              <Badge key={p.region} variant="secondary">
                {p.region} ×{p.count}
              </Badge>
            ))}
          </div>
        </section>
      )}

      {audit.markers.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Average score by inspector</h3>
          <p className="text-muted-foreground text-xs">
            From the nights each marked alone, so you can tell a harsh marker from a flight getting worse.
          </p>
          <ul className="flex flex-col gap-1 text-sm">
            {audit.markers.map((m) => (
              <li key={m.marker} className="flex justify-between gap-3">
                <span className="truncate">{m.marker}</span>
                <span className="tabular-nums">
                  {score(m.score_avg)}{" "}
                  <span className="text-muted-foreground">
                    ({m.sheets} night{m.sheets === 1 ? "" : "s"})
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

/**
 * Inspection audit: what needs improving most for a cadet, a flight or the
 * whole squadron, over one inspection or all of them. The figures load straight
 * away (no AI); the AI write-up costs a model call, so it waits for a click.
 */
export function InspectionAuditTab() {
  const { data: session } = useSession();
  const [scope, setScope] = useState<Scope>("squadron");
  const [flight, setFlight] = useState("");
  const [cadet, setCadet] = useState<{ cin: number; name: string } | null>(null);
  const [source, setSource] = useState("all");

  const { data: sheets = [] } = useApiQuery<SheetSummary[]>(["inspection-sheets"], "/inspections/sheets");
  const { data: cadets = [] } = useApiQuery<{ flight: string | null }[]>(["cadets"], "/cadets");
  const flights = flightsIn(cadets);

  const params = auditParams(scope, flight, cadet?.cin ?? null, source);
  const query = params?.toString() ?? "";
  const {
    data: audit,
    isLoading,
    error,
  } = useApiQuery<Audit>(["inspection-audit", query], `/inspections/audit?${query}`, {
    enabled: params != null,
    retry: false,
  });

  // The write-up belongs to the selection it was written for; a new selection
  // hides it rather than showing last selection's priorities against new figures.
  const [ai, setAi] = useState<{
    query: string;
    loading: boolean;
    result: AuditWithAi | null;
    error: string | null;
  }>({
    query: "",
    loading: false,
    result: null,
    error: null,
  });
  const aiHere = ai.query === query ? ai : null;

  async function writeUp() {
    if (!params || !session?.id_token) return;
    const body = Object.fromEntries(params.entries()) as Record<string, string | number>;
    if (body.cin) body.cin = Number(body.cin);
    if (body.sheet_id) body.sheet_id = Number(body.sheet_id);
    setAi({ query, loading: true, result: null, error: null });
    try {
      const result = await apiRequest<AuditWithAi>(
        session.id_token,
        `${API_BASE}/inspections/audit`,
        { method: "POST", body },
        "The audit failed."
      );
      setAi({ query, loading: false, result, error: result.ai_error });
    } catch (e) {
      setAi({
        query,
        loading: false,
        result: null,
        error: e instanceof Error ? e.message : "The audit failed.",
      });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label id="audit-who">Audit</Label>
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              aria-labelledby="audit-who"
              className="w-fit"
              value={scope}
              onValueChange={(v) => v && setScope(v as Scope)}
            >
              <ToggleGroupItem value="squadron" className="px-3">
                Squadron
              </ToggleGroupItem>
              <ToggleGroupItem value="flight" className="px-3">
                Flight
              </ToggleGroupItem>
              <ToggleGroupItem value="cadet" className="px-3">
                Cadet
              </ToggleGroupItem>
            </ToggleGroup>
          </div>

          {scope === "flight" && (
            <div className="flex flex-col gap-2">
              <Label id="audit-flight">Flight</Label>
              <ToggleGroup
                type="single"
                variant="outline"
                size="sm"
                aria-labelledby="audit-flight"
                className="w-fit"
                value={flight}
                onValueChange={(v) => v && setFlight(v)}
              >
                {flights.map((f) => (
                  <ToggleGroupItem key={f} value={f} aria-label={flightLabel(f)} className="px-3">
                    {f}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}

          {scope === "cadet" && (
            <div className="flex max-w-sm flex-col gap-2">
              <Label>Cadet</Label>
              <CadetSearchInput
                token={session?.id_token ?? null}
                selectedCin={cadet?.cin ?? null}
                selectedName={cadet?.name ?? ""}
                onSelect={(cin, name) => setCadet(cin ? { cin, name } : null)}
              />
            </div>
          )}

          <div className="flex max-w-sm flex-col gap-2">
            <Label htmlFor="audit-source">Inspections</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger id="audit-source" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PERIODS.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {p.label}
                  </SelectItem>
                ))}
                {sheets.length > 0 && (
                  <>
                    <SelectSeparator />
                    <SelectGroup>
                      <SelectLabel>One inspection</SelectLabel>
                      {sheets.map((s) => (
                        <SelectItem key={s.id} value={`sheet:${s.id}`}>
                          {formatDate(s.date)} · {s.uniform === "mtp" ? "MTP" : "Blues"}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </>
                )}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {!params ? (
        <EmptyState
          icon={ClipboardCheck}
          title={scope === "flight" ? "Pick a flight" : "Pick a cadet"}
          description="Then the audit shows what needs improving most."
        />
      ) : isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : error ? (
        <ErrorAlert title="Couldn't run the audit" message={error.message} />
      ) : audit ? (
        <>
          <h2 className="text-lg font-semibold">{audit.subject}</h2>

          <div className="bg-muted/30 rounded-lg border p-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="text-primary size-4" aria-hidden />
                What to improve first
              </h3>
              <Button size="sm" onClick={writeUp} disabled={aiHere?.loading}>
                {aiHere?.loading ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Sparkles className="size-4" />
                )}
                {aiHere?.result?.analysis ? "Rewrite" : "Ask the AI"}
              </Button>
            </div>
            <div className="mt-3">
              {aiHere?.loading && <p className="text-muted-foreground text-sm">Weighing up the figures…</p>}
              {aiHere?.error && <p className="text-destructive text-sm">{aiHere.error}</p>}
              {aiHere?.result?.analysis && <AiMarkdown text={aiHere.result.analysis} />}
              {!aiHere && (
                <p className="text-muted-foreground text-sm">
                  The AI ranks the top three things to fix from the figures below and suggests an action for
                  each. Cadets&apos; names aren&apos;t sent to it.
                </p>
              )}
            </div>
          </div>

          <AuditFigures audit={audit} />
        </>
      ) : null}
    </div>
  );
}
