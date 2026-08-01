"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import { useApiQuery } from "@/lib/use-api-query";
import { Search, Check, X } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

type Cadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
  classification: string | null;
};

type Lesson = {
  key: string;
  name: string;
  category: string;
};

type LessonCheck = {
  lesson_key: string;
  name: string;
  has: boolean;
  completed_at: string | null;
  has_qualification: boolean;
};

type TheoryResult = Cadet & {
  lessons_check: LessonCheck[];
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

/** Group lessons by category, preserving first-seen category order. */
function groupByCategory(lessons: Lesson[]): [string, Lesson[]][] {
  const groups = new Map<string, Lesson[]>();
  for (const l of lessons) {
    if (!groups.has(l.category)) groups.set(l.category, []);
    groups.get(l.category)!.push(l);
  }
  return [...groups.entries()];
}

// ─── Lesson selector ─────────────────────────────────────────────────────────

function LessonSelector({
  lessons,
  selected,
  onChange,
}: {
  lessons: Lesson[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const groups = useMemo(() => groupByCategory(lessons), [lessons]);

  function toggle(key: string) {
    const next = new Set(selected);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange(next);
  }

  function toggleCategory(keys: string[], allSelected: boolean) {
    const next = new Set(selected);
    if (allSelected) keys.forEach((k) => next.delete(k));
    else keys.forEach((k) => next.add(k));
    onChange(next);
  }

  if (lessons.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-8" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {groups.map(([category, items]) => {
        const keys = items.map((i) => i.key);
        const allSelected = keys.every((k) => selected.has(k));
        return (
          <div key={category} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">{category}</p>
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => toggleCategory(keys, allSelected)}
              >
                {allSelected ? "Clear" : "Select all"}
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {items.map((l) => (
                <div
                  key={l.key}
                  role="button"
                  tabIndex={0}
                  onClick={() => toggle(l.key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      toggle(l.key);
                    }
                  }}
                  className={cn(
                    "flex cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted/50",
                    selected.has(l.key) && "border-primary/40 bg-primary/5"
                  )}
                >
                  <Checkbox
                    checked={selected.has(l.key)}
                    onCheckedChange={() => toggle(l.key)}
                    onClick={(e) => e.stopPropagation()}
                  />
                  <span>{l.name}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Cadet multi-select ──────────────────────────────────────────────────────

function CadetPicker({
  cadets,
  loading,
  selected,
  onChange,
}: {
  cadets: Cadet[];
  loading: boolean;
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
}) {
  const [search, setSearch] = useState("");

  const filtered = cadets.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      String(c.cin).includes(q)
    );
  });

  function toggle(cin: number) {
    const next = new Set(selected);
    if (next.has(cin)) next.delete(cin);
    else next.add(cin);
    onChange(next);
  }

  return (
    <Card className="flex flex-col gap-0 overflow-hidden py-0">
      <CardHeader className="px-4 py-3">
        <CardTitle className="text-sm">
          Select cadets
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {selected.size} selected
          </span>
        </CardTitle>
      </CardHeader>
      <div className="border-t px-3 py-2">
        <InputGroup>
          <InputGroupAddon>
            <Search className="size-4" />
          </InputGroupAddon>
          <InputGroupInput
            placeholder="Search cadets…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </InputGroup>
      </div>
      <div className="h-72 overflow-y-auto border-t">
        {loading ? (
          <div className="flex flex-col gap-1.5 p-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map((c) => (
              <div
                key={c.cin}
                role="button"
                tabIndex={0}
                onClick={() => toggle(c.cin)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle(c.cin);
                  }
                }}
                className={cn(
                  "flex w-full cursor-pointer items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/50",
                  selected.has(c.cin) && "bg-muted/30"
                )}
              >
                <Checkbox
                  checked={selected.has(c.cin)}
                  onCheckedChange={() => toggle(c.cin)}
                  onClick={(e) => e.stopPropagation()}
                />
                <span className="min-w-0 truncate font-medium">
                  {c.last_name}, {c.first_name}
                </span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{c.cin}</span>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-4 border-t px-4 py-2">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground"
          onClick={() => onChange(new Set([...selected, ...filtered.map((c) => c.cin)]))}
        >
          Select all{search ? " (filtered)" : ""}
        </button>
        {selected.size > 0 && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => onChange(new Set())}
          >
            Clear selection
          </button>
        )}
      </div>
    </Card>
  );
}

// ─── Tab 1: Record Progress ──────────────────────────────────────────────────

function RecordTab({ lessons }: { lessons: Lesson[] }) {
  const { data: session } = useSession();
  const { data: cadets = [], isLoading: loadingCadets } = useApiQuery<Cadet[]>(
    ["cadets"],
    "/cadets"
  );

  const [selectedCins, setSelectedCins] = useState<Set<number>>(new Set());
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = selectedCins.size > 0 && selectedLessons.size > 0;

  async function submit(completed: boolean) {
    if (!session?.id_token || !canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE}/cadets/theory/mark`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.id_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cadet_cins: [...selectedCins],
          lesson_keys: [...selectedLessons],
          completed,
        }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail ?? res.statusText);
      }
      const data = await res.json();
      const nCadets = selectedCins.size;
      const nLessons = selectedLessons.size;
      toast.success(
        completed
          ? `Marked ${nCadets} cadet${nCadets !== 1 ? "s" : ""} × ${nLessons} lesson${
              nLessons !== 1 ? "s" : ""
            } as theory complete.`
          : `Cleared theory progress for ${nCadets} cadet${
              nCadets !== 1 ? "s" : ""
            } × ${nLessons} lesson${nLessons !== 1 ? "s" : ""}.`,
        { description: `${data.changed} record${data.changed !== 1 ? "s" : ""} updated.` }
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <CadetPicker
          cadets={cadets}
          loading={loadingCadets}
          selected={selectedCins}
          onChange={setSelectedCins}
        />

        <Card className="py-0">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm">
              Theory lessons
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {selectedLessons.size} selected
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="border-t px-4 py-3">
            <LessonSelector
              lessons={lessons}
              selected={selectedLessons}
              onChange={setSelectedLessons}
            />
          </CardContent>
        </Card>
      </div>

      <ErrorAlert message={error} title="Could not save" />

      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => submit(true)}
          disabled={!canSubmit || saving}
          className="w-full sm:w-auto"
        >
          <Check className="size-4" />
          {saving ? "Saving…" : "Mark theory complete"}
        </Button>
        <Button
          variant="outline"
          onClick={() => submit(false)}
          disabled={!canSubmit || saving}
          className="w-full sm:w-auto"
        >
          Clear selected
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Marks the selected lessons&apos; theory as complete for every selected cadet — use this
        before the formal assessment is done so part-finished progress is visible. &ldquo;Clear
        selected&rdquo; removes those theory marks again.
      </p>
    </div>
  );
}

// ─── Tab 2: View Progress ─────────────────────────────────────────────────────

function ProgressTab({ lessons }: { lessons: Lesson[] }) {
  const { data: session } = useSession();
  const [selectedLessons, setSelectedLessons] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<TheoryResult[] | null>(null);
  const [orderedKeys, setOrderedKeys] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canRun = selectedLessons.size > 0;

  async function run() {
    if (!session?.id_token || !canRun) return;
    setLoading(true);
    setError(null);
    // Keep column order matching the catalog order.
    const keys = lessons.map((l) => l.key).filter((k) => selectedLessons.has(k));
    try {
      const res = await apiFetch(`${API_BASE}/cadets/theory/check`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.id_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ lesson_keys: keys }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.detail ?? res.statusText);
      }
      setResults(await res.json());
      setOrderedKeys(keys);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const lessonName = (key: string) =>
    lessons.find((l) => l.key === key)?.name ?? key;

  // Remove theory marks (cin, lesson) pairs — covers both fixing a mistaken mark
  // and pruning theory that's now superseded by the actual qualification. Reuses
  // the mark endpoint with completed:false, one call per lesson key.
  async function removePairs(pairs: { cin: number; key: string }[]) {
    if (!session?.id_token || pairs.length === 0) return;
    const byKey = new Map<string, number[]>();
    for (const { cin, key } of pairs) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(cin);
    }
    try {
      await Promise.all(
        [...byKey.entries()].map(([key, cins]) =>
          apiFetch(`${API_BASE}/cadets/theory/mark`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${session.id_token}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ cadet_cins: cins, lesson_keys: [key], completed: false }),
          }).then(async (res) => {
            if (!res.ok) {
              const d = await res.json().catch(() => ({}));
              throw new Error(d.detail ?? res.statusText);
            }
          })
        )
      );
      const removed = new Set(pairs.map((p) => `${p.cin}:${p.key}`));
      setResults((prev) =>
        prev
          ? prev
              .map((r) => ({
                ...r,
                lessons_check: r.lessons_check.map((l) =>
                  removed.has(`${r.cin}:${l.lesson_key}`)
                    ? { ...l, has: false, completed_at: null }
                    : l
                ),
              }))
              // drop rows that no longer have any theory recorded (matches the lookup)
              .filter((r) => r.lessons_check.some((l) => l.has))
          : prev
      );
      toast.success(`Removed ${pairs.length} theory mark${pairs.length !== 1 ? "s" : ""}.`);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Could not remove theory marks.");
    }
  }

  const qualifiedPairs = (results ?? []).flatMap((r) =>
    r.lessons_check
      .filter((l) => l.has && l.has_qualification)
      .map((l) => ({ cin: r.cin, key: l.lesson_key }))
  );

  return (
    <div className="flex flex-col gap-4">
      <Card className="py-0">
        <CardHeader className="px-4 py-3">
          <CardTitle className="text-sm">
            Lessons to find
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              {selectedLessons.size} selected
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="border-t px-4 py-3">
          <LessonSelector
            lessons={lessons}
            selected={selectedLessons}
            onChange={setSelectedLessons}
          />
        </CardContent>
      </Card>

      <Button onClick={run} disabled={!canRun || loading} className="w-full sm:w-auto">
        {loading ? "Finding…" : "Find cadets"}
      </Button>

      <ErrorAlert message={error} title="Lookup failed" />

      {results !== null && (
        <>
          {qualifiedPairs.length > 0 && (
            <div className="flex flex-col gap-1.5 rounded-md border border-blue-200 bg-blue-50/50 p-3 sm:flex-row sm:items-center sm:justify-between dark:border-blue-900 dark:bg-blue-950/40">
              <p className="text-sm text-muted-foreground">
                {qualifiedPairs.length} theory mark
                {qualifiedPairs.length !== 1 ? "s are" : " is"} now covered by the actual
                qualification.
              </p>
              <Button
                variant="outline"
                size="sm"
                className="w-full sm:w-auto"
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove ${qualifiedPairs.length} theory mark${
                        qualifiedPairs.length !== 1 ? "s" : ""
                      } for cadets who now hold the qualification?`
                    )
                  )
                    removePairs(qualifiedPairs);
                }}
              >
                <X className="size-4" />
                Remove qualified
              </Button>
            </div>
          )}
          <TheoryResultsTable
            results={results}
            orderedKeys={orderedKeys}
            lessonName={lessonName}
            onRemove={(cin, key) => removePairs([{ cin, key }])}
          />
        </>
      )}
    </div>
  );
}

