"use client";

import { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useApiQuery } from "@/lib/use-api-query";
import { useAssessmentDraft } from "@/hooks/useAssessmentDraft";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import { ThumbsUp, ThumbsDown, X, Loader2, Search, Check, ChevronsUpDown, Trash2 } from "lucide-react";

// ─── Types ──────────────────────────────────────────────────────────────────
type Comment = { id: string; region: string; type: "fault" | "positive"; text: string };
// absent: undefined = follow the scraped absence log; true/false = manual override.
type Mark = { score: string; comments: Comment[]; absent?: boolean };
// order: cins in the sequence they were submitted, most-recent first (LIFO).
type Sheet = { date: string; marks: Record<number, Mark>; order?: number[] };
type Absence = { cin: number; date_from: string; date_to: string; reason: string | null };
type FlightScore = { total: number; present_count: number; awol_count: number };

type Cadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
};

// Clickable bands over the figure — top/height as % of image height, full width.
const REGIONS = [
  { id: "Beret / Headdress", top: 0, height: 14 },
  { id: "Hair / Face", top: 14, height: 6 },
  { id: "Jumper / Shirt / Tie", top: 20, height: 27 },
  { id: "Trousers", top: 47, height: 42 },
  { id: "Shoes", top: 89, height: 11 },
];

const emptyMark = (): Mark => ({ score: "", comments: [] });

// ─── Clickable figure ─────────────────────────────────────────────────────────
function InspectionFigure({
  comments,
  onAdd,
  onRemove,
  disabled = false,
}: {
  comments: Comment[];
  onAdd: (region: string, type: Comment["type"], text: string) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative mx-auto w-[200px] select-none" style={{ aspectRatio: "512 / 1536" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/inspection-figure.png"
        alt="Cadet in uniform"
        className="h-full w-full object-contain dark:opacity-90 dark:invert"
        draggable={false}
      />
      {REGIONS.map((r) => {
        const regionComments = comments.filter((c) => c.region === r.id);
        const faults = regionComments.filter((c) => c.type === "fault").length;
        const positives = regionComments.length - faults;
        return (
          <RegionButton
            key={r.id}
            region={r}
            faults={faults}
            positives={positives}
            regionComments={regionComments}
            onAdd={onAdd}
            onRemove={onRemove}
            disabled={disabled}
          />
        );
      })}
    </div>
  );
}

