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
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { cn } from "@/lib/utils";
import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import { useApiQuery } from "@/lib/use-api-query";
import { Search, Check } from "lucide-react";

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

function formatDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
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
                <span className="font-medium">
                  {c.last_name}, {c.first_name}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">{c.cin}</span>
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
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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
        <TheoryResultsTable
          results={results}
          orderedKeys={orderedKeys}
          lessonName={lessonName}
        />
      )}
    </div>
  );
}

function TheoryResultsTable({
  results,
  orderedKeys,
  lessonName,
}: {
  results: TheoryResult[];
  orderedKeys: string[];
  lessonName: (key: string) => string;
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
                    {check?.has ? (
                      <div className="flex flex-col items-center gap-0.5">
                        <Badge
                          variant="outline"
                          className="border-green-200 bg-green-50 text-green-700"
                        >
                          <Check className="size-3" />
                          Theory
                        </Badge>
                        {check.completed_at && (
                          <span className="text-[10px] text-muted-foreground">
                            {formatDate(check.completed_at)}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
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
