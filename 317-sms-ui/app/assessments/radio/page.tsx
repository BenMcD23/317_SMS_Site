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

// ─── Criteria ─────────────────────────────────────────────────────────────────
const CRITERIA = [
  { id: "callsigns",           label: "Correct Use of Both Full Callsigns" },
  { id: "auth_1a",             label: "1a) Authenticate Requested" },
  { id: "auth_1b",             label: "1b) Authenticate Answered Correctly" },
  { id: "radio_2a",            label: "2a) Radio Check Requested" },
  { id: "radio_2b",            label: "2b) Radio Check Answered Correctly" },
  { id: "tactical_3",          label: "3) Tactical Message Fully Answered" },
  { id: "say_again_4",         label: "4) I Say Again used" },
  { id: "say_again_5",         label: "5) Say Again used" },
  { id: "prowords",            label: "Prowords OVER, OUT etc. used correctly. General quick responses, RSVP and confidence." },
  { id: "verbal_understanding", label: "Verbally check understanding of CORRECT, CORRECTION, I SPELL, NOTHING HEARD, FIGURES, ROGER, WAIT OUT, SPEAK SLOWER." },
  { id: "verbal_security",     label: "Verbally check understanding of security – must not transmit names, ranks, locations, movement of arms and ammunition, personal or Sqn details, movements, current aircraft etc." },
];

// ─── Criterion toggle ──────────────────────────────────────────────────────────
function CriterionRow({
  criterion,
  checked,
  onChange,
}: {
  criterion: (typeof CRITERIA)[0];
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-all hover:shadow-sm",
        checked ? "border-green-500/40 bg-green-500/5" : "hover:border-primary/30"
      )}
      onClick={() => onChange(!checked)}
    >
      <div
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
          checked ? "border-green-500 bg-green-500" : "border-muted-foreground/40"
        )}
      >
        {checked && <CheckCircle2 className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
      </div>
      <p className="text-sm leading-snug">{criterion.label}</p>
    </div>
  );
}

// ─── Form state ───────────────────────────────────────────────────────────────
type FormState = {
  cadetCin: number | null;
  cadetName: string;
  criteria: Record<string, boolean>;
  cyberSecDate: string;
  passed: boolean | null;
  comments: string;
  assessorName: string;
  date: string;
};

const initialState = (): FormState => ({
  cadetCin: null,
  cadetName: "",
  criteria: Object.fromEntries(CRITERIA.map((c) => [c.id, false])),
  cyberSecDate: "",
  passed: null,
  comments: "",
  assessorName: "",
  date: new Date().toISOString().split("T")[0],
});

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RadioAssessmentPage() {
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
  }, [session]);

  useEffect(() => {
    if (!session?.id_token) return;

    apiFetch(`${API_BASE}/settings/assessor-name`, {
      headers: { Authorization: `Bearer ${session.id_token}` },
    }).then((res) => {
      if (res.ok) res.json().then((d) => {
        const name = d.assessor_name || session.user?.name || "";
        setForm((f) => ({ ...f, assessorName: name }));
      });
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

  const checkedCount = Object.values(form.criteria).filter(Boolean).length;
  const allChecked = checkedCount === CRITERIA.length;
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

  const handleSubmit = async () => {
    if (!form.cadetCin) {
      setError("Please select a cadet from the search results.");
      return;
    }
    if (form.passed === null) {
      setError("Please select PASS or FAIL.");
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
        criteria: form.criteria,
        cyber_sec_date: form.cyberSecDate,
        passed: form.passed,
        comments: form.comments,
        assessor_name: form.assessorName,
        assessor_signature: effectiveSignature,
        date: form.date,
      };

      const res = await apiFetch(`${API_BASE}/assessments/radio/add-assessment`, {
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
          <h1 className="text-3xl font-bold">Radio Assessment</h1>
          <p className="text-muted-foreground">Blue Badge — Basic Radio Operator Award</p>
        </div>

        <div className="flex flex-col items-center gap-6 rounded-xl border border-green-500/30 bg-green-500/10 px-8 py-12 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/20">
            <CheckCircle2 className="h-8 w-8 text-green-500" />
          </div>
          <div className="space-y-1">
            <h2 className="text-xl font-semibold text-foreground">Assessment Saved</h2>
            <p className="text-sm text-muted-foreground">
              {form.cadetName}&apos;s radio assessment has been recorded successfully.
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
              <span className="text-muted-foreground">Criteria passed</span>
              <span className="font-medium">{checkedCount} / {CRITERIA.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Result</span>
              {form.passed ? (
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
        <h1 className="text-3xl font-bold">Radio Assessment</h1>
        <p className="text-muted-foreground">Blue Badge — Basic Radio Operator Award</p>
      </div>

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
              onSelect={(cin, name) =>
                setForm((f) => ({ ...f, cadetCin: cin || null, cadetName: name }))
              }
            />
          </div>
        </CardContent>
      </Card>

      {/* Progress */}
      <div className="flex items-center gap-4 rounded-lg border bg-card p-4">
        <div className="flex-1">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-muted-foreground">
              {checkedCount} / {CRITERIA.length} criteria initialled
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.round((checkedCount / CRITERIA.length) * 100)}%` }}
            />
          </div>
        </div>
        {allChecked && (
          <Badge className="gap-1.5 bg-green-500 text-white hover:bg-green-500 shrink-0">
            <CheckCircle2 className="h-3.5 w-3.5" /> All initialled
          </Badge>
        )}
      </div>

      {/* Assessment criteria */}
      <div className="space-y-2">
        {CRITERIA.map((c) => (
          <CriterionRow
            key={c.id}
            criterion={c}
            checked={form.criteria[c.id]}
            onChange={(v) =>
              setForm((f) => ({ ...f, criteria: { ...f.criteria, [c.id]: v } }))
            }
          />
        ))}
      </div>

      {/* Cyber security video */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cyber Security</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1.5">
            <Label htmlFor="cyberSecDate">Date cadet watched Basic Cyber Security video</Label>
            <Input
              id="cyberSecDate"
              type="date"
              value={form.cyberSecDate}
              onChange={(e) => setForm((f) => ({ ...f, cyberSecDate: e.target.value }))}
              className="max-w-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* Pass / Fail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Result</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, passed: true }))}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg border-2 py-3 font-semibold transition-all",
                form.passed === true
                  ? "border-green-500 bg-green-500 text-white"
                  : "border-muted hover:border-green-500/40 hover:bg-green-500/5 text-muted-foreground"
              )}
            >
              <CheckCircle2 className="h-4 w-4" /> PASS
            </button>
            <button
              type="button"
              onClick={() => setForm((f) => ({ ...f, passed: false }))}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg border-2 py-3 font-semibold transition-all",
                form.passed === false
                  ? "border-red-500 bg-red-500 text-white"
                  : "border-muted hover:border-red-500/40 hover:bg-red-500/5 text-muted-foreground"
              )}
            >
              <XCircle className="h-4 w-4" /> FAIL
            </button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="comments">Comments</Label>
            <Textarea
              id="comments"
              placeholder="Enter any comments..."
              rows={4}
              value={form.comments}
              onChange={(e) => setForm((f) => ({ ...f, comments: e.target.value }))}
            />
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
      />

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
