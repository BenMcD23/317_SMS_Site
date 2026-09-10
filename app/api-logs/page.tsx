"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { API_BASE, OWNER_EMAIL } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import { EmptyState } from "@/components/empty-state";
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

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-8 w-24" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <div className="flex flex-col gap-2 rounded-md border p-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          </div>
          <Skeleton className="h-[68vh] w-full" />
        </div>
      </div>
    );
  }

  if (!isOwner) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <EmptyState
          icon={ShieldX}
          title="Not authorised"
          description="This page is restricted to the site owner."
        >
          <Button variant="outline" asChild>
            <Link href="/">Back to dashboard</Link>
          </Button>
        </EmptyState>
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

      {error && <p className="text-destructive text-sm">{error}</p>}

      {runs === null && loading && (
        <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-9 w-full" />
            <div className="flex flex-col gap-2 rounded-md border p-2">
              {[...Array(6)].map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-72" />
            <Skeleton className="h-[64vh] w-full" />
          </div>
        </div>
      )}

      {runs !== null && runs.length === 0 && !loading && (
        <p className="text-muted-foreground text-sm">No runs recorded in the last {retentionDays} days.</p>
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
                      "hover:bg-muted/50 flex flex-col gap-1 border-b px-3 py-2.5 text-left transition-colors",
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
                    <div className="text-muted-foreground flex items-center justify-between gap-2 text-xs">
                      <span>{formatWhen(r.ran_at)}</span>
                      {r.ran_by && <span className="truncate">{r.ran_by}</span>}
                    </div>
                  </button>
                ))}
                {filteredRuns.length === 0 && (
                  <p className="text-muted-foreground px-3 py-4 text-sm">No matching runs.</p>
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Selected run logs */}
          <div className="flex flex-col gap-2">
            {selected ? (
              <>
                <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-foreground font-medium">{selected.scraper_id}</span>
                  <span>·</span>
                  <span>{formatWhen(selected.ran_at)}</span>
                  {selected.ran_by && (
                    <>
                      <span>·</span>
                      <span>{selected.ran_by}</span>
                    </>
                  )}
                  <Badge variant={selected.success ? "outline" : "destructive"} className="px-1.5 py-0">
                    {selected.success ? "Success" : "Failed"}
                  </Badge>
                </div>
                <ScrollArea className="bg-muted/30 h-[64vh] rounded-md border">
                  <pre className="p-4 font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
                    {selected.logs?.trim() ? selected.logs : "No logs were captured for this run."}
                  </pre>
                </ScrollArea>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Select a run to view its logs.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
