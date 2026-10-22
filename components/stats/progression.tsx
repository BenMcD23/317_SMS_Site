"use client";

import { type DrillDown } from "@/components/stats/charts";
import { CsvButton } from "@/components/stats/csv-button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatMonth } from "@/lib/format";
import type { Funnel, RetentionRow } from "@/lib/stats";

/**
 * How cadets move through the squadron: the classification funnel and intake
 * retention. Both lean on the weekly per-cadet history, so they start thin and
 * fill in week by week; each says so rather than showing an empty chart.
 */

function weeks(days: number | null): string {
  if (days === null) return "—";
  const w = Math.round(days / 7);
  return w < 1 ? "under a week" : w === 1 ? "1 week" : `${w} weeks`;
}

export function ClassificationFunnel({
  funnel,
  flight,
  onDrill,
}: {
  funnel: Funnel | undefined;
  flight: string | null;
  onDrill?: DrillDown;
}) {
  const steps = funnel?.steps ?? [];
  const top = steps[0]?.reached ?? 0;
  const anyTimed = steps.some((s) => s.median_days_from_previous !== null);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Classification funnel</CardTitle>
        <CardDescription>
          Cadets on strength who have reached each step
          {anyTimed && ", and the typical time from the step before"}
        </CardDescription>
        <CardAction>
          <CsvButton
            filename="classification-funnel.csv"
            label="Download the funnel as CSV"
            rows={() =>
              steps.map((s) => ({
                step: s.name,
                reached: s.reached,
                "% of previous": s.pct_of_previous,
                "median days from previous": s.median_days_from_previous,
                "cadets timed": s.timed_cadets,
              }))
            }
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {top === 0 ? (
          <p className="text-muted-foreground text-sm">No cadets to show.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {steps.map((s, i) => (
              <li key={s.name} className="grid grid-cols-[8rem_minmax(0,1fr)] items-center gap-3 text-sm">
                <span className="truncate">{s.name.replace(" Cadet", "")}</span>
                <div className="flex min-w-0 flex-col gap-0.5">
                  <button
                    type="button"
                    disabled={!onDrill || s.reached === 0}
                    className="group flex items-center gap-2 text-left disabled:cursor-default"
                    aria-label={`${s.name}: ${s.reached} reached — show these cadets`}
                    onClick={() =>
                      onDrill?.(
                        { min_classification: s.name, ...(flight ? { flight } : {}) },
                        `Reached ${s.name}`
                      )
                    }
                  >
                    <span className="bg-muted h-4 flex-1 overflow-hidden rounded">
                      <span
                        className="bg-chart-1 group-enabled:group-hover:bg-chart-1/80 block h-full rounded"
                        style={{ width: `${(s.reached / top) * 100}%` }}
                      />
                    </span>
                    <span className="w-8 text-right text-xs font-medium tabular-nums">{s.reached}</span>
                  </button>
                  {i > 0 && (
                    <span className="text-muted-foreground text-xs">
                      {s.pct_of_previous === null ? "—" : `${s.pct_of_previous}% of the step before`}
                      {s.median_days_from_previous !== null &&
                        ` · typically ${weeks(s.median_days_from_previous)} (${s.timed_cadets} timed)`}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        {top > 0 && !anyTimed && (
          <p className="text-muted-foreground text-xs">
            Time between steps appears once the weekly history has seen cadets move up.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function pct(n: number | null, of: number): string {
  if (n === null) return "—";
  return of > 0 ? `${n} (${Math.round((n / of) * 100)}%)` : String(n);
}

export function IntakeRetention({ rows }: { rows: RetentionRow[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Intake retention</CardTitle>
        <CardDescription>
          Cadets by the month they first appeared, and how many were still coming 6 and 12 months later
        </CardDescription>
        <CardAction>
          <CsvButton
            filename="intake-retention.csv"
            label="Download retention as CSV"
            rows={() =>
              rows.map((r) => ({
                intake: r.intake,
                joined: r.joined,
                "after 6 months": r["6m"],
                "after 12 months": r["12m"],
                "still on strength": r.still_on_strength,
              }))
            }
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No intakes yet. Each cadet is recorded weekly, so new joiners show up here from their first week,
            and the 6 and 12 month columns fill in as they pass.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Intake</TableHead>
                <TableHead className="text-right">Joined</TableHead>
                <TableHead className="text-right">6 months</TableHead>
                <TableHead className="text-right">12 months</TableHead>
                <TableHead className="text-right">Still here</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.intake}>
                  <TableCell>{formatMonth(r.intake)}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.joined}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(r["6m"], r.joined)}</TableCell>
                  <TableCell className="text-right tabular-nums">{pct(r["12m"], r.joined)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {pct(r.still_on_strength, r.joined)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
