"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardAction } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/page-header";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Loader2, Clock, CheckSquare, Square, X, CalendarClock } from "lucide-react";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

const SCRAPER_TOOLS = [
  {
    id: "cadet-quali",
    label: "Cadet Qualification Scraper",
    description:
      "Fetches all cadet information (name, email, CIN), updates the database with cadets and their qualifications, and pushes the qualifications to the Google Sheet.",
  },
  {
    id: "cadet-event",
    label: "Cadet Event Scraper",
    description: "Extracts attendance lists for currently active SMS events.",
  },
  {
    id: "317-event",
    label: "317 Event Scraper",
    description: "Pulls full event metadata into the local database.",
  },
  {
    id: "medical",
    label: "Medical Scraper",
    description: "Fetches allergies and dietary requirements for cadets.",
  },
];

// React Query keys whose cached data each scraper refreshes. When a run
// completes we invalidate these so the affected pages show the new data
// immediately instead of waiting out the 60s staleTime. Keys are prefixes, so
// ["stats"] also invalidates ["stats","current"] / ["stats","history"].
// Scrapers feeding pages that aren't cached yet (cadet detail, events) map to
// [] — add their keys here if/when those pages move to useApiQuery.
const SCRAPER_CACHE_KEYS: Record<string, readonly (readonly string[])[]> = {
  "cadet-quali": [["cadets"], ["stats"]], // cadet info + qualifications → list & dashboard
  "cadet-event": [],                      // attendance lives on cadet detail (uncached)
  "317-event": [],                        // event metadata (uncached)
  "medical": [],                          // allergies/dietary on cadet detail (uncached)
};

type LogEntry = { text: string; time: string };
type LastRun = { ran_at: string | null; success: boolean | null; ran_by: string | null };
type RunningState = { running: boolean; started_by: string | null };

const toEntry = (text: string): LogEntry => ({
  text,
  time: new Date().toLocaleTimeString(),
});

