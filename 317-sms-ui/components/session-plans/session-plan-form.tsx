"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, MessageSquareWarning } from "lucide-react";
import {
  HEADER_FIELDS,
  PLAN_SECTIONS,
  type SessionPlanContent,
  type SessionPlanSectionKey,
  type SessionPlanTextKey,
  type TimetableRow,
} from "@/lib/session-plans";

/**
 * The session plan itself as a form — shared by the "new plan" and "edit plan"
 * pages so the field list and its wording live in one place. Fully controlled:
 * the parent owns the draft state and decides what the save buttons do.
 *
 * `feedback` is the staff's per-section comments; when a plan comes back for
 * amendment they're shown inline against the section they're about, so the NCO
 * fixes the text with the comment right next to it.
 */
export function SessionPlanForm({
  value,
  onChange,
  feedback,
  disabled,
}: {
  value: SessionPlanContent;
  onChange: (next: SessionPlanContent) => void;
  feedback?: Partial<Record<SessionPlanSectionKey, string>>;
  disabled?: boolean;
}) {
  const set = <K extends keyof SessionPlanContent>(key: K, v: SessionPlanContent[K]) =>
    onChange({ ...value, [key]: v });
  const setText = (key: SessionPlanTextKey, v: string) => onChange({ ...value, [key]: v });

  const setRow = (index: number, field: keyof TimetableRow, v: string) =>
    set(
      "timetable",
      value.timetable.map((r, i) => (i === index ? { ...r, [field]: v } : r)),
    );
  const addRow = () =>
    set("timetable", [...value.timetable, { timing: "", event: "", location: "" }]);
  const removeRow = (index: number) =>
    set("timetable", value.timetable.filter((_, i) => i !== index));

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header block ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">The Session</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-5 sm:grid-cols-2">
          {HEADER_FIELDS.map((field) => (
            <div
              key={field.key}
              className={field.multiline ? "space-y-1.5 sm:col-span-2" : "space-y-1.5"}
            >
              <Label htmlFor={field.key}>{field.label}</Label>
              <p className="text-xs text-muted-foreground">{field.hint}</p>
              {field.multiline ? (
                <Textarea
                  id={field.key}
                  value={value[field.key]}
                  onChange={(e) => setText(field.key, e.target.value)}
                  disabled={disabled}
                  rows={3}
                />
              ) : (
                <Input
                  id={field.key}
                  type={field.type ?? "text"}
                  value={value[field.key]}
                  onChange={(e) => setText(field.key, e.target.value)}
                  disabled={disabled}
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ── Section plan ──────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Section Plan</CardTitle>
          <p className="text-sm text-muted-foreground">
            Include timings where they help. Staff comment against each part when they review it.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          {PLAN_SECTIONS.map((section) => {
            const comment = feedback?.[section.key];
            return (
              <div key={section.key} className="space-y-1.5">
                <Label htmlFor={section.key}>{section.label}</Label>
                <p className="text-xs text-muted-foreground">{section.hint}</p>
                {comment && (
                  <div className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
                    <MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-500" />
                    <p className="whitespace-pre-wrap">{comment}</p>
                  </div>
                )}
                <Textarea
                  id={section.key}
                  value={value[section.key]}
                  onChange={(e) => set(section.key, e.target.value)}
                  disabled={disabled}
                  rows={section.key === "execution" ? 6 : 3}
                />
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Extras ────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Extras</CardTitle>
          <p className="text-sm text-muted-foreground">
            A timetable and any other notes — both optional.
          </p>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <Label>Timetable</Label>
            {value.timetable.length === 0 ? (
              <p className="text-xs text-muted-foreground">No timings added.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="hidden gap-2 text-xs text-muted-foreground sm:grid sm:grid-cols-[7rem_1fr_10rem_2.25rem]">
                  <span>Timing</span>
                  <span>Event</span>
                  <span>Location</span>
                  <span />
                </div>
                {value.timetable.map((row, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[7rem_1fr_10rem_2.25rem]">
                    <Input
                      value={row.timing}
                      onChange={(e) => setRow(i, "timing", e.target.value)}
                      placeholder="19:00"
                      disabled={disabled}
                    />
                    <Input
                      value={row.event}
                      onChange={(e) => setRow(i, "event", e.target.value)}
                      placeholder="What's happening"
                      disabled={disabled}
                    />
                    <Input
                      value={row.location}
                      onChange={(e) => setRow(i, "location", e.target.value)}
                      placeholder="Where"
                      disabled={disabled}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(i)}
                      disabled={disabled}
                      aria-label="Remove timetable row"
                    >
                      <Trash2 className="text-muted-foreground" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={addRow} disabled={disabled}>
              <Plus /> Add timing
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="notes">Notes</Label>
            <p className="text-xs text-muted-foreground">
              Anything else staff should know — wet weather plan, safety points, what a map shows.
            </p>
            <Textarea
              id="notes"
              value={value.notes}
              onChange={(e) => set("notes", e.target.value)}
              disabled={disabled}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
