"use client";

import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Loader2, CheckCircle2, XCircle, Save, X } from "lucide-react";
import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import {
  type ScoreMap,
  LEADERSHIP_QUESTIONS,
  DEBRIEF_MAX,
  leadershipPassed,
  RADIO_CRITERIA,
  RADIO_COMMENTS_MAX,
  radioPassed,
  MOI_SECTIONS,
  MOI_ALL_QUESTIONS,
  MOI_MAX_SCORE,
  MOI_SUMMARY_MAX,
  moiPassed,
  normaliseScores,
  isoDateForInput,
} from "@/lib/assessment-fields";

// ─── Score selector (1–5) ─────────────────────────────────────────────────────

function ScoreRow({
  id,
  text,
  value,
  onChange,
}: {
  id: number;
  text: string;
  value: number | null;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex flex-1 items-start gap-2">
        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-bold text-primary">
          {id}
        </span>
        <p className="text-sm leading-snug">{text}</p>
      </div>
      <div className="flex shrink-0 gap-1 pl-7 sm:pl-0">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border text-sm font-semibold transition-all",
              value === s
                ? s === 1
                  ? "border-destructive bg-destructive text-white"
                  : s === 5
                  ? "border-success bg-success text-white"
                  : "border-primary bg-primary text-primary-foreground"
                : "border-muted text-muted-foreground hover:border-primary/40 hover:bg-muted"
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function ResultBadge({ passed }: { passed: boolean }) {
  return passed ? (
    <Badge className="gap-1.5 bg-success text-white hover:bg-success">
      <CheckCircle2 className="h-3.5 w-3.5" /> PASS
    </Badge>
  ) : (
    <Badge variant="destructive" className="gap-1.5">
      <XCircle className="h-3.5 w-3.5" /> FAIL
    </Badge>
  );
}

// ─── Editor ───────────────────────────────────────────────────────────────────

type EditorState = {
  // shared
  date: string;
  scores: ScoreMap;
  // leadership
  exerciseNo: string;
  exerciseName: string;
  debriefingNotes: string;
  // radio
  criteria: Record<string, boolean>;
  cyberSecDate: string;
  comments: string;
  // moi
  cadetSurname: string;
  cadetForename: string;
  sqnDf: string;
  wingCcf: string;
  baderReference: string;
  placeOfAssessment: string;
  sectionComments: Record<string, string>;
  strengthsSummary: string;
  improvementsSummary: string;
  generalComments: string;
  assessorRole: string;
};

export function AssessmentEditor({
  assessmentId,
  assessmentType,
  token,
  onSaved,
  onCancel,
}: {
  assessmentId: number;
  assessmentType: string;
  token: string | null;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<EditorState | null>(null);

  const isLeadership = assessmentType === "Blue Leadership";
  const isRadio = assessmentType === "Blue Radio";
  const isMoi = assessmentType === "MOI";

  // ── Load existing data ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`${API_BASE}/assessments/${assessmentId}/detail`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail ?? "Failed to load");
        const d = await res.json();
        const f = d.fields ?? {};
        if (cancelled) return;
        setForm({
          date: isoDateForInput(f.date_iso, f.date),
          scores: isLeadership
            ? normaliseScores(f.scores, LEADERSHIP_QUESTIONS.map((q) => q.id))
            : isMoi
            ? normaliseScores(f.scores, MOI_ALL_QUESTIONS.map((q) => q.id))
            : {},
          exerciseNo: f.exercise_no ?? "",
          exerciseName: f.exercise_name ?? "",
          debriefingNotes: f.debriefing_notes ?? "",
          criteria: Object.fromEntries(
            RADIO_CRITERIA.map((c) => [c.id, Boolean(f.criteria?.[c.id])])
          ),
          cyberSecDate: isoDateForInput(f.cyber_sec_date_iso, f.cyber_sec_date),
          comments: f.comments ?? "",
          cadetSurname: f.cadet_surname ?? "",
          cadetForename: f.cadet_forename ?? "",
          sqnDf: f.sqn_df ?? "",
          wingCcf: f.wing_ccf ?? "",
          baderReference: f.bader_reference ?? "",
          placeOfAssessment: f.place_of_assessment ?? "",
          sectionComments: Object.fromEntries(
            MOI_SECTIONS.map((s) => [s.id, f.section_comments?.[s.id] ?? ""])
          ),
          strengthsSummary: f.strengths ?? "",
          improvementsSummary: f.improvements ?? "",
          generalComments: f.general_comments ?? "",
          assessorRole: f.assessor_role ?? "",
        });
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [assessmentId, token, isLeadership, isMoi]);

  const update = useCallback(<K extends keyof EditorState>(key: K, value: EditorState[K]) => {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }, []);

  // ── Save ────────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!token || !form) return;
    setSaving(true);
    setError(null);

    let payload: Record<string, unknown>;
    if (isLeadership) {
      payload = {
        exercise_no: form.exerciseNo,
        exercise_name: form.exerciseName,
        scores: form.scores,
        date: form.date,
        debriefing_notes: form.debriefingNotes,
      };
    } else if (isRadio) {
      payload = {
        criteria: form.criteria,
        cyber_sec_date: form.cyberSecDate,
        comments: form.comments,
        date: form.date,
      };
    } else {
      payload = {
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
        assessor_role: form.assessorRole,
        date: form.date,
      };
    }

    try {
      const res = await apiFetch(`${API_BASE}/assessments/${assessmentId}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(detail?.detail ?? "Failed to save");
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
      setSaving(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center gap-2 py-6 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading assessment…
      </div>
    );
  }
  if (error && !form) {
    return <p className="py-4 text-xs text-destructive">{error}</p>;
  }
  if (!form) return null;

  const passed = isLeadership
    ? leadershipPassed(form.scores)
    : isRadio
    ? radioPassed(form.criteria)
    : moiPassed(form.scores);

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Edit assessment</p>
        <ResultBadge passed={passed} />
      </div>

      {/* Leadership */}
      {isLeadership && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`exNo-${assessmentId}`}>Exercise No.</Label>
              <Input
                id={`exNo-${assessmentId}`}
                value={form.exerciseNo}
                onChange={(e) => update("exerciseNo", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`exName-${assessmentId}`}>Exercise Name</Label>
              <Input
                id={`exName-${assessmentId}`}
                value={form.exerciseName}
                onChange={(e) => update("exerciseName", e.target.value)}
              />
            </div>
          </div>
          <div className="divide-y rounded-lg border px-3">
            {LEADERSHIP_QUESTIONS.map((q) => (
              <ScoreRow
                key={q.id}
                id={q.id}
                text={q.text}
                value={form.scores[q.id] ?? null}
                onChange={(v) => update("scores", { ...form.scores, [q.id]: v })}
              />
            ))}
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={`debrief-${assessmentId}`}>Debriefing Notes</Label>
              <span
                className={cn(
                  "text-xs",
                  form.debriefingNotes.length > DEBRIEF_MAX ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {form.debriefingNotes.length} / {DEBRIEF_MAX}
              </span>
            </div>
            <Textarea
              id={`debrief-${assessmentId}`}
              rows={4}
              maxLength={DEBRIEF_MAX}
              value={form.debriefingNotes}
              onChange={(e) => update("debriefingNotes", e.target.value.slice(0, DEBRIEF_MAX))}
            />
          </div>
        </div>
      )}

      {/* Radio */}
      {isRadio && (
        <div className="space-y-4">
          <div className="space-y-2">
            {RADIO_CRITERIA.map((c) => {
              const checked = form.criteria[c.id];
              return (
                <div
                  key={c.id}
                  onClick={() => update("criteria", { ...form.criteria, [c.id]: !checked })}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-all",
                    checked ? "border-success/40 bg-success/5" : "hover:border-primary/30"
                  )}
                >
                  <div
                    className={cn(
                      "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors",
                      checked ? "border-success bg-success" : "border-muted-foreground/40"
                    )}
                  >
                    {checked && <CheckCircle2 className="h-3.5 w-3.5 text-white" strokeWidth={3} />}
                  </div>
                  <p className="text-sm leading-snug">{c.label}</p>
                </div>
              );
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`cyber-${assessmentId}`}>Cyber Security video date</Label>
              <Input
                id={`cyber-${assessmentId}`}
                type="date"
                value={form.cyberSecDate}
                onChange={(e) => update("cyberSecDate", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`date-${assessmentId}`}>Assessment date</Label>
              <Input
                id={`date-${assessmentId}`}
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor={`comments-${assessmentId}`}>Comments</Label>
              <span
                className={cn(
                  "text-xs",
                  form.comments.length > RADIO_COMMENTS_MAX ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {form.comments.length} / {RADIO_COMMENTS_MAX}
              </span>
            </div>
            <Textarea
              id={`comments-${assessmentId}`}
              rows={3}
              maxLength={RADIO_COMMENTS_MAX}
              value={form.comments}
              onChange={(e) => update("comments", e.target.value.slice(0, RADIO_COMMENTS_MAX))}
            />
          </div>
        </div>
      )}

      {/* MOI */}
      {isMoi && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`forename-${assessmentId}`}>Forename</Label>
              <Input
                id={`forename-${assessmentId}`}
                value={form.cadetForename}
                onChange={(e) => update("cadetForename", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`surname-${assessmentId}`}>Surname</Label>
              <Input
                id={`surname-${assessmentId}`}
                value={form.cadetSurname}
                onChange={(e) => update("cadetSurname", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`sqn-${assessmentId}`}>Sqn/DF</Label>
              <Input id={`sqn-${assessmentId}`} value={form.sqnDf} onChange={(e) => update("sqnDf", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`wing-${assessmentId}`}>Wing/CCF</Label>
              <Input id={`wing-${assessmentId}`} value={form.wingCcf} onChange={(e) => update("wingCcf", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`bader-${assessmentId}`}>Bader Reference</Label>
              <Input
                id={`bader-${assessmentId}`}
                value={form.baderReference}
                onChange={(e) => update("baderReference", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`place-${assessmentId}`}>Place of Assessment</Label>
              <Input
                id={`place-${assessmentId}`}
                value={form.placeOfAssessment}
                onChange={(e) => update("placeOfAssessment", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`moidate-${assessmentId}`}>Date of Assessment</Label>
              <Input
                id={`moidate-${assessmentId}`}
                type="date"
                value={form.date}
                onChange={(e) => update("date", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`role-${assessmentId}`}>Assessor Role</Label>
              <Input
                id={`role-${assessmentId}`}
                value={form.assessorRole}
                onChange={(e) => update("assessorRole", e.target.value)}
              />
            </div>
          </div>

          {MOI_SECTIONS.map((section) => (
            <div key={section.id} className="rounded-lg border p-3">
              <p className="mb-1 text-sm font-medium">{section.title}</p>
              <div className="divide-y">
                {section.questions.map((q) => (
                  <ScoreRow
                    key={q.id}
                    id={q.id}
                    text={q.text}
                    value={form.scores[q.id] ?? null}
                    onChange={(v) => update("scores", { ...form.scores, [q.id]: v })}
                  />
                ))}
              </div>
              <div className="pt-2">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Comments</Label>
                  <span
                    className={cn(
                      "text-xs",
                      form.sectionComments[section.id].length > section.commentLimit
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {form.sectionComments[section.id].length}/{section.commentLimit}
                  </span>
                </div>
                <Textarea
                  rows={2}
                  maxLength={section.commentLimit}
                  className="mt-1 text-sm"
                  value={form.sectionComments[section.id]}
                  onChange={(e) =>
                    update("sectionComments", { ...form.sectionComments, [section.id]: e.target.value })
                  }
                />
              </div>
            </div>
          ))}

          {(
            [
              ["strengthsSummary", "Summary of Strengths"],
              ["improvementsSummary", "Summary of Areas of Improvement"],
              ["generalComments", "General Comments"],
            ] as const
          ).map(([key, label]) => (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor={`${key}-${assessmentId}`}>{label}</Label>
                <span
                  className={cn(
                    "text-xs",
                    form[key].length > MOI_SUMMARY_MAX ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {form[key].length}/{MOI_SUMMARY_MAX}
                </span>
              </div>
              <Textarea
                id={`${key}-${assessmentId}`}
                rows={3}
                maxLength={MOI_SUMMARY_MAX}
                value={form[key]}
                onChange={(e) => update(key, e.target.value)}
              />
            </div>
          ))}

          <p className="text-xs text-muted-foreground">
            Total possible score: {MOI_MAX_SCORE}. The assessor name and signatures from the original
            assessment are kept.
          </p>
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="animate-spin" data-icon="inline-start" />
          ) : (
            <Save data-icon="inline-start" />
          )}
          {saving ? "Saving…" : "Save & regenerate PDF"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={saving}>
          <X data-icon="inline-start" /> Cancel
        </Button>
      </div>
    </div>
  );
}
