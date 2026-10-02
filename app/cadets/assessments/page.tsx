"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { cadetInitials } from "@/lib/cadet-format";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { toast } from "sonner";
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
  Trash2,
  Info,
  CheckCheck,
  RotateCcw,
  Pencil,
  Lock,
  Clock,
  CloudUpload,
} from "lucide-react";
import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import { useBaderUploads, type UploadStatus } from "@/lib/bader-upload";
import { useConfirm } from "@/components/confirm-dialog";
import { AssessmentEditor } from "@/components/assessments/assessment-editor";
import { EmptyState } from "@/components/empty-state";

const EDITABLE_TYPES = ["Blue Leadership", "Blue Radio", "Blue Space", "MOI"];

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
  uploaded_at: string | null;
};

type CadetAssessments = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
  groups: AssessmentGroup[];
};

function typeLabel(t: string) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const TYPE_DOT_COLOURS: Record<string, string> = {
  "Blue Leadership": "bg-blue-500",
  first_aid: "bg-red-500",
  radio: "bg-purple-500",
  MOI: "bg-emerald-500",
};

function typeDotColour(t: string) {
  return TYPE_DOT_COLOURS[t] ?? "bg-muted-foreground/50";
}

const RETENTION_DAYS = 182;

function daysUntilDeletion(uploadedAt: string | null): number | null {
  if (!uploadedAt) return null;
  const elapsedMs = Date.now() - new Date(uploadedAt).getTime();
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24));
  return Math.max(0, RETENTION_DAYS - elapsedDays);
}

type AssessmentFilter = "active" | "ready" | "completed";

function groupMatchesFilter(g: AssessmentGroup, filter: AssessmentFilter) {
  if (filter === "active") return !g.uploaded;
  if (filter === "ready") return g.can_upload && !g.uploaded;
  return g.uploaded;
}

function uploadKey(cin: number, assessmentType: string) {
  return `${cin}:${assessmentType}`;
}

function InfoTooltip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
          aria-label="More information"
        >
          <Info className="size-3.5" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-56">{text}</TooltipContent>
    </Tooltip>
  );
}

