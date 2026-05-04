"use client";
import Link from "next/link";
import { useState, useEffect, useRef, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Info, Loader2, Clock, CheckSquare, Square, X } from "lucide-react";

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
  const [status, setStatus] = useState<"running" | "done" | "error" | "stopping">("running");
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
      ? "border-emerald-500/40"
      : status === "error"
      ? "border-red-500/40"
      : "border-blue-500/30";

  const headerBg =
    status === "done"
      ? "bg-emerald-500/10"
      : status === "error"
      ? "bg-red-500/10"
      : "bg-blue-500/10";

  return (
    <div className={`flex flex-col rounded-xl border ${borderColor} overflow-hidden`}>
      <div className={`flex items-center gap-2 px-3 py-2 text-sm font-medium ${headerBg}`}>
        {(status === "running" || status === "stopping") && (
          <Loader2 size={13} className="animate-spin text-blue-500 shrink-0" />
        )}
        {status === "done" && <span className="text-emerald-500 shrink-0">✓</span>}
        {status === "error" && <span className="text-red-500 shrink-0">✗</span>}
        <span className="truncate">{label}</span>
        <Badge
          variant="secondary"
          className={`ml-auto text-xs ${
            status === "done"
              ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
              : status === "error"
              ? "bg-red-500/20 text-red-700 dark:text-red-300"
              : "bg-blue-500/20 text-blue-700 dark:text-blue-300"
          }`}
        >
          {status === "running"
            ? "Running"
            : status === "stopping"
            ? "Stopping..."
            : status === "done"
            ? "Done"
            : "Error"}
        </Badge>
        {(status === "running") && (
          <button
            onClick={handleStop}
            title="Stop scraper"
            className="ml-1 cursor-pointer p-0.5 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-500 transition-colors"
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

export default function ScraperPage() {
  const { data: session } = useSession();

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
  }, []);

  const allDone = activeScrapers.length > 0 && doneScrapers.size === activeScrapers.length;

  const handleBackToSelect = () => {
    setPhase("select");
    setActiveScrapers([]);
    setDoneScrapers(new Set());
    fetchLastRuns();
    fetchRunningState();
  };

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-16">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">SMS Scraper Tools</h1>
          <p className="text-muted-foreground mt-1">
            {phase === "select"
              ? "Select the scrapers you want to run."
              : "Scrapers are running. Watch the consoles below."}
          </p>
        </div>
        {phase === "running" && (
          <Badge variant={allDone ? "secondary" : "destructive"}>
            {allDone ? "All Done" : "Running"}
          </Badge>
        )}
      </div>

      {/* Running scrapers banner (visible on select phase) */}
      {phase === "select" && externallyRunning.length > 0 && (
        <button
          onClick={handleViewRunning}
          className="w-full cursor-pointer flex items-center gap-3 px-4 py-3 rounded-lg border border-blue-500/30 bg-blue-500/10 text-sm text-left hover:bg-blue-500/15 transition-colors"
        >
          <Loader2 size={15} className="animate-spin text-blue-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-medium text-blue-700 dark:text-blue-300">
              {externallyRunning.length === 1
                ? externallyRunning[0].label
                : `${externallyRunning.length} scrapers`}{" "}
              running
            </span>
            {externallyRunning[0].id && runningState[externallyRunning[0].id]?.started_by && (
              <span className="text-muted-foreground ml-2">
                — started by {runningState[externallyRunning[0].id].started_by}
              </span>
            )}
          </div>
          <span className="text-blue-500 text-xs font-medium shrink-0">View output →</span>
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
                  className={`flex flex-col space-y-2 p-4 border rounded-xl transition-colors ${
                    isRunning
                      ? "border-blue-500/30 bg-blue-500/5 cursor-default"
                      : isChecked
                      ? "border-primary/50 bg-primary/5 cursor-pointer"
                      : "bg-card hover:bg-accent/5 cursor-pointer"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {isRunning ? (
                        <Loader2 size={16} className="animate-spin text-blue-500 shrink-0" />
                      ) : (
                        <Checkbox
                          checked={isChecked}
                          onCheckedChange={() => toggleOne(tool.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="shrink-0"
                        />
                      )}
                      <h3 className="font-semibold">{tool.label}</h3>
                      {isRunning && (
                        <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-300 text-xs border-0">
                          Running
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Clock size={12} />
                      <span>{lastRun ? formatLastRan(lastRun.ran_at) : "Never"}</span>
                      {lastRun?.success === false && (
                        <Badge variant="destructive" className="text-xs py-0 px-1.5">
                          Failed
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-start gap-2 text-sm text-muted-foreground pl-7">
                    <Info size={14} className="mt-0.5 shrink-0 text-blue-500" />
                    <p>{tool.description}</p>
                  </div>
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
                ← Back to Scraper Selection
              </Button>
            </div>
          )}
        </>
      )}

      <div className="pt-4 border-t">
        <Link href="/">
          <Button variant="ghost" className="w-full">
            ← Back to Home
          </Button>
        </Link>
      </div>
    </div>
  );
}
