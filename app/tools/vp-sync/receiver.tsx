"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Loader2 } from "lucide-react";

import { ErrorAlert } from "@/components/error-alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import { VP_ORIGIN, type VpSyncSummary } from "@/lib/vp-sync";

type Phase = "waiting" | "running" | "done" | "error" | "no-opener";

type CollectorMessage = {
  vpSync: 1;
  id?: number;
  op: "hello" | "progress" | "people" | "records" | "done" | "error";
  body?: unknown;
};

/**
 * The popup the bookmarklet opens from a Volunteer Portal tab. The collector
 * script in that tab reads VP and sends each batch here; this window is signed
 * in to 317 SMS, so it posts them to the API as the user and replies with the
 * result. Messages are only taken from VP's origin and from the tab that
 * opened this one.
 */
export function VpSyncReceiver() {
  const { data: session } = useSession();
  const queryClient = useQueryClient();
  // Rendered client-side only (the page's Suspense boundary), so window is there.
  const [phase, setPhase] = useState<Phase>(() => (window.opener ? "waiting" : "no-opener"));
  const [progress, setProgress] = useState<string | null>(null);
  const [summary, setSummary] = useState<VpSyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The listener is registered once; it reads the token through a ref so a
  // session refresh mid-run doesn't tear it down and drop a message.
  const tokenRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    tokenRef.current = session?.id_token;
  }, [session?.id_token]);

  useEffect(() => {
    if (!window.opener) return;

    async function post(path: string, body: unknown) {
      const res = await apiFetch(`${API_BASE}${path}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenRef.current}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 403) throw new Error("Only staff accounts can sync VP data.");
        throw new Error(typeof data.detail === "string" ? data.detail : `The API answered ${res.status}.`);
      }
      return data;
    }

    async function onMessage(e: MessageEvent) {
      if (e.origin !== VP_ORIGIN || e.source !== window.opener) return;
      const msg = e.data as CollectorMessage;
      if (!msg || msg.vpSync !== 1) return;
      const source = e.source as Window;
      const reply = (payload: { ok: boolean; result?: unknown; error?: string }) =>
        source.postMessage({ vpSync: 1, id: msg.id, ...payload }, VP_ORIGIN);

      switch (msg.op) {
        case "hello":
          // The collector keeps saying hello until we answer; stay quiet until
          // the session has a token to post with.
          if (!tokenRef.current) return;
          setPhase("running");
          source.postMessage({ vpSync: 1, op: "ready" }, VP_ORIGIN);
          return;
        case "progress":
          setProgress((msg.body as { text: string }).text);
          return reply({ ok: true });
        case "people":
        case "records":
          try {
            return reply({ ok: true, result: await post(`/vp-sync/${msg.op}`, msg.body) });
          } catch (err) {
            return reply({ ok: false, error: err instanceof Error ? err.message : String(err) });
          }
        case "done":
          setSummary(msg.body as VpSyncSummary);
          setPhase("done");
          queryClient.invalidateQueries({ queryKey: ["vp-sync"] });
          return reply({ ok: true });
        case "error":
          setError((msg.body as { message: string }).message);
          setPhase("error");
          return reply({ ok: true });
      }
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [queryClient]);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Syncing from the Volunteer Portal</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          {phase === "no-opener" && (
            <p className="text-muted-foreground">
              This window is opened by the 317 VP Sync bookmark on a Volunteer Portal tab. Open{" "}
              <a className="underline" href="/tools/vp-sync">
                VP Sync
              </a>{" "}
              to set it up.
            </p>
          )}
          {(phase === "waiting" || phase === "running") && (
            <p className="text-muted-foreground flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" />
              {phase === "waiting" ? "Connecting to the Volunteer Portal tab…" : (progress ?? "Starting…")}
            </p>
          )}
          {phase !== "no-opener" && phase !== "done" && (
            <p className="text-muted-foreground">Keep this window and the VP tab open until it finishes.</p>
          )}
          {phase === "done" && summary && (
            <>
              <p className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="text-success size-4" />
                Synced {summary.people} people, {summary.recordsStored} records.
              </p>
              <ul className="text-muted-foreground list-disc pl-5">
                {summary.notOnSmsRoster > 0 && (
                  <li>{summary.notOnSmsRoster} in VP but not on the SMS roster yet, so skipped</li>
                )}
                {summary.removed > 0 && <li>{summary.removed} removed (no longer in VP)</li>}
                {summary.noPermission.length > 0 && (
                  <li>Your VP account can&apos;t see: {summary.noPermission.join(", ")}</li>
                )}
                {summary.failed > 0 && (
                  <li>{summary.failed} lookups failed; their previous copies were kept</li>
                )}
              </ul>
              <p className="text-muted-foreground">You can close this window.</p>
            </>
          )}
          <ErrorAlert title="Sync failed" message={phase === "error" ? error : null} />
        </CardContent>
      </Card>
    </div>
  );
}
