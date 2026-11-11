"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageSquareText, UserCheck } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { NoteComposer } from "@/components/nco-notes/note-composer";
import { NoteItem } from "@/components/nco-notes/note-item";
import { PageHeader } from "@/components/page-header";
import { SectionHeading } from "@/components/section-heading";
import { Stat, StatGroup } from "@/components/stat";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { groupByAppraisal, type NcoNotesOverview, type NcoProfile } from "@/lib/nco-notes";
import { useApiQuery } from "@/lib/use-api-query";

/** One NCO's profile: everything staff have noted about them, split into what
 *  the next appraisal will be drafted from and what earlier ones used. */
export default function NcoNotesProfilePage() {
  const { cin } = useParams<{ cin: string }>();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const token = session?.id_token;

  const { data, isLoading, error } = useApiQuery<NcoProfile>(["nco-notes", cin], `/nco-notes/ncos/${cin}`);
  // The team list, for moving a misheard note to the right NCO.
  const { data: overview } = useApiQuery<NcoNotesOverview>(["nco-notes"], "/nco-notes");
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["nco-notes"] });

  const ncos = overview?.ncos ?? (data ? [{ cin: data.nco.cin, name: data.nco.name }] : []);
  const groups = groupByAppraisal(data?.notes ?? []);
  const lastAppraisal = data?.appraisals[0];

  const back = (
    <Button asChild variant="outline">
      <Link href="/nco-notes">
        <ArrowLeft /> All NCOs
      </Link>
    </Button>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title={data?.nco.name ?? "NCO notes"}
        description={
          data ? `${data.nco.flight ? `${data.nco.flight} Flight · ` : ""}Staff only` : "Staff only"
        }
        actions={
          <>
            {back}
            {data && (
              <Button asChild>
                <Link href={`/nco-appraisals/new?cin=${data.nco.cin}`}>
                  <UserCheck /> Write appraisal
                </Link>
              </Button>
            )}
          </>
        }
      />

      {isLoading ? (
        <ListSkeleton rows={4} className="h-20" />
      ) : error || !data ? (
        <ErrorAlert message={error?.message ?? "No data"} title="Could not load this NCO" />
      ) : (
        <>
          <StatGroup className="grid-cols-2 lg:grid-cols-4">
            <Stat
              label="For the next appraisal"
              value={data.open_notes}
              tone={data.open_notes ? "primary" : undefined}
            />
            <Stat label="Notes in all" value={data.notes.length} />
            <Stat
              label="Last appraised"
              value={lastAppraisal ? formatDate(lastAppraisal.appraisal_date) : "Never"}
            />
            <Stat label="Next review" value={formatDate(data.next_review_date, "Not set")} />
          </StatGroup>

          <NoteComposer
            ncos={ncos}
            token={token}
            voiceAvailable={!!overview?.voice_available}
            fixedCin={data.nco.cin}
            onSaved={refresh}
          />

          {!data.notes.length ? (
            <EmptyState
              icon={MessageSquareText}
              title="Nothing noted yet"
              description="Notes you add here, or from the Staff Notes page, build up for this NCO's next appraisal."
            />
          ) : (
            groups.map((group) => (
              <section key={group.appraisalId ?? "open"} className="flex flex-col gap-3">
                <SectionHeading
                  title={
                    group.appraisalId === null
                      ? "Since the last appraisal"
                      : `Used in the appraisal of ${formatDate(group.appraisalDate)}`
                  }
                  description={
                    group.appraisalId === null ? "The next appraisal will be drafted from these." : undefined
                  }
                  actions={
                    group.appraisalId !== null && (
                      <Button asChild variant="ghost" size="sm" className="h-8">
                        <Link href={`/nco-appraisals/${group.appraisalId}`}>Open appraisal</Link>
                      </Button>
                    )
                  }
                />
                <ul className="bg-card flex flex-col divide-y rounded-lg border">
                  {group.notes.map((note) => (
                    <NoteItem key={note.id} note={note} ncos={ncos} token={token} onChanged={refresh} />
                  ))}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
