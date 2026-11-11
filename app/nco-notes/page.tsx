"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { ChevronRight, MessageSquareText, Users } from "lucide-react";

import { DividedGrid } from "@/components/divided-grid";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { NoteComposer } from "@/components/nco-notes/note-composer";
import { NoteItem } from "@/components/nco-notes/note-item";
import { PageHeader } from "@/components/page-header";
import { SectionHeading } from "@/components/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
import type { NcoNotesOverview } from "@/lib/nco-notes";
import { useApiQuery } from "@/lib/use-api-query";

export default function NcoNotesPage() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const token = session?.id_token;

  const { data, isLoading, error } = useApiQuery<NcoNotesOverview>(["nco-notes"], "/nco-notes");
  // Profiles and the appraisal form's notes list read the same notes.
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["nco-notes"] });

  const ncos = data?.ncos ?? [];
  const recent = data?.recent ?? [];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Staff Notes"
        description="Staff only. What you notice about the NCOs on parade night, kept for their appraisals. Write it as if the NCO might read it one day."
      />

      {isLoading ? (
        <>
          <Skeleton className="h-48 w-full" />
          <ListSkeleton rows={4} className="h-14" />
        </>
      ) : error ? (
        <ErrorAlert message={error.message} title="Could not load the notes" />
      ) : !ncos.length ? (
        <EmptyState
          icon={Users}
          title="No NCOs on the roster"
          description="Notes are filed against the NCO team. Once the roster has corporals and above, they'll be listed here."
        />
      ) : (
        <>
          <NoteComposer
            ncos={ncos}
            token={token}
            voiceAvailable={!!data?.voice_available}
            onSaved={refresh}
          />

          <section className="flex flex-col gap-3">
            <SectionHeading title="NCOs" />
            <DividedGrid as="ul" className="grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {ncos.map((nco) => (
                <li key={nco.cin}>
                  <Link
                    href={`/nco-notes/${nco.cin}`}
                    className="hover:bg-muted/50 flex items-center gap-3 px-4 py-3 transition-colors"
                  >
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="truncate font-medium">{nco.name}</span>
                      <span className="text-muted-foreground text-sm">
                        {nco.open_notes === 0
                          ? "Nothing noted since the last appraisal"
                          : `${nco.open_notes} ${nco.open_notes === 1 ? "note" : "notes"} for the next appraisal`}
                        {nco.last_note_date && ` · last ${formatDate(nco.last_note_date)}`}
                      </span>
                    </div>
                    <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
                  </Link>
                </li>
              ))}
            </DividedGrid>
          </section>

          <section className="flex flex-col gap-3">
            <SectionHeading title="Latest notes" />
            {recent.length ? (
              <ul className="bg-card flex flex-col divide-y rounded-lg border">
                {recent.map((note) => (
                  <NoteItem key={note.id} note={note} ncos={ncos} token={token} showNco onChanged={refresh} />
                ))}
              </ul>
            ) : (
              <EmptyState
                icon={MessageSquareText}
                title="No notes yet"
                description="Tap an NCO above and say or type what you saw. Notes build up into their profile for the next appraisal."
              />
            )}
          </section>
        </>
      )}
    </div>
  );
}
