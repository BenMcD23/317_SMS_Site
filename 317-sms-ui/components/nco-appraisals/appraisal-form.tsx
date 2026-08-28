"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { formatDate } from "@/lib/format";
import {
  APPRAISAL_SECTIONS, REVIEW_INTERVALS, draftWithAi, nextReviewDate,
  type AppraisalDraft, type NcoOption, type ReviewInterval,
} from "@/lib/nco-appraisals";

/**
 * The appraisal form, shared by the new and edit pages — it's the same set of
 * fields either way, so it lives here rather than being written out twice.
 *
 * `ncos` is only used to fill the picker and to prefill the header block from
 * the chosen NCO's record; editing an existing appraisal locks the NCO, since
 * moving one to a different person would rewrite history rather than fix it.
 */
export function AppraisalForm({
  draft,
  setDraft,
  ncos,
  token,
  lockedNco,
}: {
  draft: AppraisalDraft;
  setDraft: (next: AppraisalDraft) => void;
  ncos: NcoOption[];
  token: string | undefined;
  lockedNco?: boolean;
}) {
  const [points, setPoints] = useState("");
  const [drafting, setDrafting] = useState(false);

  const selected = ncos.find((n) => n.cin === draft.cadet_id);
  const set = <K extends keyof AppraisalDraft>(key: K, value: AppraisalDraft[K]) =>
    setDraft({ ...draft, [key]: value });

  /** Picking an NCO pulls their name, age and attendance across. Anything staff
   *  have already typed into those three is kept — an override shouldn't be
   *  wiped by re-selecting the same person. */
  function chooseNco(cin: number) {
    const nco = ncos.find((n) => n.cin === cin);
    if (!nco) return;
    setDraft({
      ...draft,
      cadet_id: cin,
      nco_name: draft.nco_name.trim() || nco.nco_name,
      age: draft.age.trim() || nco.age,
      attendance: draft.attendance.trim() || nco.attendance,
    });
  }

  async function runAi() {
    if (!token || !draft.cadet_id) return;
    setDrafting(true);
    try {
      const result = await draftWithAi(token, {
        cadet_id: draft.cadet_id,
        points,
        nco_name: draft.nco_name,
        age: draft.age,
        attendance: draft.attendance,
      });
      // Only fill sections the model actually returned, so a dropped section
      // never blanks out something already written by hand.
      const filled = Object.fromEntries(
        Object.entries(result.sections).filter(([, text]) => text.trim()),
      );
      setDraft({ ...draft, ...filled, generated_by: result.model });
      toast.success(
        result.used_fallback
          ? `Draft written by ${result.model_label} (the preferred model was out of quota).`
          : `Draft written by ${result.model_label}. Read it through before saving.`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't draft the appraisal.");
    } finally {
      setDrafting(false);
    }
  }

  const reviewDate = nextReviewDate(draft.appraisal_date, draft.next_review_months);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Who and when</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="appraisal-nco">NCO</Label>
            {lockedNco ? (
              <Input id="appraisal-nco" value={draft.nco_name} disabled />
            ) : (
              <Select
                value={draft.cadet_id ? String(draft.cadet_id) : ""}
                onValueChange={(value) => chooseNco(Number(value))}
              >
                <SelectTrigger id="appraisal-nco" className="w-full">
                  <SelectValue placeholder="Choose an NCO…" />
                </SelectTrigger>
                <SelectContent>
                  {ncos.map((nco) => (
                    <SelectItem key={nco.cin} value={String(nco.cin)}>
                      {nco.nco_name}
                      {nco.appraisal_count === 0 ? " — never appraised" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {selected && selected.last_appraisal_date && (
              <p className="text-xs text-muted-foreground">
                Last appraised {formatDate(selected.last_appraisal_date)}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="appraisal-date">Appraisal date</Label>
            <Input
              id="appraisal-date"
              type="date"
              value={draft.appraisal_date}
              onChange={(e) => set("appraisal_date", e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="appraisal-name">Name as printed</Label>
            <Input
              id="appraisal-name"
              value={draft.nco_name}
              onChange={(e) => set("nco_name", e.target.value)}
              placeholder="Cpl Smith"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="appraisal-age">Age</Label>
              <Input
                id="appraisal-age"
                value={draft.age}
                onChange={(e) => set("age", e.target.value)}
                placeholder="—"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="appraisal-attendance">Attendance</Label>
              <Input
                id="appraisal-attendance"
                value={draft.attendance}
                onChange={(e) => set("attendance", e.target.value)}
                placeholder="—"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Age and attendance are filled in from the cadet&apos;s record. Edit them if
            the record is wrong &mdash; what you see here is what the document prints.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="gap-1">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4 text-primary" />
            Draft it with AI
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Sum up the overall points you want to make and the AI writes the five
            sections in the squadron&apos;s style. It only uses what you give it, and
            everything comes back below for you to correct.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={points}
            onChange={(e) => setPoints(e.target.value)}
            rows={5}
            placeholder={
              "e.g. High attender, never misses a parade night.\n"
              + "Excellent at drill, teaches it well.\n"
              + "Won't tell cadets off — too worried about being liked.\n"
              + "Needs to run a session on his own without a senior NCO there."
            }
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={runAi}
              disabled={drafting || !draft.cadet_id || points.trim().length < 20}
            >
              {drafting ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              {drafting ? "Writing…" : "Write the sections"}
            </Button>
            {!draft.cadet_id && (
              <span className="text-xs text-muted-foreground">Choose an NCO first.</span>
            )}
            {draft.generated_by && (
              <Badge variant="outline" className="gap-1">
                <Sparkles className="size-3" />
                AI-drafted
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {APPRAISAL_SECTIONS.map((section) => (
        <Card key={section.key}>
          <CardHeader className="gap-1">
            <CardTitle className="text-base">{section.label}</CardTitle>
            <p className="text-sm text-muted-foreground">{section.hint}</p>
          </CardHeader>
          <CardContent>
            <Textarea
              value={draft[section.key]}
              onChange={(e) => set(section.key, e.target.value)}
              rows={section.key === "targets" ? 5 : 6}
            />
          </CardContent>
        </Card>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Next review and flags</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="appraisal-interval">Next NCO review</Label>
            <Select
              value={String(draft.next_review_months)}
              onValueChange={(value) =>
                set("next_review_months", Number(value) as ReviewInterval)
              }
            >
              <SelectTrigger id="appraisal-interval" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {REVIEW_INTERVALS.map((months) => (
                  <SelectItem key={months} value={String(months)}>
                    {months} months
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {reviewDate && (
              <p className="text-xs text-muted-foreground">
                Due {formatDate(reviewDate.toISOString())}
              </p>
            )}
          </div>

          <YesNo
            id="appraisal-concern"
            label="Cause for concern"
            value={draft.cause_for_concern}
            onChange={(v) => set("cause_for_concern", v)}
          />
          <YesNo
            id="appraisal-probation"
            label="Extend probation"
            value={draft.extend_probation}
            onChange={(v) => set("extend_probation", v)}
          />
        </CardContent>
      </Card>
    </div>
  );
}

/** A yes/no pair. A toggle group rather than a checkbox because the form asks
 *  the question both ways round, and "not ticked" shouldn't read as "not asked". */
function YesNo({
  id, label, value, onChange,
}: {
  id: string;
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <ToggleGroup
        id={id}
        type="single"
        variant="outline"
        value={value ? "yes" : "no"}
        // Ignore the empty value a second click on the active item produces —
        // this is a required yes/no, so there is no "neither".
        onValueChange={(next) => next && onChange(next === "yes")}
        className="w-full"
      >
        <ToggleGroupItem value="no" className="flex-1">No</ToggleGroupItem>
        <ToggleGroupItem value="yes" className="flex-1">Yes</ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
