"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  RotateCcw,
  AlertCircle,
  Pencil,
} from "lucide-react";
import { API_BASE } from "@/lib/config";
import Link from "next/link";

import { CadetSearchInput } from "@/components/cadet-search"

// ─── Questions ────────────────────────────────────────────────────────────────
const QUESTIONS = [
  { id: 1, text: 'Did the team leader follow "SMEAC" as a briefing tool?', labels: { 1: "No", 3: "Almost", 5: "Yes" } },
  { id: 2, text: "Were ALL the limitations mentioned?", labels: { 1: "No", 3: "Some", 5: "All" } },
  { id: 3, text: "Was the time limitation mentioned then monitored?", labels: { 1: "No", 3: "Sometimes", 5: "Yes" } },
  { id: 4, text: "Was there an initial plan?", labels: { 1: "No", 3: "Almost", 5: "Yes" } },
  { id: 5, text: "Did the team leader re-evaluate when things went wrong?", labels: { 1: "No", 3: "Indecisive", 5: "Yes" } },
  { id: 6, text: "Did the rest of the team know what was meant to be happening?", labels: { 1: "Never", 3: "Sometimes", 5: "Always" } },
  { id: 7, text: "Were limitations monitored?", labels: { 1: "Never", 3: "Sometimes", 5: "Always" } },
  { id: 8, text: "Was the leader confident?", labels: { 1: "Never", 3: "Sometimes", 5: "Always" } },
  { id: 9, text: "If you had just entered the room, would you be able to tell who was in charge?", labels: { 1: "Unlikely", 3: "Maybe", 5: "Always" } },
  { id: 10, text: "Was praise/encouragement given when necessary?", labels: { 1: "No", 3: "Sometimes", 5: "Yes" } },
];

