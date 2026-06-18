"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { cn } from "@/lib/utils";
import { API_BASE, OWNER_EMAIL } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import { RefreshCw, ShieldX } from "lucide-react";

type ApiRun = {
  id: number;
  scraper_id: string;
  ran_at: string;
  success: boolean;
  ran_by: string | null;
  logs: string;
};

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ApiLogsPage() {
  const { data: session, status } = useSession();
  const token = session?.id_token;
  const isOwner = (session?.user?.email ?? "").toLowerCase() === OWNER_EMAIL.toLowerCase();

  const [runs, setRuns] = useState<ApiRun[] | null>(null);
  const [retentionDays, setRetentionDays] = useState(7);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(() => {
    if (!token || !isOwner) return;
    setLoading(true);
    setError(null);
    apiFetch(`${API_BASE}/api-logs`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load logs (${res.status})`);
        const data = await res.json();
        setRetentionDays(data.retention_days ?? 7);
        setRuns(data.runs ?? []);
        setSelectedId((prev) => prev ?? data.runs?.[0]?.id ?? null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load logs"))
      .finally(() => setLoading(false));
  }, [token, isOwner]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredRuns = useMemo(() => {
    if (!runs) return [];
    const q = filter.trim().toLowerCase();
    if (!q) return runs;
    return runs.filter(
      (r) =>
        r.scraper_id.toLowerCase().includes(q) ||
        (r.ran_by ?? "").toLowerCase().includes(q) ||
        r.logs.toLowerCase().includes(q)
    );
  }, [runs, filter]);

  const selected = runs?.find((r) => r.id === selectedId) ?? null;

  // ── Access control (defence in depth — the API also enforces owner-only) ──
  if (status === "loading") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShieldX />
            </EmptyMedia>
            <EmptyTitle>Not authorised</EmptyTitle>
            <EmptyDescription>This page is restricted to the site owner.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" asChild>
              <Link href="/">Back to dashboard</Link>
            </Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="API Logs"
        description={`Every scraper/job run from the last ${retentionDays} days. Records are deleted automatically after ${retentionDays} days.`}
        actions={
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw size={14} className={cn(loading && "animate-spin")} /> Refresh
          </Button>
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {runs === null && loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Loading…
        </div>
      )}

      {runs !== null && runs.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">No runs recorded in the last {retentionDays} days.</p>
      )}

      {runs !== null && runs.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          {/* Run list */}
          <div className="flex flex-col gap-2">
            <Input
              placeholder="Filter by scraper, user, or text…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="h-9"
            />
            <ScrollArea className="h-[68vh] rounded-md border">
              <div className="flex flex-col">
                {filteredRuns.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setSelectedId(r.id)}
                    className={cn(
                      "flex flex-col gap-1 border-b px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                      r.id === selectedId && "bg-muted"
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{r.scraper_id}</span>
                      <Badge
                        variant={r.success ? "outline" : "destructive"}
                        className="shrink-0 px-1.5 py-0 text-[10px]"
                      >
                        {r.success ? "ok" : "failed"}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>{formatWhen(r.ran_at)}</span>
                      {r.ran_by && <span className="truncate">{r.ran_by}</span>}
                    </div>
                  </button>
                ))}
                {filteredRuns.length === 0 && (
                  <p className="px-3 py-4 text-sm text-muted-foreground">No matching runs.</p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Selected run logs */}
          <div className="flex flex-col gap-2">
            {selected ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">{selected.scraper_id}</span>
                  <span>·</span>
                  <span>{formatWhen(selected.ran_at)}</span>
                  {selected.ran_by && (
                    <>
                      <span>·</span>
                      <span>{selected.ran_by}</span>
                    </>
                  )}
                  <Badge
                    variant={selected.success ? "outline" : "destructive"}
                    className="px-1.5 py-0"
                  >
                    {selected.success ? "Success" : "Failed"}
                  </Badge>
                </div>
                <ScrollArea className="h-[64vh] rounded-md border bg-muted/30">
                  <pre className="whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed">
                    {selected.logs?.trim() ? selected.logs : "No logs were captured for this run."}
                  </pre>
                </ScrollArea>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Select a run to view its logs.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
