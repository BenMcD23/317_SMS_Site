"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AlertTriangle, ClipboardCopy, ListChecks, Users } from "lucide-react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { PlanResult } from "@/components/session-planner/plan-result";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { flightBadgeClass, flightLabel, flightsIn } from "@/lib/cadet-format";
import { copyText } from "@/lib/clipboard";
import { todayLocal } from "@/lib/format";
import {
  badgeLevel,
  kindLabel,
  planSession,
  planToText,
  SESSION_KINDS,
  taskLabel,
  type BankTask,
  type PlannerCadet,
  type SessionKind,
  type SessionPlan,
} from "@/lib/session-planner";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

/** Below this, or with an absence booked, "Untick unlikely" takes them off. */
const UNLIKELY = 0.5;

export function isUnlikely(c: PlannerCadet): boolean {
  const { likelihood, flags } = c.attendance;
  return flags.some((f) => f.code === "absence_booked") || (likelihood !== null && likelihood < UNLIKELY);
}

/** A whole number typed into a box, or null if it isn't one. */
function wholeNumber(text: string): number | null {
  return /^\d+$/.test(text.trim()) ? Number(text) : null;
}

function Section({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside && <span className="text-muted-foreground text-sm">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

function CadetRow({
  cadet,
  ticked,
  leadership,
  onToggle,
}: {
  cadet: PlannerCadet;
  ticked: boolean;
  leadership: boolean;
  onToggle: () => void;
}) {
  const id = `cadet-${cadet.cin}`;
  const { likelihood, flags } = cadet.attendance;
  const badge = badgeLevel(cadet.leadership.level);
  return (
    <li className="flex items-start gap-3 px-3 py-2.5">
      <Checkbox id={id} checked={ticked} onCheckedChange={onToggle} className="mt-0.5" />
      <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-1">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-medium">
            {cadet.last_name}, {cadet.first_name}
          </span>
          {cadet.rank && <span className="text-muted-foreground text-xs">{cadet.rank}</span>}
          {cadet.flight && (
            <Badge variant="outline" className={cn("text-[11px]", flightBadgeClass(cadet.flight))}>
              {cadet.flight}
            </Badge>
          )}
          {likelihood !== null && (
            <span className={cn("text-xs", likelihood < UNLIKELY ? "text-warning" : "text-muted-foreground")}>
              {Math.round(likelihood * 100)}% likely in
            </span>
          )}
        </span>
        {leadership && (
          <span className="text-muted-foreground text-xs">
            {badge ? `${badge} Leadership held. ` : ""}
            {cadet.leadership.led
              ? `Led ${cadet.leadership.led}, passed ${cadet.leadership.passes}`
              : "Not led a task yet"}
          </span>
        )}
        {flags.some((f) => f.code === "absence_booked") && (
          <span className="text-warning flex items-center gap-1 text-xs">
            <AlertTriangle className="size-3" aria-hidden />
            Absence booked
          </span>
        )}
      </label>
    </li>
  );
}

/**
 * Plan one session: pick the night, the kind of session and its times, how
 * many stands the staff can run at once, which tasks to use and which cadets
 * are in. The API (core/session_plan.py) turns that into mixed-flight groups,
 * rounds that fit the time and kit, and for leadership a leader per run who
 * hasn't led that task before. Nothing is saved; change anything and plan
 * again.
 */
export function SessionPlanner() {
  const { data: session } = useSession();
  const [date, setDate] = useState(todayLocal());
  const [kind, setKind] = useState<SessionKind>("leadership");
  const [start, setStart] = useState("19:30");
  const [end, setEnd] = useState("21:00");
  // Kept as typed, so clearing a box to type a new number works; checked below.
  const [changeoverText, setChangeover] = useState("5");
  const [standsText, setStands] = useState("3");
  const [flights, setFlights] = useState<string[] | null>(null); // null: every flight
  const [unticked, setUnticked] = useState<Set<number>>(new Set());
  const [skipped, setSkipped] = useState<Set<number>>(new Set()); // tasks not used
  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [planFor, setPlanFor] = useState("");

  const tasksQuery = useApiQuery<BankTask[]>(
    ["session-planner", "tasks", "active"],
    "/session-planner/tasks"
  );
  const cadetsQuery = useApiQuery<PlannerCadet[]>(
    ["session-planner", "cadets", date],
    `/session-planner/cadets?date=${date}`,
    { enabled: !!date }
  );
  const allTasks = useMemo(() => (Array.isArray(tasksQuery.data) ? tasksQuery.data : []), [tasksQuery.data]);
  const roster = useMemo(() => (Array.isArray(cadetsQuery.data) ? cadetsQuery.data : []), [cadetsQuery.data]);

  const kinds = SESSION_KINDS.filter((k) => allTasks.some((t) => t.kind === k));
  const tasks = allTasks.filter((t) => t.kind === kind);
  const usable = tasks.filter((t) => !t.kit_short.length && !skipped.has(t.id));
  const allFlights = flightsIn(roster);
  const pickedFlights = flights ?? allFlights;
  const shown = roster.filter((c) => pickedFlights.includes(c.flight?.trim() ?? ""));
  const ticked = shown.filter((c) => !unticked.has(c.cin));
  const leadership = kind === "leadership";
  const stands = wholeNumber(standsText);
  const changeover = wholeNumber(changeoverText);

  const request = {
    kind,
    date,
    start,
    end,
    changeover_minutes: changeover ?? 0,
    stands: stands ?? 0,
    task_ids: usable.map((t) => t.id),
    cins: ticked.map((c) => c.cin),
  };
  const signature = JSON.stringify(request);
  const stale = plan !== null && planFor !== signature;

  function toggle(set: Set<number>, id: number): Set<number> {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  }

  async function runPlan() {
    setPlanning(true);
    setPlanError(null);
    try {
      const result = await planSession(session?.id_token ?? "", request);
      setPlan(result);
      setPlanFor(signature);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : "Couldn't plan the session.");
    } finally {
      setPlanning(false);
    }
  }

  async function copyPlan() {
    if (!plan) return;
    if (await copyText(planToText(plan))) toast.success("Plan copied");
    else toast.error("Couldn't copy. Select the plan and copy it by hand.");
  }

  const loading = tasksQuery.isLoading || cadetsQuery.isLoading;
  const loadError = tasksQuery.error ?? cadetsQuery.error;
  const blocker =
    stands === null || stands < 1 || stands > 20
      ? "Stands at once: a number from 1 to 20."
      : changeover === null || changeover > 60
        ? "Changeover: a number of minutes from 0 to 60."
        : !usable.length
          ? "Tick at least one task."
          : !ticked.length
            ? "Tick at least one cadet."
            : end <= start
              ? "The session has to end after it starts."
              : null;

  if (loading) return <ListSkeleton rows={8} />;
  if (loadError) return <ErrorAlert message={loadError.message} title="Could not load the planner" />;
  if (!allTasks.length)
    return (
      <EmptyState
        icon={ListChecks}
        title="No tasks in the bank yet"
        description="Add the tasks your sessions run, and the kit they need, before planning one."
      >
        <Button asChild>
          <Link href="/training/tasks">Open tasks & kit</Link>
        </Button>
      </EmptyState>
    );

  return (
    <div className="flex flex-col gap-8">
      <Section title="Session">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-date">Date</Label>
            <Input id="plan-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-kind">Kind of session</Label>
            <Select
              value={kind}
              onValueChange={(v) => {
                setKind(v as SessionKind);
                setSkipped(new Set());
              }}
            >
              <SelectTrigger id="plan-kind" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(kinds.length ? kinds : [kind]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {kindLabel(k)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-start">Start</Label>
            <Input id="plan-start" type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-end">End</Label>
            <Input id="plan-end" type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-changeover">Changeover (min)</Label>
            <Input
              id="plan-changeover"
              type="number"
              inputMode="numeric"
              min={0}
              max={60}
              value={changeoverText}
              onChange={(e) => setChangeover(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="plan-stands">Stands at once</Label>
            <Input
              id="plan-stands"
              type="number"
              inputMode="numeric"
              min={1}
              max={20}
              value={standsText}
              onChange={(e) => setStands(e.target.value)}
            />
          </div>
        </div>
        <p className="text-muted-foreground text-sm">
          Stands at once is how many tasks your staff can run side by side. It sets how many groups there are.
        </p>
      </Section>

      <Section title="Tasks" aside={`${usable.length} of ${tasks.length} in use`}>
        {tasks.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No {kindLabel(kind).toLowerCase()} tasks in the bank.
          </p>
        ) : (
          <ul className="bg-card divide-y rounded-lg border">
            {tasks.map((t) => {
              const short = t.kit_short.length > 0;
              const id = `task-${t.id}`;
              return (
                <li key={t.id} className="flex items-start gap-3 px-3 py-2.5">
                  <Checkbox
                    id={id}
                    checked={!short && !skipped.has(t.id)}
                    disabled={short}
                    onCheckedChange={() => setSkipped((s) => toggle(s, t.id))}
                    className="mt-0.5"
                  />
                  <label htmlFor={id} className="flex min-w-0 flex-1 cursor-pointer flex-col gap-0.5">
                    <span className="font-medium">{taskLabel(t)}</span>
                    <span className={cn("text-xs", short ? "text-warning" : "text-muted-foreground")}>
                      {t.duration_minutes} min
                      {short ? ` · not enough ${t.kit_short.join(", ")}` : ""}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        <Link href="/training/tasks" className="text-primary self-start text-sm hover:underline">
          Edit tasks and kit
        </Link>
      </Section>

      <Section title="Cadets" aside={`${ticked.length} ticked`}>
        {allFlights.length > 1 && (
          <ToggleGroup
            type="multiple"
            variant="outline"
            size="sm"
            aria-label="Flights in this session"
            className="flex-wrap"
            value={pickedFlights}
            onValueChange={(v) => setFlights(v)}
          >
            {allFlights.map((f) => (
              <ToggleGroupItem key={f} value={f} className="px-3">
                {flightLabel(f)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setUnticked(new Set(shown.filter(isUnlikely).map((c) => c.cin)))}
          >
            Untick unlikely
          </Button>
          <Button variant="outline" size="sm" className="h-9" onClick={() => setUnticked(new Set())}>
            Tick all
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setUnticked(new Set(shown.map((c) => c.cin)))}
          >
            Untick all
          </Button>
        </div>
        {shown.length === 0 ? (
          <EmptyState icon={Users} title="No cadets" description="Pick a flight to see its cadets." />
        ) : (
          <ul className="bg-card divide-y rounded-lg border">
            {shown.map((c) => (
              <CadetRow
                key={c.cin}
                cadet={c}
                ticked={!unticked.has(c.cin)}
                leadership={leadership}
                onToggle={() => setUnticked((s) => toggle(s, c.cin))}
              />
            ))}
          </ul>
        )}
      </Section>

      <div className="bg-background sticky bottom-16 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t px-4 py-3 md:bottom-0 md:mx-0 md:px-0">
        <Button className="h-10" onClick={runPlan} disabled={!!blocker || planning}>
          {planning ? "Planning…" : plan ? "Plan again" : "Plan session"}
        </Button>
        {blocker ? (
          <span className="text-muted-foreground text-sm">{blocker}</span>
        ) : (
          stale && <span className="text-warning text-sm">Changed since this plan.</span>
        )}
        {plan && (
          <Button variant="outline" className="h-10 sm:ml-auto" onClick={copyPlan}>
            <ClipboardCopy />
            Copy plan
          </Button>
        )}
      </div>

      <ErrorAlert message={planError} title="Not planned" />
      {plan && <PlanResult plan={plan} />}
    </div>
  );
}
