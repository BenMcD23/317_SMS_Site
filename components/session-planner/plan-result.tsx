"use client";

import { AlertTriangle } from "lucide-react";

import { Stat, StatGroup } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { flightBadgeClass } from "@/lib/cadet-format";
import { personName, taskLabel, type SessionPlan } from "@/lib/session-planner";
import { cn } from "@/lib/utils";

/**
 * A planned session: the headline figures, anything the planner couldn't do,
 * each round's stands (what staff run the night from), then who's in each
 * group. Split from the planner so the inputs and the answer stay readable.
 */
export function PlanResult({ plan }: { plan: SessionPlan }) {
  const cadets = plan.groups.reduce((n, g) => n + g.cadets.length, 0);
  const leaders = plan.leads.length;
  const last = plan.rounds.at(-1);

  return (
    <div className="flex flex-col gap-6" aria-label="Session plan">
      <StatGroup>
        <Stat label="Groups" value={plan.groups.length} />
        <Stat label="Rounds" value={plan.rounds.length} hint={last ? `Finishes ${last.end}` : undefined} />
        {plan.leadership && (
          <Stat
            label="Leading tonight"
            value={`${leaders} of ${cadets}`}
            tone={leaders < cadets ? "warning" : "success"}
          />
        )}
      </StatGroup>

      {plan.warnings.length > 0 && (
        <ul className="flex flex-col gap-1.5" aria-label="Things to know">
          {plan.warnings.map((w) => (
            <li key={w} className="text-warning flex items-start gap-2 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {w}
            </li>
          ))}
        </ul>
      )}

      {plan.rounds.map((r) => (
        <section key={r.number} className="flex flex-col gap-2">
          <h3 className="font-semibold">
            Round {r.number}{" "}
            <span className="text-muted-foreground font-normal tabular-nums">
              {r.start}–{r.end}
            </span>
          </h3>
          <div className="bg-card overflow-hidden rounded-lg border">
            <Table aria-label={`Round ${r.number}`}>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">Group</TableHead>
                  <TableHead>Task</TableHead>
                  {plan.leadership && <TableHead>Leader</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {r.runs.map((run) => (
                  <TableRow key={run.group}>
                    <TableCell className="font-medium">{run.group}</TableCell>
                    <TableCell className="whitespace-normal">
                      {taskLabel({ number: run.task_number, name: run.task_name })}
                    </TableCell>
                    {plan.leadership && (
                      <TableCell className="whitespace-normal">
                        {run.leader ? (
                          personName(run.leader)
                        ) : (
                          <span className="text-warning">No leader</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {r.idle_groups.map((g) => (
                  <TableRow key={`idle-${g}`}>
                    <TableCell className="font-medium">{g}</TableCell>
                    <TableCell colSpan={plan.leadership ? 2 : 1} className="text-muted-foreground">
                      Sits out
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ))}

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">Groups</h3>
        <ul className="bg-card grid divide-y rounded-lg border sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">
          {plan.groups.map((g) => (
            <li key={g.number} className="flex flex-col gap-2 p-4">
              <span className="font-medium">
                Group {g.number}{" "}
                <span className="text-muted-foreground font-normal">({g.cadets.length})</span>
              </span>
              <ul className="flex flex-col gap-1 text-sm">
                {g.cadets.map((c) => (
                  <li key={c.cin} className="flex items-center gap-2">
                    <span className="min-w-0 truncate">{personName(c)}</span>
                    {c.flight && (
                      <Badge variant="outline" className={cn("text-[11px]", flightBadgeClass(c.flight))}>
                        {c.flight}
                      </Badge>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      {plan.leadership && plan.not_leading.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="font-semibold">Not leading tonight</h3>
          <p className="text-muted-foreground text-sm">{plan.not_leading.map(personName).join(", ")}</p>
        </section>
      )}
    </div>
  );
}
