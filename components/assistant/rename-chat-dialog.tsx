"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";

import { ErrorAlert } from "@/components/error-alert";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { ChatSummary } from "@/lib/assistant";

// The API's own limit on a chat's name.
export const CHAT_TITLE_MAX = 80;

const schema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Give the chat a name")
    .max(CHAT_TITLE_MAX, `${CHAT_TITLE_MAX} characters at most`),
});
type Form = z.infer<typeof schema>;

/**
 * Renames a saved assistant chat. `onSave` does the request and rejects with
 * the API's message. Give it a `key` per chat, so each opening starts a fresh
 * form holding that chat's name.
 */
export function RenameChatDialog({
  chat,
  onOpenChange,
  onSave,
}: {
  chat: ChatSummary | null;
  onOpenChange: (open: boolean) => void;
  onSave: (chat: ChatSummary, title: string) => Promise<void>;
}) {
  const form = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { title: chat?.title ?? "" },
    mode: "onTouched",
  });
  const { register, handleSubmit, formState } = form;
  const [submitError, setSubmitError] = useState<string | null>(null);

  const submit = handleSubmit(async ({ title }) => {
    if (!chat) return;
    setSubmitError(null);
    try {
      await onSave(chat, title.trim());
      onOpenChange(false);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "Couldn't rename the chat.");
    }
  });
  const error = formState.errors.title?.message;

  return (
    <ResponsiveDialog open={!!chat} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-md">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>Rename chat</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form id="rename-chat" onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <Field data-invalid={!!error || undefined}>
            <FieldLabel htmlFor="chat-title">Name</FieldLabel>
            <Input
              id="chat-title"
              autoComplete="off"
              aria-invalid={!!error || undefined}
              {...register("title")}
            />
            <FieldError>{error}</FieldError>
          </Field>
          <ErrorAlert message={submitError} title="Not renamed" />
        </form>
        <ResponsiveDialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form="rename-chat" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Saving…" : "Save name"}
          </Button>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
