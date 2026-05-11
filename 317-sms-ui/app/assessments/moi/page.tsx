"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2, CheckCircle2, XCircle, RotateCcw } from "lucide-react";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import { CadetSearchInput } from "@/components/cadet-search";
import { AssessorCard } from "@/components/assessments/assessor-card";

// ─── Data ─────────────────────────────────────────────────────────────────────
const SECTIONS = [
  {
    id: "identifying",
    title: "Identifying Participants Needs",
    commentLimit: 670,
    questions: [
      { id: 1, text: "Have participants needs been identified?" },
      { id: 2, text: "Are objectives SMART?" },
    ],
  },
  {
    id: "planning",
    title: "Planning and Preparation of Lesson",
    commentLimit: 900,
    questions: [
      { id: 3, text: "Was lesson plan submitted and complete?" },
      { id: 4, text: "Were resources prepared and ready?" },
      { id: 5, text: "Was delivery of lesson properly structured?" },
    ],
  },
  {
    id: "resources",
    title: "Use of Resources",
    commentLimit: 900,
    questions: [
      { id: 6, text: "Were resources used effectively?" },
      { id: 7, text: "How well did resources support delivery of lesson?" },
    ],
  },
  {
    id: "delivery",
    title: "Delivery of Lesson",
    commentLimit: 500,
    questions: [
      { id: 8, text: "Was the delivery of the session confident and clear?" },
      { id: 9, text: "How well did the candidate manage the classroom environment?" },
    ],
  },
  {
    id: "assessment",
    title: "Assessment of Students",
    commentLimit: 900,
    questions: [
      { id: 10, text: "How well was the student's learning assessed throughout the session?" },
      { id: 11, text: "How well did the assessment at the end of the session achieve initial objectives?" },
    ],
  },
  {
    id: "evaluation",
    title: "Evaluation of Lesson",
    commentLimit: 900,
    questions: [
      { id: 12, text: "During the session, did the instructor actively adapt to any changes in the lesson plan?" },
      { id: 13, text: "During debrief, was the instructor able to evaluate their lesson?" },
    ],
  },
] as const;

const ALL_QUESTIONS: { id: number; text: string }[] = SECTIONS.flatMap((s) =>
  s.questions.map((q) => ({ id: q.id, text: q.text }))
);
const PASS_SCORE = 35;
const MAX_SCORE = ALL_QUESTIONS.length * 5;

// ─── Score selector ───────────────────────────────────────────────────────────
function ScoreButton({
  score,
  selected,
  onClick,
}: {
  score: number;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-sm font-semibold transition-all",
        selected
          ? score === 1
            ? "border-red-500 bg-red-500 text-white shadow-sm"
            : score === 5
            ? "border-green-500 bg-green-500 text-white shadow-sm"
            : "border-primary bg-primary text-primary-foreground shadow-sm"
          : "border-muted text-muted-foreground hover:border-primary/40 hover:bg-muted"
      )}
    >
      {score}
    </button>
  );
}

