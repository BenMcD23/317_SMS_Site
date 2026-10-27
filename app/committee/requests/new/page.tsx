"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";

import { API_BASE } from "@/lib/config";
import { apiRequest } from "@/lib/api-fetch";
import type { CommitteeRequestDetail } from "@/lib/committee";
import {
  type CommitteeRequestForm,
  committeeRequestSchema,
  emptyRequest,
  formToPayload,
} from "@/lib/committee-form";
import { CommitteeRequestFields } from "@/components/committee/request-fields";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";

export default function NewCommitteeRequestPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const form = useForm<CommitteeRequestForm>({
    resolver: zodResolver(committeeRequestSchema),
    defaultValues: emptyRequest(),
    mode: "onTouched",
  });

  const submit = form.handleSubmit(async (values) => {
    if (!session?.id_token) {
      toast.error("No session token. Please sign in again.");
      return;
    }
    try {
      const created = await apiRequest<CommitteeRequestDetail>(
        session.id_token,
        `${API_BASE}/committee-requests`,
        { method: "POST", body: formToPayload(values) },
        "Failed to submit request."
      );
      queryClient.invalidateQueries({ queryKey: ["committee-requests"] });
      toast.success(`Request ${created.reference} submitted — the OC has been notified.`);
      router.push(`/committee/requests/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit request.");
    }
  });

  const submitting = form.formState.isSubmitting;
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="New Committee Request"
        description="Submit a purchase request — the OC is emailed a PDF for approval"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/committee/requests">
              <ArrowLeft /> Back
            </Link>
          </Button>
        }
      />

      <form onSubmit={submit} noValidate className="flex flex-col gap-6">
        <CommitteeRequestFields form={form} idPrefix="new" />
        <Button type="submit" className="h-10 w-full" disabled={submitting}>
          {submitting ? <Loader2 className="animate-spin" /> : null}
          {submitting ? "Submitting…" : "Submit request"}
        </Button>
      </form>
    </div>
  );
}
