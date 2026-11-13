"use client";

import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Footprints, Search, Users } from "lucide-react";

import { CadetDrillDialog } from "@/components/drill/cadet-drill-dialog";
import { SquadDialog } from "@/components/drill/squad-dialog";
import { StageStatusBadge } from "@/components/drill/status-badge";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { FlightFilter, type FlightChoice } from "@/components/flight-filter";
import { ListSkeleton } from "@/components/list-skeleton";
import { Stat, StatGroup } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { flightLabel, flightsIn } from "@/lib/cadet-format";
import { DRILL_KEYS, readyByStage, stageCount, type DrillCadet, type DrillProgress } from "@/lib/drill";
import { useApiQuery } from "@/lib/use-api-query";

function CadetRow({
  cadet,
  progress,
  onOpen,
}: {
  cadet: DrillCadet;
  progress: DrillProgress;
  onOpen: (c: DrillCadet) => void;
}) {
  const stage = progress.stages.find((s) => s.id === cadet.current);
  const count = stage ? stageCount(cadet, stage) : null;
  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(cadet)}
        className="hover:bg-muted/60 focus-visible:bg-muted/60 flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left outline-none"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-medium">{cadet.name}</span>
          <span className="text-muted-foreground truncate text-xs">
            {[cadet.rank, cadet.flight && flightLabel(cadet.flight)].filter(Boolean).join(" · ")}
          </span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1 text-right">
          {stage ? (
            <>
              <span className="text-xs">{stage.name}</span>
              <span className="flex items-center gap-2">
                {count && count.total > 0 && (
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {count.passed}/{count.total}
                  </span>
                )}
                <StageStatusBadge status={cadet.stages[String(stage.id)] ?? "not_started"} />
              </span>
            </>
          ) : (
            <StageStatusBadge status="complete" />
          )}
        </span>
        <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
      </button>
    </li>
  );
}

/**
 * Who is where on the drill syllabus. The list leads with who is ready for a
 * stage test, since that is what an SNCO with a spare ten minutes wants to
 * know, then everyone with the stage they're on. Tapping a cadet opens their
 * record.
 */
export function DrillProgressView({ canRecord }: { canRecord: boolean }) {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useApiQuery<DrillProgress>(DRILL_KEYS.progress, "/drill/progress");
  const progress = useMemo<DrillProgress>(
    () =>
      data && Array.isArray(data.stages) && Array.isArray(data.cadets) ? data : { stages: [], cadets: [] },
    [data]
  );
  const [flight, setFlight] = useState<FlightChoice>("");
  const [search, setSearch] = useState("");
  const [openCin, setOpenCin] = useState<number | null>(null);
  const [squad, setSquad] = useState(false);

  const flights = useMemo(() => flightsIn(progress.cadets), [progress.cadets]);
  const needle = search.trim().toLowerCase();
  const shown = progress.cadets.filter(
    (c) => (!flight || c.flight?.trim() === flight) && (!needle || c.name.toLowerCase().includes(needle))
  );
  const ready = readyByStage(progress, shown);
  const refresh = () => queryClient.invalidateQueries({ queryKey: DRILL_KEYS.progress });
  // Look the open cadet up fresh, so the sheet shows each change as it saves.
  const open = progress.cadets.find((c) => c.cin === openCin) ?? null;

  const total = shown.length;
  const readyCount = shown.filter((c) => c.ready_for_test.length > 0).length;
  const done = shown.filter((c) => c.current === null && progress.stages.length > 0).length;
  const started = shown.filter((c) => Object.keys(c.lessons).length > 0 || c.tests.length > 0).length;

  if (isLoading) return <ListSkeleton rows={8} />;
  if (error) return <ErrorAlert message={error.message} title="Couldn't load drill progress" />;
  if (!progress.stages.length) {
    return (
      <EmptyState
        icon={Footprints}
        title="No drill syllabus yet"
        description={
          canRecord
            ? "Staff set up the stages and lessons on the Syllabus tab."
            : "Staff set up the stages and lessons first."
        }
      />
    );
  }
  if (!progress.cadets.length) {
    return (
      <EmptyState
        icon={Users}
        title="No cadets on the roster"
        description="Cadets appear once the scrapers have run."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <StatGroup className="grid-cols-2 sm:grid-cols-4">
        <Stat label="Started" value={started} />
        <Stat label="Ready for a test" value={readyCount} />
        <Stat label="Whole syllabus passed" value={done} />
        <Stat label="Cadets" value={total} />
      </StatGroup>

      <div className="flex flex-wrap items-center gap-3">
        <FlightFilter flights={flights} value={flight} onChange={setFlight} />
        <InputGroup className="h-9 w-full sm:w-56">
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
        {canRecord && (
          <Button className="h-9 sm:ml-auto" onClick={() => setSquad(true)}>
            Mark a squad
          </Button>
        )}
      </div>

      {ready.length > 0 && (
        <section aria-labelledby="drill-ready" className="flex flex-col gap-3">
          <h2 id="drill-ready" className="font-semibold">
            Ready for a test
          </h2>
          {ready.map(({ stage, cadets }) => (
            <div key={stage.id} className="flex flex-col gap-1">
              <h3 className="text-muted-foreground text-sm">
                {stage.name} · {stage.test_name}
              </h3>
              <ul className="bg-card divide-y overflow-hidden rounded-lg border">
                {cadets.map((c) => (
                  <CadetRow key={c.cin} cadet={c} progress={progress} onOpen={(x) => setOpenCin(x.cin)} />
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      <section aria-labelledby="drill-everyone" className="flex flex-col gap-3">
        <h2 id="drill-everyone" className="font-semibold">
          Everyone
        </h2>
        {shown.length === 0 ? (
          <EmptyState icon={Users} title="Nobody here" description="Try another flight or search." />
        ) : (
          <ul className="bg-card divide-y overflow-hidden rounded-lg border">
            {shown.map((c) => (
              <CadetRow key={c.cin} cadet={c} progress={progress} onOpen={(x) => setOpenCin(x.cin)} />
            ))}
          </ul>
        )}
      </section>

      <CadetDrillDialog
        cadet={open}
        progress={progress}
        canRecord={canRecord}
        onClose={() => setOpenCin(null)}
        onChanged={refresh}
      />
      {canRecord && (
        <SquadDialog
          open={squad}
          onOpenChange={setSquad}
          stages={progress.stages}
          cadets={progress.cadets}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
