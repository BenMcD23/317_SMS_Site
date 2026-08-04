"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { SessionPlanForm } from "@/components/session-plans/session-plan-form";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Loader2, Save, Send } from "lucide-react";
import { savePlan, submitPlan } from "@/lib/session-plans-api";
import { EMPTY_PLAN, missingForSubmit, type SessionPlanContent } from "@/lib/session-plans";

export default function NewSessionPlanPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const [plan, setPlan] = useState<SessionPlanContent>(EMPTY_PLAN);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);

  const missing = missingForSubmit(plan);
  const token = session?.id_token;

  // Both buttons create the plan; "submit" just carries straight on to the
  // approval request, so a half-finished plan is never lost either way.
  const create = async (thenSubmit: boolean) => {
    if (!token) {
      toast.error("No session token. Please sign in again.");
      return;
    }
    setBusy(thenSubmit ? "submit" : "draft");
    try {
      const created = await savePlan(token, plan);
      if (thenSubmit) {
        await submitPlan(token, created.id);
        toast.success("Session plan submitted — staff have been emailed.");
      } else {
        toast.success("Draft saved.");
      }
      queryClient.invalidateQueries({ queryKey: ["session-plans"] });
      router.push(`/session-plans/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save the plan.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="New Session Plan"
        description="Save it as a draft while you work on it, then send it to staff for approval"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/session-plans"><ArrowLeft /> Back</Link>
          </Button>
        }
      />

      <SessionPlanForm value={plan} onChange={setPlan} disabled={busy !== null} />

      <div className="flex flex-wrap items-center gap-2 border-t pt-4">
        <Button variant="outline" onClick={() => create(false)} disabled={busy !== null}>
          {busy === "draft" ? <Loader2 className="animate-spin" /> : <Save />} Save draft
        </Button>
        <Button onClick={() => create(true)} disabled={busy !== null || missing.length > 0}>
          {busy === "submit" ? <Loader2 className="animate-spin" /> : <Send />} Submit for approval
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
