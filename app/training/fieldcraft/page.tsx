"use client";

import { useMemo, useState } from "react";
import { Check, Tent } from "lucide-react";

import { EmptyState } from "@317/ui-common/components/empty-state";
import { ErrorAlert } from "@317/ui-common/components/error-alert";
import { Badge } from "@317/ui-common/components/ui/badge";
import { Card } from "@317/ui-common/components/ui/card";
import { FlightFilter, type FlightChoice } from "@/components/flight-filter";
import { ListSkeleton } from "@/components/list-skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { flightBadgeClass, flightsIn } from "@/lib/cadet-format";
import { FIELDCRAFT_KEY, hasDone, workingOn, type FieldcraftGrid } from "@/lib/fieldcraft";
import { formatDate } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@317/ui-common/lib/utils";

type Show = "todo" | "all";

/**
 * Every cadet against every fieldcraft lesson at one level, from the Volunteer
 * Portal, with how many still need each lesson so the next one to teach is
 * obvious. Read-only: lessons are recorded on the portal.
 */
export default function FieldcraftPage() {
  const { data, isLoading, error } = useApiQuery<FieldcraftGrid>(FIELDCRAFT_KEY, "/cadets/fieldcraft");
  const levels = data?.levels ?? [];
  const roster = useMemo(() => data?.cadets ?? [], [data]);
  const [picked, setPicked] = useState<string | null>(null);
  const index = Math.max(
    0,
    levels.findIndex((l) => l.level === picked)
  );
  const level = levels[index];
  const [flight, setFlight] = useState<FlightChoice>("");
  const [show, setShow] = useState<Show>("todo");

  const inFlight = roster.filter((c) => !flight || c.flight?.trim() === flight);
  const rows = inFlight.filter((c) => (show === "all" ? c.synced : workingOn(c, levels, index)));
  const unsynced = inFlight.filter((c) => !c.synced).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        {levels.length > 1 && (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label="Level"
            value={level?.level ?? ""}
            onValueChange={(v) => v && setPicked(v)}
          >
            {levels.map((l) => (
              <ToggleGroupItem key={l.level} value={l.level} className="px-3">
                {l.level}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        <FlightFilter flights={flightsIn(roster)} value={flight} onChange={setFlight} />
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Show"
          value={show}
          onValueChange={(v) => v && setShow(v as Show)}
        >
          <ToggleGroupItem value="todo" className="px-3">
            Working on it
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="px-3">
            Everyone
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      <p className="text-muted-foreground text-xs">
        From the Volunteer Portal
        {data?.synced_at && `, last synced ${formatDate(data.synced_at)}`}. Record lessons on the portal; they
        show here after the next 317 Sync.
        {unsynced > 0 && ` ${unsynced} ${unsynced === 1 ? "cadet has" : "cadets have"} no portal record yet.`}
      </p>

      <ErrorAlert message={error?.message} title="Couldn't load fieldcraft" />

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : error ? null : !level ? (
        <EmptyState
          icon={Tent}
          title="No fieldcraft synced yet"
          description="Run 317 Sync from a Volunteer Portal login that can see fieldcraft."
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Tent}
          title="Nobody here"
          description={
            show === "todo"
              ? `Nobody shown is working on ${level.level}. Try Everyone.`
              : "Try another flight."
          }
        />
      ) : (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="bg-muted sticky left-0 z-10 min-w-44 pl-4">Cadet</TableHead>
                  {level.lessons.map((l) => {
                    const need = rows.filter((c) => !hasDone(c, l)).length;
                    return (
                      <TableHead key={l.lesson_id} className="h-auto min-w-28 py-2 text-center align-bottom">
                        <span className="block text-xs leading-tight font-medium whitespace-normal">
                          {l.title}
                        </span>
                        {l.reference && (
                          <span className="text-muted-foreground block text-[10px] font-normal">
                            {l.reference}
                          </span>
                        )}
                        {need > 0 && <span className="sr-only">{", "}</span>}
                        {need > 0 && (
                          <span className="text-warning block text-[10px] font-normal">{need} need it</span>
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => (
                  <TableRow key={c.cin} className="group">
                    <TableCell className="bg-card group-hover:bg-muted sticky left-0 z-10 pl-4">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">
                          {c.last_name}, {c.first_name}
                        </span>
                        {c.flight && (
                          <Badge
                            variant="outline"
                            className={cn("w-fit text-[10px]", flightBadgeClass(c.flight))}
                          >
                            {c.flight}
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    {level.lessons.map((l) => {
                      const had = hasDone(c, l);
                      const when = c.done[String(l.lesson_id)];
                      return (
                        <TableCell key={l.lesson_id} className="text-center">
                          {had ? (
                            <span
                              className="text-success inline-flex flex-col items-center text-[10px]"
                              title={when ? formatDate(when) : "Done, no date on the portal"}
                            >
                              <Check className="size-4" aria-label={`${l.title}: done`} />
                            </span>
                          ) : (
                            <span className="text-muted-foreground" aria-label={`${l.title}: not done`}>
                              —
                            </span>
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
}
