"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useApiQuery } from "@/lib/use-api-query";
import { PageHeader } from "@/components/page-header";
import { SessionPlanForm } from "@/components/session-plans/session-plan-form";
import { AttachmentList } from "@/components/session-plans/attachment-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Loader2, Save, Send, Upload } from "lucide-react";
import {
  savePlan, submitPlan, deleteAttachment, uploadAttachments,
} from "@/lib/session-plans-api";
import {
  ATTACHMENT_ACCEPT, contentOf, missingForSubmit,
  type SessionPlanContent, type SessionPlanDetail,
} from "@/lib/session-plans";

export default function EditSessionPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const planId = Number(id);
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [plan, setPlan] = useState<SessionPlanContent | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const { data: saved, isLoading, error } = useApiQuery<SessionPlanDetail>(
    ["session-plan", id],
    `/session-plans/${id}`,
  );

  // Seed the form once, then leave it alone — refetches must not stomp on
  // edits in progress.
  useEffect(() => {
    setPlan((current) => current ?? (saved ? contentOf(saved) : null));
  }, [saved]);

  const token = session?.id_token;
  const missing = plan ? missingForSubmit(plan) : [];

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["session-plan", id] });
    queryClient.invalidateQueries({ queryKey: ["session-plans"] });
  };

  const save = async (thenSubmit: boolean) => {
    if (!token || !plan) return;
    setBusy(thenSubmit ? "submit" : "save");
    try {
      await savePlan(token, plan, planId);
      if (thenSubmit) {
        await submitPlan(token, planId);
        toast.success("Session plan submitted — staff have been emailed.");
      } else {
        toast.success("Changes saved.");
      }
      refresh();
      router.push(`/session-plans/${id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save the plan.");
    } finally {
      setBusy(null);
    }
  };

  const uploadFiles = async (files: FileList) => {
    if (!token) return;
    setBusy("upload");
    try {
      // uploadAttachments compresses images and throws a message meant for the
      // user if a file still won't fit the API's payload limit.
      await uploadAttachments(token, planId, Array.from(files));
      toast.success("File attached.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed.");
    } finally {
      setBusy(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeAttachment = async (attachmentId: number) => {
    if (!token) return;
    setBusy(`del-${attachmentId}`);
    try {
      await deleteAttachment(token, planId, attachmentId);
      toast.success("Attachment removed.");
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed.");
    } finally {
      setBusy(null);
    }
  };

  if (isLoading || (!plan && !error)) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <Skeleton className="h-9 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (error || !saved || !plan) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-sm text-destructive">{error?.message ?? "Session plan not found."}</p>
        <Button asChild variant="ghost" size="sm" className="mt-2">
          <Link href="/session-plans"><ArrowLeft /> Back to session plans</Link>
        </Button>
      </div>
    );
  }
  if (!saved.can_edit) {
    return (
      <div className="mx-auto w-full max-w-3xl">
        <p className="text-sm text-muted-foreground">
          {saved.status === "submitted"
            ? "This plan is with staff for review, so it can't be edited right now."
            : saved.status === "approved"
              ? "This plan has been approved and is locked."
              : "You can't edit this plan."}
        </p>
        <Button asChild variant="ghost" size="sm" className="mt-2">
          <Link href={`/session-plans/${id}`}><ArrowLeft /> Back to the plan</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="Edit Session Plan"
        description={
          saved.status === "amendments_requested"
            ? "Staff have asked for changes — their comments are shown against each section"
            : "Save as you go, then send it to staff for approval"
        }
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href={`/session-plans/${id}`}><ArrowLeft /> Back</Link>
          </Button>
        }
      />

      {saved.status === "amendments_requested" && saved.amendment_note && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-medium">Staff asked for:</p>
          <p className="whitespace-pre-wrap">{saved.amendment_note}</p>
        </div>
      )}

      <SessionPlanForm
        value={plan}
        onChange={setPlan}
        feedback={saved.feedback}
        disabled={busy !== null}
      />

      {/* ── Attachments (the sheet's map box) ───────────────────────────────── */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Attachments</CardTitle>
          <p className="text-sm text-muted-foreground">
            A map, a diagram, anything else staff should see. PNG, JPEG, WebP or PDF.
            Large photos are shrunk automatically; anything still over 5 MB is refused.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <AttachmentList
            planId={planId}
            token={token}
            attachments={saved.attachments}
            onRemove={removeAttachment}
            busy={busy}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy !== null}
          >
            {busy === "upload" ? <Loader2 className="animate-spin" /> : <Upload />} Attach a file
          </Button>
          <p className="text-xs text-muted-foreground">
            Attachments save as soon as you pick them, separately from the rest of the plan.
          </p>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button variant="outline" onClick={() => save(false)} disabled={busy !== null}>
          {busy === "save" ? <Loader2 className="animate-spin" /> : <Save />} Save changes
        </Button>
        <Button onClick={() => save(true)} disabled={busy !== null || missing.length > 0}>
          {busy === "submit" ? <Loader2 className="animate-spin" /> : <Send />}
          {saved.status === "amendments_requested" ? "Save & resubmit" : "Save & submit for approval"}
        </Button>
        {missing.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Still needed before submitting: {missing.join(", ")}.
          </p>
        )}
      </div>
    </div>
  );
}
