"use client";
import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { API_BASE } from "@/lib/config";
import { Info } from "lucide-react";

export default function ScraperPage() {
  const { data: session } = useSession();
  
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
    // 3. Check for token before starting
    if (!session?.id_token) {
      toast.error("You must be logged in to run scrapers.");
      setLogs((prev) => [...prev, "[ERROR] No valid session found."]);
      return;
    }

    setLogs((prev) => [...prev, `> Starting ${name}...`]);
    setIsRunning(true);

    try {
      const res = await fetch(`${API_BASE}/run-scraper/${name}`, {
        method: "GET",
        headers: {
          // 4. Pass the token to FastAPI
          "Authorization": `Bearer ${session.id_token}`,
        },
      });

      const data = await res.json();

      if (!res.ok) {
        setIsRunning(false);
        setLogs((prev) => [...prev, `[ERROR] ${data.detail || "Server error"}`]);
        return;
      }

      connectToStream();
    } catch (err) {
      setIsRunning(false);
      setLogs((prev) => [...prev, "[ERROR] Could not reach server"]);
    }
  };

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

const scraperTools = [
    {
      id: "cadet-quali",
      label: "Cadet Qualification Scraper",
      description: "Syncs cadet qualifications to the Google Sheet.",
      variant: "outline" as const,
    },
    {
      id: "cadet-event",
      label: "Cadet Event Scraper",
      description: "Extracts attendance lists for currently active SMS events.",
      variant: "outline" as const,
    },
    {
      id: "317-event",
      label: "317 Event Scraper",
      description: "Pulls full event metadata into the local database to power the JI and AO generator.",
      variant: "outline" as const,
    },
    {
      id: "medical",
      label: "Medical Scraper",
      description: "Fetches allergies and dietary requirements for cadets on the squadron nominal roll and syncs to the Google Sheet.",
      variant: "outline" as const,
    },
  ];

  return (
    <main className="container max-w-3xl mx-auto py-10 px-4 space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">SMS Scraper Tools</h1>
          <p className="text-muted-foreground mt-1">Select a tool to begin syncing data from Bader.</p>
        </div>
        <Badge variant={isRunning ? "destructive" : "secondary"} className="h-fit">
          {isRunning ? "Running..." : "Idle"}
        </Badge>
      </div>

      {/* Grid of Scraper Buttons with Info */}
      <div className="grid gap-6">
        {scraperTools.map((tool) => (
          <div key={tool.id} className="flex flex-col space-y-2 p-4 border rounded-xl bg-card hover:bg-accent/5 transition-colors">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-lg">{tool.label}</h3>
              <Button
                variant={tool.variant}
                disabled={isRunning}
                onClick={() => runScraper(tool.id)}
                className="min-w-[140px]"
              >
                Run Scraper
              </Button>
            </div>
            <div className="flex items-start gap-2 text-sm text-muted-foreground">
              <Info size={16} className="mt-0.5 shrink-0 text-blue-500" />
              <p>{tool.description}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Console Output Section */}
      <div className="mt-10 space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Console Output
          </h3>
          {logs.length > 0 && (
            <button 
              onClick={() => setLogs([])}
              className="text-xs text-muted-foreground hover:text-primary underline"
            >
              Clear Logs
            </button>
          )}
        </div>

        <ScrollArea className="h-64 w-full rounded-md border bg-black p-4 font-mono text-sm text-green-500 shadow-inner">
          {logs.map((log, i) => (
            <div key={i} className="mb-1">
              <span className="opacity-50 select-none mr-2">[{new Date().toLocaleTimeString()}]</span>
              {log}
            </div>
          ))}
          {logs.length === 0 && (
            <span className="text-gray-600 animate-pulse">_ Waiting for command...</span>
          )}
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