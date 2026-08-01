"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { useApiQuery } from "@/lib/use-api-query";
import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { flightBadgeClass } from "@/lib/cadet-format";
import { toast } from "sonner";
import {
  Search,
  ChevronUp,
  ChevronDown,
  Shirt,
  Sparkles,
  Loader2,
  ThumbsDown,
  ThumbsUp,
  FileDown,
  CalendarDays,
  Trash2,
} from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
type Note = { region: string; text: string };
type TimelineEntry = {
  date: string;
  score: number | null;
  absent: boolean;
  awol: boolean;
  faults: Note[];
  positives: Note[];
};
type CadetHistory = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
  timeline: TimelineEntry[];
  present_count: number;
  attendance_avg: number;
  score_avg: number;
  overall: number;
  attendance_rank: number;
  score_rank: number;
  overall_rank: number;
  overall_rank_label: string;
};
type HistoryResp = {
  inspection_count: number;
  dates: string[];
  cadets: CadetHistory[];
};

type SheetSummary = {
  id: number;
  date: string;
  submitted_by: string | null;
  submitted_at: string | null;
  cadet_count: number;
  present: number;
};
type SheetCadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string;
  score: number | null;
  absent: boolean;
  awol: boolean;
  faults: Note[];
  positives: Note[];
};
type FlightGroup = {
  flight: string;
  present: number;
  awol: number;
  penalty: number;
  total: number;
  average: number;
  cadets: SheetCadet[];
};
type SheetDetail = {
  id: number;
  date: string;
  submitted_by: string | null;
  submitted_at: string | null;
  flights: FlightGroup[];
};

// Clickable bands on the marking page — reused here to place fault markers.
const REGIONS: Record<string, { top: number; height: number }> = {
  "Beret / Headdress": { top: 0, height: 14 },
  "Hair / Face": { top: 14, height: 6 },
  "Jumper / Shirt / Tie": { top: 20, height: 27 },
  Trousers: { top: 47, height: 42 },
  Shoes: { top: 89, height: 11 },
};

type NumberedNote = { n: number; type: "fault" | "positive"; region: string; text: string };

function numberComments(faults: Note[], positives: Note[]): NumberedNote[] {
  const out: NumberedNote[] = [];
  let n = 1;
  for (const f of faults) out.push({ n: n++, type: "fault", region: f.region, text: f.text });
  for (const p of positives) out.push({ n: n++, type: "positive", region: p.region, text: p.text });
  return out;
}

