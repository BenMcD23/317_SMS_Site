"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { CircleCheck, Hourglass, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { EmptyState } from "@/components/empty-state";
import { CountTabs } from "@/components/count-tabs";
import { OrderDisclosure, OrderList, OrderListSkeleton } from "@/components/order-disclosure";
import { Private } from "@/components/private";
import { ApplicationChecklist } from "@/components/applications/application-checklist";
import { DeadlineBadge, ProgressBadge } from "@/components/applications/application-badges";
import {
  type NearingCadet,
  type StaffCadetResponse,
  STAFF_CADET_KEY,
  deadlineText,
  nextStepLabel,
  startStaffCadet,
} from "@/lib/applications";
import { formatDate } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";

type Tab = "nearing" | "progress" | "complete";

function cadetMeta(c: NearingCadet) {
  return [c.rank, c.flight && `${c.flight} Flight`].filter(Boolean).join(" · ") || `CIN ${c.cin}`;
}

/**
 * Staff cadet applications (PI501). Cadets 17½ and over are listed as nearing
 * 18; starting an application moves one into the tracking list, where staff
 * tick off the Wing's three stages as they go. Unfinished by the 18th birthday
 * means suspended, so everything is ordered by that date.
 */
export default function StaffCadetApplicationsPage() {
  const { data, isLoading, error } = useApiQuery<StaffCadetResponse>(
    STAFF_CADET_KEY,
    "/applications/staff-cadets"
  );
  // An error body ({detail}) where the lists were expected must not crash the page.
  const ok = data && Array.isArray(data.applications) && Array.isArray(data.nearing18) ? data : null;
  const inProgress = ok?.applications.filter((a) => !a.complete) ?? [];
  const complete = ok?.applications.filter((a) => a.complete) ?? [];
  const nearing = ok?.nearing18 ?? [];

  const [chosen, setChosen] = useState<Tab | null>(null);
  // Open on what needs doing: the tracking list if anything's in it.
  const tab: Tab = chosen ?? (inProgress.length || !nearing.length ? "progress" : "nearing");
  const [openId, setOpenId] = useState<number | null>(null);
  const shown = tab === "complete" ? complete : inProgress;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Staff Cadet Applications"
        description="Start at 17½. If the process isn't finished by a cadet's 18th birthday they're suspended until it is."
      />

      <ErrorAlert message={error?.message ?? null} title="Could not load staff cadet applications" />

      {!error && (
        <CountTabs<Tab>
          value={tab}
          onValueChange={setChosen}
          loading={isLoading || !ok}
          tabs={[
            { value: "progress", label: "In progress", count: inProgress.length },
            { value: "nearing", label: "Nearing 18", count: nearing.length },
            { value: "complete", label: "Complete", count: complete.length },
          ]}
        />
      )}

      {isLoading && <OrderListSkeleton rows={4} />}

      {ok && tab === "nearing" && <NearingList cadets={nearing} onStarted={() => setChosen("progress")} />}

      {ok && tab !== "nearing" && shown.length === 0 && (
        <EmptyState
          icon={tab === "complete" ? CircleCheck : Hourglass}
          title={tab === "complete" ? "No finished applications" : "No applications in progress"}
          description={
            tab === "complete"
              ? "An application lands here once every step is ticked."
              : "Start one from the Nearing 18 tab."
          }
        >
          {tab === "progress" && nearing.length > 0 && (
            <Button variant="outline" onClick={() => setChosen("nearing")}>
              See who&apos;s nearing 18
            </Button>
          )}
        </EmptyState>
      )}

      {ok && tab !== "nearing" && shown.length > 0 && (
        <OrderList>
          {shown.map((app) => {
            const next = nextStepLabel(ok.stages, app.nextStep);
            return (
              <OrderDisclosure
                key={app.id}
                open={openId === app.id}
                onToggle={() => setOpenId(openId === app.id ? null : app.id)}
                label={`application for ${app.cadet.name}`}
                muted={app.complete}
                title={app.cadet.name}
                meta={
                  <span className="flex flex-col gap-0.5">
                    <span>
                      {cadetMeta(app.cadet)}
                      <Private>
                        {app.cadet.turns18On && ` · 18 on ${formatDate(app.cadet.turns18On)}`}
                      </Private>
                    </span>
                    {next && <span>Next: {next}</span>}
                  </span>
                }
                aside={
                  <>
                    {!app.complete && <DeadlineBadge daysTo18={app.cadet.daysTo18} />}
                    <ProgressBadge done={app.done} total={app.total} complete={app.complete} />
                  </>
                }
              >
                <ApplicationChecklist
                  application={app}
                  stages={ok.stages}
                  queryKey={STAFF_CADET_KEY}
                  removeMessage={`Remove ${app.cadet.name}'s staff cadet application? Every tick is lost, and they go back on the Nearing 18 list.`}
                />
              </OrderDisclosure>
            );
          })}
        </OrderList>
      )}
    </div>
  );
}

/** Cadets 17½ and over with no application yet, soonest birthday first. */
function NearingList({ cadets, onStarted }: { cadets: NearingCadet[]; onStarted: () => void }) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [starting, setStarting] = useState<number | null>(null);

  async function start(cadet: NearingCadet) {
    setStarting(cadet.cin);
    try {
      await startStaffCadet(session?.id_token ?? "", cadet.cin);
      await queryClient.invalidateQueries({ queryKey: STAFF_CADET_KEY });
      toast.success(`Application started for ${cadet.name}.`);
      onStarted();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't start the application.");
    } finally {
      setStarting(null);
    }
  }

  if (!cadets.length) {
    return (
      <EmptyState
        icon={UserPlus}
        title="Nobody is nearing 18"
        description="Cadets appear here once they're 17½, with time to finish before their 18th birthday."
      />
    );
  }

  return (
    <OrderList>
      {cadets.map((c) => (
        <div
          key={c.cin}
          className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-3 sm:px-5"
        >
          <div className="flex min-w-40 flex-1 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2 font-semibold">
              {c.name}
              <DeadlineBadge daysTo18={c.daysTo18} />
            </span>
            <span className="text-muted-foreground text-xs">
              {cadetMeta(c)}
              <Private>
                {c.turns18On && ` · ${deadlineText(c.daysTo18)} (${formatDate(c.turns18On)})`}
              </Private>
            </span>
          </div>
          <Button
            variant="outline"
            className="h-9"
            onClick={() => void start(c)}
            disabled={starting !== null}
          >
            Start application
          </Button>
        </div>
      ))}
    </OrderList>
  );
}
