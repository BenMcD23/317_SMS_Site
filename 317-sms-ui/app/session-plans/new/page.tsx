"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { SessionPlanForm } from "@/components/session-plans/session-plan-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, FileText, Loader2, Save, Send, Trash2, Upload } from "lucide-react";
import { savePlan, submitPlan, uploadAttachments } from "@/lib/session-plans-api";
import { prepareUploads } from "@/lib/compress-image";
import {
  ATTACHMENT_ACCEPT, EMPTY_PLAN, missingForSubmit,
  type SessionPlanContent,
} from "@/lib/session-plans";

export default function NewSessionPlanPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [plan, setPlan] = useState<SessionPlanContent>(EMPTY_PLAN);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);

  const missing = missingForSubmit(plan);
  const token = session?.id_token;

  // Nothing to attach files to until the plan exists, so they queue here and go
  // up straight after it's created.
  const addFiles = async (chosen: FileList) => {
    // Compress as they're picked rather than at upload time, so a too-large
    // file is rejected while the user is still looking at the file picker —
    // and so the queued files are already within the API's payload limit.
    let picked: File[];
    try {
      picked = await prepareUploads(Array.from(chosen));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That file is too large to upload.");
      return;
    }
    setFiles((current) => [...current, ...picked]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

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
      // The plan is saved by this point — a failed upload shouldn't lose it, so
      // it's a warning and the files can be re-added from the edit page.
      if (files.length > 0) {
        try {
          await uploadAttachments(token, created.id, files);
        } catch (e) {
          toast.warning(e instanceof Error ? e.message : "Attachments failed to upload.");
        }
      }
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

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Attachments</CardTitle>
          <p className="text-sm text-muted-foreground">
            A map, a diagram, anything else staff should see. PNG, JPEG, WebP or PDF.
            Large photos are shrunk automatically; anything still over 5 MB is refused.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {files.length > 0 && (
            <ul className="flex flex-col divide-y">
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center gap-2 py-2">
                  <FileText className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex-1 truncate text-sm">{f.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={busy !== null}
                    aria-label={`Remove ${f.name}`}
                    onClick={() => setFiles((c) => c.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept={ATTACHMENT_ACCEPT}
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); }}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy !== null}
          >
            <Upload /> Attach a file
          </Button>
          <p className="text-xs text-muted-foreground">
            These upload when you save the plan.
          </p>
        </CardContent>
      </Card>

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
