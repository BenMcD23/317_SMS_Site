"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  Upload,
  Search,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  Loader2,
  AlertCircle,
  FileText,
  Download,
} from "lucide-react";
import { API_BASE } from "@/lib/config";

// ─── Types ────────────────────────────────────────────────────────────────────

type AssessmentEntry = {
  id: number;
  assessment_type: string;
  created_at: string;
  passed: boolean | null;
  total_score: number | null;
  exercise_name: string | null;
  assessor_name: string | null;
};

type AssessmentGroup = {
  assessment_type: string;
  assessments: AssessmentEntry[];
  passed_count: number;
  required_to_upload: number;
  can_upload: boolean;
  uploaded: boolean;
};

type CadetAssessments = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
  groups: AssessmentGroup[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function typeLabel(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const TYPE_COLOURS: Record<string, string> = {
  leadership: "bg-blue-100 text-blue-700 border-blue-200",
  first_aid: "bg-red-100 text-red-700 border-red-200",
  radio: "bg-purple-100 text-purple-700 border-purple-200",
};

function typeColour(t: string) {
  return TYPE_COLOURS[t] ?? "bg-muted text-muted-foreground border-muted";
}

// ─── PDF Row ──────────────────────────────────────────────────────────────────

function AssessmentPdfRow({
  assessment,
  token,
}: {
  assessment: AssessmentEntry;
  token: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);

  const fetchPdf = async (): Promise<string | null> => {
    if (pdfUrl) return pdfUrl;
    if (!token) return null;
    setLoadingPdf(true);
    setPdfError(null);
    try {
      const res = await fetch(`${API_BASE}/assessments/${assessment.id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfUrl(url);
      return url;
    } catch (e: unknown) {
      setPdfError(e instanceof Error ? e.message : "Failed");
      return null;
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleToggle = async () => {
    const next = !expanded;
    setExpanded(next);
    if (next) await fetchPdf();
  };

  const handleDownload = async () => {
    const url = await fetchPdf();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `assessment_${assessment.id}_${assessment.assessment_type}.pdf`;
    a.click();
  };

  return (
    <div className="border-t first:border-t-0">
      <div className="flex items-center gap-3 px-4 py-2.5 pl-10 hover:bg-muted/30 transition-colors">
        {/* Pass/fail icon */}
        <div className="shrink-0">
          {assessment.passed === true ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          ) : assessment.passed === false ? (
            <XCircle className="h-3.5 w-3.5 text-red-500" />
          ) : (
            <div className="h-3.5 w-3.5 rounded-full border-2 border-muted-foreground/30" />
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {assessment.exercise_name ?? typeLabel(assessment.assessment_type)}
          </p>
          <p className="text-xs text-muted-foreground">
            {formatDate(assessment.created_at)}
            {assessment.assessor_name && <> · {assessment.assessor_name}</>}
          </p>
        </div>

        {/* Score + pass badge */}
        <div className="shrink-0 flex items-center gap-2">
          {assessment.total_score !== null && (
            <span className="text-xs font-mono text-muted-foreground">
              {assessment.total_score}/50
            </span>
          )}
          {assessment.passed !== null && (
            <Badge
              className={cn(
                "text-[11px]",
                assessment.passed
                  ? "bg-green-500 text-white hover:bg-green-500"
                  : "bg-red-500 text-white hover:bg-red-500"
              )}
            >
              {assessment.passed ? "PASS" : "FAIL"}
            </Badge>
          )}
        </div>

        {/* PDF controls */}
        <div className="shrink-0 flex items-center gap-1 ml-1">
          <button
            type="button"
            onClick={handleDownload}
            className="flex items-center gap-1 rounded px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Download PDF"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleToggle}
            className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            {loadingPdf ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            {expanded ? "Hide" : "View"}
          </button>
        </div>
      </div>

      {/* PDF viewer */}
      {expanded && (
        <div className="px-4 pb-3 pl-10">
          {pdfError ? (
            <p className="text-xs text-destructive">{pdfError}</p>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full rounded border"
              style={{ height: 500 }}
              title={`Assessment ${assessment.id}`}
            />
          ) : (
            <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading PDF…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Upload button ────────────────────────────────────────────────────────────

function UploadButton({
  cin,
  assessmentType,
  canUpload,
  uploaded,
  token,
  onUploaded,
}: {
  cin: number;
  assessmentType: string;
  canUpload: boolean;
  uploaded: boolean;
  token: string | null;
  onUploaded: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(uploaded);

  const handleUpload = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/assessments/${cin}/${assessmentType}/upload-qualification`,
        { method: "POST", headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(detail?.detail ?? "Upload failed");
      }
      setDone(true);
      onUploaded();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <Badge className="gap-1.5 bg-green-500 text-white hover:bg-green-500 text-xs">
        <CheckCircle2 className="h-3 w-3" /> Uploaded
      </Badge>
    );
  }

  if (!canUpload) {
    return (
      <Badge variant="outline" className="gap-1.5 text-xs text-muted-foreground">
        <AlertCircle className="h-3 w-3" />
        {assessmentType === "leadership" ? "Needs 2 passes" : "Needs 1 pass"}
      </Badge>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button size="sm" onClick={handleUpload} disabled={loading} className="h-7 gap-1.5 text-xs">
        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        Upload
      </Button>
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

// ─── Assessment group row ─────────────────────────────────────────────────────

function AssessmentGroupRow({
  group,
  cin,
  token,
  onUploaded,
}: {
  group: AssessmentGroup;
  cin: number;
  token: string | null;
  onUploaded: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Outer div — never a button, to safely contain buttons inside */}
      <div className="flex w-full items-center gap-3 px-4 py-3 hover:bg-muted/40 transition-colors">
        {/* Clickable expand area */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v);
          }}
          className="flex flex-1 items-center gap-3 cursor-pointer min-w-0"
        >
          <span className="text-muted-foreground shrink-0">
            {expanded ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
          </span>

          <Badge className={cn("shrink-0 border text-xs", typeColour(group.assessment_type))}>
            {typeLabel(group.assessment_type)}
          </Badge>

          <span className="flex-1 text-sm font-medium">
            {group.assessments.length} assessment{group.assessments.length !== 1 ? "s" : ""}
          </span>

          <span className="text-xs text-muted-foreground mr-3 shrink-0">
            <span
              className={cn(
                "font-semibold",
                group.passed_count > 0 ? "text-green-600" : "text-muted-foreground"
              )}
            >
              {group.passed_count}
            </span>
            <span className="text-muted-foreground">/{group.required_to_upload} passed</span>
          </span>
        </div>

        {/* Upload button — sibling to expand area, not nested inside it */}
        <div className="shrink-0">
          <UploadButton
            cin={cin}
            assessmentType={group.assessment_type}
            canUpload={group.can_upload}
            uploaded={group.uploaded}
            token={token}
            onUploaded={onUploaded}
          />
        </div>
      </div>

      {expanded && (
        <div className="bg-muted/20">
          {group.assessments.map((a) => (
            <AssessmentPdfRow key={a.id} assessment={a} token={token} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Cadet card ───────────────────────────────────────────────────────────────

function CadetAssessmentCard({
  cadet,
  token,
  onUploaded,
}: {
  cadet: CadetAssessments;
  token: string | null;
  onUploaded: () => void;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(true);

  const totalAssessments = cadet.groups.reduce((s, g) => s + g.assessments.length, 0);
  const readyCount = cadet.groups.filter((g) => g.can_upload && !g.uploaded).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          {/* Expand toggle — div with role=button */}
          <div
            role="button"
            tabIndex={0}
            onClick={() => setExpanded((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v);
            }}
            className="flex flex-1 items-center gap-3 cursor-pointer min-w-0"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
              {cadet.first_name[0]}{cadet.last_name[0]}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-semibold">
                  {cadet.first_name} {cadet.last_name}
                </p>
                {cadet.rank && (
                  <Badge variant="secondary" className="text-xs hidden sm:inline-flex">
                    {cadet.rank}
                  </Badge>
                )}
                {readyCount > 0 && (
                  <Badge className="gap-1 bg-amber-500 text-white hover:bg-amber-500 text-xs">
                    <Upload className="h-2.5 w-2.5" />
                    {readyCount} ready
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                CIN {cadet.cin} · {totalAssessments} assessment
                {totalAssessments !== 1 ? "s" : ""}
                {cadet.flight && <> · {cadet.flight} Flight</>}
              </p>
            </div>
            <span className="text-muted-foreground shrink-0">
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
          </div>

          {/* View profile — real button, sibling not child of the expand div */}
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 text-xs text-muted-foreground"
            onClick={() => router.push(`/cadets/${cadet.cin}`)}
          >
            View profile
          </Button>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-2">
          {cadet.groups.map((group) => (
            <AssessmentGroupRow
              key={group.assessment_type}
              group={group}
              cin={cadet.cin}
              token={token}
              onUploaded={onUploaded}
            />
          ))}
        </CardContent>
      )}
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AssessmentsOverviewPage() {
  const { data: session } = useSession();
  const [cadets, setCadets] = useState<CadetAssessments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "ready" | "complete">("all");

  const token = session?.id_token ?? null;

  const fetchData = async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/assessments/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText);
      setCadets(await res.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const filtered = cadets.filter((c) => {
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      String(c.cin).includes(q);

    const matchesFilter =
      filter === "all" ||
      (filter === "ready" && c.groups.some((g) => g.can_upload && !g.uploaded)) ||
      (filter === "complete" && c.groups.every((g) => g.uploaded));

    return matchesSearch && matchesFilter;
  });

  const readyTotal = cadets.filter((c) =>
    c.groups.some((g) => g.can_upload && !g.uploaded)
  ).length;

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Assessments</h1>
          <p className="text-muted-foreground">
            {loading ? "Loading…" : `${cadets.length} cadets with assessments`}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <ClipboardList className="h-5 w-5 text-primary" />
        </div>
      </div>

      {!loading && readyTotal > 0 && (
        <div className="flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
          <Upload className="h-4 w-4 shrink-0 text-amber-600" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">
              {readyTotal} cadet{readyTotal !== 1 ? "s" : ""}
            </span>{" "}
            ready to have qualifications uploaded.
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or CIN…"
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {(["all", "ready", "complete"] as const).map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => setFilter(f)}
              className="capitalize"
            >
              {f}
            </Button>
          ))}
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading && (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {search ? `No cadets match "${search}"` : "No assessments found."}
        </p>
      )}

      {!loading &&
        filtered.map((cadet) => (
          <CadetAssessmentCard
            key={cadet.cin}
            cadet={cadet}
            token={token}
            onUploaded={fetchData}
          />
        ))}
    </div>
  );
}