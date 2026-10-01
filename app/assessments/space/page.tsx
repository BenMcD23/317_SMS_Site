"use client";

import { useState, useEffect, useCallback } from "react";
import { useAssessmentDraft } from "@/hooks/useAssessmentDraft";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Loader2, CheckCircle2, XCircle, RotateCcw } from "lucide-react";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import { SPACE_CHECKLIST, SPACE_EXPERIMENTS_MAX, spacePassed } from "@/lib/assessment-fields";
import { CadetSearchInput } from "@/components/cadet-search";
import { AssessorCard } from "@/components/assessments/assessor-card";
import { SectionHeading } from "@/components/section-heading";

function ChecklistRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-all hover:shadow-sm",
        checked ? "border-success/40 bg-success/5" : "hover:border-primary/30"
      )}
      onClick={() => onChange(!checked)}
    >
      <div
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
          checked ? "border-success bg-success" : "border-muted-foreground/40"
        )}
      >
        {checked && <CheckCircle2 className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
      </div>
      <p className="text-sm leading-snug">{label}</p>
    </div>
  );
}

type FormState = {
  cadetCin: number | null;
  cadetName: string;
  checklist: Record<string, boolean>;
  ptsDate: string;
  experiments: string;
  cadetSignature: string | null;
  assessorName: string;
  assessorRole: string;
  date: string;
};

const initialState = (): FormState => ({
  cadetCin: null,
  cadetName: "",
  checklist: Object.fromEntries(SPACE_CHECKLIST.map((c) => [c.id, false])),
  ptsDate: "",
  experiments: "",
  cadetSignature: null,
  assessorName: "",
  assessorRole: "",
  date: new Date().toISOString().split("T")[0],
});

