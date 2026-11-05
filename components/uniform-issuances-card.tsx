"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Check, History, Loader2, Pencil, Shirt, Undo2, X } from "lucide-react";

import { useConfirm } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { apiFetch, errorDetail } from "@/lib/api-fetch";
import { formatDate, todayLocal } from "@/lib/format";
import { useReference } from "@/lib/reference";
import { useApiQuery, useSetApiQueryData } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

type Issuance = {
  id: number;
  itemCategory: string;
  lastGiven: string;
  sizeGiven: string | null;
};

/** One recorded give, from the API's issuance history (newest first). */
export type IssuanceHistoryEntry = {
  id: number;
  itemCategory: string;
  lastGiven: string;
  sizeGiven: string | null;
  recordedAt: string;
  recordedBy: string | null;
  orderItemId: string | null;
  undoneAt: string | null;
  undoneBy: string | null;
  /** The give the "last issued" record is showing: the one an undo takes back. */
  current: boolean;
};

interface Props {
  /** GET + POST endpoint (e.g. /api/stores/issuances/123 or /api/stores/issuances/user/5) */
  baseUrl: string;
}

const NO_ISSUANCES: Issuance[] = [];
const NO_HISTORY: IssuanceHistoryEntry[] = [];

function sizeAndDate(entry: { sizeGiven: string | null; lastGiven: string }) {
  return entry.sizeGiven
    ? `size ${entry.sizeGiven}, ${formatDate(entry.lastGiven)}`
    : formatDate(entry.lastGiven);
}

