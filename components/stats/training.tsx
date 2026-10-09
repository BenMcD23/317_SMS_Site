"use client";

import { type DrillDown } from "@/components/stats/charts";
import { CsvButton } from "@/components/stats/csv-button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { BLUE_FLYING_STATES, type TrainingProgress } from "@/lib/stats";
import { cn } from "@/lib/utils";

/**
 * Training progress from the Volunteer Portal data (GET /stats/progress):
 * where cadets are with Blue Flying, and how many of the cadets who need each
 * classification exam have passed it. Every bar opens the cadets behind it.
 */

/** One bar: label, a fill of `value / of`, the count. Clickable only when
 *  given `onClick` — callers leave it off when there'd be nobody to show. */
function Bar({
  label,
  value,
  of,
  fill,
  onClick,
  detail,
}: {
  label: string;
  value: number;
  of: number;
  fill: string;
  onClick?: () => void;
  detail?: string;
}) {
  return (
    <li className="grid grid-cols-[9rem_minmax(0,1fr)] items-center gap-3 text-sm sm:grid-cols-[14rem_minmax(0,1fr)]">
      <span className="truncate" title={label}>
        {label}
      </span>
      <button
        type="button"
        disabled={!onClick}
        className="group flex min-w-0 items-center gap-2 text-left disabled:cursor-default"
        aria-label={`${label}: ${detail ?? value} — show these cadets`}
        onClick={onClick}
      >
        <span className="bg-muted h-4 flex-1 overflow-hidden rounded">
          <span
            className={cn("block h-full rounded group-enabled:group-hover:opacity-80", fill)}
            style={{ width: `${of > 0 ? (value / of) * 100 : 0}%` }}
          />
        </span>
        <span className="w-14 text-right text-xs font-medium tabular-nums">{detail ?? value}</span>
      </button>
    </li>
  );
}

export function BlueFlyingCard({ progress, onDrill }: { progress: TrainingProgress; onDrill?: DrillDown }) {
  const counts = progress.blue_flying;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Blue Flying</CardTitle>
        <CardDescription>
          {progress.flown_last_year} of {progress.total} cadets have flown in the last year. Stages: Blue ATP
          ground school, Blue PTT, then a flight in a Tutor or Viking.
        </CardDescription>
        <CardAction>
          <CsvButton
            filename="blue-flying.csv"
            label="Download Blue Flying as CSV"
            rows={() => BLUE_FLYING_STATES.map((s) => ({ stage: s.label, cadets: counts[s.key] ?? 0 }))}
          />
        </CardAction>
      </CardHeader>
      <CardContent>
        {progress.total === 0 ? (
          <p className="text-muted-foreground text-sm">No cadets in this selection.</p>
        ) : (
          <ol className="flex flex-col gap-2">
            {BLUE_FLYING_STATES.map((s) => (
              <Bar
                key={s.key}
                label={s.label}
                value={counts[s.key] ?? 0}
                of={progress.total}
                fill={
                  s.key === "done"
                    ? "bg-success"
                    : s.key === "not_started"
                      ? "bg-muted-foreground/40"
                      : "bg-chart-4"
                }
                onClick={
                  onDrill && counts[s.key]
                    ? () => onDrill({ blue_flying: s.key }, `Blue Flying — ${s.label}`)
                    : undefined
                }
              />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function ClassificationExamsCard({
  progress,
  onDrill,
}: {
  progress: TrainingProgress;
  onDrill?: DrillDown;
}) {
  const groups = [
    { category: "Leading", who: "First Class cadets" },
    { category: "Senior/Master", who: "Leading and Senior cadets" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Classification exams</CardTitle>
        <CardDescription>
          How many of the cadets who still need each exam have passed it. Click a bar for who hasn&apos;t.
        </CardDescription>
        <CardAction>
          <CsvButton
            filename="classification-exams.csv"
            label="Download classification exams as CSV"
            rows={() =>
              progress.exams.map((e) => ({
                exam: e.name,
                for: e.category,
                cadets: e.cadets,
                passed: e.passed,
                "not yet": e.cadets - e.passed,
              }))
            }
          />
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {groups.map(({ category, who }) => {
          const exams = progress.exams.filter((e) => e.category === category);
          const cadets = exams[0]?.cadets ?? 0;
          return (
            <section key={category} aria-label={`${category} exams`} className="flex flex-col gap-2">
              <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                {category} · {cadets} {who}
              </p>
              {cadets === 0 ? (
                <p className="text-muted-foreground text-sm">No {who} in this selection.</p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {exams.map((e) => (
                    <Bar
                      key={e.key}
                      label={e.name}
                      value={e.passed}
                      of={e.cadets}
                      fill="bg-chart-2"
                      detail={`${e.passed}/${e.cadets}`}
                      onClick={
                        onDrill && e.passed < e.cadets
                          ? () => onDrill({ exam: e.key, exam_passed: "false" }, `Still to pass ${e.name}`)
                          : undefined
                      }
                    />
                  ))}
                </ol>
              )}
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
