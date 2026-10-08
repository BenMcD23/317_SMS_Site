"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { RefreshCw, ShieldX } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ListSkeleton } from "@/components/list-skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { apiFetch, errorDetail } from "@/lib/api-fetch";
import { API_BASE, OWNER_EMAIL } from "@/lib/config";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/utils";

type RouteUsage = {
  method: string;
  route: string;
  calls: number;
  users: number;
  roles: Record<string, number>;
  last_used: string;
};

type UserUsage = {
  email: string;
  role: string;
  calls: number;
  routes: number;
  last_used: string;
};

type Usage = {
  days: number;
  since: string;
  total_calls: number;
  routes: RouteUsage[];
  users: UserUsage[];
  unused: { method: string; route: string }[];
};

const WINDOWS = ["7", "30", "90", "180"];

function MethodBadge({ method }: { method: string }) {
  return (
    <Badge variant={method === "GET" ? "outline" : "secondary"} className="px-1.5 py-0 font-mono text-[10px]">
      {method}
    </Badge>
  );
}

export default function UsagePage() {
  const { data: session, status } = useSession();
  const token = session?.id_token;
  const isOwner = (session?.user?.email ?? "").toLowerCase() === OWNER_EMAIL.toLowerCase();

  const [days, setDays] = useState("30");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");

  const load = useCallback(() => {
    if (!token || !isOwner) return;
    setLoading(true);
    setError(null);
    apiFetch(`${API_BASE}/usage?days=${days}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(errorDetail(body) ?? `Failed to load usage (${res.status})`);
        setUsage(body);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load usage"))
      .finally(() => setLoading(false));
  }, [token, isOwner, days]);

  useEffect(() => {
    load();
  }, [load]);

  const q = filter.trim().toLowerCase();
  const matches = useCallback(
    (...fields: string[]) => !q || fields.some((f) => f.toLowerCase().includes(q)),
    [q]
  );
  const routes = useMemo(
    () => (usage?.routes ?? []).filter((r) => matches(r.route, r.method)),
    [usage, matches]
  );
  const users = useMemo(() => (usage?.users ?? []).filter((u) => matches(u.email, u.role)), [usage, matches]);
  const unused = useMemo(
    () => (usage?.unused ?? []).filter((r) => matches(r.route, r.method)),
    [usage, matches]
  );

  if (status === "loading") {
    return (
      <div className="flex flex-col gap-6">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-96" />
        </div>
        <ListSkeleton rows={6} />
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

  const endpointCount = (usage?.routes.length ?? 0) + (usage?.unused.length ?? 0);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-16">
      <PageHeader
        title="Usage"
        description="Which API endpoints people actually call, and which nobody does. Counts successful calls from this site and the cadet portal."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={days}
              onValueChange={(v) => v && setDays(v)}
              aria-label="Time window"
            >
              {WINDOWS.map((d) => (
                <ToggleGroupItem key={d} value={d} aria-label={`Last ${d} days`}>
                  {d}d
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={cn(loading && "animate-spin")} /> Refresh
            </Button>
          </div>
        }
      />

      {error && <p className="text-destructive text-sm">{error}</p>}

      {usage === null && loading && <ListSkeleton rows={6} />}

      {usage && (
        <>
          <dl className="grid grid-cols-3 gap-4">
            {[
              ["Calls", usage.total_calls],
              ["People", usage.users.length],
              ["Endpoints used", `${usage.routes.length} / ${endpointCount}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border p-4">
                <dt className="text-muted-foreground text-xs">{label}</dt>
                <dd className="text-2xl font-semibold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>

          <Input
            placeholder="Filter by endpoint, person or role…"
            aria-label="Filter"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-9 max-w-sm"
          />

          <Tabs defaultValue="endpoints">
            <TabsList>
              <TabsTrigger value="endpoints">Endpoints ({usage.routes.length})</TabsTrigger>
              <TabsTrigger value="people">People ({usage.users.length})</TabsTrigger>
              <TabsTrigger value="unused">Unused ({usage.unused.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="endpoints">
              {routes.length === 0 ? (
                <p className="text-muted-foreground py-4 text-sm">
                  No calls recorded in the last {usage.days} days.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Endpoint</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">People</TableHead>
                      <TableHead>By role</TableHead>
                      <TableHead>Last used</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {routes.map((r) => (
                      <TableRow key={`${r.method} ${r.route}`}>
                        <TableCell className="font-mono text-xs">
                          <MethodBadge method={r.method} /> {r.route}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{r.calls}</TableCell>
                        <TableCell className="text-right tabular-nums">{r.users}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {Object.entries(r.roles)
                            .sort(([, a], [, b]) => b - a)
                            .map(([role, n]) => `${role} ${n}`)
                            .join(" · ")}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatTimestamp(r.last_used)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="people">
              {users.length === 0 ? (
                <p className="text-muted-foreground py-4 text-sm">
                  No one signed in has used the API in this window.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Person</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Endpoints</TableHead>
                      <TableHead>Last seen</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((u) => (
                      <TableRow key={u.email}>
                        <TableCell>{u.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{u.role}</Badge>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{u.calls}</TableCell>
                        <TableCell className="text-right tabular-nums">{u.routes}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">
                          {formatTimestamp(u.last_used)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="unused">
              {unused.length === 0 ? (
                <p className="text-muted-foreground py-4 text-sm">
                  {usage.unused.length ? "No matches." : "Every endpoint was used in this window."}
                </p>
              ) : (
                <ul className="divide-y rounded-md border">
                  {unused.map((r) => (
                    <li key={`${r.method} ${r.route}`} className="px-3 py-2 font-mono text-xs">
                      <MethodBadge method={r.method} /> {r.route}
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