export function UniformIssuancesCard({ baseUrl }: Props) {
  const { issuanceCategories } = useReference();
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const issuancesKey = ["issuances", baseUrl];
  const historyKey = ["issuance-history", baseUrl];
  const query = useApiQuery<Issuance[]>(issuancesKey, baseUrl);
  const issuances = Array.isArray(query.data) ? query.data : NO_ISSUANCES;
  const loading = query.isPending && !query.error;
  const setCached = useSetApiQueryData<Issuance[]>(issuancesKey);
  const setIssuances = (update: (prev: Issuance[]) => Issuance[]) => setCached((prev) => update(prev ?? []));
  // A failed save or undo; a failed load is the query's error. Both show, so
  // a lookup that failed never reads as "nothing issued".
  const [actionError, setError] = useState<string | null>(null);
  const error = actionError ?? query.error?.message ?? null;

  // History loads only once opened: most visits just want the current sizes.
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyQuery = useApiQuery<IssuanceHistoryEntry[]>(historyKey, `${baseUrl}/history`, {
    enabled: historyOpen,
  });
  const history = Array.isArray(historyQuery.data) ? historyQuery.data : NO_HISTORY;

  const [editing, setEditing] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editSize, setEditSize] = useState("");
  const [saving, setSaving] = useState(false);

  function startEdit(category: string) {
    const record = issuances.find((i) => i.itemCategory === category);
    setEditing(category);
    setEditDate(record ? record.lastGiven.slice(0, 10) : todayLocal());
    setEditSize(record?.sizeGiven ?? "");
    setError(null);
  }

  // Every write adds to or changes the history, so refetch it if it's loaded.
  const refreshHistory = () => queryClient.invalidateQueries({ queryKey: historyKey });

  async function save(category: string) {
    if (!editDate) return;
    setSaving(true);
    try {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ itemCategory: category, sizeGiven: editSize || null, lastGiven: editDate }],
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated: Issuance[] = await res.json();
      setIssuances((prev) => {
        const next = prev.filter((i) => !updated.some((u) => u.itemCategory === i.itemCategory));
        return [...next, ...updated];
      });
      setEditing(null);
      refreshHistory();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function undoLast(record: Issuance) {
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/stores/issuances/item/${record.id}/undo`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorDetail(data) ?? "Couldn't undo that.");
      const restored: Issuance | null = data?.issuance ?? null;
      setIssuances((prev) => [
        ...prev.filter((i) => i.itemCategory !== record.itemCategory),
        ...(restored ? [restored] : []),
      ]);
      setEditing(null);
      refreshHistory();
      // A give made against an order puts that order item back to waiting.
      queryClient.invalidateQueries({ queryKey: ["stores", "orders"] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't undo that.");
    } finally {
      setSaving(false);
    }
  }

  function askUndo(record: Issuance) {
    confirm(
      `Undo the last ${record.itemCategory} given (${sizeAndDate(record)})? It goes back to the one before, and stays in the history as undone.`,
      () => undoLast(record)
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Shirt className="text-muted-foreground h-4 w-4" />
          Uniform Issuances
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {error && <p className="text-destructive px-6 py-2 text-sm">{error}</p>}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="text-muted-foreground h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="divide-y">
            {issuanceCategories.map((category) => {
              const record = issuances.find((i) => i.itemCategory === category);
              const isEditing = editing === category;

              return (
                <div key={category} className="px-6 py-3">
                  {isEditing ? (
                    <div className="space-y-2">
                      <span className="text-sm font-medium">{category}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="h-8 w-full text-sm sm:w-40"
                          aria-label={`${category} date given`}
                        />
                        <Input
                          placeholder="Size (optional)"
                          value={editSize}
                          onChange={(e) => setEditSize(e.target.value)}
                          className="h-8 w-full text-sm sm:w-32"
                          aria-label={`${category} size given`}
                        />
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-success hover:text-success h-8 w-8"
                            onClick={() => save(category)}
                            disabled={saving || !editDate}
                            aria-label={`Save ${category}`}
                          >
                            {saving ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-muted-foreground h-8 w-8"
                            onClick={() => setEditing(null)}
                            disabled={saving}
                            aria-label="Cancel"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          {record && (
                            <Button
                              variant="ghost"
                              className="text-muted-foreground h-8 px-2 text-xs"
                              onClick={() => askUndo(record)}
                              disabled={saving}
                            >
                              <Undo2 data-icon="inline-start" />
                              Undo last given
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-medium">{category}</span>
                      <div className="flex items-center gap-1">
                        {record ? (
                          <div className="mr-1 text-right">
                            <p className="text-muted-foreground text-sm">{formatDate(record.lastGiven)}</p>
                            {record.sizeGiven && (
                              <p className="text-muted-foreground text-xs">Size: {record.sizeGiven}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground mr-1 text-xs italic">N/A</span>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-muted-foreground hover:text-foreground size-8"
                          onClick={() => startEdit(category)}
                          aria-label={`Edit ${category}`}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            <div>
              <Button
                variant="ghost"
                className="h-11 w-full justify-between rounded-none px-6 text-sm font-medium"
                onClick={() => setHistoryOpen((open) => !open)}
                aria-expanded={historyOpen}
              >
                <span className="flex items-center gap-2">
                  <History className="text-muted-foreground size-4" />
                  History
                </span>
                <ChevronDown className={cn("size-4 transition-transform", historyOpen && "rotate-180")} />
              </Button>
              {historyOpen && (
                <IssuanceHistoryList
                  entries={history}
                  loading={historyQuery.isPending && !historyQuery.error}
                  error={historyQuery.error?.message ?? null}
                  busy={saving}
                  onUndo={(entry) => {
                    const record = issuances.find((i) => i.itemCategory === entry.itemCategory);
                    if (record) askUndo(record);
                  }}
                />
              )}
            </div>
          </div>
        )}
      </CardContent>
      {confirmDialog}
    </Card>
  );
}

function IssuanceHistoryList({
  entries,
  loading,
  error,
  busy,
  onUndo,
}: {
  entries: IssuanceHistoryEntry[];
  loading: boolean;
  error: string | null;
  busy: boolean;
  onUndo: (entry: IssuanceHistoryEntry) => void;
}) {
  if (error) return <p className="text-destructive px-6 pb-3 text-sm">{error}</p>;
  if (loading) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 px-6 pb-3 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading history…
      </p>
    );
  }
  if (entries.length === 0) {
    return <p className="text-muted-foreground px-6 pb-3 text-sm">Nothing recorded as given yet.</p>;
  }
  return (
    <ul className="divide-y border-t" aria-label="Issuance history">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-6 py-2.5"
        >
          <div className="min-w-0 text-sm">
            <p className={cn("font-medium", entry.undoneAt && "text-muted-foreground line-through")}>
              {entry.itemCategory}
              {entry.sizeGiven && <span className="font-normal"> · {entry.sizeGiven}</span>}
              <span className="text-muted-foreground font-normal"> · {formatDate(entry.lastGiven)}</span>
            </p>
            <p className="text-muted-foreground text-xs">
              {entry.recordedBy ? `By ${entry.recordedBy}` : "Recorded before history was kept"}
              {entry.orderItemId && " · from an order"}
              {entry.undoneAt &&
                ` · undone${entry.undoneBy ? ` by ${entry.undoneBy}` : ""} ${formatDate(entry.undoneAt)}`}
            </p>
          </div>
          {entry.current && (
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => onUndo(entry)}
              disabled={busy}
              aria-label={`Undo last ${entry.itemCategory} given`}
            >
              <Undo2 data-icon="inline-start" />
              Undo
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