function QuestionRow({
  question,
  value,
  onChange,
}: {
  question: { id: number; text: string };
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
        {question.id}
      </span>
      <p className="flex-1 text-sm">{question.text}</p>
      <div className="flex shrink-0 gap-1">
        {[1, 2, 3, 4, 5].map((s) => (
          <ScoreButton key={s} score={s} selected={value === s} onClick={() => onChange(s)} />
        ))}
      </div>
    </div>
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────
type FormState = {
  cadetCin: number | null;
  cadetSurname: string;
  cadetForename: string;
  sqnDf: string;
  wingCcf: string;
  baderReference: string;
  placeOfAssessment: string;
  date: string;
  scores: Record<number, number | null>;
  sectionComments: Record<string, string>;
  strengthsSummary: string;
  improvementsSummary: string;
  generalComments: string;
  assessorName: string;
  assessorRole: string;
  cadetSignature: string | null;
};

const initialState = (): FormState => ({
  cadetCin: null,
  cadetSurname: "",
  cadetForename: "",
  sqnDf: "317",
  wingCcf: "GM",
  baderReference: "",
  placeOfAssessment: "317 Squadron",
  date: new Date().toISOString().split("T")[0],
  scores: Object.fromEntries(ALL_QUESTIONS.map((q) => [q.id, null])),
  sectionComments: Object.fromEntries(SECTIONS.map((s) => [s.id, ""])),
  strengthsSummary: "",
  improvementsSummary: "",
  generalComments: "",
  assessorName: "",
  assessorRole: "",
  cadetSignature: null,
});

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function MoiAssessmentPage() {
  const { data: session } = useSession();
  const [form, setForm] = useState<FormState>(initialState());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [assessmentId, setAssessmentId] = useState<number | null>(null);

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
      setForm((f) => ({ ...f, assessorName: d.assessor_name || session.user?.name || "" }));
    }
  }, [session]);

  useEffect(() => {
    if (!session?.id_token) return;

    apiFetch(`${API_BASE}/settings/assessor-name`, {
      headers: { Authorization: `Bearer ${session.id_token}` },
    }).then((res) => {
      if (res.ok)
        res.json().then((d) =>
          setForm((f) => ({ ...f, assessorName: d.assessor_name || session.user?.name || "" }))
        );
    });

    setSigLoading(true);
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
  }, [session]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const answeredScores = Object.values(form.scores).filter((v): v is number => v !== null);
  const totalScore = answeredScores.reduce((a, b) => a + b, 0);
  const allAnswered = answeredScores.length === ALL_QUESTIONS.length;
  const hasOneScore = Object.values(form.scores).some((v) => v === 1);
  const passed = allAnswered && totalScore >= PASS_SCORE && !hasOneScore;
  const completionPct = Math.round((answeredScores.length / ALL_QUESTIONS.length) * 100);
  const effectiveSignature = overrideSignature ?? savedSignatureB64 ?? null;

  const handleReset = () => {
    setShowDrawOverride(false);
    setForm(initialState());
    setError(null);
    setOverrideSignature(null);
    setSubmitted(false);
    setAssessmentId(null);
    loadAssessorName();
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.cadetCin || !form.cadetSurname) {
      setError("Please select a candidate from the search.");
      return;
    }
    if (!allAnswered) {
      setError("Please score all 13 questions before submitting.");
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
        cadet_surname: form.cadetSurname,
        cadet_forename: form.cadetForename,
        sqn_df: form.sqnDf,
        wing_ccf: form.wingCcf,
        bader_reference: form.baderReference,
        place_of_assessment: form.placeOfAssessment,
        scores: form.scores,
        section_comments: form.sectionComments,
        strengths_summary: form.strengthsSummary,
        improvements_summary: form.improvementsSummary,
        general_comments: form.generalComments,
        assessor_name: form.assessorName,
        assessor_role: form.assessorRole,
        assessor_signature: effectiveSignature,
        cadet_signature: form.cadetSignature,
        date: form.date,
      };

      const res = await apiFetch(`${API_BASE}/assessments/moi/add-assessment`, {
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
      setAssessmentId(result.assessment_id);
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 pb-16">
        <div>
          <h1 className="text-3xl font-bold">MOI Assessment</h1>
          <p className="text-muted-foreground">Air Cadet Methods of Instruction Course</p>
        </div>

        <div className="flex flex-col items-center gap-6 rounded-xl border border-green-500/30 bg-green-500/10 px-8 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold">Assessment Saved</h2>
            <p className="text-sm text-muted-foreground">
              {form.cadetForename} {form.cadetSurname}&apos;s MOI assessment has been recorded.
            </p>
            {assessmentId && (
              <p className="text-xs text-muted-foreground mt-1">Assessment ID: #{assessmentId}</p>
            )}
          </div>

          <div className="w-full max-w-xs rounded-lg border bg-card px-4 py-3 text-left text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Candidate</span>
              <span className="font-medium">{form.cadetForename} {form.cadetSurname}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Score</span>
              <span className="font-medium">{totalScore} / {MAX_SCORE}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Result</span>
              {passed ? (
                <Badge className="bg-green-500 text-white hover:bg-green-500 gap-1 text-xs">
                  <CheckCircle2 className="h-3 w-3" /> PASS
                </Badge>
              ) : (
                <Badge variant="destructive" className="gap-1 text-xs">
                  <XCircle className="h-3 w-3" /> FAIL
                </Badge>
              )}
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Assessor</span>
              <span className="font-medium">{form.assessorName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date</span>
              <span className="font-medium">{form.date}</span>
            </div>
          </div>

          <Button onClick={handleReset} variant="outline" className="mt-2">
            <RotateCcw className="mr-2 h-4 w-4" />
            Submit Another Assessment
          </Button>
        </div>
      </div>
    );
  }

  // ── Main form ─────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <div>
        <h1 className="text-3xl font-bold">MOI Assessment</h1>
        <p className="text-muted-foreground">Air Cadet Methods of Instruction Course</p>
      </div>

      {/* Candidate details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Candidate Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Candidate</Label>
            <CadetSearchInput
              token={session?.id_token ?? null}
              selectedCin={form.cadetCin}
              selectedName={`${form.cadetForename} ${form.cadetSurname}`.trim()}
              onSelect={(cin, name) => {
                const parts = name.trim().split(" ");
                const forename = parts.slice(0, -1).join(" ");
                const surname = parts[parts.length - 1] ?? "";
                setForm((f) => ({
                  ...f,
                  cadetCin: cin || null,
                  cadetForename: forename,
                  cadetSurname: surname,
                }));
              }}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sqnDf">Sqn/DF</Label>
            <Input
              id="sqnDf"
              placeholder="e.g. 317"
              value={form.sqnDf}
              onChange={(e) => setForm((f) => ({ ...f, sqnDf: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wingCcf">Wing/CCF</Label>
            <Input
              id="wingCcf"
              placeholder="e.g. Yorkshire"
              value={form.wingCcf}
              onChange={(e) => setForm((f) => ({ ...f, wingCcf: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="baderReference">Bader Reference</Label>
            <Input
              id="baderReference"
              placeholder="Bader ref."
              value={form.baderReference}
              onChange={(e) => setForm((f) => ({ ...f, baderReference: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="placeOfAssessment">Place of Assessment</Label>
            <Input
              id="placeOfAssessment"
              placeholder="e.g. Squadron HQ"
              value={form.placeOfAssessment}
              onChange={(e) => setForm((f) => ({ ...f, placeOfAssessment: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dateOfAssessment">Date of Assessment</Label>
            <Input
              id="dateOfAssessment"
              type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Progress bar */}
      <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
        <div className="flex-1">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-muted-foreground">
              {answeredScores.length} / {ALL_QUESTIONS.length} answered
            </span>
            {allAnswered && (
              <span className="font-mono font-semibold">
                Score: {totalScore} / {MAX_SCORE}
              </span>
            )}
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${completionPct}%` }}
            />
          </div>
        </div>
        {allAnswered && (
          <div className="shrink-0">
            {passed ? (
              <Badge className="gap-1.5 bg-green-500 text-white hover:bg-green-500">
                <CheckCircle2 className="h-3.5 w-3.5" /> PASS
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1.5">
                <XCircle className="h-3.5 w-3.5" /> FAIL
              </Badge>
            )}
          </div>
        )}
      </div>

      {/* Sections */}
      {SECTIONS.map((section) => (
        <Card key={section.id}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">{section.title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <div className="hidden justify-end pr-1 sm:flex">
              <div className="flex gap-1 text-[10px] text-muted-foreground">
                {[1, 2, 3, 4, 5].map((n) => (
                  <span key={n} className="flex w-9 justify-center">{n}</span>
                ))}
              </div>
            </div>
            {section.questions.map((q, i) => (
              <div key={q.id}>
                <QuestionRow
                  question={q}
                  value={form.scores[q.id]}
                  onChange={(v) =>
                    setForm((f) => ({ ...f, scores: { ...f.scores, [q.id]: v } }))
                  }
                />
                {i < section.questions.length - 1 && <div className="border-t border-dashed" />}
              </div>
            ))}
            <div className="pt-3">
              <Label className="text-xs text-muted-foreground">Comments</Label>
              <Textarea
                rows={2}
                placeholder="Section comments..."
                className="mt-1 text-sm"
                maxLength={section.commentLimit}
                value={form.sectionComments[section.id]}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    sectionComments: { ...f.sectionComments, [section.id]: e.target.value },
                  }))
                }
              />
              <p className={`text-xs text-right mt-0.5 ${form.sectionComments[section.id].length > section.commentLimit ? "text-red-500" : "text-muted-foreground"}`}>
                {form.sectionComments[section.id].length}/{section.commentLimit}
              </p>
            </div>
          </CardContent>
        </Card>
      ))}

      {/* Pass/fail detail */}
      {allAnswered && (
        <div
          className={cn(
            "rounded-lg border px-4 py-3 text-sm",
            passed
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-800"
          )}
        >
          {passed ? (
            <p>
              <strong>PASS</strong> — Score of <strong>{totalScore}/{MAX_SCORE}</strong>, no scores
              of 1. Candidate has met the MOI pass standard.
            </p>
          ) : (
            <p>
              <strong>FAIL</strong> — Score of <strong>{totalScore}/{MAX_SCORE}</strong>.{" "}
              {totalScore < PASS_SCORE
                ? `Needs at least ${PASS_SCORE} to pass (${PASS_SCORE - totalScore} more required).`
                : "Has at least one score of 1."}
            </p>
          )}
        </div>
      )}

      {/* Overall feedback */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Overall Feedback</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="strengthsSummary">Summary of Strengths</Label>
            <Textarea
              id="strengthsSummary"
              rows={3}
              placeholder="Key strengths observed..."
              maxLength={1150}
              value={form.strengthsSummary}
              onChange={(e) => setForm((f) => ({ ...f, strengthsSummary: e.target.value }))}
            />
            <p className={`text-xs text-right mt-0.5 ${form.strengthsSummary.length > 1150 ? "text-red-500" : "text-muted-foreground"}`}>
              {form.strengthsSummary.length}/1150
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="improvementsSummary">Summary of Areas of Improvement</Label>
            <Textarea
              id="improvementsSummary"
              rows={3}
              placeholder="Areas to develop..."
              maxLength={1150}
              value={form.improvementsSummary}
              onChange={(e) => setForm((f) => ({ ...f, improvementsSummary: e.target.value }))}
            />
            <p className={`text-xs text-right mt-0.5 ${form.improvementsSummary.length > 1150 ? "text-red-500" : "text-muted-foreground"}`}>
              {form.improvementsSummary.length}/1150
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="generalComments">General Comments</Label>
            <Textarea
              id="generalComments"
              rows={3}
              placeholder="Any other comments..."
              maxLength={1150}
              value={form.generalComments}
              onChange={(e) => setForm((f) => ({ ...f, generalComments: e.target.value }))}
            />
            <p className={`text-xs text-right mt-0.5 ${form.generalComments.length > 1150 ? "text-red-500" : "text-muted-foreground"}`}>
              {form.generalComments.length}/1150
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Assessor */}
      <AssessorCard
        assessorName={form.assessorName}
        onAssessorNameChange={(v) => setForm((f) => ({ ...f, assessorName: v }))}
        date={form.date}
        onDateChange={(v) => setForm((f) => ({ ...f, date: v }))}
        showNameFromAccount={!!session?.user?.name}
        sigLoading={sigLoading}
        savedSignatureUrl={savedSignatureUrl}
        overrideSignature={overrideSignature}
        onOverrideSignature={setOverrideSignature}
        showDraw={showDrawOverride}
        onSetShowDraw={setShowDrawOverride}
        showRole
        assessorRole={form.assessorRole}
        onAssessorRoleChange={(v) => setForm((f) => ({ ...f, assessorRole: v }))}
        cadetSignature={form.cadetSignature}
        onCadetSignature={(v) => setForm((f) => ({ ...f, cadetSignature: v }))}
      />

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 sm:min-w-48 sm:flex-none"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving…
            </>
          ) : (
            <>
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Submit Assessment
            </>
          )}
        </Button>
        <Button variant="outline" onClick={handleReset}>
          Reset
        </Button>
      </div>
    </div>
  );
}
