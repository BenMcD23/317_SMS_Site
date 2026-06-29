"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
import {
  RefreshCw,
  ShieldX,
  DatabaseBackup,
  Eye,
  RotateCcw,
} from "lucide-react";

type Backup = {
  id: string;
  name: string;
  size: number | null;
  created_at: string | null;
};

type PreviewRow = {
  table: string;
  current_rows: number | null;
  backup_rows: number | null;
  delta: number;
};

type Preview = {
  file: string;
  current_db: string;
  tables: PreviewRow[];
};

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function BackupsPage() {
  const { data: session, status } = useSession();
  const token = session?.id_token;
  const isOwner = (session?.user?.email ?? "").toLowerCase() === OWNER_EMAIL.toLowerCase();

  const [backups, setBackups] = useState<Backup[] | null>(null);
  const [retention, setRetention] = useState(14);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Preview dialog state
  const [previewFor, setPreviewFor] = useState<Backup | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // Restore confirm/run state
  const [restoreFor, setRestoreFor] = useState<Backup | null>(null);
  const [restoring, setRestoring] = useState(false);

  const authHeaders = useCallback(
    () => ({ Authorization: `Bearer ${token}` }),
    [token]
  );

  const load = useCallback(() => {
    if (!token || !isOwner) return;
    setLoading(true);
    setError(null);
    apiFetch(`${API_BASE}/backups`, { headers: authHeaders() })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Failed to load backups (${res.status})`);
        const data = await res.json();
        setRetention(data.retention ?? 14);
        setBackups(data.backups ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load backups"))
      .finally(() => setLoading(false));
  }, [token, isOwner, authHeaders]);

  useEffect(() => {
    load();
  }, [load]);

  const runBackup = useCallback(() => {
    if (!token) return;
    setRunning(true);
    apiFetch(`${API_BASE}/backups/run`, { method: "POST", headers: authHeaders() })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? `Backup failed (${res.status})`);
        }
        const data = await res.json();
        toast.success(`Backup created: ${data.name}`);
        load();
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Backup failed"))
      .finally(() => setRunning(false));
  }, [token, authHeaders, load]);

  const openPreview = useCallback(
    (backup: Backup) => {
      if (!token) return;
      setPreviewFor(backup);
      setPreview(null);
      setPreviewLoading(true);
      apiFetch(`${API_BASE}/backups/${backup.id}/preview`, { headers: authHeaders() })
        .then(async (res) => {
          if (!res.ok) {
            const body = await res.json().catch(() => null);
            throw new Error(body?.detail ?? `Preview failed (${res.status})`);
          }
          setPreview(await res.json());
        })
        .catch((e) => {
          toast.error(e instanceof Error ? e.message : "Preview failed");
          setPreviewFor(null);
        })
        .finally(() => setPreviewLoading(false));
    },
    [token, authHeaders]
  );

  const runRestore = useCallback(() => {
    if (!token || !restoreFor) return;
    setRestoring(true);
    apiFetch(`${API_BASE}/backups/${restoreFor.id}/restore`, {
      method: "POST",
      headers: authHeaders(),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? `Restore failed (${res.status})`);
        }
        const data = await res.json();
        toast.success(`Restored ${data.restored}`);
        setRestoreFor(null);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Restore failed"))
      .finally(() => setRestoring(false));
  }, [token, restoreFor, authHeaders]);

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
        title="Database Backups"
        description={`Daily PostgreSQL backups stored in Google Drive. The newest ${retention} are kept; older ones are deleted automatically.`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw size={14} className={cn(loading && "animate-spin")} /> Refresh
            </Button>
            <Button size="sm" onClick={runBackup} disabled={running}>
              <DatabaseBackup size={14} className={cn(running && "animate-pulse")} />
              {running ? "Backing up…" : "Back up now"}
            </Button>
          </div>
        }
      />

      {error && <p className="text-sm text-destructive">{error}</p>}

      {backups === null && loading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner /> Loading…
        </div>
      )}

      {backups !== null && backups.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground">
          No backups found in the Drive folder yet. Use “Back up now” to create one.
        </p>
      )}

      {backups !== null && backups.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Backup</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Size</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((b, i) => (
                <TableRow key={b.id}>
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{b.name}</span>
                      {i === 0 && (
                        <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                          latest
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{formatWhen(b.created_at)}</TableCell>
                  <TableCell className="text-muted-foreground">{formatBytes(b.size)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button variant="outline" size="sm" onClick={() => openPreview(b)}>
                        <Eye size={14} /> Preview
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setRestoreFor(b)}
                      >
                        <RotateCcw size={14} /> Restore
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Preview diff dialog */}
      <AlertDialog open={previewFor !== null} onOpenChange={(o) => !o && setPreviewFor(null)}>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Preview: {previewFor?.name}</AlertDialogTitle>
            <AlertDialogDescription>
              Row counts in this backup compared to the current database. The backup is
              restored into a throwaway database to compute this — your live data is untouched.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {previewLoading && (
            <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Spinner /> Restoring into a scratch database to compare…
            </div>
          )}

          {!previewLoading && preview && (
            <ScrollArea className="max-h-[55vh] rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Table</TableHead>
                    <TableHead className="text-right">Current</TableHead>
                    <TableHead className="text-right">Backup</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.tables.map((r) => (
                    <TableRow key={r.table}>
                      <TableCell className="font-mono text-xs">{r.table}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.current_rows ?? "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {r.backup_rows ?? "—"}
                      </TableCell>
                      <TableCell
                        className={cn(
                          "text-right tabular-nums",
                          r.delta > 0 && "text-emerald-600",
                          r.delta < 0 && "text-destructive"
                        )}
                      >
                        {r.delta > 0 ? `+${r.delta}` : r.delta}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}

          <AlertDialogFooter>
            <AlertDialogCancel>Close</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Restore confirm dialog */}
      <AlertDialog open={restoreFor !== null} onOpenChange={(o) => !o && !restoring && setRestoreFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore this backup?</AlertDialogTitle>
            <AlertDialogDescription>
              This will overwrite the <strong>current live database</strong> with the contents of{" "}
              <span className="font-mono">{restoreFor?.name}</span>. This cannot be undone. Any
              data created since this backup will be lost.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                runRestore();
              }}
              disabled={restoring}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {restoring ? "Restoring…" : "Restore now"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
