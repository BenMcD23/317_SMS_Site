"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { ExternalLink, Mail, Printer, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/confirm-dialog";
import {
  type Application,
  type Stage,
  type StepLink,
  removeApplication,
  tickStep,
  updateApplication,
} from "@/lib/applications";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The checklist inside an application row, shared by the staff cadet and
 * adult staff pages: each stage's steps as tick boxes (with who ticked them
 * and when), each stage's note, links to print each paper form, a notes box and
 * remove. Saves go straight to the API and the returned application replaces
 * the cached one, so the row's progress updates without a refetch.
 */
export function ApplicationChecklist<T extends Application>({
  application,
  stages,
  queryKey,
  removeMessage,
}: {
  application: T;
  /** Already narrowed to the applicant's route. */
  stages: Stage[];
  /** The list query this application sits in, to update in place. */
  queryKey: readonly unknown[];
  removeMessage: string;
}) {
  const { data: session } = useSession();
  const token = session?.id_token ?? "";
  const queryClient = useQueryClient();
  const { confirm, confirmDialog } = useConfirm();
  const [saving, setSaving] = useState<string | null>(null);
  const [notes, setNotes] = useState(application.notes ?? "");
  const notesChanged = notes.trim() !== (application.notes ?? "");

  function replace(updated: T) {
    queryClient.setQueryData<{ applications: T[] }>(queryKey, (old) =>
      old ? { ...old, applications: old.applications.map((a) => (a.id === updated.id ? updated : a)) } : old
    );
  }

  async function tick(key: string, done: boolean) {
    setSaving(key);
    try {
      replace(await tickStep<T>(token, application.id, key, done));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that step.");
    } finally {
      setSaving(null);
    }
  }

  async function saveNotes() {
    setSaving("notes");
    try {
      const updated = await updateApplication<T>(token, application.id, { notes: notes.trim() });
      replace(updated);
      setNotes(updated.notes ?? "");
      toast.success("Notes saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the notes.");
    } finally {
      setSaving(null);
    }
  }

  async function remove() {
    try {
      await removeApplication(token, application.id);
      toast.success("Application removed.");
      // A removed staff cadet goes back on the nearing-18 list, which only
      // the server can work out.
      await queryClient.invalidateQueries({ queryKey });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't remove the application.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      {stages.map((stage) => {
        const done = stage.steps.filter((s) => application.steps[s.key]).length;
        return (
          <section
            key={stage.key}
            aria-labelledby={`stage-${application.id}-${stage.key}`}
            className="flex flex-col gap-2"
          >
            <h3
              id={`stage-${application.id}-${stage.key}`}
              className="flex items-baseline justify-between gap-3 text-sm font-semibold"
            >
              {stage.title}
              <span
                className={cn(
                  "text-xs font-normal tabular-nums",
                  done === stage.steps.length ? "text-success" : "text-muted-foreground"
                )}
              >
                {done} of {stage.steps.length}
              </span>
            </h3>
            <ul className="divide-y rounded-md border">
              {stage.steps.map((step) => {
                const ticked = application.steps[step.key];
                const id = `step-${application.id}-${step.key}`;
                return (
                  <li key={step.key} className="flex gap-3 px-3 py-2.5">
                    {/* A 32px tap area round the 16px box, for a thumb. */}
                    <div className="-m-2 flex size-8 shrink-0 items-center justify-center">
                      <Checkbox
                        id={id}
                        checked={!!ticked}
                        disabled={saving === step.key}
                        onCheckedChange={(checked) => void tick(step.key, checked === true)}
                      />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <Label
                        htmlFor={id}
                        className={cn("leading-snug font-normal", ticked && "text-muted-foreground")}
                      >
                        {step.label}
                      </Label>
                      {step.hint && (
                        <p className="text-muted-foreground text-xs leading-relaxed">{step.hint}</p>
                      )}
                      {step.links.length > 0 && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {step.links.map((link) => (
                            <FormLink key={link.url} link={link} />
                          ))}
                        </div>
                      )}
                      {ticked && (
                        <p className="text-muted-foreground text-xs">
                          Done {formatDate(ticked.at)}
                          {ticked.by && ` by ${ticked.by}`}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            {stage.note && <p className="text-muted-foreground text-xs">{stage.note}</p>}
          </section>
        );
      })}

      <div className="flex flex-col gap-2">
        <Label htmlFor={`notes-${application.id}`}>Notes</Label>
        <Textarea
          id={`notes-${application.id}`}
          value={notes}
          maxLength={5000}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Board dates, what's being chased, anything the next person needs to know"
          className="min-h-20"
        />
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button
            variant="ghost"
            className="text-destructive hover:text-destructive h-9"
            onClick={() => confirm(removeMessage, () => void remove())}
          >
            <Trash2 />
            Remove application
          </Button>
          {notesChanged && (
            <Button className="h-9" onClick={() => void saveNotes()} disabled={saving === "notes"}>
              Save notes
            </Button>
          )}
        </div>
      </div>
      {confirmDialog}
    </div>
  );
}

/** A form to print (Word or PDF on SharePoint), an address to email, or an online form. */
function FormLink({ link }: { link: StepLink }) {
  const isMail = link.url.startsWith("mailto:");
  const isDocument = /\.(docx|pdf)\b|Doc\.aspx|:w:/i.test(link.url);
  const Icon = isMail ? Mail : isDocument ? Printer : ExternalLink;
  return (
    <Button asChild variant="outline" size="sm" className="h-8 max-w-full">
      <a href={link.url} target={isMail ? undefined : "_blank"} rel="noopener noreferrer">
        <Icon />
        <span className="truncate">{link.label}</span>
      </a>
    </Button>
  );
}
