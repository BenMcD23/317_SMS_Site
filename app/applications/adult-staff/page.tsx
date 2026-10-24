"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { CircleCheck, Plus, UserPlus } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { EmptyState } from "@/components/empty-state";
import { CountTabs } from "@/components/count-tabs";
import { OrderDisclosure, OrderList, OrderListSkeleton } from "@/components/order-disclosure";
import { AddApplicantDialog } from "@/components/applications/add-applicant-dialog";
import { ApplicationChecklist } from "@/components/applications/application-checklist";
import { ProgressBadge } from "@/components/applications/application-badges";
import {
  ROUTE_LABEL,
  type Route,
  type UniformedApplication,
  type UniformedResponse,
  UNIFORMED_KEY,
  nextStepLabel,
  stagesFor,
  updateApplication,
} from "@/lib/applications";
import { formatDate } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";

type Tab = "progress" | "complete";

/**
 * Adults applying to join as uniformed staff: application, Wing board, Region
 * board (officers only), appointment on JPA, then the Combined Initial Course
 * within 12 months. Staff add the applicant and tick each step as it happens.
 */
export default function AdultStaffApplicationsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useApiQuery<UniformedResponse>(UNIFORMED_KEY, "/applications/uniformed");
  // An error body ({detail}) where the list was expected must not crash the page.
  const ok = data && Array.isArray(data.applications) && Array.isArray(data.stages) ? data : null;
  const inProgress = ok?.applications.filter((a) => !a.complete) ?? [];
  const complete = ok?.applications.filter((a) => a.complete) ?? [];
  const [tab, setTab] = useState<Tab>("progress");
  const [openId, setOpenId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const shown = tab === "complete" ? complete : inProgress;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Adult Staff Applications"
        description="Uniformed SNCO and officer applicants, from the application forms to the Combined Initial Course."
        actions={
          <Button onClick={() => setAdding(true)}>
            <Plus />
            Add applicant
          </Button>
        }
      />

      <ErrorAlert message={error?.message ?? null} title="Could not load adult staff applications" />

      {!error && (
        <CountTabs<Tab>
          value={tab}
          onValueChange={setTab}
          loading={isLoading || !ok}
          tabs={[
            { value: "progress", label: "In progress", count: inProgress.length },
            { value: "complete", label: "Complete", count: complete.length },
          ]}
        />
      )}

      {isLoading && <OrderListSkeleton rows={3} />}

      {ok && shown.length === 0 && (
        <EmptyState
          icon={tab === "complete" ? CircleCheck : UserPlus}
          title={tab === "complete" ? "No finished applications" : "No applications in progress"}
          description={
            tab === "complete"
              ? "An application lands here once the applicant has done their CIC."
              : "Add someone applying to join as uniformed staff to track their application."
          }
        >
          {tab === "progress" && (
            <Button variant="outline" onClick={() => setAdding(true)}>
              <Plus />
              Add applicant
            </Button>
          )}
        </EmptyState>
      )}

      {ok && shown.length > 0 && (
        <OrderList>
          {shown.map((app) => {
            const stages = stagesFor(ok.stages, app.route);
            const next = nextStepLabel(stages, app.nextStep);
            return (
              <OrderDisclosure
                key={app.id}
                open={openId === app.id}
                onToggle={() => setOpenId(openId === app.id ? null : app.id)}
                label={`application for ${app.name}`}
                muted={app.complete}
                title={app.name}
                meta={
                  <span className="flex flex-col gap-0.5">
                    <span>
                      {ROUTE_LABEL[app.route] ?? app.route} · started {formatDate(app.startedAt)}
                    </span>
                    {next && <span>Next: {next}</span>}
                  </span>
                }
                aside={
                  <>
                    {app.cicDueBy && !app.complete && (
                      <Badge variant="outline">CIC by {formatDate(app.cicDueBy)}</Badge>
                    )}
                    <ProgressBadge done={app.done} total={app.total} complete={app.complete} />
                  </>
                }
              >
                <RoutePicker application={app} />
                <ApplicationChecklist
                  application={app}
                  stages={stages}
                  queryKey={UNIFORMED_KEY}
                  removeMessage={`Remove ${app.name}'s application? Every tick is lost.`}
                />
              </OrderDisclosure>
            );
          })}
        </OrderList>
      )}

      <AddApplicantDialog
        open={adding}
        onOpenChange={setAdding}
        onAdded={(app) => {
          toast.success(`${app.name} added.`);
          setTab("progress");
          setOpenId(app.id);
          void queryClient.invalidateQueries({ queryKey: UNIFORMED_KEY });
        }}
      />
    </div>
  );
}

/** SNCO or officer: switching only shows or hides the Region board; its ticks are kept. */
function RoutePicker({ application }: { application: UniformedApplication }) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const labelId = `route-${application.id}`;

  async function change(route: Route) {
    setSaving(true);
    try {
      const updated = await updateApplication<UniformedApplication>(session?.id_token ?? "", application.id, {
        route,
      });
      queryClient.setQueryData<UniformedResponse>(UNIFORMED_KEY, (old) =>
        old ? { ...old, applications: old.applications.map((a) => (a.id === updated.id ? updated : a)) } : old
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't change the route.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span id={labelId} className="text-sm font-medium">
        Applying as
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        aria-labelledby={labelId}
        value={application.route}
        disabled={saving}
        onValueChange={(v) => v && v !== application.route && void change(v as Route)}
      >
        {(Object.keys(ROUTE_LABEL) as Route[]).map((r) => (
          <ToggleGroupItem key={r} value={r} className="h-8 px-3">
            {ROUTE_LABEL[r]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  );
}
