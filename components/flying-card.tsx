import { CheckCircle2, Circle, Plane } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatMinutes } from "@/lib/format";
import { cn } from "@/lib/utils";

export type Flight = {
  id: number;
  date: string;
  activity: "powered" | "gliding" | "simulator" | string;
  aircraft: string | null;
  category: string | null;
  duty: string | null;
  sortie: string | null;
  unit: string | null;
  minutes: number | null;
};

export type FlyingStage = { stage: number; name: string; done: boolean };

/**
 * A cadet's flying record (synced from the Volunteer Portal) and how far they
 * are through Blue Flying. The API decides the stages (core/qualifications.py),
 * the same check badge orders and the audit use. Lists, not a table, so it
 * reads on a phone.
 */
export function FlyingCard({ flights, stages }: { flights: Flight[]; stages: FlyingStage[] }) {
  const totalMinutes = flights.reduce((n, f) => n + (f.minutes ?? 0), 0);
  const blueDone = stages.length > 0 && stages.every((s) => s.done);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
          <Plane className="text-muted-foreground h-4 w-4" />
          Flying
          <Badge variant="secondary" className="ml-auto text-xs font-normal">
            {flights.length} {flights.length === 1 ? "flight" : "flights"}
            {totalMinutes > 0 && ` · ${formatMinutes(totalMinutes)}`}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {stages.length > 0 && (
          <section aria-label="Blue Flying stages" className="flex flex-col gap-2">
            <p className="text-sm font-medium">
              Blue Flying{" "}
              <span className={cn("font-normal", blueDone ? "text-success" : "text-muted-foreground")}>
                —{" "}
                {blueDone
                  ? "all stages done"
                  : `${stages.filter((s) => s.done).length} of ${stages.length} stages`}
              </span>
            </p>
            <ol className="flex flex-col gap-1.5 text-sm">
              {stages.map((s) => (
                <li key={s.stage} className="flex items-center gap-2">
                  {s.done ? (
                    <CheckCircle2 className="text-success size-4 shrink-0" aria-label="Done" />
                  ) : (
                    <Circle className="text-muted-foreground size-4 shrink-0" aria-label="Not done" />
                  )}
                  <span className={cn(!s.done && "text-muted-foreground")}>
                    Stage {s.stage}: {s.name}
                  </span>
                </li>
              ))}
            </ol>
          </section>
        )}

        {flights.length === 0 ? (
          <p className="text-muted-foreground text-sm">No flights recorded on the Volunteer Portal.</p>
        ) : (
          <ul className="divide-y text-sm" aria-label="Flights">
            {flights.map((f) => (
              <li key={f.id} className="flex items-start justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="font-medium">
                    {f.activity === "simulator" ? "Simulator (PTT)" : (f.aircraft ?? "Flight")}
                    {f.duty && <span className="text-muted-foreground font-normal"> · {f.duty}</span>}
                  </p>
                  {(f.sortie || f.unit) && (
                    <p className="text-muted-foreground text-xs break-words">
                      {[f.sortie, f.unit].filter(Boolean).join(" · ")}
                    </p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="whitespace-nowrap">{formatDate(f.date)}</p>
                  {f.minutes != null && (
                    <p className="text-muted-foreground text-xs">{formatMinutes(f.minutes)}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