function RegionButton({
  region,
  faults,
  positives,
  regionComments,
  onAdd,
  onRemove,
  disabled = false,
}: {
  region: (typeof REGIONS)[number];
  faults: number;
  positives: number;
  regionComments: Comment[];
  onAdd: (region: string, type: Comment["type"], text: string) => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [type, setType] = useState<Comment["type"]>("fault");

  function submit() {
    const t = text.trim();
    if (!t) return;
    onAdd(region.id, type, t);
    setText("");
    setType("fault");
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={(o) => !disabled && setOpen(o)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={region.id}
          disabled={disabled}
          className={cn(
            "group absolute left-0 w-full border border-transparent transition-colors",
            disabled
              ? "cursor-not-allowed"
              : "cursor-pointer hover:border-primary/40 hover:bg-primary/5",
            open && "border-primary/60 bg-primary/10"
          )}
          style={{ top: `${region.top}%`, height: `${region.height}%` }}
        >
          <span className="pointer-events-none absolute left-1 top-1 rounded bg-background/80 px-1 text-[10px] font-medium text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
            {region.id}
          </span>
          <span className="pointer-events-none absolute right-1 top-1/2 flex -translate-y-1/2 gap-1">
            {faults > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[11px] font-bold text-white">
                {faults}
              </span>
            )}
            {positives > 0 && (
              <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-green-600 px-1 text-[11px] font-bold text-white">
                {positives}
              </span>
            )}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="center"
        collisionPadding={8}
        className="flex max-h-(--radix-popover-content-available-height) w-[calc(100vw-1rem)] max-w-xs flex-col overflow-y-auto sm:w-72"
      >
        <div className="mb-2 text-sm font-semibold">{region.id}</div>

        {regionComments.length > 0 && (
          <ul className="mb-3 flex flex-col gap-1">
            {regionComments.map((c) => (
              <li
                key={c.id}
                className="flex items-start gap-1.5 rounded border bg-muted/40 px-2 py-1 text-xs"
              >
                {c.type === "fault" ? (
                  <ThumbsDown className="mt-0.5 h-3 w-3 shrink-0 text-destructive" />
                ) : (
                  <ThumbsUp className="mt-0.5 h-3 w-3 shrink-0 text-green-600" />
                )}
                <span className="flex-1">{c.text}</span>
                <button
                  type="button"
                  onClick={() => onRemove(c.id)}
                  className="text-muted-foreground hover:text-destructive"
                  aria-label="Remove"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <ToggleGroup
          type="single"
          value={type}
          onValueChange={(v) => v && setType(v as Comment["type"])}
          className="mb-2 w-full"
        >
          <ToggleGroupItem value="fault" className="flex-1 gap-1 text-xs">
            <ThumbsDown className="h-3.5 w-3.5" /> Fault
          </ToggleGroupItem>
          <ToggleGroupItem value="positive" className="flex-1 gap-1 text-xs">
            <ThumbsUp className="h-3.5 w-3.5" /> Positive
          </ToggleGroupItem>
        </ToggleGroup>

        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`e.g. ${type === "fault" ? "beret not shaped" : "boots well bulled"}`}
          rows={2}
          className="mb-2 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
          }}
        />
        <Button size="sm" className="w-full" onClick={submit} disabled={!text.trim()}>
          Add
        </Button>
      </PopoverContent>
    </Popover>
  );
}

// ─── Per-cadet card ─────────────────────────────────────────────────────────
function CadetCard({
  cadet,
  mark,
  update,
  hasAbsenceLog,
  absenceReason,
}: {
  cadet: Cadet;
  mark: Mark;
  update: (fn: (m: Mark) => Mark) => void;
  hasAbsenceLog: boolean;
  absenceReason: string | null;
}) {
  const faults = mark.comments.filter((c) => c.type === "fault").length;
  const positives = mark.comments.length - faults;
  const absent = mark.absent ?? hasAbsenceLog; // default to the scraped log, overridable

  return (
    <Card className={cn(absent && "opacity-60")}>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base">
          <span className={cn(absent && "line-through")}>
            {cadet.rank ? `${cadet.rank} ` : ""}
            {cadet.first_name} {cadet.last_name}
          </span>
          <div className="flex items-center gap-2 text-xs font-normal">
            {absent && <Badge variant="secondary">Absent</Badge>}
            {faults > 0 && <Badge variant="destructive">{faults} faults</Badge>}
            {positives > 0 && (
              <Badge className="bg-green-600 text-white hover:bg-green-600">{positives} good</Badge>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3">
        <label className="flex items-center gap-2 self-start text-sm">
          <Checkbox
            checked={absent}
            onCheckedChange={(v) => update((m) => ({ ...m, absent: v === true }))}
          />
          Absent
          {hasAbsenceLog && (
            <span className="text-xs text-muted-foreground" title={absenceReason ?? ""}>
              (logged)
            </span>
          )}
        </label>
        <InspectionFigure
          comments={mark.comments}
          onAdd={(region, type, text) =>
            update((m) => ({
              ...m,
              comments: [
                ...m.comments,
                { id: crypto.randomUUID(), region, type, text },
              ],
            }))
          }
          onRemove={(id) =>
            update((m) => ({ ...m, comments: m.comments.filter((c) => c.id !== id) }))
          }
          disabled={absent}
        />
        <div className="flex w-full items-center justify-center gap-2">
          <Label htmlFor={`score-${cadet.cin}`} className="text-sm">
            Score
          </Label>
          <Input
            id={`score-${cadet.cin}`}
            type="number"
            min={0}
            max={10}
            value={mark.score}
            onChange={(e) => update((m) => ({ ...m, score: e.target.value }))}
            disabled={absent}
            className="w-16 text-center"
          />
          <span className="text-sm text-muted-foreground">/ 10</span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function InspectionPage() {
  const { data: session } = useSession();
  const { data: cadets = [], isLoading } = useApiQuery<Cadet[]>(["cadets"], "/cadets");

  const {
    state: sheet,
    setState: setSheet,
    clearDraft,
    draftRestored: restored,
  } = useAssessmentDraft<Sheet>(
    "inspection",
    { date: new Date().toISOString().slice(0, 10), marks: {} },
    session?.user?.email,
    (s) => Object.keys(s.marks).length > 0
  );

  const { data: absences = [] } = useApiQuery<Absence[]>(
    ["absences", sheet.date],
    `/absences?date=${sheet.date}`
  );
  const absenceByCin = useMemo(
    () => new Map(absences.map((a) => [a.cin, a])),
    [absences]
  );

  const [submitting, setSubmitting] = useState(false);
  const [flightScores, setFlightScores] = useState<Record<string, FlightScore> | null>(null);

  async function submit() {
    if (!session?.id_token) return;
    setSubmitting(true);
    try {
      const marks = Object.entries(sheet.marks).map(([cin, m]) => ({
        cin: Number(cin),
        score: m.score === "" ? null : Number(m.score),
        absent: m.absent ?? absenceByCin.has(Number(cin)),
        comments: m.comments,
      }));
      const res = await apiFetch(`${API_BASE}/inspections`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.id_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ date: sheet.date, marks }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? res.statusText);
      const { awol, flight_scores } = (await res.json()) as {
        awol: number[];
        flight_scores: Record<string, FlightScore>;
      };
      setFlightScores(flight_scores);
      if (awol.length) {
        const names = awol
          .map((cin) => cadets.find((c) => c.cin === cin))
          .map((c) => (c ? `${c.first_name} ${c.last_name}` : "Unknown"))
          .join(", ");
        toast.warning(`Submitted — ${awol.length} marked AWOL: ${names}`);
      } else {
        toast.success("Inspection submitted");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  const flights = useMemo(() => {
    const set = new Set<string>();
    for (const c of cadets) if (c.flight) set.add(c.flight);
    return [...set].sort();
  }, [cadets]);

  const [flight, setFlight] = useState<string | null>(null);
  const activeFlight = flight ?? flights[0] ?? null;

  // Cadet currently being marked within the active flight, and the search combobox.
  const [selectedCin, setSelectedCin] = useState<number | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const flightCadets = useMemo(
    () =>
      cadets
        .filter((c) => c.flight === activeFlight)
        .sort((a, b) => a.last_name.localeCompare(b.last_name)),
    [cadets, activeFlight]
  );

  const selectedCadet = flightCadets.find((c) => c.cin === selectedCin) ?? null;

  // Recorded cadets in this flight, most-recently submitted first (LIFO). Falls
  // back to marks order for drafts saved before `order` was tracked.
  const recordedCadets = useMemo(() => {
    const ordered = sheet.order ?? [];
    const extra = Object.keys(sheet.marks)
      .map(Number)
      .filter((cin) => !ordered.includes(cin));
    return [...ordered, ...extra]
      .map((cin) => flightCadets.find((c) => c.cin === cin))
      .filter((c): c is Cadet => !!c && !!sheet.marks[c.cin]);
  }, [sheet.order, sheet.marks, flightCadets]);

  function selectFlight(f: string) {
    setFlight(f);
    setSelectedCin(null);
    setSearchOpen(false);
  }

  function updateMark(cin: number, fn: (m: Mark) => Mark) {
    setSheet((s) => ({
      ...s,
      marks: { ...s.marks, [cin]: fn(s.marks[cin] ?? emptyMark()) },
    }));
  }

  // "Submit cadet" — record this cadet as inspected (creating an empty mark if
  // untouched), move them to the top of the recorded list, and return to the
  // search so the next cadet can be found.
  function submitCadet() {
    if (selectedCin == null) return;
    const cin = selectedCin;
    setSheet((s) => ({
      ...s,
      marks: s.marks[cin] ? s.marks : { ...s.marks, [cin]: emptyMark() },
      order: [cin, ...(s.order ?? []).filter((c) => c !== cin)],
    }));
    const c = flightCadets.find((c) => c.cin === cin);
    if (c) toast.success(`${c.first_name} ${c.last_name} recorded`);
    setSelectedCin(null);
  }

  // Remove a recorded cadet from the sheet entirely.
  function removeCadet(cin: number) {
    setSheet((s) => {
      const marks = { ...s.marks };
      delete marks[cin];
      return { ...s, marks, order: (s.order ?? []).filter((c) => c !== cin) };
    });
    if (selectedCin === cin) setSelectedCin(null);
  }

  function clearAll() {
    setSheet({ date: sheet.date, marks: {}, order: [] });
    clearDraft();
    setSelectedCin(null);
    setFlightScores(null);
    toast.success("Draft cleared");
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-16">
      <PageHeader
        title="Inspection Marking Sheet"
        description="Tap a part of the uniform to log a fault or a positive. Scores save automatically."
        actions={
          <div className="flex items-center gap-2">
            <Label htmlFor="insp-date" className="text-sm">
              Date
            </Label>
            <Input
              id="insp-date"
              type="date"
              value={sheet.date}
              onChange={(e) => setSheet((s) => ({ ...s, date: e.target.value }))}
              className="w-40"
            />
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  disabled={Object.keys(sheet.marks).length === 0}
                >
                  <Trash2 className="h-4 w-4" />
                  Clear draft
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear this draft?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This removes every recorded cadet from the current, unsaved
                    marking session. Inspections already completed are not
                    affected. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={clearAll}>
                    Clear draft
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Button onClick={submit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Complete inspection
            </Button>
          </div>
        }
      />

      {restored && (
        <p className="text-xs text-muted-foreground">Restored your unsaved marking session.</p>
      )}

      {flightScores && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Flight scores</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(flightScores)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([f, s]) => (
                <div key={f} className="rounded-lg border p-3">
                  <div className="text-sm font-medium">{f} Flight</div>
                  <div className="text-2xl font-bold tabular-nums">{s.total}</div>
                  <div className="text-xs text-muted-foreground">
                    {s.present_count} marked
                    {s.awol_count > 0 && (
                      <span className="text-destructive">
                        {" · "}
                        {s.awol_count} AWOL (−{s.awol_count * 5})
                      </span>
                    )}
                  </div>
                </div>
              ))}
          </CardContent>
        </Card>
      )}

      {/* Flight tabs */}
      <div className="flex flex-wrap gap-2">
        {flights.map((f) => (
          <Button
            key={f}
            size="sm"
            variant={f === activeFlight ? "default" : "outline"}
            onClick={() => selectFlight(f)}
          >
            {f} Flight
          </Button>
        ))}
      </div>

      {isLoading ? (
        <Skeleton className="h-[560px] w-full max-w-md" />
      ) : flightCadets.length === 0 ? (
        <p className="text-sm text-muted-foreground">No cadets found for this flight.</p>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Cadet search */}
          <Popover open={searchOpen} onOpenChange={setSearchOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={searchOpen}
                className="w-full justify-between text-muted-foreground sm:w-96"
              >
                <span className="flex items-center gap-2">
                  <Search className="h-4 w-4" />
                  Search cadet in {activeFlight} Flight…
                </span>
                <ChevronsUpDown className="h-4 w-4 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
              <Command>
                <CommandInput placeholder="Type a name…" />
                <CommandList>
                  <CommandEmpty>No cadet found.</CommandEmpty>
                  <CommandGroup>
                    {flightCadets.map((c) => {
                      const marked = !!sheet.marks[c.cin];
                      return (
                        <CommandItem
                          key={c.cin}
                          value={`${c.first_name} ${c.last_name} ${c.rank ?? ""}`}
                          onSelect={() => {
                            setSelectedCin(c.cin);
                            setSearchOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "h-4 w-4",
                              marked ? "opacity-100" : "opacity-0"
                            )}
                          />
                          <span className="flex-1">
                            {c.rank ? `${c.rank} ` : ""}
                            {c.first_name} {c.last_name}
                          </span>
                          {marked && (
                            <Badge variant="secondary" className="text-[10px]">
                              done
                            </Badge>
                          )}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {/* Recorded cadets in this flight — most recent first */}
          {recordedCadets.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                Recorded ({recordedCadets.length})
              </span>
              <ul className="divide-y rounded-md border">
                {recordedCadets.map((c) => {
                  const m = sheet.marks[c.cin] ?? emptyMark();
                  const faults = m.comments.filter((x) => x.type === "fault").length;
                  const positives = m.comments.length - faults;
                  const absent = m.absent ?? absenceByCin.has(c.cin);
                  return (
                    <li
                      key={c.cin}
                      className={cn(
                        "flex items-center gap-2 px-3 py-2 text-sm transition-colors",
                        c.cin === selectedCin && "bg-primary/5"
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedCin(c.cin)}
                        className="flex flex-1 items-center gap-2 text-left"
                      >
                        <Check className="h-4 w-4 shrink-0 text-green-600" />
                        <span className={cn("flex-1 truncate", absent && "line-through opacity-60")}>
                          {c.rank ? `${c.rank} ` : ""}
                          {c.first_name} {c.last_name}
                        </span>
                        <span className="flex items-center gap-1.5">
                          {absent ? (
                            <Badge variant="secondary" className="text-[10px]">Absent</Badge>
                          ) : (
                            <>
                              {faults > 0 && (
                                <Badge variant="destructive" className="text-[10px]">{faults}</Badge>
                              )}
                              {positives > 0 && (
                                <Badge className="bg-green-600 text-white hover:bg-green-600 text-[10px]">
                                  {positives}
                                </Badge>
                              )}
                              {m.score !== "" && (
                                <span className="tabular-nums text-xs text-muted-foreground">
                                  {m.score}/10
                                </span>
                              )}
                            </>
                          )}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => removeCadet(c.cin)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Remove ${c.first_name} ${c.last_name}`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Active cadet */}
          {selectedCadet ? (
            <div className="flex w-full max-w-md flex-col gap-3">
              <CadetCard
                cadet={selectedCadet}
                mark={sheet.marks[selectedCadet.cin] ?? emptyMark()}
                update={(fn) => updateMark(selectedCadet.cin, fn)}
                hasAbsenceLog={absenceByCin.has(selectedCadet.cin)}
                absenceReason={absenceByCin.get(selectedCadet.cin)?.reason ?? null}
              />
              <div className="flex gap-2">
                <Button className="flex-1" onClick={submitCadet}>
                  Submit cadet
                </Button>
                <Button variant="outline" onClick={() => setSelectedCin(null)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Search for a cadet above to start marking.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
