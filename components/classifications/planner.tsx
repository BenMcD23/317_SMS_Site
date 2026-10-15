"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ClipboardCopy, GraduationCap, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { ErrorAlert } from "@/components/error-alert";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { FlightFilter, type FlightChoice } from "@/components/flight-filter";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { flightBadgeClass, flightsIn } from "@/lib/cadet-format";
import {
  buildGroups,
  countFlagged,
  nextLesson,
  parseSlotId,
  planToTsv,
  slotId,
  suggestedSlot,
  type ClassificationPlan,
  type PlannedCadet,
  type Slot,
  type Subject,
} from "@/lib/classification-day";
import { formatDate, todayLocal } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

/** Pick which lessons are running tonight; none picked means any. */
function LessonsRunning({
  subjects,
  selected,
  onChange,
}: {
  subjects: Subject[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const categories = [...new Set(subjects.map((s) => s.category))];
  const toggle = (key: string) =>
    onChange(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 justify-start" id="cd-lessons">
          {selected.length === 0
            ? "Any lesson"
            : `${selected.length} lesson${selected.length === 1 ? "" : "s"}`}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="flex w-80 flex-col gap-3">
        <p className="text-muted-foreground text-xs">
          Pick the lessons you can run tonight. Cadets go on the first one they still need; exams are given
          whatever runs.
        </p>
        {categories.map((category) => (
          <fieldset key={category} className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-semibold">{category}</legend>
            {subjects
              .filter((s) => s.category === category)
              .map((s) => (
                <Label key={s.key} className="flex items-center gap-2 text-sm font-normal">
                  <Checkbox checked={selected.includes(s.key)} onCheckedChange={() => toggle(s.key)} />
                  {s.name}
                </Label>
              ))}
          </fieldset>
        ))}
        {selected.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => onChange([])}>
            Clear — any lesson
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}

function MoveSelect({
  cadet,
  slot,
  subjects,
  onMove,
}: {
  cadet: PlannedCadet;
  slot: Slot;
  subjects: Subject[];
  onMove: (slot: Slot) => void;
}) {
  const name = (key: string) => subjects.find((s) => s.key === key)?.name ?? key;
  const current = slotId(slot);
  // Keep whatever they're on listed, even if it isn't one of the usual choices.
  const fixed = ["not_offered", "first_class", "complete"].includes(slot.kind);

  return (
    <Select value={current} onValueChange={(v) => onMove(parseSlotId(v))}>
      <SelectTrigger
        size="sm"
        className="h-8 w-full sm:w-56"
        aria-label={`Move ${cadet.first_name} ${cadet.last_name}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {fixed && <SelectItem value={current}>Leave as is</SelectItem>}
        {cadet.ready_exams.length > 0 && (
          <SelectGroup>
            <SelectLabel>Exams</SelectLabel>
            {cadet.ready_exams.map((key) => (
              <SelectItem key={key} value={`exam:${key}`}>
                {name(key)} exam
              </SelectItem>
            ))}
          </SelectGroup>
        )}
        <SelectGroup>
          <SelectLabel>Lessons</SelectLabel>
          {subjects.map((s) => (
            <SelectItem key={s.key} value={`lesson:${s.key}`}>
              {s.name}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectItem value="float">Float</SelectItem>
        <SelectItem value="none">Not on tonight&apos;s list</SelectItem>
      </SelectContent>
    </Select>
  );
}

function CadetRow({
  cadet,
  slot,
  subjects,
  moved,
  onMove,
}: {
  cadet: PlannedCadet;
  slot: Slot;
  subjects: Subject[];
  moved: boolean;
  onMove: (slot: Slot | null) => void;
}) {
  const { flags, likelihood } = cadet.attendance;
  // The move menu already shows the lesson or exam; only a cadet left off
  // tonight's lessons needs telling what they'd be on.
  const nextName = slot.kind === "not_offered" ? cadet.lesson_name : null;
  const lesson = nextLesson(cadet, slot);

  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">
            {cadet.last_name}, {cadet.first_name}
          </span>
          {cadet.rank && <span className="text-muted-foreground text-xs">{cadet.rank}</span>}
          {cadet.flight && (
            <Badge variant="outline" className={cn("text-[11px]", flightBadgeClass(cadet.flight))}>
              {cadet.flight}
            </Badge>
          )}
          {lesson && (
            <Badge variant="secondary" className="text-[11px] font-medium">
              {lesson.charAt(0).toUpperCase() + lesson.slice(1)}
            </Badge>
          )}
          {likelihood !== null && (
            <span
              className={cn(
                "text-xs tabular-nums",
                likelihood < 0.5 ? "text-warning" : "text-muted-foreground"
              )}
              title="How often they're in on this night of the week over the last 6 months"
            >
              {Math.round(likelihood * 100)}% likely in
            </span>
          )}
        </div>
        {nextName && (
          <p className="text-muted-foreground text-xs">
            Next subject: {nextName}
            {cadet.lesson_part && cadet.lesson_parts && cadet.lesson_parts > 1
              ? `, lesson ${cadet.lesson_part} of ${cadet.lesson_parts}`
              : ""}
          </p>
        )}
        {cadet.awaiting && (
          <p className="text-xs text-blue-700 dark:text-blue-400">
            All exams for {cadet.awaiting} passed — classification not on record yet
          </p>
        )}
        {flags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Attendance flags">
            {flags.map((f) => (
              <li key={f.code}>
                <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning gap-1">
                  <AlertTriangle className="size-3" />
                  {f.message}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <MoveSelect cadet={cadet} slot={slot} subjects={subjects} onMove={onMove} />
        {moved && (
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Put ${cadet.first_name} ${cadet.last_name} back on their suggestion`}
            onClick={() => onMove(null)}
          >
            <RotateCcw className="size-4" />
          </Button>
        )}
      </div>
    </li>
  );
}

type Show = "all" | "flagged";

/** Cadets across the groups whose id matches — the summary tiles over the plan. */
function count(groups: { id: string; cadets: unknown[] }[], match: (id: string) => boolean): number {
  return groups.filter((g) => match(g.id)).reduce((n, g) => n + g.cadets.length, 0);
}

/**
 * Who sits which exam and who has which lesson on a classification night, from
 * the Volunteer Portal exams and the lessons recorded on the Progress tab, with
 * anyone unlikely to be in flagged.
 */
export function ClassificationPlanner() {
  const [date, setDate] = useState(todayLocal);
  const [offered, setOffered] = useState<string[]>([]);
  const [flight, setFlight] = useState<FlightChoice>("");
  const [show, setShow] = useState<Show>("all");
  const [overrides, setOverrides] = useState<Record<number, Slot>>({});

  const { data: subjects = [], error: subjectsError } = useApiQuery<Subject[]>(
    ["classification-day", "lessons"],
    "/classification-day/lessons"
  );
  const params = new URLSearchParams({ date });
  offered.forEach((k) => params.append("offered", k));
  const {
    data: plan,
    isLoading,
    error,
  } = useApiQuery<ClassificationPlan>(
    ["classification-day", date, offered],
    `/classification-day?${params}`,
    { enabled: !!date }
  );

  const cadets = useMemo(() => plan?.cadets ?? [], [plan]);
  const flights = useMemo(() => flightsIn(cadets), [cadets]);
  const visible = cadets.filter(
    (c) => (!flight || c.flight?.trim() === flight) && (show === "all" || c.attendance.flags.length > 0)
  );
  const groups = buildGroups(visible, subjects, overrides);

  function move(cin: number, slot: Slot | null) {
    setOverrides((prev) => {
      const next = { ...prev };
      const cadet = cadets.find((c) => c.cin === cin);
      // Moving back to the suggestion is the same as no override.
      if (!slot || (cadet && slotId(slot) === slotId(suggestedSlot(cadet)))) delete next[cin];
      else next[cin] = slot;
      return next;
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(planToTsv(groups, subjects));
      toast.success("Copied — paste it into the classification sheet.");
    } catch {
      toast.error("Couldn't copy to the clipboard.");
    }
  }

  const movedCount = Object.keys(overrides).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="cd-date" className="text-muted-foreground text-xs">
            Night
          </Label>
          <Input
            id="cd-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 w-[9.5rem]"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="cd-lessons" className="text-muted-foreground text-xs">
            Lessons running
          </Label>
          <LessonsRunning subjects={subjects} selected={offered} onChange={setOffered} />
        </div>
        <FlightFilter flights={flights} value={flight} onChange={setFlight} />
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Show"
          value={show}
          onValueChange={(v) => v && setShow(v as Show)}
        >
          <ToggleGroupItem value="all" className="px-3">
            Everyone
          </ToggleGroupItem>
          <ToggleGroupItem value="flagged" className="px-3">
            Flagged {plan ? countFlagged(cadets) : ""}
          </ToggleGroupItem>
        </ToggleGroup>
        {movedCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setOverrides({})}>
            <RotateCcw className="size-4" />
            Undo {movedCount} move{movedCount === 1 ? "" : "s"}
          </Button>
        )}
        <Button variant="outline" size="sm" className="ml-auto" onClick={copy} disabled={!groups.length}>
          <ClipboardCopy className="size-4" />
          Copy for Sheets
        </Button>
      </div>

      <ErrorAlert message={(error ?? subjectsError)?.message} title="Couldn't load the plan" />

      {plan && cadets.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Sitting an exam" value={count(groups, (id) => id === "exam")} tone="primary" />
          <Stat label="On a lesson" value={count(groups, (id) => id.startsWith("lesson:"))} />
          <Stat label="Next subject not running" value={count(groups, (id) => id === "not_offered")} />
          <Stat
            label="Flagged"
            value={countFlagged(visible)}
            tone={countFlagged(visible) ? "warning" : undefined}
          />
        </div>
      )}

      {plan && (
        <p className="text-muted-foreground text-sm">
          Planning {plan.weekday} {formatDate(plan.date)}. Attendance flags look at the last 6 months of
          parade nights; flagged cadets are still on the list.
        </p>
      )}

      {isLoading ? (
        <ListSkeleton rows={6} />
      ) : plan && groups.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title={cadets.length ? "Nobody matches" : "No cadets on the roster"}
          description={
            cadets.length
              ? "Try another flight or show everyone."
              : "Cadets appear once the scrapers have run."
          }
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-2">
          {groups.map((group) => (
            <Card key={group.id} className="gap-0 py-0">
              <CardHeader className="px-4 py-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <h2>{group.title}</h2>
                  <span className="text-muted-foreground text-sm font-normal tabular-nums">
                    {group.cadets.length}
                  </span>
                </CardTitle>
                {group.hint && <CardDescription>{group.hint}</CardDescription>}
              </CardHeader>
              <CardContent className="border-t px-4">
                <ul className="divide-y">
                  {group.cadets.map(({ cadet, slot }) => (
                    <CadetRow
                      key={cadet.cin}
                      cadet={cadet}
                      slot={slot}
                      subjects={subjects}
                      moved={cadet.cin in overrides}
                      onMove={(s) => move(cadet.cin, s)}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
