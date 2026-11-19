import { CheckCircle2, Circle, Tent } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@317/ui-common/components/ui/card";
import type { CadetFieldcraftLevel } from "@/lib/fieldcraft";
import { formatDate } from "@/lib/format";
import { cn } from "@317/ui-common/lib/utils";

/**
 * A cadet's fieldcraft lessons, level by level, from the Volunteer Portal.
 * `levels` is null when the sync has no fieldcraft record for them. Lists, not
 * a table, so it reads on a phone.
 */
export function FieldcraftCard({ levels }: { levels: CadetFieldcraftLevel[] | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Tent className="text-muted-foreground h-4 w-4" />
          Fieldcraft lessons
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!levels ? (
          <p className="text-muted-foreground text-sm">
            No fieldcraft record from the Volunteer Portal yet. It comes in with 317 Sync, from a portal login
            that can see fieldcraft.
          </p>
        ) : levels.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No fieldcraft lessons recorded on the Volunteer Portal.
          </p>
        ) : (
          levels.map((level) => {
            const had = level.lessons.filter((l) => l.done).length;
            const all = had === level.lessons.length;
            return (
              <section
                key={level.level}
                aria-label={`${level.level} fieldcraft`}
                className="flex flex-col gap-2"
              >
                <p className="text-sm font-medium">
                  {level.level}{" "}
                  <span className={cn("font-normal", all ? "text-success" : "text-muted-foreground")}>
                    — {all ? "all lessons done" : `${had} of ${level.lessons.length} lessons`}
                  </span>
                </p>
                <ol className="flex flex-col gap-1.5 text-sm">
                  {level.lessons.map((l) => (
                    <li key={l.lesson_id} className="flex items-start gap-2">
                      {l.done ? (
                        <CheckCircle2 className="text-success mt-0.5 size-4 shrink-0" aria-label="Done" />
                      ) : (
                        <Circle
                          className="text-muted-foreground mt-0.5 size-4 shrink-0"
                          aria-label="Not done"
                        />
                      )}
                      <span className={cn("min-w-0 flex-1", !l.done && "text-muted-foreground")}>
                        {l.reference && <span className="text-muted-foreground">{l.reference} · </span>}
                        {l.title}
                        {l.delivered_by && (
                          <span className="text-muted-foreground block text-xs">{l.delivered_by}</span>
                        )}
                      </span>
                      {l.done && (
                        <span className="text-muted-foreground shrink-0 text-xs whitespace-nowrap">
                          {formatDate(l.completed_on, "no date")}
                        </span>
                      )}
                    </li>
                  ))}
                </ol>
              </section>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