// ─── Score selector ───────────────────────────────────────────────────────────
function ScoreSelector({
  question,
  value,
  onChange,
}: {
  question: (typeof QUESTIONS)[0];
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-lg border bg-card p-4 transition-shadow hover:shadow-sm">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
          {question.id}
        </span>
        <p className="text-sm font-medium leading-snug">{question.text}</p>
      </div>
      <div className="flex items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((score) => {
          const label = question.labels[score as keyof typeof question.labels];
          const isSelected = value === score;
          return (
            <button
              key={score}
              type="button"
              onClick={() => onChange(score)}
              className={cn(
                "group relative flex flex-1 flex-col items-center gap-0.5 rounded-md border py-2.5 text-xs font-semibold transition-all",
                isSelected
                  ? score === 1
                    ? "border-red-500 bg-red-500 text-white shadow-sm"
                    : score === 5
                    ? "border-green-500 bg-green-500 text-white shadow-sm"
                    : "border-primary bg-primary text-primary-foreground shadow-sm"
                  : "border-muted text-muted-foreground hover:border-primary/40 hover:bg-muted"
              )}
            >
              <span>{score}</span>
              {label && (
                <span className={cn("text-[10px] font-normal leading-none", isSelected ? "opacity-90" : "opacity-50")}>
                  {label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Signature section ────────────────────────────────────────────────────────
function SignatureSection({
  savedSignatureUrl,
  onOverride,
  overrideSignature,
  onClearOverride,
  showDraw,
  onSetShowDraw,
}: {
  savedSignatureUrl: string | null;
  onOverride: (dataUrl: string | null) => void;
  overrideSignature: string | null;
  onClearOverride: () => void;
  showDraw: boolean;
  onSetShowDraw: (v: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) return {
      x: (e.touches[0].clientX - rect.left) * scaleX,
      y: (e.touches[0].clientY - rect.top) * scaleY,
    };
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  useEffect(() => {
    if (!showDraw && savedSignatureUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const start = (e: MouseEvent | TouchEvent) => { drawing.current = true; const p = getPos(e, canvas); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
    const move = (e: MouseEvent | TouchEvent) => { if (!drawing.current) return; const p = getPos(e, canvas); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); };
    const stop = () => { if (!drawing.current) return; drawing.current = false; setHasDrawn(true); onOverride(canvas.toDataURL()); };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", stop);
    canvas.addEventListener("mouseleave", stop);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", stop);
    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", stop);
      canvas.removeEventListener("mouseleave", stop);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", stop);
    };
  }, [showDraw, onOverride]);

  const clearDraw = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onOverride(null);
  };

  if (savedSignatureUrl && !showDraw) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 overflow-hidden rounded-md border bg-white p-2">
            <img src={savedSignatureUrl} alt="Saved signature" className="max-h-16 object-contain" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Badge variant="secondary" className="gap-1 whitespace-nowrap text-[11px]">
              <CheckCircle2 className="h-3 w-3 text-green-600" />
              From account
            </Badge>
            <button
              type="button"
              onClick={() => onSetShowDraw(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
              Draw instead
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {savedSignatureUrl && showDraw && (
        <button
          type="button"
          onClick={() => { onSetShowDraw(false); setHasDrawn(false); onClearOverride(); }}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          ← Use saved signature
        </button>
      )}
      <div className="relative overflow-hidden rounded-md border bg-white">
        <canvas
          ref={canvasRef}
          width={560}
          height={80}
          className="w-full cursor-crosshair touch-none"
        />
        {!hasDrawn && !overrideSignature && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Sign here
          </span>
        )}
      </div>
      {hasDrawn && (
        <button
          type="button"
          onClick={clearDraw}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
        >
          <RotateCcw className="h-3 w-3" /> Clear
        </button>
      )}
      {!savedSignatureUrl && (
        <p className="text-xs text-muted-foreground">
          Save a signature in{" "}
          <Link href="/settings" className="underline hover:text-foreground">
            Settings
          </Link>{" "}
          to auto-fill this next time.
        </p>
      )}
    </div>
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────
type FormState = {
  cadetCin: number | null;
  cadetName: string;
  exerciseNo: string;
  exerciseName: string;
  scores: Record<number, number | null>;
  assessorName: string;
  date: string;
  debriefingNotes: string;
};

const initialState = (): FormState => ({
  cadetCin: null,
  cadetName: "",
  exerciseNo: "",
  exerciseName: "",
  scores: Object.fromEntries(QUESTIONS.map((q) => [q.id, null])),
  assessorName: "",
  date: new Date().toISOString().split("T")[0],
  debriefingNotes: "",
});

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LeadershipAssessmentPage() {
  const { data: session } = useSession();
  const [form, setForm] = useState<FormState>(initialState());
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

  // ── Load assessor name + signature ────────────────────────────────────────
  useEffect(() => {
    if (!session?.id_token) return;

    if (session.user?.name) {
      setForm((f) => ({ ...f, assessorName: session.user!.name! }));
    }

    setSigLoading(true);
    fetch(`${API_BASE}/get-signature`, {
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

  // ── Derived score values ──────────────────────────────────────────────────
  const answeredScores = Object.values(form.scores).filter((v): v is number => v !== null);
  const totalScore = answeredScores.reduce((a, b) => a + b, 0);
  const allAnswered = answeredScores.length === QUESTIONS.length;
  const hasOneInCol = Object.values(form.scores).some((v) => v === 1);
  const passed = allAnswered && totalScore >= 30 && !hasOneInCol;
  const completionPct = Math.round((answeredScores.length / QUESTIONS.length) * 100);

  const effectiveSignature = overrideSignature ?? savedSignatureB64 ?? null;

  const handleReset = () => {
    setShowDrawOverride(false);
    setForm(initialState());
    setError(null);
    setOverrideSignature(null);
    setSubmitted(false);
    setAssessmentId(null);
  };

  // ── Submit ────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.cadetCin || !form.exerciseNo || !form.exerciseName) {
      setError("Please select a cadet from the search results and fill in exercise details.");
      return;
    }
    if (!allAnswered) {
      setError("Please answer all 10 questions before submitting.");
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
        cadet_name: form.cadetName,
        exercise_no: form.exerciseNo,
        exercise_name: form.exerciseName,
        scores: form.scores,
        assessor_name: form.assessorName,
        assessor_signature: effectiveSignature,
        date: form.date,
        debriefing_notes: form.debriefingNotes,
      };

      const res = await fetch(`${API_BASE}/assessments/leadership/add-assessment`, {
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
          <h1 className="text-3xl font-bold">Leadership Assessment</h1>
          <p className="text-muted-foreground">Blue Badge — Air Cadet Foundation</p>
        </div>

        <div className="flex flex-col items-center gap-6 rounded-xl border border-green-500/30 bg-green-500/10 px-8 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-foreground">Assessment Saved</h2>
            <p className="text-sm text-muted-foreground">
              {form.cadetName}&apos;s leadership assessment has been recorded successfully.
            </p>
            {assessmentId && (
              <p className="text-xs text-muted-foreground mt-1">Assessment ID: #{assessmentId}</p>
            )}
          </div>

          <div className="w-full max-w-xs rounded-lg border bg-card px-4 py-3 text-left text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cadet</span>
              <span className="font-medium">{form.cadetName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Exercise</span>
              <span className="font-medium">{form.exerciseName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Score</span>
              <span className="font-medium">{totalScore} / 50</span>
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
        <h1 className="text-3xl font-bold">Leadership Assessment</h1>
        <p className="text-muted-foreground">Blue Badge — Air Cadet Foundation</p>
      </div>

      {/* Exercise details */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exercise Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Exercise Leader (Cadet)</Label>
              <CadetSearchInput
                token={session?.id_token ?? null}
                selectedCin={form.cadetCin}
                selectedName={form.cadetName}
                onSelect={(cin, name) =>
                  setForm((f) => ({ ...f, cadetCin: cin || null, cadetName: name }))
                }
              />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="exerciseNo">Exercise No.</Label>
            <Input
              id="exerciseNo"
              placeholder="e.g. 3"
              value={form.exerciseNo}
              onChange={(e) => setForm((f) => ({ ...f, exerciseNo: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="exerciseName">Exercise Name</Label>
            <Input
              id="exerciseName"
              placeholder="e.g. River Crossing"
              value={form.exerciseName}
              onChange={(e) => setForm((f) => ({ ...f, exerciseName: e.target.value }))}
            />
          </div>
        </CardContent>
      </Card>

      {/* Progress + live score */}
      <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
        <div className="flex-1">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-muted-foreground">
              {answeredScores.length} / {QUESTIONS.length} answered
            </span>
            {allAnswered && (
              <span className="font-mono font-semibold">Score: {totalScore} / 50</span>
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

      {/* Questions */}
      <div className="space-y-3">
        {QUESTIONS.map((q) => (
          <ScoreSelector
            key={q.id}
            question={q}
            value={form.scores[q.id]}
            onChange={(v) => setForm((f) => ({ ...f, scores: { ...f.scores, [q.id]: v } }))}
          />
        ))}
      </div>

      {/* Pass/fail detail */}
      {allAnswered && (
        <div className={cn("rounded-lg border px-4 py-3 text-sm", passed ? "border-green-200 bg-green-50 text-green-800" : "border-red-200 bg-red-50 text-red-800")}>
          {passed ? (
            <p><strong>PASS</strong> — Score of <strong>{totalScore}/50</strong>, no scores of 1. Cadet has achieved the Blue Badge leadership standard.</p>
          ) : (
            <p><strong>FAIL</strong> — Score of <strong>{totalScore}/50</strong>.{" "}{totalScore < 30 ? `Needs at least 30 to pass (${30 - totalScore} more required).` : "Has at least one score of 1 — must be re-assessed on another exercise."}</p>
          )}
        </div>
      )}

      {/* Assessor */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Assessor</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="assessorName">
                Name
                {session?.user?.name && (
                  <span className="ml-2 text-[11px] font-normal text-muted-foreground">(from account)</span>
                )}
              </Label>
              <Input
                id="assessorName"
                placeholder="Assessor full name"
                value={form.assessorName}
                onChange={(e) => setForm((f) => ({ ...f, assessorName: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Signature</Label>
            {sigLoading ? (
              <div className="flex h-14 items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading signature…
              </div>
            ) : (
              <SignatureSection
                savedSignatureUrl={savedSignatureUrl}
                onOverride={setOverrideSignature}
                overrideSignature={overrideSignature}
                onClearOverride={() => setOverrideSignature(null)}
                showDraw={showDrawOverride}
                onSetShowDraw={setShowDrawOverride}
              />
            )}
          </div>

          {!sigLoading && !savedSignatureUrl && !overrideSignature && (
            <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              No signature — the PDF will be generated without one. You can draw above or save one in{" "}
              <Link href="/settings" className="underline">Settings</Link>.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Debriefing notes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Debriefing Notes</CardTitle>
        </CardHeader>
        <CardContent>
          <Textarea
            placeholder="Enter debrief notes..."
            rows={5}
            value={form.debriefingNotes}
            onChange={(e) => setForm((f) => ({ ...f, debriefingNotes: e.target.value }))}
          />
        </CardContent>
      </Card>

      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <Button onClick={handleSubmit} disabled={loading} className="flex-1 sm:min-w-48 sm:flex-none">
          {loading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving…</>
          ) : (
            <><CheckCircle2 className="mr-2 h-4 w-4" />Submit Assessment</>
          )}
        </Button>
        <Button variant="outline" onClick={handleReset}>
          Reset
        </Button>
      </div>
    </div>
  );
}