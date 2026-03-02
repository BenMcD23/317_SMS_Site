"use client";

import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Download, Loader2, CheckCircle2, XCircle, RotateCcw } from "lucide-react";

// ─── Questions from the PDF ───────────────────────────────────────────────────
const QUESTIONS = [
  {
    id: 1,
    text: 'Did the team leader follow "SMEAC" as a briefing tool?',
    labels: { 1: "No", 3: "Almost", 5: "Yes" },
  },
  {
    id: 2,
    text: "Were ALL the limitations mentioned?",
    labels: { 1: "No", 3: "Some", 5: "All" },
  },
  {
    id: 3,
    text: "Was the time limitation mentioned then monitored?",
    labels: { 1: "No", 3: "Sometimes", 5: "Yes" },
  },
  {
    id: 4,
    text: "Was there an initial plan?",
    labels: { 1: "No", 3: "Almost", 5: "Yes" },
  },
  {
    id: 5,
    text: "Did the team leader re-evaluate when things went wrong?",
    labels: { 1: "No", 3: "Indecisive", 5: "Yes" },
  },
  {
    id: 6,
    text: "Did the rest of the team know what was meant to be happening?",
    labels: { 1: "Never", 3: "Sometimes", 5: "Always" },
  },
  {
    id: 7,
    text: "Were limitations monitored?",
    labels: { 1: "Never", 3: "Sometimes", 5: "Always" },
  },
  {
    id: 8,
    text: "Was the leader confident?",
    labels: { 1: "Never", 3: "Sometimes", 5: "Always" },
  },
  {
    id: 9,
    text: "If you had just entered the room, would you be able to tell who was in charge?",
    labels: { 1: "Unlikely", 3: "Maybe", 5: "Always" },
  },
  {
    id: 10,
    text: "Was praise/encouragement given when necessary?",
    labels: { 1: "No", 3: "Sometimes", 5: "Yes" },
  },
];

// ─── Score selector for a single question ────────────────────────────────────
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
                <span
                  className={cn(
                    "text-[10px] font-normal leading-none",
                    isSelected ? "opacity-90" : "opacity-50"
                  )}
                >
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

// ─── Signature pad ────────────────────────────────────────────────────────────
function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasSignature, setHasSignature] = useState(false);

  const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const start = (e: MouseEvent | TouchEvent) => {
      drawing.current = true;
      const pos = getPos(e, canvas);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      e.preventDefault();
    };
    const move = (e: MouseEvent | TouchEvent) => {
      if (!drawing.current) return;
      const pos = getPos(e, canvas);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      e.preventDefault();
    };
    const stop = () => {
      if (!drawing.current) return;
      drawing.current = false;
      setHasSignature(true);
      onChange(canvas.toDataURL());
    };

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
  }, [onChange]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasSignature(false);
    onChange(null);
  };

  return (
    <div className="space-y-1.5">
      <div className="relative overflow-hidden rounded-md border bg-white">
        <canvas
          ref={canvasRef}
          width={560}
          height={80}
          className="w-full cursor-crosshair touch-none"
        />
        {!hasSignature && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Sign here
          </span>
        )}
      </div>
      {hasSignature && (
        <button
          type="button"
          onClick={clear}
          className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-destructive"
        >
          <RotateCcw className="h-3 w-3" />
          Clear signature
        </button>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
type FormState = {
  cadetName: string;
  exerciseNo: string;
  exerciseName: string;
  scores: Record<number, number | null>;
  assessorName: string;
  assessorSignature: string | null;
  date: string;
  debriefingNotes: string;
};

const initialState = (): FormState => ({
  cadetName: "",
  exerciseNo: "",
  exerciseName: "",
  scores: Object.fromEntries(QUESTIONS.map((q) => [q.id, null])),
  assessorName: "",
  assessorSignature: null,
  date: new Date().toISOString().split("T")[0],
  debriefingNotes: "",
});

export default function LeadershipAssessmentPage() {
  const [form, setForm] = useState<FormState>(initialState());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Derived values ──────────────────────────────────────────────────────────
  const answeredScores = Object.values(form.scores).filter((v): v is number => v !== null);
  const totalScore = answeredScores.reduce((a, b) => a + b, 0);
  const allAnswered = answeredScores.length === QUESTIONS.length;
  const hasOneInCol = Object.values(form.scores).some((v) => v === 1);
  const passed = allAnswered && totalScore >= 30 && !hasOneInCol;
  const completionPct = Math.round((answeredScores.length / QUESTIONS.length) * 100);

  // ── Submit ──────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!form.cadetName || !form.exerciseNo || !form.exerciseName) {
      setError("Please fill in cadet name, exercise number, and exercise name.");
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
        cadet_name: form.cadetName,
        exercise_no: form.exerciseNo,
        exercise_name: form.exerciseName,
        scores: form.scores,
        total_score: totalScore,
        passed,
        assessor_name: form.assessorName,
        assessor_signature: form.assessorSignature, // base64 PNG data URL
        date: form.date,
        debriefing_notes: form.debriefingNotes,
      };

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/assessments/leadership/generate-pdf`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );

      if (!res.ok) {
        const detail = await res.text();
        throw new Error(detail || "Failed to generate PDF");
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leadership-${form.cadetName.replace(/\s+/g, "-")}-${form.date}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      {/* Header */}
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
            <Label htmlFor="cadetName">Exercise Leader (Cadet Name)</Label>
            <Input
              id="cadetName"
              placeholder="e.g. Cdt Smith"
              value={form.cadetName}
              onChange={(e) => setForm((f) => ({ ...f, cadetName: e.target.value }))}
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
              <span className="font-mono font-semibold">
                Score: {totalScore} / 50
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
              <Badge className="gap-1.5 bg-green-500 hover:bg-green-500 text-white">
                <CheckCircle2 className="h-3.5 w-3.5" />
                PASS
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1.5">
                <XCircle className="h-3.5 w-3.5" />
                FAIL
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
            onChange={(v) =>
              setForm((f) => ({ ...f, scores: { ...f.scores, [q.id]: v } }))
            }
          />
        ))}
      </div>

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
              <strong>PASS</strong> — Score of <strong>{totalScore}/50</strong>, no scores
              of 1. Cadet has achieved the Blue Badge leadership standard.
            </p>
          ) : (
            <p>
              <strong>FAIL</strong> — Score of <strong>{totalScore}/50</strong>.{" "}
              {totalScore < 30
                ? `Needs at least 30 to pass (${30 - totalScore} more required).`
                : "Has at least one score of 1 — must be re-assessed on another exercise."}
            </p>
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
              <Label htmlFor="assessorName">Name</Label>
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
            <SignaturePad
              onChange={(sig) => setForm((f) => ({ ...f, assessorSignature: sig }))}
            />
          </div>
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

      {/* Error */}
      {error && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        <Button
          onClick={handleSubmit}
          disabled={loading}
          className="flex-1 sm:flex-none sm:min-w-48"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Generating PDF…
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Generate &amp; Download PDF
            </>
          )}
        </Button>
        <Button
          variant="outline"
          onClick={() => { setForm(initialState()); setError(null); }}
        >
          Reset
        </Button>
      </div>
    </div>
  );
}