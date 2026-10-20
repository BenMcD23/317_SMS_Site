"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Copy, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { SectionHeading } from "@/components/section-heading";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { useConfirm } from "@/components/confirm-dialog";
import { usePrivateText } from "@/components/private";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RecruitAnswers } from "@/components/recruits/recruit-answers";
import { RecruitPdf } from "@/components/recruits/recruit-pdf";
import { RecruitStatusBadge, StepChecklist } from "@/components/recruits/recruit-status";
import { copyText } from "@/lib/clipboard";
import { formatDate, formatTimestamp } from "@/lib/format";
import {
  daysLeft,
  deleteRecruit,
  extendRecruitLink,
  recruitName,
  reopenRecruit,
  type RecruitDetail,
} from "@/lib/recruits";
import { useApiQuery } from "@/lib/use-api-query";

function expiryText(r: RecruitDetail): string {
  if (r.expired)
    return `The link expired on ${formatDate(r.expiresAt)}. Extend it to let the parent carry on.`;
  const days = daysLeft(r.expiresAt);
  const when = days < 1 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  return `The link expires ${when} (${formatDate(r.expiresAt)}). Their answers so far are kept either way.`;
}

export default function RecruitPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const privateText = usePrivateText();
  const queryClient = useQueryClient();
  const { data: session } = useSession();
  const token = session?.id_token ?? "";
  const { confirm, confirmDialog } = useConfirm();
  const [busy, setBusy] = useState(false);

  // The parent may be filling it in right now; a light poll keeps progress current.
  const {
    data: recruit,
    isLoading,
    error,
    refetch,
  } = useApiQuery<RecruitDetail>(["recruits", id], `/recruits/${id}`, {
    refetchInterval: (q) => (q.state.data?.submittedAt ? false : 30_000),
  });

  async function copyLink() {
    if (!recruit) return;
    if (await copyText(recruit.link)) toast.success("Link copied.");
    else toast.error("Couldn't copy. Select the link and copy it by hand.");
  }

  async function extend() {
    setBusy(true);
    try {
      await extendRecruitLink(token, Number(id));
      toast.success("Link extended for another 14 days.");
      await refetch();
      void queryClient.invalidateQueries({ queryKey: ["recruits"], exact: true });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't extend the link.");
    } finally {
      setBusy(false);
    }
  }

  function reopen() {
    if (!recruit) return;
    confirm(
      `Send ${recruitName(recruit)}'s form back to ${recruit.parentName}? Their answers are kept, but they'll need to sign again, and the same link works for another 14 days.`,
      async () => {
        try {
          await reopenRecruit(token, recruit.id);
          toast.success("Form reopened. Let the parent know what to change.");
          await refetch();
          void queryClient.invalidateQueries({ queryKey: ["recruits"], exact: true });
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Couldn't reopen the form.");
        }
      }
    );
  }

  function remove() {
    if (!recruit) return;
    confirm(
      `Delete ${recruitName(recruit)}? Their link stops working and everything the parent has filled in is deleted.`,
      async () => {
        try {
          await deleteRecruit(token, recruit.id);
          toast.success(`${recruitName(recruit)} deleted.`);
          void queryClient.invalidateQueries({ queryKey: ["recruits"], exact: true });
          router.push("/recruits");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Couldn't delete the recruit.");
        }
      }
    );
  }

  if (isLoading || (!recruit && !error)) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
        <PageHeader title="Recruit" description="Loading…" />
        <ListSkeleton rows={6} />
      </div>
    );
  }

  if (!recruit) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
        <PageHeader title="Recruit" />
        <ErrorAlert message={error?.message ?? "Recruit not found."} title="Could not load this recruit" />
      </div>
    );
  }

  const name = recruitName(recruit);
  const submitted = !!recruit.submittedAt;
  const timeline: [string, string | null][] = [
    ["Added", recruit.createdAt],
    ["Link opened", recruit.openedAt],
    ["Last saved", recruit.lastSavedAt],
    ["Submitted", recruit.submittedAt],
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 pb-16">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {name}
            <RecruitStatusBadge recruit={recruit} />
          </span>
        }
        description={`Parent: ${recruit.parentName} · ${privateText(recruit.parentEmail)}`}
        actions={
          <>
            {submitted && (
              <Button variant="outline" onClick={reopen}>
                <RotateCcw />
                Reopen for changes
              </Button>
            )}
            <Button variant="outline" onClick={remove}>
              <Trash2 />
              Delete
            </Button>
          </>
        }
      />

      {!submitted && (
        <section className="flex flex-col gap-3">
          <SectionHeading
            title="Joining-form link"
            description={`Send this to ${recruit.parentName}. Anyone with it can fill in the form, so send it only to them.`}
          />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              readOnly
              value={recruit.link}
              aria-label="Joining-form link"
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <Button onClick={copyLink} className="shrink-0">
              <Copy />
              Copy link
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className={recruit.expired ? "text-warning text-sm" : "text-muted-foreground text-sm"}>
              {expiryText(recruit)}
            </p>
            <Button variant="outline" onClick={extend} disabled={busy}>
              <CalendarPlus />
              {busy ? "Extending…" : "Extend 14 days"}
            </Button>
          </div>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <SectionHeading
          title="Progress"
          description={`${recruit.progress.done} of ${recruit.progress.total} steps done.`}
        />
        <StepChecklist steps={recruit.progress.steps} missing={recruit.missing} />
        <dl className="text-muted-foreground grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-4">
          {timeline.map(([label, at]) => (
            <div key={label} className="flex flex-col">
              <dt>{label}</dt>
              <dd className="text-foreground tabular-nums">{at ? formatTimestamp(at) : "—"}</dd>
            </div>
          ))}
        </dl>
      </section>

      <Tabs defaultValue={submitted ? "3822A" : "answers"}>
        <TabsList>
          <TabsTrigger value="answers">Answers</TabsTrigger>
          {submitted && <TabsTrigger value="3822A">3822A consent</TabsTrigger>}
          {submitted && recruit.hasHealthDeclaration && <TabsTrigger value="3822H">3822H health</TabsTrigger>}
        </TabsList>
        <TabsContent value="answers" className="pt-4">
          <RecruitAnswers recruit={recruit} />
        </TabsContent>
        {submitted && (
          <TabsContent value="3822A" className="pt-4">
            <RecruitPdf id={recruit.id} form="3822A" fileLabel={`3822A ${name}`} />
          </TabsContent>
        )}
        {submitted && recruit.hasHealthDeclaration && (
          <TabsContent value="3822H" className="pt-4">
            <RecruitPdf id={recruit.id} form="3822H" fileLabel={`3822H ${name}`} />
          </TabsContent>
        )}
      </Tabs>

      {confirmDialog}
    </div>
  );
}
