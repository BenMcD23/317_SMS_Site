"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Search, ChevronDown, ChevronRight } from "lucide-react";

// ─── Constants ───────────────────────────────────────────────────────────────────────

const QUALIFICATION_TYPES = [
  { value: "duke_of_edinburgh", label: "Duke of Edinburgh" },
  { value: "first_aid", label: "First Aid" },
  { value: "leadership", label: "Leadership" },
  { value: "cyber", label: "Cyber" },
  { value: "radio", label: "Radio" },
  { value: "road_marching", label: "Road Marching" },
  { value: "space", label: "Space" },
  { value: "music", label: "Music" },
  { value: "flying_badge", label: "Flying Badge" },
  { value: "fieldcraft", label: "Fieldcraft" },
  { value: "shooting", label: "Shooting" },
  { value: "presentation_skills", label: "Presentation Skills" },
  { value: "moi", label: "MOI" },
  { value: "swimming_proficiency", label: "Swimming Proficiency" },
  { value: "climatic_injuries", label: "Climatic Injuries" },
];

// ─── Types ─────────────────────────────────────────────────────────────────────────

type Cadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
};

type AllergyEntry = {
  id?: number;
  allergy_name: string;
  auto_injector: string;
  severity: string | null;
  details: string | null;
};

type DietaryEntry = {
  id?: number;
  name: string;
  details: string | null;
};

type MedicalCadet = Cadet & {
  allergies: AllergyEntry[];
  dietary: DietaryEntry[];
};

type QualCheck = {
  qual_type: string;
  display_name: string;
  has: boolean;
  date_achieved: string | null;
  date_expires: string | null;
};

type AuditResult = Cadet & {
  qualifications_check?: QualCheck[];
  allergies?: AllergyEntry[];
  dietary?: DietaryEntry[];
};

type SubApp = {
  id: number;
  title: string;
  cadet_count: number;
  cadets: Cadet[];
};

type EventEntry = {
  id: number;
  title: string;
  cadet_count: number;
  cadets: Cadet[];
  sub_apps: SubApp[];
};

// ─── Shared components ───────────────────────────────────────────────────────────

function CheckBadge({ has }: { has: boolean }) {
  if (has) {
    return (
      <Badge variant="outline" className="border-green-200 bg-green-50 text-green-700">
        Yes
      </Badge>
    );
  }
  return <Badge variant="outline" className="text-muted-foreground">No</Badge>;
}

function CriteriaSelector({
  selectedQuals,
  onToggleQual,
  includeMedical,
  onToggleMedical,
  includeDietary,
  onToggleDietary,
}: {
  selectedQuals: string[];
  onToggleQual: (v: string) => void;
  includeMedical: boolean;
  onToggleMedical: (v: boolean) => void;
  includeDietary: boolean;
  onToggleDietary: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">Qualifications</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {QUALIFICATION_TYPES.map((qt) => (
          <div key={qt.value} className="flex items-center gap-2">
            <Checkbox
              id={`qual-${qt.value}`}
              checked={selectedQuals.includes(qt.value)}
              onCheckedChange={() => onToggleQual(qt.value)}
            />
            <Label
              htmlFor={`qual-${qt.value}`}
              className="cursor-pointer text-sm font-normal"
            >
              {qt.label}
            </Label>
          </div>
        ))}
      </div>
      <p className="border-t pt-3 text-sm font-semibold">Medical &amp; Dietary</p>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="include-medical"
            checked={includeMedical}
            onCheckedChange={(v) => onToggleMedical(!!v)}
          />
          <Label htmlFor="include-medical" className="cursor-pointer text-sm font-normal">
            Include allergies / medical
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id="include-dietary"
            checked={includeDietary}
            onCheckedChange={(v) => onToggleDietary(!!v)}
          />
          <Label htmlFor="include-dietary" className="cursor-pointer text-sm font-normal">
            Include dietary requirements
          </Label>
        </div>
      </div>
    </div>
  );
}

