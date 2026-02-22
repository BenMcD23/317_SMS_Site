"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

const API_BASE = "http://localhost:8000"; // Change in production

export default function ScraperPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const connectToStream = () => {
    const evtSource = new EventSource(`${API_BASE}/scraper-stream`);
    eventSourceRef.current = evtSource;

    evtSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "status") {
          if (data.value === "running") {
            setIsRunning(true);
            setLogs((prev) => [...prev, "> Scraper started"]);
          }

          if (data.value === "done") {
            setIsRunning(false);
            setLogs((prev) => [...prev, "[SUCCESS] Scraper completed"]);
            evtSource.close();
          }
        }

        if (data.type === "error") {
          setIsRunning(false);
          setLogs((prev) => [...prev, `[ERROR] ${data.value}`]);
          evtSource.close();
        }
      } catch {
        setLogs((prev) => [...prev, event.data]);
      }
    };
  };

  const runScraper = async (name: string) => {
    setLogs((prev) => [...prev, `> Starting ${name}...`]);

    try {
      const res = await fetch(`${API_BASE}/run-scraper/${name}`);
      const data = await res.json();

      if (!res.ok) {
        setLogs((prev) => [...prev, `[ERROR] ${data.detail}`]);
        return;
      }

      connectToStream();
    } catch (err) {
      setLogs((prev) => [...prev, "[ERROR] Could not reach server"]);
    }
  };

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  return (
    <main className="container max-w-3xl mx-auto py-10 px-4 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">SMS Scraper Tools</h1>
        <Badge variant={isRunning ? "destructive" : "secondary"}>
          {isRunning ? "Running..." : "Idle"}
        </Badge>
      </div>

      <div className="grid gap-4">
        <Button
          disabled={isRunning}
          onClick={() => runScraper("cadet-quali")}
        >
          Cadet Qualification Scraper
        </Button>

        <Button
          variant="outline"
          disabled={isRunning}
          onClick={() => runScraper("cadet-event")}
        >
          Cadet Event Scraper
        </Button>

        <Button
          variant="outline"
          disabled={isRunning}
          onClick={() => runScraper("317-event")}
        >
          317 Event Scraper
        </Button>
      </div>

      <div className="mt-10">
        <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase">
          Console Output
        </h3>

        <ScrollArea className="h-64 w-full rounded-md border bg-black p-4 font-mono text-sm text-green-500">
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
          {logs.length === 0 && (
            <span className="text-gray-600">Waiting for command...</span>
          )}
        </ScrollArea>
      </div>
    </main>
  );
}