function AssessmentPdfRow({
  assessment,
  token,
  locked,
  onDeleted,
  onEdited,
}: {
  assessment: AssessmentEntry;
  token: string | null;
  locked: boolean;
  onDeleted: (id: number) => void;
  onEdited: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);

  const canEdit = !locked && EDITABLE_TYPES.includes(assessment.assessment_type);

  const fetchPdf = async (): Promise<string | null> => {
    if (pdfUrl) return pdfUrl;
    if (!token) return null;
    setLoadingPdf(true);
    setPdfError(null);
    try {
      const res = await apiFetch(`${API_BASE}/assessments/${assessment.id}/pdf`, {
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

  const handleSaved = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
    setExpanded(false);
    setEditing(false);
    onEdited();
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

  const handleDelete = async () => {
    if (!token) return;
    setDeleting(true);
    try {
      const res = await apiFetch(`${API_BASE}/assessments/${assessment.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to delete");
      onDeleted(assessment.id);
    } catch {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div className="border-t first:border-t-0">
      <div className="hover:bg-muted/30 flex items-center gap-3 px-4 py-2.5 pl-4 transition-colors sm:pl-10">
        <div className="shrink-0">
          {assessment.passed === true ? (
            <CheckCircle2 className="text-success size-3.5" />
          ) : assessment.passed === false ? (
            <XCircle className="text-destructive size-3.5" />
          ) : (
            <div className="border-muted-foreground/30 size-3.5 rounded-full border-2" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-sm font-medium">
              {assessment.exercise_name ?? typeLabel(assessment.assessment_type)}
            </p>
            {assessment.passed !== null && (
              <Badge
                variant="outline"
                className={cn(
                  "shrink-0",
                  assessment.passed
                    ? "border-success/40 bg-success/10 text-success"
                    : "border-destructive/40 bg-destructive/10 text-destructive"
                )}
              >
                {assessment.passed ? "Pass" : "Fail"}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-xs">
            {formatDate(assessment.created_at)}
            {assessment.total_score !== null && (
              <>
                {" "}
                · <span className="font-mono">{assessment.total_score}/50</span>
              </>
            )}
            {assessment.assessor_name && <> · {assessment.assessor_name}</>}
          </p>
        </div>

        <div className="ml-1 flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={handleDownload}
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors"
            title="Download PDF"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={handleToggle}
            className="text-muted-foreground hover:text-foreground hover:bg-muted flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors"
          >
            {loadingPdf ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <FileText className="h-3.5 w-3.5" />
            )}
            {expanded ? "Hide" : "View"}
          </button>

          {canEdit ? (
            <button
              type="button"
              onClick={() => {
                setEditing((v) => !v);
                if (!editing) setExpanded(false);
              }}
              className={cn(
                "flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors",
                editing
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              title="Edit assessment"
            >
              <Pencil className="size-3.5" />
            </button>
          ) : locked ? (
            <span
              className="text-muted-foreground/60 flex items-center gap-1 rounded px-1.5 py-1 text-xs"
              title="Completed assessments are locked — reopen to edit"
            >
              <Lock className="size-3.5" />
            </span>
          ) : null}

          {confirmDelete ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="text-destructive hover:bg-destructive/10 cursor-pointer rounded px-1.5 py-1 text-xs font-medium transition-colors"
              >
                {deleting ? <Loader2 className="size-3.5 animate-spin" /> : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="text-muted-foreground hover:bg-muted cursor-pointer rounded px-1.5 py-1 text-xs transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors"
              title="Delete assessment"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {editing && (
        <div className="px-4 pb-3 pl-4 sm:pl-10">
          <AssessmentEditor
            assessmentId={assessment.id}
            assessmentType={assessment.assessment_type}
            token={token}
            onSaved={handleSaved}
            onCancel={() => setEditing(false)}
          />
        </div>
      )}

      {expanded && (
        <div className="px-4 pb-3 pl-4 sm:pl-10">
          {pdfError ? (
            <p className="text-destructive text-xs">{pdfError}</p>
          ) : pdfUrl ? (
            <iframe
              src={pdfUrl}
              className="w-full rounded border"
              style={{ height: "min(500px, 60vh)" }}
              title={`Assessment ${assessment.id}`}
            />
          ) : (
            <div className="text-muted-foreground flex items-center gap-2 py-4 text-xs">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading PDF…
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The upload itself runs in useBaderUploads, so its progress (a toast) and its
// place in the queue survive this button being replaced once a refetch moves
// the group to Completed.

function UploadButton({
  assessmentType,
  canUpload,
  uploaded,
  status,
  onUpload,
}: {
  assessmentType: string;
  canUpload: boolean;
  uploaded: boolean;
  status: UploadStatus | undefined;
  onUpload: () => void;
}) {
  const { data: session } = useSession();

  if (uploaded || status === "done") {
    return (
      <Badge variant="outline" className="border-success/40 bg-success/10 text-success gap-1.5">
        <CheckCircle2 className="size-3" /> Uploaded
      </Badge>
    );
  }

  if (!canUpload) {
    return (
      <Badge variant="outline" className="text-muted-foreground gap-1.5">
        <AlertCircle className="size-3" />
        <span className="hidden sm:inline">
          {assessmentType === "Blue Leadership" ? "Needs 2 passes" : "Needs 1 pass"}
        </span>
        <span className="sm:hidden">{assessmentType === "Blue Leadership" ? "2 passes" : "1 pass"}</span>
      </Badge>
    );
  }

  if (session?.role !== "staff") return null;

  const busy = status === "queued" || status === "uploading";
  return (
    <Button size="sm" onClick={onUpload} disabled={busy}>
      {status === "uploading" ? (
        <Loader2 className="animate-spin" data-icon="inline-start" />
      ) : status === "queued" ? (
        <Clock data-icon="inline-start" />
      ) : (
        <Upload data-icon="inline-start" />
      )}
      {status === "uploading" ? "Uploading…" : status === "queued" ? "Queued" : "Upload to SMS"}
    </Button>
  );
}

function CompletionControl({
  cin,
  assessmentType,
  uploaded,
  uploadedAt,
  token,
  onChanged,
}: {
  cin: number;
  assessmentType: string;
  uploaded: boolean;
  uploadedAt: string | null;
  token: string | null;
  onChanged: () => void;
}) {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isStaff = session?.role === "staff";

  const setCompleted = async (completed: boolean) => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `${API_BASE}/assessments/${cin}/${encodeURIComponent(assessmentType)}/mark-complete`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ completed }),
        }
      );
      if (!res.ok) {
        const detail = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(detail?.detail ?? "Failed");
      }
      setConfirm(false);
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    }
  };

  if (uploaded) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Badge variant="outline" className="border-success/40 bg-success/10 text-success gap-1.5">
          <CheckCircle2 className="size-3" /> Completed
        </Badge>
        {uploadedAt && <span className="text-muted-foreground text-[11px]">{formatDate(uploadedAt)}</span>}
        {(() => {
          const days = daysUntilDeletion(uploadedAt);
          if (days === null) return null;
          return (
            <span
              className={cn(
                "text-[11px]",
                days < 30 ? "text-warning font-medium" : "text-muted-foreground/70"
              )}
            >
              {days === 0 ? "Deletes today" : `Deletes in ${days}d`}
            </span>
          );
        })()}
        {isStaff &&
          (confirm ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setCompleted(false)}
                disabled={loading}
                className="text-warning hover:bg-warning/15 cursor-pointer rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors"
              >
                {loading ? <Loader2 className="size-3 animate-spin" /> : "Reopen"}
              </button>
              <button
                type="button"
                onClick={() => setConfirm(false)}
                className="text-muted-foreground hover:bg-muted cursor-pointer rounded px-1.5 py-0.5 text-[11px] transition-colors"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirm(true)}
              className="text-muted-foreground hover:text-warning flex cursor-pointer items-center gap-1 text-[11px] transition-colors"
              title="Move back to active"
            >
              <RotateCcw className="size-3" /> Reopen
            </button>
          ))}
        {error && <p className="text-destructive text-[11px]">{error}</p>}
      </div>
    );
  }

  if (!isStaff) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      {confirm ? (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setCompleted(true)}
            disabled={loading}
            className="text-success hover:bg-success/10 cursor-pointer rounded px-1.5 py-1 text-xs font-medium transition-colors"
          >
            {loading ? <Loader2 className="size-3.5 animate-spin" /> : "Confirm"}
          </button>
          <button
            type="button"
            onClick={() => setConfirm(false)}
            className="text-muted-foreground hover:bg-muted cursor-pointer rounded px-1.5 py-1 text-xs transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirm(true)}
          className="text-muted-foreground hover:bg-success/10 hover:text-success flex cursor-pointer items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors"
          title="Mark this set as completed without uploading to SMS"
        >
          <CheckCheck className="size-3.5" />
          <span className="hidden sm:inline">Mark complete</span>
        </button>
      )}
      {error && <p className="text-destructive text-[11px]">{error}</p>}
    </div>
  );
}

function CombinedPdfButton({
  cin,
  assessmentType,
  token,
}: {
  cin: number;
  assessmentType: string;
  token: string | null;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleView = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(
        `${API_BASE}/assessments/group/${cin}/${encodeURIComponent(assessmentType)}/combined-pdf`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Failed to load combined PDF");
      const blob = await res.blob();
      window.open(URL.createObjectURL(blob), "_blank");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-muted/30 flex items-center gap-2 border-t px-4 py-2">
      <button
        type="button"
        onClick={handleView}
        disabled={loading}
        className="text-muted-foreground hover:text-foreground hover:bg-muted flex cursor-pointer items-center gap-1.5 rounded px-1.5 py-1 text-xs transition-colors"
        title="Every assessment sheet and lesson plan for this qualification, oldest first, as one PDF"
      >
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
        Combined record (sheets + lesson plans)
      </button>
      {error && <p className="text-destructive text-[11px]">{error}</p>}
    </div>
  );
}

function AssessmentGroupRow({
  cin,
  group,
  token,
  uploadStatus,
  onUpload,
  onUploaded,
  onAssessmentDeleted,
}: {
  cin: number;
  group: AssessmentGroup;
  token: string | null;
  uploadStatus: UploadStatus | undefined;
  onUpload: () => void;
  onUploaded: () => void;
  onAssessmentDeleted: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-card rounded-lg border">
      {/* Header: stacks on mobile (type row, then passes + actions full-width),
          two columns on sm+ (type left, passes + actions stacked right). */}
      <div className="hover:bg-muted/40 flex w-full flex-col gap-2 px-4 py-3 transition-colors sm:flex-row sm:items-start sm:gap-3">
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") setExpanded((v) => !v);
          }}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 pt-0.5"
        >
          <span className="text-muted-foreground shrink-0">
            {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          </span>
          <div className="min-w-0">
            <Badge variant="outline" className="gap-1.5">
              <span className={cn("size-2 rounded-full", typeDotColour(group.assessment_type))} />
              {typeLabel(group.assessment_type)}
            </Badge>
            <p className="text-muted-foreground mt-0.5 pl-0.5 text-xs">
              {group.assessments.length} assessment{group.assessments.length !== 1 ? "s" : ""}
            </p>
          </div>
        </div>

        {/* Passes count + upload/completion controls. Full-width row (indented
            under the badge) on mobile; stacked right column on sm+. */}
        <div className="flex items-center justify-between gap-2 pl-6 sm:shrink-0 sm:flex-col sm:items-end sm:justify-start sm:gap-1.5 sm:pl-0">
          <span className="text-muted-foreground text-xs whitespace-nowrap">
            <span
              className={cn(
                "font-semibold",
                group.passed_count > 0 ? "text-success" : "text-muted-foreground"
              )}
            >
              {group.passed_count}
            </span>
            {group.assessment_type !== "MOI" && <span>/{group.required_to_upload}</span>}
            {" passed"}
          </span>

          {group.uploaded ? (
            <CompletionControl
              cin={cin}
              assessmentType={group.assessment_type}
              uploaded={group.uploaded}
              uploadedAt={group.uploaded_at}
              token={token}
              onChanged={onUploaded}
            />
          ) : (
            <div className="flex flex-wrap items-center justify-end gap-1.5">
              <UploadButton
                assessmentType={group.assessment_type}
                canUpload={group.can_upload}
                uploaded={group.uploaded}
                status={uploadStatus}
                onUpload={onUpload}
              />
              <InfoTooltip text="Starts a background scraper that adds this qualification and uploads the assessment PDFs directly to Bader SMS, then puts in the badge order for it." />
              <CompletionControl
                cin={cin}
                assessmentType={group.assessment_type}
                uploaded={group.uploaded}
                uploadedAt={group.uploaded_at}
                token={token}
                onChanged={onUploaded}
              />
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <div className="bg-muted/20">
          {group.assessment_type === "MOI" && (
            <CombinedPdfButton cin={cin} assessmentType={group.assessment_type} token={token} />
          )}
          {group.assessments.map((a) => (
            <AssessmentPdfRow
              key={a.id}
              assessment={a}
              token={token}
              locked={group.uploaded}
              onDeleted={onAssessmentDeleted}
              onEdited={onUploaded}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CadetAssessmentCard({
  cadet,
  token,
  uploadStatuses,
  onUpload,
  onUploaded,
  onAssessmentDeleted,
}: {
  cadet: CadetAssessments;
  token: string | null;
  uploadStatuses: Record<string, UploadStatus>;
  onUpload: (cadet: CadetAssessments, group: AssessmentGroup) => void;
  onUploaded: () => void;
  onAssessmentDeleted: (id: number) => void;
}) {
  const router = useRouter();

  const totalAssessments = cadet.groups.reduce((s, g) => s + g.assessments.length, 0);
  const readyCount = cadet.groups.filter((g) => g.can_upload && !g.uploaded).length;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <Avatar className="size-9 shrink-0">
              <AvatarFallback className="text-sm">
                {cadetInitials(cadet.first_name, cadet.last_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">
                  {cadet.first_name} {cadet.last_name}
                </p>
                {cadet.rank && (
                  <Badge variant="secondary" className="hidden sm:inline-flex">
                    {cadet.rank}
                  </Badge>
                )}
                {readyCount > 0 && (
                  <Badge variant="outline" className="border-warning/40 bg-warning/15 text-warning gap-1">
                    <Upload className="size-2.5" />
                    {readyCount} ready
                  </Badge>
                )}
              </div>
              <p className="text-muted-foreground text-xs">
                {totalAssessments} assessment{totalAssessments !== 1 ? "s" : ""}
              </p>
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground shrink-0 text-xs"
            onClick={() => router.push(`/cadets/${cadet.cin}`)}
          >
            View profile
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-2 pt-0">
        {cadet.groups.map((group) => (
          <AssessmentGroupRow
            key={group.assessment_type}
            cin={cadet.cin}
            group={group}
            token={token}
            uploadStatus={uploadStatuses[uploadKey(cadet.cin, group.assessment_type)]}
            onUpload={() => onUpload(cadet, group)}
            onUploaded={onUploaded}
            onAssessmentDeleted={onAssessmentDeleted}
          />
        ))}
      </CardContent>
    </Card>
  );
}

export default function AssessmentsOverviewPage() {
  const { data: session } = useSession();
  const [cadets, setCadets] = useState<CadetAssessments[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<AssessmentFilter>("active");
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const token = session?.id_token ?? null;
  const { confirm, confirmDialog } = useConfirm();
  const [bulk, setBulk] = useState<{ total: number; finished: number } | null>(null);

  // `quiet` refreshes after an upload without swapping the list for skeletons —
  // during "Upload all" that would flash the page once per cadet.
  const fetchData = async ({ quiet = false } = {}) => {
    if (!token) return;
    if (!quiet) setLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/assessments/overview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail ?? res.statusText);
      setCadets(await res.json());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  const handleAssessmentDeleted = (deletedId: number) => {
    setCadets((prev) =>
      prev
        .map((cadet) => ({
          ...cadet,
          groups: cadet.groups
            .map((group) => ({
              ...group,
              assessments: group.assessments.filter((a) => a.id !== deletedId),
              passed_count: group.assessments.filter((a) => a.id !== deletedId && a.passed === true).length,
            }))
            .filter((group) => group.assessments.length > 0),
        }))
        .filter((cadet) => cadet.groups.length > 0)
    );
  };

  useEffect(() => {
    fetchData();
  }, [token]);

  const { statuses: uploadStatuses, upload } = useBaderUploads(token, () => fetchData({ quiet: true }));

  const uploadGroup = (cadet: CadetAssessments, group: AssessmentGroup) =>
    upload(
      uploadKey(cadet.cin, group.assessment_type),
      group.assessments.map((a) => a.id),
      `${typeLabel(group.assessment_type)} for ${cadet.first_name} ${cadet.last_name}`
    );

  const availableTypes = Array.from(new Set(cadets.flatMap((c) => c.groups.map((g) => g.assessment_type))));

  const matchesType = (g: AssessmentGroup) => !typeFilter || g.assessment_type === typeFilter;

  const filtered = cadets
    .map((c) => ({
      ...c,
      groups: c.groups.filter((g) => groupMatchesFilter(g, filter) && matchesType(g)),
    }))
    .filter((c) => {
      if (c.groups.length === 0) return false;
      const q = search.toLowerCase();
      return (
        !q ||
        c.first_name.toLowerCase().includes(q) ||
        c.last_name.toLowerCase().includes(q) ||
        String(c.cin).includes(q)
      );
    });

  const countForFilter = (f: AssessmentFilter) =>
    cadets.filter((c) => c.groups.some((g) => groupMatchesFilter(g, f) && matchesType(g))).length;
  const tabCounts: Record<AssessmentFilter, number> = {
    active: countForFilter("active"),
    ready: countForFilter("ready"),
    completed: countForFilter("completed"),
  };

  const readyTotal = countForFilter("ready");

  // What "Upload all" would send: every ready group currently on screen (so the
  // search and type filters narrow it) that isn't already queued or running.
  const pendingUploads = filtered.flatMap((cadet) =>
    cadet.groups
      .filter((g) => {
        const status = uploadStatuses[uploadKey(cadet.cin, g.assessment_type)];
        return (
          g.can_upload && !g.uploaded && status !== "queued" && status !== "uploading" && status !== "done"
        );
      })
      .map((group) => ({ cadet, group }))
  );

  const uploadAll = () => {
    const batch = pendingUploads;
    setBulk({ total: batch.length, finished: 0 });
    let succeeded = 0;
    Promise.all(
      batch.map(({ cadet, group }) =>
        uploadGroup(cadet, group).then((ok) => {
          if (ok) succeeded++;
          setBulk((b) => b && { ...b, finished: b.finished + 1 });
        })
      )
    ).then(() => {
      setBulk(null);
      const failed = batch.length - succeeded;
      if (failed)
        toast.error(`${succeeded} of ${batch.length} uploaded — ${failed} failed`, { duration: 8000 });
      else toast.success(`All ${batch.length} qualification${batch.length !== 1 ? "s" : ""} uploaded`);
    });
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="Cadet Assessments"
        description={loading ? "Loading…" : `${cadets.length} cadets with assessment sheets`}
      />

      {!loading && readyTotal > 0 && (
        <Alert>
          <Upload className="text-warning" />
          <AlertTitle>
            {readyTotal} cadet{readyTotal !== 1 ? "s" : ""} ready to have qualifications uploaded
          </AlertTitle>
        </Alert>
      )}

      <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-10 flex flex-col gap-3 border-b pt-2 pb-3 backdrop-blur">
        <div className="flex flex-col gap-3 sm:flex-row">
          <InputGroup className="flex-1">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              placeholder="Search by name or CIN…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
          <ToggleGroup
            type="single"
            variant="outline"
            value={filter}
            onValueChange={(v) => v && setFilter(v as AssessmentFilter)}
          >
            {(["active", "ready", "completed"] as const).map((f) => (
              <ToggleGroupItem key={f} value={f} className="gap-1.5 capitalize">
                {f}
                <span className="bg-muted text-muted-foreground inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
                  {tabCounts[f]}
                </span>
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        {availableTypes.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTypeFilter(null)}
              className={cn(
                "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                typeFilter === null
                  ? "border-foreground/20 bg-foreground/10 text-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/70 border-transparent"
              )}
            >
              All types
            </button>
            {availableTypes.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTypeFilter(typeFilter === t ? null : t)}
                className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                  typeFilter === t
                    ? "border-foreground/20 bg-foreground/10 text-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/70 border-transparent"
                )}
              >
                <span className={cn("size-2 rounded-full", typeDotColour(t))} />
                {typeLabel(t)}
              </button>
            ))}
          </div>
        )}
      </div>

      {!loading && filter === "ready" && session?.role === "staff" && (pendingUploads.length > 0 || bulk) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">
            {bulk
              ? `${bulk.finished} of ${bulk.total} finished — up to 3 upload at once, the rest are queued.`
              : `${pendingUploads.length} qualification${pendingUploads.length !== 1 ? "s" : ""} ready to upload.`}
          </p>
          <Button
            size="sm"
            disabled={!!bulk || pendingUploads.length === 0}
            onClick={() =>
              confirm(
                `Upload ${pendingUploads.length} qualification${pendingUploads.length !== 1 ? "s" : ""} to Bader SMS and order their badges? Up to 3 run at once; the rest queue.`,
                uploadAll
              )
            }
          >
            {bulk ? (
              <Loader2 className="animate-spin" data-icon="inline-start" />
            ) : (
              <CloudUpload data-icon="inline-start" />
            )}
            {bulk ? "Uploading…" : `Upload all (${pendingUploads.length})`}
          </Button>
        </div>
      )}

      {!loading && filter === "completed" && filtered.length > 0 && (
        <Alert>
          <Info />
          <AlertTitle className="text-muted-foreground font-normal">
            Completed assessments are automatically deleted 6 months after they were uploaded.
          </AlertTitle>
        </Alert>
      )}

      <ErrorAlert message={error} title="Could not load assessments" />

      {loading && (
        <div className="flex flex-col gap-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title="Nothing here"
          description={
            <>
              {search
                ? `No cadets match "${search}".`
                : filter === "active"
                  ? "No active assessments — everything is uploaded or completed."
                  : filter === "ready"
                    ? "No assessments are ready to upload."
                    : "No completed assessments yet."}
            </>
          }
        />
      )}

      {!loading &&
        filtered.map((cadet) => (
          <CadetAssessmentCard
            key={cadet.cin}
            cadet={cadet}
            token={token}
            uploadStatuses={uploadStatuses}
            onUpload={uploadGroup}
            onUploaded={() => fetchData()}
            onAssessmentDeleted={handleAssessmentDeleted}
          />
        ))}
      {confirmDialog}
    </div>
  );
}
