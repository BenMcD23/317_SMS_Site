"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Copy, Loader2, Mail, Pencil } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { ErrorAlert } from "@/components/error-alert";
import { apiRequest } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";
import { copyText } from "@/lib/clipboard";
import type { ParentEmailsResponse } from "@/lib/leaving";
import { useApiQuery } from "@/lib/use-api-query";

export const PARENT_EMAILS_KEY = ["oc-parent-emails"] as const;

/**
 * Every parent address on file as `a@x;b@y`, to paste into a BCC. The site
 * deliberately doesn't send to parents: the OC does that from their own account.
 * The Cadet Records Scraper adds addresses from Bader's Next Of Kin report;
 * the OC can add more here, and the scraper never removes one.
 */
export function ParentEmailsCard() {
  const [editing, setEditing] = useState(false);
  const { data, isLoading, error } = useApiQuery<ParentEmailsResponse>(
    PARENT_EMAILS_KEY,
    "/oc/parent-emails"
  );

  async function copyAll() {
    if (!data?.bcc) return;
    const ok = await copyText(data.bcc);
    if (ok) toast.success(`Copied ${data.count} parent email${data.count !== 1 ? "s" : ""}`);
    else toast.error("Couldn't copy — select the text and copy it by hand");
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="text-muted-foreground size-4" />
          Parent emails
          {data && (
            <Badge variant="secondary" className="ml-auto text-xs font-normal">
              {data.count}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          Paste into the BCC of an email from your own account. Siblings sharing an address are listed once.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {error ? (
          <ErrorAlert message={error.message} title="Could not load parent emails" />
        ) : isLoading || !data ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <Textarea
              readOnly
              aria-label="Parent emails, separated by semicolons"
              value={data.bcc}
              placeholder="No parent emails on file yet. Run the Cadet Records Scraper, or use “Edit emails” to add them."
              className="max-h-40 min-h-24 font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={copyAll} disabled={!data.bcc}>
                <Copy data-icon="inline-start" />
                Copy all
              </Button>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil data-icon="inline-start" />
                Edit emails
              </Button>
              {data.missing > 0 && (
                <span className="text-warning text-xs">
                  {data.missing} cadet{data.missing !== 1 ? "s have" : " has"} no parent email
                </span>
              )}
            </div>
          </>
        )}
      </CardContent>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit parent emails</DialogTitle>
            <DialogDescription>
              Separate several addresses with a semicolon. Each row saves on its own.
            </DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-col gap-2 overflow-y-auto pr-1">
            {data?.cadets.map((c) => (
              <ParentEmailsRow
                key={c.cin}
                cin={c.cin}
                name={c.name}
                flight={c.flight}
                emails={c.parentEmails}
              />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function ParentEmailsRow({
  cin,
  name,
  flight,
  emails,
}: {
  cin: number;
  name: string;
  flight: string | null;
  emails: string[];
}) {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  const saved = emails.join("; ");
  const [value, setValue] = useState(saved);
  const [saving, setSaving] = useState(false);
  const dirty = value.trim() !== saved;

  async function save() {
    if (!session?.id_token) return;
    setSaving(true);
    try {
      const res = await apiRequest<{ parentEmails: string[] }>(
        session.id_token,
        `${API_BASE}/oc/parent-emails/${cin}`,
        { method: "PUT", body: { emails: value } },
        "Could not save"
      );
      setValue(res.parentEmails.join("; "));
      await queryClient.invalidateQueries({ queryKey: PARENT_EMAILS_KEY });
      await queryClient.invalidateQueries({ queryKey: ["oc-leaving"] });
      toast.success(`Saved ${name}`);
    } catch (e: unknown) {
      // The API names the bad address, so the OC can fix the typo.
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid items-center gap-2 sm:grid-cols-[12rem_1fr_auto]">
      <span className="truncate text-sm">
        {name}
        {flight && <span className="text-muted-foreground"> · {flight}</span>}
      </span>
      <Input
        aria-label={`Parent emails for ${name}`}
        value={value}
        placeholder="parent@example.com; other@example.com"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && dirty && save()}
      />
      <Button
        size="sm"
        variant="outline"
        onClick={save}
        disabled={!dirty || saving}
        aria-label={`Save ${name}`}
      >
        {saving ? <Loader2 className="animate-spin" /> : "Save"}
      </Button>
    </div>
  );
}