function AuditResultsTable({
  results,
  qualifications,
  includeMedical,
  includeDietary,
}: {
  results: AuditResult[];
  qualifications: string[];
  includeMedical: boolean;
  includeDietary: boolean;
}) {
  const qualLabels = QUALIFICATION_TYPES.filter((q) =>
    qualifications.includes(q.value)
  );

  if (results.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">No results.</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="min-w-40 pl-4">Cadet</TableHead>
            {qualLabels.map((q) => (
              <TableHead key={q.value} className="min-w-24 text-center">
                {q.label}
              </TableHead>
            ))}
            {includeMedical && (
              <TableHead className="min-w-40">Allergies</TableHead>
            )}
            {includeDietary && (
              <TableHead className="min-w-40">Dietary</TableHead>
            )}
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
              {qualLabels.map((q) => {
                const check = r.qualifications_check?.find(
                  (c) => c.qual_type === q.value
                );
                return (
                  <TableCell key={q.value} className="text-center">
                    <CheckBadge has={check?.has ?? false} />
                  </TableCell>
                );
              })}
              {includeMedical && (
                <TableCell>
                  {r.allergies && r.allergies.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {r.allergies.map((a, i) => (
                        <Badge key={i} variant="destructive" className="text-xs">
                          {a.allergy_name}
                          {a.auto_injector === "Yes" ? " (EpiPen)" : ""}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </TableCell>
              )}
              {includeDietary && (
                <TableCell>
                  {r.dietary && r.dietary.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {r.dietary.map((d, i) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {d.name}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">None</span>
                  )}
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Tab 1: Medical Overview ──────────────────────────────────────────────────────

function MedicalCadetCard({ cadet }: { cadet: MedicalCadet }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card className="gap-0 overflow-hidden py-0">
      <button
        type="button"
        className="w-full cursor-pointer text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <CardHeader className="flex flex-row items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
          <div className="min-w-0 flex-1">
            <CardTitle className="text-sm font-medium">
              {cadet.rank ? `${cadet.rank} ` : ""}
              {cadet.first_name} {cadet.last_name}
            </CardTitle>
            <p className="text-xs text-muted-foreground">CIN {cadet.cin}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {cadet.allergies.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                {cadet.allergies.length}{" "}
                allerg{cadet.allergies.length !== 1 ? "ies" : "y"}
              </Badge>
            )}
            {cadet.dietary.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {cadet.dietary.length} dietary
              </Badge>
            )}
            {expanded ? (
              <ChevronDown className="size-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="size-4 text-muted-foreground" />
            )}
          </div>
        </CardHeader>
      </button>

      {expanded && (
        <CardContent className="border-t px-4 py-3">
          {cadet.allergies.length > 0 && (
            <div className={cn(cadet.dietary.length > 0 && "mb-4")}>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Allergies
              </p>
              <div className="flex flex-col gap-1.5">
                {cadet.allergies.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{a.allergy_name}</span>
                    {a.auto_injector === "Yes" && (
                      <Badge variant="destructive" className="text-xs">
                        EpiPen required
                      </Badge>
                    )}
                    {a.severity && (
                      <span className="text-muted-foreground">
                        Severity: {a.severity}
                      </span>
                    )}
                    {a.details && (
                      <span className="text-muted-foreground">— {a.details}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
          {cadet.dietary.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Dietary
              </p>
              <div className="flex flex-col gap-1.5">
                {cadet.dietary.map((d) => (
                  <div key={d.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">{d.name}</span>
                    {d.details && (
                      <span className="text-muted-foreground">— {d.details}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}

function MedicalOverviewTab() {
  const { data: cadets = [], isLoading, error } = useApiQuery<MedicalCadet[]>(
    ["audit-medical"],
    "/cadets/audit/medical"
  );

  return (
    <div className="flex flex-col gap-3">
      {isLoading &&
        [...Array(4)].map((_, i) => <Skeleton key={i} className="h-14" />)}
      <ErrorAlert
        message={error?.message ?? null}
        title="Could not load medical data"
      />
      {!isLoading && !error && cadets.length === 0 && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          No cadets with medical or dietary requirements recorded.
        </p>
      )}
      {!isLoading &&
        cadets.map((c) => <MedicalCadetCard key={c.cin} cadet={c} />)}
    </div>
  );
}

// ─── Tab 2: Cadet Check ─────────────────────────────────────────────────────────

function CadetCheckTab() {
  const { data: session } = useSession();
  const { data: allCadets = [], isLoading: loadingCadets } =
    useApiQuery<Cadet[]>(["cadets"], "/cadets");

  const [search, setSearch] = useState("");
  const [selectedCins, setSelectedCins] = useState<Set<number>>(new Set());
  const [selectedQuals, setSelectedQuals] = useState<string[]>([]);
  const [includeMedical, setIncludeMedical] = useState(false);
  const [includeDietary, setIncludeDietary] = useState(false);
  const [results, setResults] = useState<AuditResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = allCadets.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      String(c.cin).includes(q)
    );
  });

  function toggleCadet(cin: number) {
    setSelectedCins((prev) => {
      const next = new Set(prev);
      if (next.has(cin)) next.delete(cin);
      else next.add(cin);
      return next;
    });
  }

  function toggleQual(v: string) {
    setSelectedQuals((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  }

  async function runCheck() {
    if (!session?.id_token) return;
    if (selectedQuals.length === 0 && !includeMedical && !includeDietary) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE}/cadets/audit/check`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.id_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cadet_cins: [...selectedCins],
          qualifications: selectedQuals,
          include_medical: includeMedical,
          include_dietary: includeDietary,
        }),
      });
      setResults(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const canRun =
    selectedQuals.length > 0 || includeMedical || includeDietary;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Cadet selection */}
        <Card className="flex flex-col gap-0 overflow-hidden py-0">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm">
              Select cadets
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {selectedCins.size === 0
                  ? "None selected — all cadets checked"
                  : `${selectedCins.size} selected`}
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
            {loadingCadets ? (
              <div className="flex flex-col gap-1.5 p-3">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-8" />
                ))}
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map((c) => (
                  <button
                    key={c.cin}
                    type="button"
                    onClick={() => toggleCadet(c.cin)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-muted/50",
                      selectedCins.has(c.cin) && "bg-muted/30"
                    )}
                  >
                    <Checkbox
                      checked={selectedCins.has(c.cin)}
                      onCheckedChange={() => toggleCadet(c.cin)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className="font-medium">
                      {c.last_name}, {c.first_name}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {c.cin}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedCins.size > 0 && (
            <div className="border-t px-4 py-2">
              <button
                type="button"
                className="text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedCins(new Set())}
              >
                Clear selection
              </button>
            </div>
          )}
        </Card>

        {/* Criteria */}
        <Card className="py-0">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm">Criteria to check</CardTitle>
          </CardHeader>
          <CardContent className="border-t px-4 py-3">
            <CriteriaSelector
              selectedQuals={selectedQuals}
              onToggleQual={toggleQual}
              includeMedical={includeMedical}
              onToggleMedical={setIncludeMedical}
              includeDietary={includeDietary}
              onToggleDietary={setIncludeDietary}
            />
          </CardContent>
        </Card>
      </div>

      <Button
        onClick={runCheck}
        disabled={!canRun || loading}
        className="w-full sm:w-auto"
      >
        {loading ? "Checking…" : "Run Check"}
      </Button>

      <ErrorAlert message={error} title="Check failed" />

      {results !== null && (
        <AuditResultsTable
          results={results}
          qualifications={selectedQuals}
          includeMedical={includeMedical}
          includeDietary={includeDietary}
        />
      )}
    </div>
  );
}

// ─── Tab 3: Event Audit ─────────────────────────────────────────────────────────

function EventCheckTab() {
  const { data: session } = useSession();
  const { data: events = [], isLoading: loadingEvents } =
    useApiQuery<EventEntry[]>(["cadet-events"], "/cadet-events");

  const [selectedEventId, setSelectedEventId] = useState("");
  const [selectedSubAppId, setSelectedSubAppId] = useState("all");
  const [selectedQuals, setSelectedQuals] = useState<string[]>([]);
  const [includeMedical, setIncludeMedical] = useState(false);
  const [includeDietary, setIncludeDietary] = useState(false);
  const [results, setResults] = useState<AuditResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedEvent = events.find((e) => String(e.id) === selectedEventId);
  const subApps = selectedEvent?.sub_apps ?? [];

  function toggleQual(v: string) {
    setSelectedQuals((prev) =>
      prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]
    );
  }

  function handleEventChange(val: string) {
    setSelectedEventId(val);
    setSelectedSubAppId("all");
    setResults(null);
  }

  const effectiveEventId =
    selectedSubAppId !== "all"
      ? parseInt(selectedSubAppId)
      : selectedEventId
      ? parseInt(selectedEventId)
      : null;

  async function runCheck() {
    if (!session?.id_token || effectiveEventId === null) return;
    if (selectedQuals.length === 0 && !includeMedical && !includeDietary) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`${API_BASE}/cadets/audit/event-check`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.id_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          event_id: effectiveEventId,
          qualifications: selectedQuals,
          include_medical: includeMedical,
          include_dietary: includeDietary,
        }),
      });
      setResults(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  const canRun =
    effectiveEventId !== null &&
    (selectedQuals.length > 0 || includeMedical || includeDietary);

  const selectedSubApp = subApps.find((s) => String(s.id) === selectedSubAppId);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Event selection */}
        <Card className="py-0">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm">Select event</CardTitle>
          </CardHeader>
          <CardContent className="border-t px-4 py-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1.5">
                <Label className="text-sm">Event</Label>
                <Select
                  value={selectedEventId}
                  onValueChange={handleEventChange}
                  disabled={loadingEvents}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select an event…" />
                  </SelectTrigger>
                  <SelectContent>
                    {events.map((e) => (
                      <SelectItem key={e.id} value={String(e.id)}>
                        {e.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {subApps.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <Label className="text-sm">
                    Sub-application{" "}
                    <span className="text-muted-foreground">(optional)</span>
                  </Label>
                  <Select
                    value={selectedSubAppId}
                    onValueChange={setSelectedSubAppId}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All cadets on event</SelectItem>
                      {subApps.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {selectedEvent && (
                <p className="text-xs text-muted-foreground">
                  {selectedSubAppId === "all"
                    ? `${selectedEvent.cadet_count} cadet${
                        selectedEvent.cadet_count !== 1 ? "s" : ""
                      } on this event`
                    : `${selectedSubApp?.cadet_count ?? 0} cadet${
                        (selectedSubApp?.cadet_count ?? 0) !== 1 ? "s" : ""
                      } on sub-app`}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Criteria */}
        <Card className="py-0">
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm">Criteria to check</CardTitle>
          </CardHeader>
          <CardContent className="border-t px-4 py-3">
            <CriteriaSelector
              selectedQuals={selectedQuals}
              onToggleQual={toggleQual}
              includeMedical={includeMedical}
              onToggleMedical={setIncludeMedical}
              includeDietary={includeDietary}
              onToggleDietary={setIncludeDietary}
            />
          </CardContent>
        </Card>
      </div>

      <Button
        onClick={runCheck}
        disabled={!canRun || loading}
        className="w-full sm:w-auto"
      >
        {loading ? "Checking…" : "Run Event Check"}
      </Button>

      <ErrorAlert message={error} title="Event check failed" />

      {results !== null && (
        <AuditResultsTable
          results={results}
          qualifications={selectedQuals}
          includeMedical={includeMedical}
          includeDietary={includeDietary}
        />
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────────

export default function AuditPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Audit"
        description="Review cadet medical requirements and check qualifications"
      />
      <Tabs defaultValue="medical">
        <TabsList>
          <TabsTrigger value="medical">Medical Overview</TabsTrigger>
          <TabsTrigger value="cadet-check">Cadet Check</TabsTrigger>
          <TabsTrigger value="event-check">Event Audit</TabsTrigger>
        </TabsList>
        <TabsContent value="medical" className="mt-4">
          <MedicalOverviewTab />
        </TabsContent>
        <TabsContent value="cadet-check" className="mt-4">
          <CadetCheckTab />
        </TabsContent>
        <TabsContent value="event-check" className="mt-4">
          <EventCheckTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