/** Theory badge that doubles as its own remove control (confirm dialog on click).
 *  Hover swaps the tick for an ✕ so the removable affordance reads without an
 *  extra button breaking the column's alignment. */
function RemovableTheoryBadge({
  description,
  onConfirm,
}: {
  description: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button
          type="button"
          title="Remove this theory mark"
          className="group/rm inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 transition-colors hover:border-destructive/50 hover:bg-destructive/10 hover:text-destructive dark:border-green-900 dark:bg-green-950 dark:text-green-400"
        >
          <Check className="size-3 group-hover/rm:hidden" />
          <X className="hidden size-3 group-hover/rm:block" />
          Theory
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove theory mark?</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Remove
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function TheoryResultsTable({
  results,
  orderedKeys,
  lessonName,
  onRemove,
}: {
  results: TheoryResult[];
  orderedKeys: string[];
  lessonName: (key: string) => string;
  onRemove: (cin: number, key: string) => void;
}) {
  if (results.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No cadets have completed the theory for any of the selected lessons yet.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-40 pl-4">Cadet</TableHead>
            <TableHead className="min-w-28">Classification</TableHead>
            {orderedKeys.map((k) => (
              <TableHead key={k} className="min-w-28 text-center">
                {lessonName(k)}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((r) => (
            <TableRow key={r.cin}>
              <TableCell className="pl-4">
                <p className="font-medium">
                  {r.last_name}, {r.first_name}
                </p>
                <p className="text-xs text-muted-foreground">CIN {r.cin}</p>
              </TableCell>
              <TableCell>
                <span className="text-sm">{r.classification || "Junior Cadet"}</span>
              </TableCell>
              {orderedKeys.map((k) => {
                const check = r.lessons_check.find((c) => c.lesson_key === k);
                return (
                  <TableCell key={k} className="text-center">
                    <div className="flex flex-col items-center gap-1">
                      {check?.has ? (
                        <div className="flex flex-col items-center gap-0.5">
                          <RemovableTheoryBadge
                            description={`Remove the theory mark for ${r.last_name}, ${r.first_name} on ${lessonName(k)}? You can re-add it later from Record Progress.`}
                            onConfirm={() => onRemove(r.cin, k)}
                          />
                          {check.completed_at && (
                            <span className="text-[10px] text-muted-foreground">
                              {formatDate(check.completed_at, "")}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                      {check?.has_qualification ? (
                        <Badge
                          variant="outline"
                          className="border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-400"
                        >
                          <Check className="size-3" />
                          Qualified
                        </Badge>
                      ) : (
                        <span className="text-[10px] text-muted-foreground">No qual</span>
                      )}
                    </div>
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function TheoryProgressPage() {
  const { data: lessons = [] } = useApiQuery<Lesson[]>(
    ["theory-lessons"],
    "/cadets/theory/lessons"
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Theory Progress"
        description="Record when cadets have completed a lesson's theory before the assessment, and see who has done what"
      />
      <Tabs defaultValue="record">
        <TabsList className="max-w-full justify-start overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="record">Record Progress</TabsTrigger>
          <TabsTrigger value="view">View Progress</TabsTrigger>
        </TabsList>
        <TabsContent value="record" className="mt-4">
          <RecordTab lessons={lessons} />
        </TabsContent>
        <TabsContent value="view" className="mt-4">
          <ProgressTab lessons={lessons} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
