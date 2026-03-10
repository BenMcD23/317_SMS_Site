"use client";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Info, User, Loader2 } from "lucide-react";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

const SCRAPER_LABELS: Record<string, string> = {
  "cadet-quali": "Cadet Qualification Scraper",
  "cadet-event": "Cadet Event Scraper",
  "317-event": "317 Event Scraper",
  "medical": "Medical Scraper",
};

type LogEntry = { text: string; time: string };

const toEntry = (text: string): LogEntry => ({
  text,
  time: new Date().toLocaleTimeString(),
});

export default function ScraperPage() {
  const { data: session } = useSession();

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [activeUser, setActiveUser] = useState<string | null>(null);
  const [activeName, setActiveName] = useState<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  const addLog = (text: string) => {
    setLogs((prev) => [...prev, toEntry(text)]);
  };

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

const connectToStream = () => {
  if (eventSourceRef.current) eventSourceRef.current.close();
  
  const token = session?.id_token;
  const url = token
    ? `${API_BASE}/scraper-stream?token=${encodeURIComponent(token)}`
    : `${API_BASE}/scraper-stream`;

  const evtSource = new EventSource(url);

    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "status" && data.value === "running") {
          setIsRunning(true);
          setActiveUser(data.started_by ?? null);
          setActiveName(data.scraper_name ?? null);
          addLog(`> ${SCRAPER_LABELS[data.scraper_name] ?? data.scraper_name} started by ${data.started_by}`);
        }

        if (data.type === "status" && data.value === "done") {
          setIsRunning(false);
          setActiveUser(null);
          setActiveName(null);
          addLog("[SUCCESS] Scraper completed");
        }

        if (data.type === "error") {
          setIsRunning(false);
          setActiveUser(null);
          setActiveName(null);
          addLog(`[ERROR] ${data.value}`);
        }

        if (data.type === "log" || data.type === "info" || data.type === "warning") {
          addLog(data.value);
        }
      } catch {
        addLog(event.data);
      }
    };

    evtSource.onerror = () => {
      evtSource.close();
      setTimeout(connectToStream, 3000);
    };
  };

  useEffect(() => {
    if (!session?.id_token) return;
    apiFetch(`${API_BASE}/scraper-status`, {
      headers: { Authorization: `Bearer ${session.id_token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.running) {
          setIsRunning(true);
          setActiveUser(data.started_by ?? null);
          setActiveName(data.scraper_name ?? null);
          if (data.recent_logs?.length) {
            setLogs(data.recent_logs.map((l: unknown) =>
              typeof l === "string" ? toEntry(l) : l as LogEntry
            ));
          }
        }
      })
      .catch(() => {});
  }, [session?.id_token]);

  const runScraper = async (name: string) => {
    if (!session?.id_token) {
      toast.error("You must be logged in to run scrapers.");
      return;
    }

    try {
      const res = await apiFetch(`${API_BASE}/run-scraper/${name}`, {
        method: "GET",
        headers: { Authorization: `Bearer ${session.id_token}` },
      });

      const data = await res.json();

      if (!res.ok) {
        toast.error(data.detail || "Server error");
        addLog(`[ERROR] ${data.detail || "Server error"}`);
      }
    } catch {
      addLog("[ERROR] Could not reach server");
    }
  };

  const scraperTools = [
    { id: "cadet-quali", label: "Cadet Qualification Scraper", description: "Fetches all cadet information (name, email, CIN), updates the database with cadets and their qualifications, and pushes the qualifications to the Google Sheet." },
    { id: "cadet-event", label: "Cadet Event Scraper", description: "Extracts attendance lists for currently active SMS events." },
    { id: "317-event", label: "317 Event Scraper", description: "Pulls full event metadata into the local database." },
    { id: "medical", label: "Medical Scraper", description: "Fetches allergies and dietary requirements for cadets." },
  ];

  return (
    <main className="container max-w-3xl mx-auto py-10 px-4 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">SMS Scraper Tools</h1>
          <p className="text-muted-foreground mt-1">Select a tool to begin syncing data from Bader.</p>
        </div>
        <Badge variant={isRunning ? "destructive" : "secondary"}>
          {isRunning ? "Running" : "Idle"}
        </Badge>
      </div>

      {/* Active scraper banner */}
      {isRunning && activeUser && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-lg border border-blue-500/30 bg-blue-500/10 text-sm">
          <Loader2 size={15} className="animate-spin text-blue-500 shrink-0" />
          <span className="font-medium text-blue-700 dark:text-blue-300">
            {SCRAPER_LABELS[activeName ?? ""] ?? activeName ?? "Scraper"}
          </span>
          <span className="text-muted-foreground">—</span>
          <User size={13} className="text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">{activeUser}</span>
        </div>
      )}

      {/* Scraper grid */}
      <div className="grid gap-4">
        {scraperTools.map((tool) => {
          const isThisOne = activeName === tool.id && isRunning;

          return (
            <div
              key={tool.id}
              className="flex flex-col space-y-2 p-4 border rounded-xl bg-card hover:bg-accent/5 transition-colors"
            >
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">{tool.label}</h3>
                <Button
                  variant={isThisOne ? "secondary" : "outline"}
                  disabled={isRunning}
                  onClick={() => runScraper(tool.id)}
                  className="min-w-[140px]"
                  title={isRunning && !isThisOne ? "Another scraper is already running" : ""}
                >
                  {isThisOne ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" /> Running...
                    </span>
                  ) : isRunning ? (
                    "🔒 In Use"
                  ) : (
                    "Run Scraper"
                  )}
                </Button>
              </div>
              <div className="flex items-start gap-2 text-sm text-muted-foreground">
                <Info size={16} className="mt-0.5 shrink-0 text-blue-500" />
                <p>{tool.description}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Console */}
      <div className="mt-10 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Console Output</h3>
          {logs.length > 0 && !isRunning && (
            <button onClick={() => setLogs([])} className="text-xs text-muted-foreground hover:text-primary underline">
              Clear Logs
            </button>
          )}
        </div>
        <ScrollArea className="h-64 w-full rounded-md border bg-black p-4 font-mono text-sm text-green-400 shadow-inner">
          {logs.map((log, i) => (
            <div key={i} className="mb-1">
              <span className="opacity-40 select-none mr-2">[{log.time}]</span>
              <span className={
                log.text.startsWith("[ERROR]") ? "text-red-400" :
                log.text.startsWith("[SUCCESS]") ? "text-emerald-400" :
                log.text.startsWith("[WARN]") ? "text-yellow-400" :
                log.text.startsWith(">") ? "text-yellow-400" : ""
              }>
                {log.text}
              </span>
            </div>
          ))}
          {logs.length === 0 && (
            <span className="text-gray-600 animate-pulse">_ Waiting for command...</span>
          )}
          <div ref={logsEndRef} />
        </ScrollArea>
      </div>

      <div className="pt-4 border-t">
        <Link href="/">
          <Button variant="ghost" className="w-full">← Back to Home</Button>
        </Link>
      </div>
    </main>
  );
}