function formatLastRan(isoString: string | null): string {
  if (!isoString) return "Never";
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ConsolePanel({
  scraperId,
  label,
  token,
  onDone,
}: {
  scraperId: string;
  label: string;
  token: string;
  onDone: (id: string) => void;
}) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatus] = useState<"running" | "done" | "error" | "stopping" | "stopped">("running");
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  const addLog = useCallback((text: string) => {
    setLogs((prev) => [...prev, toEntry(text)]);
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  useEffect(() => {
    const url = `${API_BASE}/scraper-stream/${scraperId}?token=${encodeURIComponent(token)}`;
    const evtSource = new EventSource(url);
    eventSourceRef.current = evtSource;

    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "status" && data.value === "running") {
          addLog(`> ${label} started`);
        }
        if (data.type === "status" && data.value === "done") {
          setStatus("done");
          onDone(scraperId);
          evtSource.close();
        }
        if (data.type === "status" && data.value === "stopped") {
          setStatus("stopped");
          onDone(scraperId);
          evtSource.close();
        }
        if (data.type === "error") {
          setStatus("error");
          addLog(`[ERROR] ${data.value}`);
          onDone(scraperId);
          evtSource.close();
        }
        if (data.type === "log" || data.type === "info") {
          addLog(data.value);
        }
        if (data.type === "warning") {
          addLog(data.value);
        }
      } catch {
        addLog(event.data);
      }
    };

    evtSource.onerror = () => {
      evtSource.close();
    };

    return () => {
      evtSource.close();
    };
  }, [scraperId, token, label, addLog, onDone]);

  const handleStop = async () => {
    setStatus("stopping");
    try {
      const res = await apiFetch(`${API_BASE}/stop-scraper/${scraperId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        toast.error(data.detail || "Could not stop scraper");
        setStatus("running");
      }
    } catch {
      toast.error("Could not reach server");
      setStatus("running");
    }
  };

  const borderColor =
    status === "done"
      ? "border-success/40"
      : status === "error"
      ? "border-destructive/40"
      : status === "stopped"
      ? "border-warning/40"
      : "border-primary/30";

  const headerBg =
    status === "done"
      ? "bg-success/10"
      : status === "error"
      ? "bg-destructive/10"
      : status === "stopped"
      ? "bg-warning/10"
      : "bg-primary/10";

  return (
    <div className={cn("flex flex-col overflow-hidden rounded-lg border", borderColor)}>
      <div className={cn("flex items-center gap-2 px-3 py-2 text-sm font-medium", headerBg)}>
        {(status === "running" || status === "stopping") && (
          <Loader2 size={13} className="shrink-0 animate-spin text-primary" />
        )}
        {status === "done" && <span className="shrink-0 text-success">✓</span>}
        {status === "error" && <span className="shrink-0 text-destructive">✗</span>}
        {status === "stopped" && <span className="shrink-0 text-warning">■</span>}
        <span className="truncate">{label}</span>
        <Badge
          variant="outline"
          className={cn(
            "ml-auto",
            status === "done"
              ? "border-success/40 bg-success/10 text-success"
              : status === "error"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : status === "stopped"
              ? "border-warning/40 bg-warning/10 text-warning"
              : "border-primary/40 bg-primary/10 text-primary"
          )}
        >
          {status === "running"
            ? "Running"
            : status === "stopping"
            ? "Stopping…"
            : status === "done"
            ? "Done"
            : status === "stopped"
            ? "Stopped"
            : "Error"}
        </Badge>
        {(status === "running") && (
          <button
            onClick={handleStop}
            title="Stop scraper"
            className="ml-1 cursor-pointer rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
          >
            <X size={13} />
          </button>
        )}
      </div>
      <ScrollArea className="h-56 bg-black p-3 font-mono text-xs text-green-400">
        {logs.map((log, i) => (
          <div key={i} className="mb-1 leading-relaxed">
            <span className="opacity-30 select-none mr-2">[{log.time}]</span>
            <span
              className={
                log.text.startsWith("[ERROR]")
                  ? "text-red-400"
                  : log.text.startsWith("[SUCCESS]")
                  ? "text-emerald-400"
                  : log.text.startsWith("[WARN]") || log.text.startsWith("[STOPPED]")
                  ? "text-yellow-400"
                  : log.text.startsWith(">")
                  ? "text-yellow-400"
                  : ""
              }
            >
              {log.text}
            </span>
          </div>
        ))}
        {logs.length === 0 && (
          <span className="text-gray-600 animate-pulse">_ Connecting...</span>
        )}
        <div ref={logsEndRef} />
      </ScrollArea>
    </div>
  );
}

// ─── Schedule tab ─────────────────────────────────────────────────────────────

type Schedule = {
  enabled: boolean;
  days: string[];
  hour: number;
  minute: number;
  runs_as: string | null;
  updated_by: string | null;
  updated_at: string | null;
};

const DAY_OPTIONS = [
  { id: "mon", label: "Mon" },
  { id: "tue", label: "Tue" },
  { id: "wed", label: "Wed" },
  { id: "thu", label: "Thu" },
  { id: "fri", label: "Fri" },
  { id: "sat", label: "Sat" },
  { id: "sun", label: "Sun" },
];

const pad = (n: number) => String(n).padStart(2, "0");

function ScheduleCard({
  tool,
  schedule,
  token,
  onSaved,
}: {
  tool: (typeof SCRAPER_TOOLS)[number];
  schedule: Schedule;
  token: string;
  onSaved: (id: string, s: Schedule) => void;
}) {
  const [enabled, setEnabled] = useState(schedule.enabled);
  const [days, setDays] = useState<string[]>(schedule.days);
  const [time, setTime] = useState(`${pad(schedule.hour)}:${pad(schedule.minute)}`);
  const [saving, setSaving] = useState(false);

  const dirty =
    enabled !== schedule.enabled ||
    time !== `${pad(schedule.hour)}:${pad(schedule.minute)}` ||
    days.slice().sort().join(",") !== schedule.days.slice().sort().join(",");

  const handleSave = async () => {
    const [h, m] = time.split(":").map(Number);
    if (enabled && days.length === 0) {
      toast.error("Pick at least one day of the week.");
      return;
    }
    setSaving(true);
    try {
      const res = await apiFetch(`${API_BASE}/scraper-schedules/${tool.id}`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, days, hour: h ?? 22, minute: m ?? 0 }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.detail || "Could not save schedule");
        return;
      }
      onSaved(tool.id, data);
      toast.success(`${tool.label} schedule saved.`);
    } catch {
      toast.error("Could not reach server");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{tool.label}</CardTitle>
        <CardAction>
          {schedule.enabled ? (
            <Badge variant="outline" className="border-success/40 bg-success/10 text-success">
              Scheduled
            </Badge>
          ) : (
            <Badge variant="secondary">Off</Badge>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm">
            <Checkbox checked={enabled} onCheckedChange={(v) => setEnabled(v === true)} />
            Enabled
          </label>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">Days</Label>
            <ToggleGroup
              type="multiple"
              variant="outline"
              size="sm"
              spacing={1}
              value={days}
              onValueChange={setDays}
              className="flex-wrap"
            >
              {DAY_OPTIONS.map((d) => (
                <ToggleGroupItem key={d.id} value={d.id} aria-label={d.label} className="px-2.5">
                  {d.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`time-${tool.id}`} className="text-xs text-muted-foreground">
              Time
            </Label>
            <Input
              id={`time-${tool.id}`}
              type="time"
              className="w-28"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>

          <Button size="sm" className="ml-auto" disabled={!dirty || saving} onClick={handleSave}>
            {saving && <Spinner />}
            Save
          </Button>
        </div>

        {schedule.runs_as && (
          <p className="text-xs text-muted-foreground">
            Runs with {schedule.runs_as}&apos;s Bader credentials
            {schedule.updated_by && ` · last saved by ${schedule.updated_by}`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function ScheduleTab({ token }: { token: string }) {
  const [schedules, setSchedules] = useState<Record<string, Schedule> | null>(null);

  useEffect(() => {
    apiFetch(`${API_BASE}/scraper-schedules`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then(setSchedules)
      .catch(() => toast.error("Could not load schedules"));
  }, [token]);

  if (!schedules) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="size-6" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <CalendarClock className="mt-0.5 size-4 shrink-0" />
        Schedules are squadron-wide — they run automatically whether or not anyone is logged in,
        using the saved Bader credentials of whoever last saved each schedule.
      </p>
      {SCRAPER_TOOLS.map((tool) => (
        <ScheduleCard
          key={tool.id}
          tool={tool}
          schedule={schedules[tool.id]}
          token={token}
          onSaved={(id, s) => setSchedules((prev) => ({ ...prev!, [id]: s }))}
        />
      ))}
    </div>
  );
}

export default function ScraperPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [phase, setPhase] = useState<"select" | "running">("select");
  const [activeScrapers, setActiveScrapers] = useState<string[]>([]);
  const [doneScrapers, setDoneScrapers] = useState<Set<string>>(new Set());
  const [lastRuns, setLastRuns] = useState<Record<string, LastRun>>({});
  const [runningState, setRunningState] = useState<Record<string, RunningState>>({});
  const [isStarting, setIsStarting] = useState(false);

  const fetchLastRuns = useCallback(() => {
    if (!session?.id_token) return;
    apiFetch(`${API_BASE}/scraper-last-runs`, {
      headers: { Authorization: `Bearer ${session.id_token}` },
    })
      .then((r) => r.json())
      .then((data) => setLastRuns(data))
      .catch(() => {});
  }, [session?.id_token]);

  const fetchRunningState = useCallback(() => {
    if (!session?.id_token) return;
    apiFetch(`${API_BASE}/scrapers-running`, {
      headers: { Authorization: `Bearer ${session.id_token}` },
    })
      .then((r) => r.json())
      .then((data: Record<string, RunningState>) => {
        setRunningState(data);
        // If we're on select phase and some scrapers are externally running, update display
      })
      .catch(() => {});
  }, [session?.id_token]);

  // Initial load
  useEffect(() => {
    fetchLastRuns();
    fetchRunningState();
  }, [fetchLastRuns, fetchRunningState]);

  // Poll running state every 5s when on select phase
  useEffect(() => {
    if (phase !== "select") return;
    const interval = setInterval(fetchRunningState, 5000);
    return () => clearInterval(interval);
  }, [phase, fetchRunningState]);

  const externallyRunning = SCRAPER_TOOLS.filter(
    (t) => runningState[t.id]?.running
  );

  const allSelected = selected.size === SCRAPER_TOOLS.length;

  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(SCRAPER_TOOLS.map((t) => t.id)));
    }
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRunSelected = async () => {
    if (!session?.id_token) {
      toast.error("You must be logged in to run scrapers.");
      return;
    }
    if (selected.size === 0) {
      toast.error("Select at least one scraper.");
      return;
    }

    setIsStarting(true);
    const ids = Array.from(selected);
    const failures: string[] = [];

    await Promise.all(
      ids.map(async (name) => {
        try {
          const res = await apiFetch(`${API_BASE}/run-scraper/${name}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${session.id_token}` },
          });
          if (!res.ok) {
            const data = await res.json();
            failures.push(`${name}: ${data.detail || "Server error"}`);
          }
        } catch {
          failures.push(`${name}: Could not reach server`);
        }
      })
    );

    setIsStarting(false);

    if (failures.length > 0) {
      failures.forEach((f) => toast.error(f));
    }

    const started = ids.filter((id) => !failures.some((f) => f.startsWith(id)));
    if (started.length > 0) {
      setActiveScrapers(started);
      setDoneScrapers(new Set());
      setPhase("running");
    }
  };

  const handleViewRunning = () => {
    const ids = externallyRunning.map((t) => t.id);
    setActiveScrapers(ids);
    setDoneScrapers(new Set());
    setPhase("running");
  };

  const handleScraperDone = useCallback((id: string) => {
    setDoneScrapers((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    // Drop client-side caches the scraper just refreshed so pages refetch the
    // new data (the backend already invalidated its own cache on completion).
    for (const queryKey of SCRAPER_CACHE_KEYS[id] ?? []) {
      queryClient.invalidateQueries({ queryKey });
    }
  }, [queryClient]);

  const allDone = activeScrapers.length > 0 && doneScrapers.size === activeScrapers.length;

  const handleBackToSelect = () => {
    setPhase("select");
    setActiveScrapers([]);
    setDoneScrapers(new Set());
    fetchLastRuns();
    fetchRunningState();
  };

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Bader Scrapers"
        description={
          phase === "select"
            ? "Sync cadet, event and medical data from Bader SMS"
            : "Scrapers are running — watch the consoles below"
        }
        actions={
          phase === "running" ? (
            <Badge variant={allDone ? "secondary" : "outline"} className={cn(!allDone && "border-primary/40 bg-primary/10 text-primary")}>
              {allDone ? "All done" : "Running"}
            </Badge>
          ) : undefined
        }
      />

      <Tabs defaultValue="run" className="flex flex-col gap-6">
        <TabsList className="w-fit">
          <TabsTrigger value="run">Run</TabsTrigger>
          <TabsTrigger value="schedule">Schedule</TabsTrigger>
        </TabsList>

        <TabsContent value="run" className="flex flex-col gap-6">

      {/* Running scrapers banner (visible on select phase) */}
      {phase === "select" && externallyRunning.length > 0 && (
        <button
          onClick={handleViewRunning}
          className="flex w-full cursor-pointer items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-left text-sm transition-colors hover:bg-primary/15"
        >
          <Loader2 size={15} className="shrink-0 animate-spin text-primary" />
          <div className="min-w-0 flex-1">
            <span className="font-medium text-primary">
              {externallyRunning.length === 1
                ? externallyRunning[0].label
                : `${externallyRunning.length} scrapers`}{" "}
              running
            </span>
            {externallyRunning[0].id && runningState[externallyRunning[0].id]?.started_by && (
              <span className="ml-2 text-muted-foreground">
                — started by {runningState[externallyRunning[0].id].started_by}
              </span>
            )}
          </div>
          <span className="shrink-0 text-xs font-medium text-primary">View output →</span>
        </button>
      )}

      {phase === "select" && (
        <>
          {/* Select all + Run button */}
          <div className="flex items-center justify-between">
            <button
              onClick={toggleAll}
              className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              {allSelected ? (
                <CheckSquare size={16} className="text-primary" />
              ) : (
                <Square size={16} />
              )}
              {allSelected ? "Deselect All" : "Select All"}
            </button>
            <Button
              onClick={handleRunSelected}
              disabled={selected.size === 0 || isStarting}
              className="min-w-[140px]"
            >
              {isStarting ? (
                <span className="flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" /> Starting...
                </span>
              ) : (
                `Run Selected${selected.size > 0 ? ` (${selected.size})` : ""}`
              )}
            </Button>
          </div>

          {/* Scraper selection grid */}
          <div className="grid gap-3">
            {SCRAPER_TOOLS.map((tool) => {
              const isChecked = selected.has(tool.id);
              const lastRun = lastRuns[tool.id];
              const isRunning = runningState[tool.id]?.running;

              return (
                <div
                  key={tool.id}
                  onClick={() => !isRunning && toggleOne(tool.id)}
                  className={cn(
                    "flex flex-col gap-2 rounded-lg border p-4 transition-colors",
                    isRunning
                      ? "cursor-default border-primary/30 bg-primary/5"
                      : isChecked
                      ? "cursor-pointer border-primary/50 bg-primary/5"
                      : "cursor-pointer bg-card hover:bg-muted/40"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isRunning ? (
                        <Loader2 size={16} className="shrink-0 animate-spin text-primary" />
                      ) : (
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleOne(tool.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0"
                        />
                      )}
                      <h3 className="text-sm font-semibold">{tool.label}</h3>
                      {isRunning && (
                        <Badge variant="outline" className="border-primary/40 bg-primary/10 text-primary">
                          Running
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock size={12} />
                      <span>{lastRun ? formatLastRan(lastRun.ran_at) : "Never"}</span>
                      {lastRun?.success === false && (
                        <Badge variant="destructive" className="px-1.5 py-0">
                          Failed
                        </Badge>
                      )}
                    </div>
                  </div>
                  <p className="pl-7 text-sm text-muted-foreground">{tool.description}</p>
                </div>
              );
            })}
          </div>
        </>
      )}

      {phase === "running" && session?.id_token && (
        <>
          <div className="flex items-center justify-between">
            <button
              onClick={handleBackToSelect}
              className="text-sm text-muted-foreground hover:text-primary transition-colors"
            >
              ← Back to selection
            </button>
          </div>

          {/* Console panels grid */}
          <div
            className={`grid gap-4 ${
              activeScrapers.length === 1
                ? "grid-cols-1"
                : activeScrapers.length === 2
                ? "grid-cols-1 md:grid-cols-2"
                : activeScrapers.length === 3
                ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                : "grid-cols-1 md:grid-cols-2"
            }`}
          >
            {activeScrapers.map((id) => {
              const tool = SCRAPER_TOOLS.find((t) => t.id === id)!;
              return (
                <ConsolePanel
                  key={id}
                  scraperId={id}
                  label={tool.label}
                  token={session.id_token!}
                  onDone={handleScraperDone}
                />
              );
            })}
          </div>

          {allDone && (
            <div className="flex justify-center">
              <Button onClick={handleBackToSelect} variant="outline">
                Back to scraper selection
              </Button>
            </div>
          )}
        </>
      )}
        </TabsContent>

        <TabsContent value="schedule">
          {session?.id_token && <ScheduleTab token={session.id_token} />}
        </TabsContent>
      </Tabs>
    </div>
  );
}
