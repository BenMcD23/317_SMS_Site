"use client";

import { Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";

import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { AppraisalForm } from "@/components/nco-appraisals/appraisal-form";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/lib/use-api-query";
import {
  createAppraisal, emptyDraft, type AppraisalDraft, type AppraisalOverview,
} from "@/lib/nco-appraisals";

/** useSearchParams opts the tree into client-side rendering, so Next needs a
 *  Suspense boundary around it — without one the page fails to prerender. */
export default function NewAppraisalPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <NewAppraisal />
    </Suspense>
  );
}

function NewAppraisal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const token = session?.id_token;

  // Null until staff touch the form. Keeping "untouched" distinct from "empty"
  // is what lets the ?cin= preselection below apply the moment the NCO list
  // arrives, without an effect that could overwrite a real edit.
  const [edited, setEdited] = useState<AppraisalDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const { data, isLoading, error } = useApiQuery<AppraisalOverview>(
    ["nco-appraisals"],
    "/nco-appraisals",
  );
  const ncos = useMemo(() => data?.ncos ?? [], [data]);

  // ?cin= preselects the NCO, so "Appraise" on the upcoming list lands here with
  // their name, age and attendance already filled in.
  const cinParam = searchParams.get("cin");
  const preselected = useMemo(() => {
    const nco = cinParam ? ncos.find((n) => n.cin === Number(cinParam)) : undefined;
    if (!nco) return emptyDraft();
    return {
      ...emptyDraft(),
      cadet_id: nco.cin,
      nco_name: nco.nco_name,
      age: nco.age,
      attendance: nco.attendance,
    };
  }, [cinParam, ncos]);

  const draft = edited ?? preselected;

  async function save() {
    if (!token || !draft.cadet_id) return;
    setSaving(true);
    try {
      const saved = await createAppraisal(token, draft);
      queryClient.invalidateQueries({ queryKey: ["nco-appraisals"] });
      toast.success("Appraisal saved.");
      router.push(`/nco-appraisals/${saved.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the appraisal.");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="New NCO Appraisal"
        description="Everything saves to the squadron record and can be issued as a Word document or PDF."
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/nco-appraisals">
                <ArrowLeft className="size-4" />
                Back
              </Link>
            </Button>
            <Button onClick={save} disabled={saving || !draft.cadet_id}>
              <Save className="size-4" />
              {saving ? "Saving…" : "Save appraisal"}
            </Button>
          </>
        }
      />

      <ErrorAlert message={error?.message} />

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <>
          <AppraisalForm draft={draft} setDraft={setEdited} ncos={ncos} token={token} />
          <div className="flex justify-end border-t pt-4">
            <Button onClick={save} disabled={saving || !draft.cadet_id}>
              <Save className="size-4" />
              {saving ? "Saving…" : "Save appraisal"}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
