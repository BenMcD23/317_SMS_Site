"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useForm, type UseFormReturn } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { z } from "zod";

import { API_BASE } from "@/lib/config";
import { apiRequest } from "@/lib/api-fetch";
import type { CommitteeRequestDetail } from "@/lib/committee";
import {
  type CommitteeRequestForm,
  committeeRequestSchema,
  formToPayload,
  requestToForm,
} from "@/lib/committee-form";
import { CommitteeRequestFields } from "@/components/committee/request-fields";
import { ErrorAlert } from "@/components/error-alert";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

// The OC can also reword the reason on a rejected request.
const editSchema = committeeRequestSchema.extend({ rejectionReason: z.string() });
type EditForm = z.infer<typeof editSchema>;

const toEditForm = (req: CommitteeRequestDetail): EditForm => ({
  ...requestToForm(req),
  rejectionReason: req.rejection_reason ?? "",
});

/**
 * The OC's correction of a request after it has gone in: every piece of text,
 * the items and, once rejected, the reason. The API rebuilds the PDF, so the
 * committee's copy follows.
 */
export function EditCommitteeRequestDialog({
  req,
  open,
  onOpenChange,
  onSaved,
}: {
  req: CommitteeRequestDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (req: CommitteeRequestDetail) => void;
}) {
  const { data: session } = useSession();
  const form = useForm<EditForm>({
    resolver: zodResolver(editSchema),
    defaultValues: toEditForm(req),
    mode: "onTouched",
  });
  const [saveError, setSaveError] = useState<string | null>(null);
  const rejected = req.status === "rejected";
  const { reset } = form;

  // A fresh copy of the request each time it opens, so a cancelled edit is gone.
  useEffect(() => {
    if (open) reset(toEditForm(req));
  }, [open, req, reset]);

  const changeOpen = (next: boolean) => {
    if (!next) setSaveError(null);
    onOpenChange(next);
  };

  const save = form.handleSubmit(async (values) => {
    setSaveError(null);
    try {
      const saved = await apiRequest<CommitteeRequestDetail>(
        session?.id_token ?? "",
        `${API_BASE}/committee-requests/${req.id}`,
        {
          method: "PATCH",
          body: {
            ...formToPayload(values),
            ...(rejected ? { rejection_reason: values.rejectionReason } : {}),
          },
        },
        "Couldn't save the request."
      );
      onSaved(saved);
      changeOpen(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Couldn't save the request.");
    }
  });

  const saving = form.formState.isSubmitting;
  return (
    <ResponsiveDialog open={open} onOpenChange={changeOpen}>
      <ResponsiveDialogContent className="sm:max-w-2xl">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Edit {req.reference}</ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            Correct the wording or the items. The PDF is rebuilt with your changes.
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>

        <form
          id="edit-committee-request"
          onSubmit={save}
          noValidate
          className="flex flex-col gap-5 py-1 sm:max-h-[65vh] sm:overflow-y-auto sm:pr-1"
        >
          {/* The fields only touch the shared request fields, so the wider form fits. */}
          <CommitteeRequestFields
            form={form as unknown as UseFormReturn<CommitteeRequestForm>}
            idPrefix="edit"
          />
          {rejected && (
            <Field>
              <FieldLabel htmlFor="edit-rejection-reason">Reason for rejection</FieldLabel>
              <Textarea id="edit-rejection-reason" rows={2} {...form.register("rejectionReason")} />
            </Field>
          )}
          <ErrorAlert message={saveError} title="Not saved" />
        </form>

        <ResponsiveDialogFooter>
          <Button type="button" variant="ghost" onClick={() => changeOpen(false)}>
            Cancel
          </Button>
          <Button type="submit" form="edit-committee-request" disabled={saving}>
            {saving ? <Loader2 className="animate-spin" /> : null} Save changes
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
