"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { FlightFilter, type FlightChoice } from "@/components/flight-filter";
import { ListSkeleton } from "@/components/list-skeleton";
import { LessonCell, LessonPips } from "@/components/classifications/lesson-cell";
import { RecordLessonDialog } from "@/components/classifications/record-dialog";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { classificationBadgeClass, flightBadgeClass, flightsIn } from "@/lib/cadet-format";
import {
  categoriesOf,
  markLessons,
  progressOf,
  stillToDo,
  THEORY_KEYS,
  type CadetProgress,
  type TheorySubject,
} from "@/lib/theory";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

type Show = "todo" | "all";

/** Pip legend, so "amber" doesn't have to be guessed. */
function Legend() {
  const sample = (lessons: number[], taught = false, passed = false) => (
    <LessonPips progress={{ lessons, taught, passed }} parts={3} />
  );
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
      <span className="flex items-center gap-2">{sample([1, 2])} Lessons had</span>
      <span className="flex items-center gap-2">{sample([1, 2, 3], true)} Taught, exam to sit</span>
      <span className="flex items-center gap-2">{sample([], false, true)}</span>
    </div>
  );
}

/**
 * Every cadet against every subject in one category, with the lessons they've
 * had. Tapping a cell ticks lessons off, which is how a missed QR scan is put
 * right.
 */
export function TheoryProgress({ subjects }: { subjects: TheorySubject[] }) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const {
    data: cadets,
    isLoading,
    error,
  } = useApiQuery<CadetProgress[]>(THEORY_KEYS.progress, "/cadets/theory/progress");

  const ordered = categoriesOf(subjects);
  const [picked, setPicked] = useState<string | null>(null);
  const category = picked ?? ordered[0] ?? "";
  const [flight, setFlight] = useState<FlightChoice>("");
  const [show, setShow] = useState<Show>("todo");
  const [search, setSearch] = useState("");

  const columns = subjects.filter((s) => s.category === category);
  const roster = useMemo(() => (Array.isArray(cadets) ? cadets : []), [cadets]);
  const flights = useMemo(() => flightsIn(roster), [roster]);
  const needle = search.trim().toLowerCase();
  const rows = roster.filter(
    (c) =>
      (!flight || c.flight?.trim() === flight) &&
      (show === "all" || stillToDo(c, columns)) &&
      (!needle || `${c.first_name} ${c.last_name}`.toLowerCase().includes(needle))
  );

  async function change(
    cadet: CadetProgress,
    subject: TheorySubject,
    part: number | undefined,
    done: boolean
  ) {
    if (!session?.id_token) return;
    try {
      await markLessons(session.id_token, [cadet.cin], [{ key: subject.key, part }], done);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: THEORY_KEYS.progress }),
        queryClient.invalidateQueries({ queryKey: THEORY_KEYS.plan }),
      ]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the lessons.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Subjects"
          value={category}
          onValueChange={(v) => v && setPicked(v)}
        >
          {ordered.map((c) => (
            <ToggleGroupItem key={c} value={c} className="px-3">
              {c}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <FlightFilter flights={flights} value={flight} onChange={setFlight} />
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Show"
          value={show}
          onValueChange={(v) => v && setShow(v as Show)}
        >
          <ToggleGroupItem value="todo" className="px-3">
            Still to do
          </ToggleGroupItem>
          <ToggleGroupItem value="all" className="px-3">
            Everyone
          </ToggleGroupItem>
        </ToggleGroup>
        <InputGroup className="h-8 w-full sm:w-48">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            aria-label="Search cadets"
            placeholder="Search cadets"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Legend />
        <RecordLessonDialog subjects={subjects} roster={roster} />
      </div>

      <ErrorAlert message={error?.message} title="Couldn't load progress" />

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : !error && rows.length === 0 ? (
        <EmptyState
          icon={Users}
          title={roster.length ? "Nobody here" : "No cadets on the roster"}
          description={
            roster.length
              ? show === "todo"
                ? "Everyone shown has passed these subjects, or isn't on them yet. Try Everyone."
                : "Try another flight or search."
              : "Cadets appear once the scrapers have run."
          }
        />
      ) : rows.length > 0 ? (
        <Card className="gap-0 overflow-hidden py-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className="bg-muted sticky left-0 z-10 min-w-44 pl-4">Cadet</TableHead>
                  {columns.map((s) => {
                    const taught = rows.filter((c) => progressOf(c, s.key).taught).length;
                    return (
                      <TableHead key={s.key} className="h-auto min-w-28 py-2 text-center align-bottom">
                        <span className="block text-xs leading-tight font-medium whitespace-normal">
                          {s.name}
                        </span>
                        {/* Read as "Airmanship, 2 to sit exam", not run together. */}
                        {taught > 0 && <span className="sr-only">{", "}</span>}
                        {taught > 0 && (
                          <span className="text-warning block text-[10px] font-normal">
                            {taught} to sit exam
                          </span>
                        )}
                      </TableHead>
                    );
                  })}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((c) => {
                  const name = `${c.first_name} ${c.last_name}`;
                  return (
                    <TableRow key={c.cin} className="group">
                      <TableCell className="bg-card group-hover:bg-muted sticky left-0 z-10 pl-4">
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">
                            {c.last_name}, {c.first_name}
                          </span>
                          <span className="flex flex-wrap items-center gap-1">
                            {c.flight && (
                              <Badge
                                variant="outline"
                                className={cn("text-[10px]", flightBadgeClass(c.flight))}
                              >
                                {c.flight}
                              </Badge>
                            )}
                            <Badge
                              variant="outline"
                              className={cn("text-[10px]", classificationBadgeClass(c.classification))}
                            >
                              {(c.classification || "Junior Cadet").replace(/ Cadet$/, "")}
                            </Badge>
                          </span>
                        </div>
                      </TableCell>
                      {columns.map((s) => (
                        <TableCell key={s.key} className="text-center">
                          <LessonCell
                            cadetName={name}
                            subject={s}
                            progress={progressOf(c, s.key)}
                            onChange={(part, done) => change(c, s, part, done)}
                          />
                        </TableCell>
                      ))}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