// ─── Read-only figure with numbered fault/positive markers ────────────────────
function InspectionFigureView({ notes }: { notes: NumberedNote[] }) {
  const byRegion = new Map<string, NumberedNote[]>();
  for (const note of notes) {
    const r = REGIONS[note.region] ? note.region : "Trousers";
    if (!byRegion.has(r)) byRegion.set(r, []);
    byRegion.get(r)!.push(note);
  }

  return (
    <div className="relative w-[80px] shrink-0 select-none" style={{ aspectRatio: "512 / 1536" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/inspection-figure.png"
        alt="Cadet in uniform"
        className="h-full w-full object-contain dark:opacity-90 dark:invert"
        draggable={false}
      />
      {[...byRegion.entries()].map(([region, items]) => {
        const band = REGIONS[region];
        return items.map((note, j) => {
          const top = band.top + (band.height * (j + 1)) / (items.length + 1);
          return (
            <span
              key={note.n}
              className={cn(
                "absolute left-1/2 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[9px] font-bold text-white ring-2 ring-background",
                note.type === "fault" ? "bg-destructive" : "bg-green-600"
              )}
              style={{ top: `${top}%` }}
              title={note.text}
            >
              {note.n}
            </span>
          );
        });
      })}
    </div>
  );
}

// ─── One cadet row in the per-date inspection view ────────────────────────────
function HistoryCadetCard({ cadet }: { cadet: SheetCadet }) {
  const notes = numberComments(cadet.faults, cadet.positives);

  return (
    <Card>
      <CardContent className="flex gap-3 p-3">
        <InspectionFigureView notes={notes} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">
                {cadet.last_name}, {cadet.first_name}
              </div>
              {cadet.rank && (
                <div className="text-xs text-muted-foreground">{cadet.rank}</div>
              )}
            </div>
            {cadet.absent ? (
              <Badge variant={cadet.awol ? "destructive" : "secondary"}>
                {cadet.awol ? "AWOL" : "Absent"}
              </Badge>
            ) : (
              <Badge variant="outline" className="tabular-nums">
                {cadet.score != null ? `${cadet.score}/10` : "–/10"}
              </Badge>
            )}
          </div>

          {notes.length === 0 ? (
            !cadet.absent && (
              <p className="mt-2 text-xs text-muted-foreground">No faults logged.</p>
            )
          ) : (
            <ul className="mt-2 flex flex-col gap-1">
              {notes.map((note) => (
                <li key={note.n} className="flex items-start gap-1.5 text-xs">
                  <span
                    className={cn(
                      "mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-white",
                      note.type === "fault" ? "bg-destructive" : "bg-green-600"
                    )}
                  >
                    {note.n}
                  </span>
                  <span className="min-w-0 flex-1 break-words">
                    <span className="text-muted-foreground">{note.region}:</span> {note.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Compact AWOL / absent lists shown under a flight's present cadets ─────────
function AbsenceLists({ awol, absent }: { awol: SheetCadet[]; absent: SheetCadet[] }) {
  const column = (title: string, people: SheetCadet[], tone: "awol" | "absent") => (
    <div className="overflow-hidden rounded-md border">
      <div
        className={cn(
          "flex items-center justify-between px-3 py-1.5 text-xs font-semibold",
          tone === "awol"
            ? "bg-destructive/10 text-destructive"
            : "bg-muted text-muted-foreground"
        )}
      >
        <span>{title}</span>
        <span className="tabular-nums">{people.length}</span>
      </div>
      {people.length === 0 ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">None</p>
      ) : (
        <ul className="divide-y">
          {people.map((c) => (
            <li key={c.cin} className="px-3 py-1.5 text-sm">
              {c.rank ? `${c.rank} ` : ""}
              {c.last_name}, {c.first_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {column("AWOL", awol, "awol")}
      {column("Absent (excused)", absent, "absent")}
    </div>
  );
}

// ─── Inspection History tab (browse by date + PDF export) ─────────────────────
function HistoryTab() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const { data: sheets = [], isLoading: sheetsLoading } = useApiQuery<SheetSummary[]>(
    ["inspection-sheets"],
    "/inspections/sheets"
  );

  const [sheetId, setSheetId] = useState<number | null>(null);
  useEffect(() => {
    if (sheetId == null && sheets.length) setSheetId(sheets[0].id);
  }, [sheets, sheetId]);

  const { data: detail, isLoading: detailLoading } = useApiQuery<SheetDetail>(
    ["inspection-sheet", sheetId],
    `/inspections/sheets/${sheetId}`,
    { enabled: sheetId != null }
  );

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  async function deleteSheet() {
    if (sheetId == null || !session?.id_token) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`${API_BASE}/inspections/sheets/${sheetId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.id_token}` },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.detail ?? res.statusText);
      }
      toast.success("Inspection deleted");
      setConfirmDelete(false);
      setSheetId(null);
      // Leaderboard/history aggregates change too — refresh everything.
      queryClient.invalidateQueries({ queryKey: ["inspection-sheets"] });
      queryClient.invalidateQueries({ queryKey: ["inspection-history"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  const selectedSheet = sheets.find((s) => s.id === sheetId) ?? null;

  const [exporting, setExporting] = useState(false);
  async function exportPdf() {
    if (sheetId == null || !session?.id_token) return;
    setExporting(true);
    try {
      const res = await apiFetch(`${API_BASE}/inspections/sheets/${sheetId}/pdf`, {
        headers: { Authorization: `Bearer ${session.id_token}` },
      });
      if (!res.ok) throw new Error(res.statusText);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `inspection-${detail?.date ?? sheetId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }

  if (sheetsLoading) return <Skeleton className="h-96 w-full" />;
  if (sheets.length === 0)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CalendarDays />
          </EmptyMedia>
          <EmptyTitle>No inspections recorded</EmptyTitle>
          <EmptyDescription>
            Submit an inspection marking sheet and it will show up here to browse and export.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={sheetId != null ? String(sheetId) : undefined}
          onValueChange={(v) => setSheetId(Number(v))}
        >
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Choose an inspection date" />
          </SelectTrigger>
          <SelectContent>
            {sheets.map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                {s.date} · {s.present}/{s.cadet_count} present
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" onClick={exportPdf} disabled={exporting || sheetId == null}>
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />}
          Export PDF
        </Button>
        <Button
          variant="outline"
          className="text-destructive hover:text-destructive"
          onClick={() => setConfirmDelete(true)}
          disabled={sheetId == null}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </div>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(o) => !o && !deleting && setConfirmDelete(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this inspection?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes the inspection from{" "}
              <strong>{selectedSheet?.date}</strong>
              {selectedSheet ? ` (${selectedSheet.cadet_count} cadets)` : ""}. All scores and
              comments for this date will be lost and it cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                deleteSheet();
              }}
              disabled={deleting}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleting ? "Deleting…" : "Delete inspection"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {detailLoading || !detail ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="flex flex-col gap-6">
          {detail.flights.map((fl) => {
            const present = fl.cadets.filter((c) => !c.absent);
            const awol = fl.cadets.filter((c) => c.awol);
            const absent = fl.cadets.filter((c) => c.absent && !c.awol);
            return (
              <div key={fl.flight}>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-semibold">{fl.flight} Flight</h3>
                  <Badge variant="secondary">{fl.present} present</Badge>
                  {fl.awol > 0 && (
                    <Badge variant="destructive" className="tabular-nums">
                      {fl.awol} AWOL · −{fl.penalty}
                    </Badge>
                  )}
                  <Badge variant="outline" className="tabular-nums">
                    avg {fl.average.toFixed(2)}
                  </Badge>
                  <Badge variant="outline" className="tabular-nums">
                    total {fl.total.toFixed(0)}
                  </Badge>
                </div>
                {present.length > 0 && (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {present.map((c) => (
                      <HistoryCadetCard key={c.cin} cadet={c} />
                    ))}
                  </div>
                )}
                {(awol.length > 0 || absent.length > 0) && (
                  <AbsenceLists awol={awol} absent={absent} />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Leaderboard sorting ──────────────────────────────────────────────────────
type SortKey =
  | "name"
  | "attendance_avg"
  | "score_avg"
  | "overall"
  | "overall_rank";

function SortHead({
  label,
  col,
  sort,
  dir,
  onSort,
  className,
}: {
  label: string;
  col: SortKey;
  sort: SortKey;
  dir: "asc" | "desc";
  onSort: (c: SortKey) => void;
  className?: string;
}) {
  const active = sort === col;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onSort(col)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground"
        )}
      >
        {label}
        {active &&
          (dir === "asc" ? (
            <ChevronUp className="h-3.5 w-3.5" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" />
          ))}
      </button>
    </TableHead>
  );
}

// ─── Tiny markdown renderer for the AI summary ────────────────────────────────
function AiMarkdown({ text }: { text: string }) {
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flush = (key: string) => {
    if (bullets.length) {
      blocks.push(
        <ul key={key} className="ml-4 list-disc space-y-1 text-sm">
          {bullets.map((b, i) => (
            <li key={i}>{b}</li>
          ))}
        </ul>
      );
      bullets = [];
    }
  };

  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      flush(`u-${i}`);
      return;
    }
    if (line.startsWith("###")) {
      flush(`u-${i}`);
      blocks.push(
        <h4 key={i} className="mt-3 text-sm font-semibold first:mt-0">
          {line.replace(/^#+\s*/, "")}
        </h4>
      );
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      bullets.push(line.slice(2));
    } else {
      flush(`u-${i}`);
      blocks.push(
        <p key={i} className="text-sm text-muted-foreground">
          {line}
        </p>
      );
    }
  });
  flush("u-end");

  return <div className="space-y-2">{blocks}</div>;
}

function faultTally(timeline: TimelineEntry[]) {
  const byRegion = new Map<string, number>();
  for (const e of timeline) {
    for (const f of e.faults) {
      const r = f.region || "General";
      byRegion.set(r, (byRegion.get(r) ?? 0) + 1);
    }
  }
  return [...byRegion.entries()].sort((a, b) => b[1] - a[1]);
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

// ─── Per-cadet detail dialog (leaderboard) ────────────────────────────────────
function CadetDetail({ cadet }: { cadet: CadetHistory }) {
  const { data: session } = useSession();
  const [ai, setAi] = useState<{
    loading: boolean;
    text: string | null;
    error: string | null;
  }>({ loading: false, text: null, error: null });

  const chartData = cadet.timeline.map((e) => ({
    date: e.date.slice(5),
    score: e.absent ? null : e.score,
  }));

  const faults = faultTally(cadet.timeline);
  const maxFaults = faults[0]?.[1] ?? 1;
  const totalPositives = cadet.timeline.reduce((n, e) => n + e.positives.length, 0);

  async function analyse() {
    if (!session?.id_token) return;
    setAi({ loading: true, text: null, error: null });
    try {
      const res = await apiFetch(`${API_BASE}/inspections/analyse`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.id_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cin: cadet.cin }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail ?? res.statusText);
      setAi({ loading: false, text: body.analysis, error: null });
    } catch (e) {
      setAi({
        loading: false,
        text: null,
        error: e instanceof Error ? e.message : "Analysis failed",
      });
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Overall" value={cadet.overall.toFixed(2)} sub={cadet.overall_rank_label} />
        <Stat label="Score avg" value={cadet.score_avg.toFixed(2)} sub={`#${cadet.score_rank}`} />
        <Stat
          label="Attendance"
          value={`${cadet.attendance_avg.toFixed(0)}%`}
          sub={`#${cadet.attendance_rank}`}
        />
        <Stat
          label="Inspected"
          value={String(cadet.timeline.length)}
          sub={`${cadet.present_count} present`}
        />
      </div>

      <div>
        <h3 className="mb-2 text-sm font-medium">Score trend</h3>
        {chartData.filter((d) => d.score != null).length >= 2 ? (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={chartData} margin={{ top: 5, right: 8, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis
                domain={[0, 10]}
                tick={{ fontSize: 11 }}
                width={32}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  background: "var(--popover)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  color: "var(--popover-foreground)",
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="var(--chart-1)"
                strokeWidth={2}
                dot={{ r: 3 }}
                connectNulls={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not enough scored inspections to chart a trend yet.
          </p>
        )}
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
          <ThumbsDown className="h-4 w-4 text-destructive" />
          Recurring faults by area
          {totalPositives > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-xs font-normal text-green-600">
              <ThumbsUp className="h-3.5 w-3.5" />
              {totalPositives} positive{totalPositives === 1 ? "" : "s"} logged
            </span>
          )}
        </h3>
        {faults.length === 0 ? (
          <p className="text-sm text-muted-foreground">No faults logged — spotless.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {faults.map(([region, count]) => (
              <div key={region} className="flex items-center gap-2 text-sm">
                <span className="w-40 shrink-0 truncate">{region}</span>
                <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className="h-full rounded bg-destructive/70"
                    style={{ width: `${(count / maxFaults) * 100}%` }}
                  />
                </div>
                <span className="w-6 text-right tabular-nums text-muted-foreground">{count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-muted/30 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="h-4 w-4 text-primary" />
            AI trend analysis
          </h3>
          <Button size="sm" onClick={analyse} disabled={ai.loading}>
            {ai.loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {ai.text ? "Regenerate" : "Analyse"}
          </Button>
        </div>
        <div className="mt-3">
          {ai.loading && (
            <p className="text-sm text-muted-foreground">
              Reasoning over {cadet.first_name}&apos;s inspection history…
            </p>
          )}
          {ai.error && <p className="text-sm text-destructive">{ai.error}</p>}
          {ai.text && <AiMarkdown text={ai.text} />}
          {!ai.loading && !ai.error && !ai.text && (
            <p className="text-sm text-muted-foreground">
              Uses the Groq LLM to spot recurring uniform issues and score trends.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Leaderboard tab ──────────────────────────────────────────────────────────
function LeaderboardTab() {
  const { data, isLoading, error } = useApiQuery<HistoryResp>(
    ["inspection-history"],
    "/inspections/history"
  );
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("overall_rank");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [selected, setSelected] = useState<CadetHistory | null>(null);

  function onSort(col: SortKey) {
    if (col === sort) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(col);
      setDir(col === "overall_rank" ? "asc" : col === "name" ? "asc" : "desc");
    }
  }

  const rows = useMemo(() => {
    const cadets = data?.cadets ?? [];
    const q = search.trim().toLowerCase();
    const filtered = q
      ? cadets.filter(
          (c) =>
            c.first_name.toLowerCase().includes(q) ||
            c.last_name.toLowerCase().includes(q) ||
            c.flight?.toLowerCase().includes(q)
        )
      : cadets;
    return [...filtered].sort((a, b) => {
      let cmp: number;
      if (sort === "name") {
        cmp = `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`);
      } else {
        cmp = (a[sort] as number) - (b[sort] as number);
      }
      return dir === "asc" ? cmp : -cmp;
    });
  }, [data, search, sort, dir]);

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (error) return <ErrorAlert message={error.message} />;
  if ((data?.inspection_count ?? 0) === 0)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Shirt />
          </EmptyMedia>
          <EmptyTitle>No inspections yet</EmptyTitle>
          <EmptyDescription>
            Submit an inspection marking sheet and per-cadet trends will appear here.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );

  return (
    <div className="flex flex-col gap-4">
      <InputGroup className="max-w-sm">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search by name or flight…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </InputGroup>

      <Card className="overflow-hidden py-0">
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <SortHead label="Cadet" col="name" sort={sort} dir={dir} onSort={onSort} />
                <TableHead className="hidden sm:table-cell">Flight</TableHead>
                <SortHead
                  label="Attend."
                  col="attendance_avg"
                  sort={sort}
                  dir={dir}
                  onSort={onSort}
                  className="text-right"
                />
                <SortHead
                  label="Score"
                  col="score_avg"
                  sort={sort}
                  dir={dir}
                  onSort={onSort}
                  className="text-right"
                />
                <SortHead
                  label="Overall"
                  col="overall"
                  sort={sort}
                  dir={dir}
                  onSort={onSort}
                  className="text-right"
                />
                <SortHead
                  label="Rank"
                  col="overall_rank"
                  sort={sort}
                  dir={dir}
                  onSort={onSort}
                  className="text-right"
                />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((c) => (
                <TableRow key={c.cin} className="cursor-pointer" onClick={() => setSelected(c)}>
                  <TableCell>
                    <div className="font-medium">
                      {c.last_name}, {c.first_name}
                    </div>
                    {c.rank && <div className="text-xs text-muted-foreground">{c.rank}</div>}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">
                    {c.flight && (
                      <Badge variant="outline" className={flightBadgeClass(c.flight)}>
                        {c.flight}
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.attendance_avg.toFixed(0)}%
                    <span className="ml-1 text-xs text-muted-foreground">#{c.attendance_rank}</span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {c.score_avg.toFixed(2)}
                    <span className="ml-1 text-xs text-muted-foreground">#{c.score_rank}</span>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {c.overall.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums">
                    {c.overall_rank_label}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No cadets match your search.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>
                  {selected.rank ? `${selected.rank} ` : ""}
                  {selected.first_name} {selected.last_name}
                </DialogTitle>
                <DialogDescription>
                  {selected.flight ? `${selected.flight} Flight · ` : ""}
                  Inspection history &amp; uniform trends
                </DialogDescription>
              </DialogHeader>
              <CadetDetail cadet={selected} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function InspectionHistoryPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Inspection History"
        description="Browse past inspections by date, export them to PDF, and track score & uniform trends per cadet."
      />

      <Tabs defaultValue="history">
        <TabsList>
          <TabsTrigger value="history">By date</TabsTrigger>
          <TabsTrigger value="leaderboard">Leaderboard</TabsTrigger>
        </TabsList>
        <TabsContent value="history" className="mt-4">
          <HistoryTab />
        </TabsContent>
        <TabsContent value="leaderboard" className="mt-4">
          <LeaderboardTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
