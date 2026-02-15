"use client"; // Required for interactivity (state)
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

export default function ScraperPage() {
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  const runScraper = (name: string) => {
    setIsRunning(true);
    setLogs(prev => [...prev, `> Starting ${name}...`]);
    // Mocking the behavior for now
    setTimeout(() => {
      setLogs(prev => [...prev, `[SUCCESS] ${name} completed.`]);
      setIsRunning(false);
    }, 2000);
  };

  return (
    <main className="container max-w-3xl mx-auto py-10 px-4 space-y-8">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">SMS Scraper Tools</h1>
        <Badge variant={isRunning ? "destructive" : "secondary"}>
          {isRunning ? "Running..." : "Idle"}
        </Badge>
      </div>

      <div className="grid gap-4">
        <Button disabled={isRunning} onClick={() => runScraper("Quali Scraper")}>
          Cadet Qualification Scraper
        </Button>
        <Button variant="outline" disabled={isRunning} onClick={() => runScraper("Event Scraper")}>
          Event Info Scraper
        </Button>
      </div>

      <div className="mt-10">
        <h3 className="text-sm font-semibold mb-2 text-muted-foreground uppercase">Console Output</h3>
        <ScrollArea className="h-64 w-full rounded-md border bg-black p-4 font-mono text-sm text-green-500">
          {logs.map((log, i) => (
            <div key={i}>{log}</div>
          ))}
          {logs.length === 0 && <span className="text-gray-600">Waiting for command...</span>}
        </ScrollArea>
      </div>
    </main>
  );
}