import { Check, Circle } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { statusLabel, statusTone, type Recruit } from "@/lib/recruits";

/**
 * How far a recruit's parent has got with the joining form, shown in the same
 * words on the Recruits list and a recruit's own page.
 */

const TONE_CLASS = {
  success: "border-success/40 bg-success/10 text-success",
  warning: "border-warning/40 bg-warning/10 text-warning",
  muted: "text-muted-foreground",
};

export function RecruitStatusBadge({ recruit }: { recruit: Pick<Recruit, "status" | "expired"> }) {
  return (
    <Badge variant="outline" className={TONE_CLASS[statusTone(recruit)]}>
      {statusLabel(recruit)}
    </Badge>
  );
}

/** "3 of 8" with a thin bar: a glanceable count for the list. */
export function StepMeter({ progress }: { progress: Recruit["progress"] }) {
  const pct = progress.total ? (progress.done / progress.total) * 100 : 0;
  return (
    <div className="flex min-w-16 flex-col gap-1">
      <span className="text-xs tabular-nums">
        {progress.done} of {progress.total}
      </span>
      <div
        className="bg-muted h-1 w-full max-w-24 overflow-hidden rounded-full"
        role="meter"
        aria-label="Form progress"
        aria-valuemin={0}
        aria-valuemax={progress.total}
        aria-valuenow={progress.done}
      >
        <div className="bg-primary h-full rounded-full" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Every step of the form, ticked when done, with what's still missing under
 *  the ones that aren't — so staff can tell a parent exactly what to finish. */
export function StepChecklist({
  steps,
  missing,
}: {
  steps: Recruit["progress"]["steps"];
  missing: Record<string, string[]>;
}) {
  return (
    <ol className="divide-y rounded-lg border">
      {steps.map((step) => {
        const gaps = step.done ? [] : (missing[step.key] ?? []);
        return (
          <li key={step.key} className="flex gap-3 px-4 py-3">
            {step.done ? (
              <Check className="text-success mt-0.5 size-4 shrink-0" aria-hidden />
            ) : (
              <Circle className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
            )}
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className={cn("text-sm", step.done ? "font-medium" : "text-muted-foreground")}>
                {step.label}
                <span className="sr-only">{step.done ? " (done)" : " (not done)"}</span>
              </span>
              {gaps.length > 0 && (
                <span className="text-muted-foreground text-xs text-pretty">
                  Still needed: {gaps.join(", ")}
                </span>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