export default function SpaceAssessmentPage() {
  const { data: session } = useSession();
  const {
    state: form,
    setState: setForm,
    clearDraft,
    draftRestored,
  } = useAssessmentDraft("space", initialState(), session?.user?.email, (s) => s.cadetCin !== null);
  const [draftBannerDismissed, setDraftBannerDismissed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [assessmentId, setAssessmentId] = useState<number | null>(null);

  // Signature state
  const [showDrawOverride, setShowDrawOverride] = useState(false);
  const [savedSignatureUrl, setSavedSignatureUrl] = useState<string | null>(null);
  const [overrideSignature, setOverrideSignature] = useState<string | null>(null);
  const [sigLoading, setSigLoading] = useState(true);
  const [savedSignatureB64, setSavedSignatureB64] = useState<string | null>(null);

  const loadAssessorName = useCallback(async () => {
    if (!session?.id_token) return;
    const res = await apiFetch(`${API_BASE}/settings/assessor-name`, {
      headers: { Authorization: `Bearer ${session.id_token}` },
    });
    if (res.ok) {
      const d = await res.json();
      const name = d.assessor_name || session.user?.name || "";
      setForm((f) => ({ ...f, assessorName: name }));
    }
  }, [session, setForm]);

  useEffect(() => {
    if (!session?.id_token) return;

    loadAssessorName();

    apiFetch(`${API_BASE}/get-signature`, {
      headers: { Authorization: `Bearer ${session.id_token}` },
    })
      .then(async (res) => {
        if (!res.ok) return;
        const blob = await res.blob();
        setSavedSignatureUrl(URL.createObjectURL(blob));
        const reader = new FileReader();
        reader.onloadend = () => setSavedSignatureB64(reader.result as string);
        reader.readAsDataURL(blob);
      })
      .finally(() => setSigLoading(false));
  }, [session, loadAssessorName]);

  const checkedCount = Object.values(form.checklist).filter(Boolean).length;
  const allChecked = spacePassed(form.checklist);
  const effectiveSignature = overrideSignature ?? savedSignatureB64 ?? null;

  const handleReset = () => {
    setShowDrawOverride(false);
    setForm(initialState());
    setError(null);
    setOverrideSignature(null);
    setSubmitted(false);
    setAssessmentId(null);
    clearDraft();
    setDraftBannerDismissed(true);
    loadAssessorName();
  };

  const handleSubmit = async () => {
    if (!form.cadetCin) {
      setError("Please select a cadet from the search results.");
      return;
    }
    if (form.checklist.pts && !form.ptsDate) {
      setError("Please enter the date the Blue Space PTS was completed.");
      return;
    }
    if (!effectiveSignature) {
      setError("An instructor signature is required. Please draw or use your saved signature.");
      return;
    }
    if (!form.cadetSignature) {
      setError("The cadet needs to sign the checklist.");
      return;
    }
    if (!form.assessorName) {
      setError("Please enter the assessor name.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const payload = {
        cadet_cin: form.cadetCin,
        checklist: form.checklist,
        pts_date: form.ptsDate,
        experiments: form.experiments,
        assessor_name: form.assessorName,
        assessor_signature: effectiveSignature,
        cadet_signature: form.cadetSignature,
        date: form.date,
      };

      const res = await apiFetch(`${API_BASE}/assessments/space/add-assessment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.id_token ? { Authorization: `Bearer ${session.id_token}` } : {}),
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const detail = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(detail?.detail || "Failed to save assessment");
      }

      const result = await res.json();
      clearDraft();
      setAssessmentId(result.assessment_id);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
        <SectionHeading
          title="Space Assessment"
          description="Blue Space — Fundamentals of the Solar System"
        />

        <div className="border-success/30 bg-success/10 flex flex-col items-center gap-6 rounded-xl border px-8 py-12 text-center">
          <div className="bg-success/20 flex h-16 w-16 items-center justify-center rounded-full">
            <CheckCircle2 className="text-success h-8 w-8" />
          </div>
          <div className="space-y-1">
            <h2 className="text-foreground text-xl font-semibold">Checklist Saved</h2>
            <p className="text-muted-foreground text-sm">
              {form.cadetName}&apos;s Blue Space checklist has been recorded successfully.
            </p>
            {assessmentId && (
              <p className="text-muted-foreground mt-1 text-xs">Assessment ID: #{assessmentId}</p>
            )}
          </div>

          <div className="bg-card w-full max-w-xs space-y-1.5 rounded-lg border px-4 py-3 text-left text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cadet</span>
              <span className="font-medium">{form.cadetName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sections completed</span>
              <span className="font-medium">
                {checkedCount} / {SPACE_CHECKLIST.length}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Result</span>
              {allChecked ? (
                <Badge className="bg-success hover:bg-success gap-1 text-xs text-white">
                  <CheckCircle2 className="h-3 w-3" /> PASS
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1 text-xs">
                  <XCircle className="h-3 w-3" /> INCOMPLETE
                </Badge>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Instructor</span>
              <span className="font-medium">{form.assessorName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">{form.date}</span>
            </div>
          </div>

          <Button onClick={handleReset} variant="outline" className="mt-2">
            <RotateCcw className="mr-2 h-4 w-4" />
            Submit Another Checklist
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <SectionHeading title="Space Assessment" description="Blue Space — Fundamentals of the Solar System" />

      {draftRestored && !draftBannerDismissed && (
        <div className="border-warning/30 bg-warning/10 flex items-center justify-between rounded-lg border px-4 py-3 text-sm">
          <span className="text-warning">Draft restored from your last session.</span>
          <Button
            variant="outline"
            size="sm"
            onClick={handleReset}
            className="border-warning/40 text-warning hover:bg-warning/10 hover:text-warning ml-4"
          >
            Reset Form
          </Button>
        </div>
      )}

      {sigLoading ? (
        <div className="space-y-6">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-16 w-full rounded-lg" />
          <div className="space-y-2">
            {SPACE_CHECKLIST.map((c) => (
              <Skeleton key={c.id} className="h-14 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      ) : (
        <>
          {/* Cadet */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Cadet</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1.5">
                <Label>Cadet Being Assessed</Label>
                <CadetSearchInput
                  token={session?.id_token ?? null}
                  selectedCin={form.cadetCin}
                  selectedName={form.cadetName}
                  onSelect={(cin, name) => setForm((f) => ({ ...f, cadetCin: cin || null, cadetName: name }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Progress */}
          <div className="bg-card flex items-center gap-4 rounded-lg border p-4">
            <div className="flex-1">
              <div className="mb-1.5 flex items-center justify-between text-sm">
                <span className="text-muted-foreground font-medium">
                  {checkedCount} / {SPACE_CHECKLIST.length} sections completed
                </span>
              </div>
              <div className="bg-muted h-2 w-full overflow-hidden rounded-full">
                <div
                  className="bg-primary h-full rounded-full transition-all duration-300"
                  style={{ width: `${Math.round((checkedCount / SPACE_CHECKLIST.length) * 100)}%` }}
                />
              </div>
            </div>
            {allChecked && (
              <Badge className="bg-success hover:bg-success shrink-0 gap-1.5 text-white">
                <CheckCircle2 className="h-3.5 w-3.5" /> All completed
              </Badge>
            )}
          </div>

          {/* Checklist — the PTS date sits under its own row, as on the sheet */}
          <div className="space-y-2">
            {SPACE_CHECKLIST.map((c) => (
              <div key={c.id} className="space-y-2">
                <ChecklistRow
                  label={c.label}
                  checked={form.checklist[c.id]}
                  onChange={(v) => setForm((f) => ({ ...f, checklist: { ...f.checklist, [c.id]: v } }))}
                />
                {c.id === "pts" && form.checklist.pts && (
                  <div className="space-y-1.5 pb-2 pl-12">
                    <Label htmlFor="ptsDate">Date PTS completed</Label>
                    <Input
                      id="ptsDate"
                      type="date"
                      value={form.ptsDate}
                      onChange={(e) => setForm((f) => ({ ...f, ptsDate: e.target.value }))}
                      className="max-w-xs"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Practical experiments */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Practical Experiments</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="experiments">Practical experiments to support PTS</Label>
                <span
                  className={cn(
                    "text-xs",
                    form.experiments.length > SPACE_EXPERIMENTS_MAX
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {form.experiments.length} / {SPACE_EXPERIMENTS_MAX}
                </span>
              </div>
              <Textarea
                id="experiments"
                placeholder="List the practical experiments completed..."
                rows={4}
                maxLength={SPACE_EXPERIMENTS_MAX}
                value={form.experiments}
                onChange={(e) =>
                  setForm((f) => ({ ...f, experiments: e.target.value.slice(0, SPACE_EXPERIMENTS_MAX) }))
                }
              />
            </CardContent>
          </Card>

          {/* Instructor + cadet sign-off */}
          <AssessorCard
            assessorName={form.assessorName}
            onAssessorNameChange={(v) => setForm((f) => ({ ...f, assessorName: v }))}
            assessorRole={form.assessorRole}
            onAssessorRoleChange={(v) => setForm((f) => ({ ...f, assessorRole: v }))}
            date={form.date}
            onDateChange={(v) => setForm((f) => ({ ...f, date: v }))}
            showNameFromAccount={!!session?.user?.name}
            sigLoading={sigLoading}
            savedSignatureUrl={savedSignatureUrl}
            overrideSignature={overrideSignature}
            onOverrideSignature={setOverrideSignature}
            showDraw={showDrawOverride}
            onSetShowDraw={setShowDrawOverride}
            cadetSignature={form.cadetSignature}
            onCadetSignature={(v) => setForm((f) => ({ ...f, cadetSignature: v }))}
          />

          {error && (
            <p className="border-destructive/30 bg-destructive/10 text-destructive rounded-lg border px-4 py-3 text-sm">
              {error}
            </p>
          )}

          <div className="flex gap-3">
            <Button onClick={handleSubmit} disabled={loading} className="flex-1 sm:min-w-48 sm:flex-none">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Submit Checklist
                </>
              )}
            </Button>
            <Button variant="outline" onClick={handleReset}>
              Reset Form
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
