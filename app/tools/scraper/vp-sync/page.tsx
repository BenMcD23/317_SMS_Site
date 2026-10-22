"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AlertTriangle, Bookmark, CheckCircle2, Copy, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { API_BASE } from "@/lib/config";
import { apiRequest } from "@/lib/api-fetch";
import {
  BOOKMARKLET_VERSION,
  collectPortalData,
  VP_ORIGIN,
  type PortalError,
  type PortalFetch,
} from "@/lib/vp-sync";

const NO_OPENER = "Open this from the 317 Sync bookmark on the Volunteer Portal — see Bader Scrapers.";

type SyncCounts = {
  matched: number;
  unmatched: number;
  saved: number;
  failed: number;
  kept: number;
  theory: number;
};
type Status =
  { kind: "waiting"; text: string } | { kind: "done"; counts: SyncCounts } | { kind: "error"; text: string };

/** What a status code most likely means, for someone who isn't a developer. */
function explain(status: number): string {
  if (status === 401) return "signed out of the portal";
  if (status === 403) return "your portal login lacks this permission";
  if (status === 404) return "not found on the portal";
  if (status === 0) return "no response";
  if (status >= 500) return "portal error";
  return `HTTP ${status}`;
}

/**
 * Target of the 317 Sync bookmarklet (public/vp-sync-bookmarklet.js).
 *
 * The bookmarklet opens this page from the Volunteer Portal and relays portal
 * GETs for us; this page decides what to read (collectPortalData), reads only
 * the cadets we hold, then imports them with the signed-in user's token. Messages are accepted only from the portal
 * origin *and* the window that opened us, so no other site can feed data in.
 * Every portal call that failed is listed in full, so whoever runs a sync can
 * copy the problems and send them on.
 */
export default function VpSyncPage() {
  const { data: session } = useSession();
  const token = session?.id_token;
  const [status, setStatus] = useState<Status>({
    kind: "waiting",
    text: "Connecting to the Volunteer Portal…",
  });
  const [errors, setErrors] = useState<PortalError[]>([]);

  const [outdated, setOutdated] = useState(false);

  useEffect(() => {
    if (!token) return;
    const portal = window.opener as Window | null;
    let cins = new Set<string>();
    let started = false;

    // Each relayed portal GET is a numbered request the bookmarklet answers.
    const pending = new Map<number, (reply: { status: number; body: string }) => void>();
    let nextId = 0;
    const fetchPortal: PortalFetch = (path) =>
      new Promise((resolve) => {
        const id = ++nextId;
        pending.set(id, resolve);
        portal!.postMessage({ type: "sms-vp-get", id, path }, VP_ORIGIN);
      });

    const importCadets = async (cadets: unknown, found: PortalError[]) => {
      setErrors(found);
      setStatus({ kind: "waiting", text: `Importing ${Array.isArray(cadets) ? cadets.length : 0} cadets…` });
      try {
        const counts = await apiRequest<SyncCounts>(token, `${API_BASE}/vp-sync`, {
          method: "POST",
          body: { cadets },
        });
        setStatus({ kind: "done", counts });
      } catch (err) {
        setStatus({
          kind: "error",
          text: `Saving to 317 SMS failed: ${err instanceof Error ? err.message : err}`,
        });
      }
    };

    const run = async () => {
      const found: PortalError[] = [];
      try {
        const cadets = await collectPortalData(fetchPortal, cins, found, (done, total) => {
          setStatus({ kind: "waiting", text: `Read ${done} of ${total} cadets from the Volunteer Portal…` });
          portal!.postMessage(
            { type: "sms-vp-progress", text: `read ${done} of ${total} cadets…` },
            VP_ORIGIN
          );
        });
        await importCadets(cadets, found);
      } catch (err) {
        setErrors(found);
        setStatus({
          kind: "error",
          text: `Reading the Volunteer Portal failed: ${err instanceof Error ? err.message : err}`,
        });
      } finally {
        // Tells the bookmarklet to stop relaying.
        portal!.postMessage({ type: "sms-vp-done", text: "done — check the 317 SMS tab." }, VP_ORIGIN);
      }
    };

    const onMessage = (e: MessageEvent) => {
      if (e.origin !== VP_ORIGIN || e.source !== portal) return;
      const m = e.data;
      if (m?.type === "sms-vp-result") {
        pending.get(m.id)?.({ status: Number(m.status) || 0, body: String(m.body ?? "") });
        pending.delete(m.id);
      } else if (m?.type === "sms-vp-hello" && !started) {
        started = true;
        if (!(Number(m.version) >= BOOKMARKLET_VERSION)) setOutdated(true);
        void run();
      } else if (m?.type === "sms-vp-data" && !started) {
        // A bookmark from before the relay reads the portal itself and sends
        // everything at once. Still import it, but ask for a re-drag.
        started = true;
        setOutdated(true);
        void importCadets(m.cadets, Array.isArray(m.errors) ? m.errors : []);
      } else if (m?.type === "sms-vp-error" && !started) {
        setOutdated(true);
        if (Array.isArray(m.errors)) setErrors(m.errors);
        setStatus({ kind: "error", text: `Reading the Volunteer Portal failed: ${m.message}` });
      }
    };
    window.addEventListener("message", onMessage);

    (async () => {
      try {
        if (!portal) throw new Error(NO_OPENER);
        const roster = await apiRequest<{ cin: number }[]>(token, `${API_BASE}/cadets`, { method: "GET" });
        cins = new Set(roster.map((c) => String(c.cin)));
        // `cins` is only for bookmarks from before the relay, which filter themselves.
        portal.postMessage({ type: "sms-vp-ready", cins: roster.map((c) => c.cin) }, VP_ORIGIN);
        setStatus({ kind: "waiting", text: "Reading from the Volunteer Portal — keep that tab open…" });
      } catch (err) {
        setStatus({ kind: "error", text: err instanceof Error ? err.message : String(err) });
      }
    })();

    return () => window.removeEventListener("message", onMessage);
  }, [token]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="Volunteer Portal Sync"
        description="Importing cadet data from the Volunteer Portal"
      />

      {outdated && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-900 dark:text-amber-200">
          <Bookmark />
          <AlertTitle>Your 317 Sync bookmark is out of date</AlertTitle>
          <AlertDescription className="text-amber-900/90 dark:text-amber-200/90">
            <p>
              Delete it and drag a fresh one from{" "}
              <Link href="/tools/scraper" className="underline">
                Bader Scrapers
              </Link>
              . This one still works, but may miss data newer versions read.
            </p>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="flex items-start gap-3 text-sm">
          {status.kind === "waiting" && (
            <>
              <Loader2 className="text-primary mt-0.5 size-5 shrink-0 animate-spin" />
              <p className="pt-0.5">{status.text}</p>
            </>
          )}
          {status.kind === "error" && (
            <>
              <XCircle className="text-destructive mt-0.5 size-5 shrink-0" />
              <p role="alert" className="pt-0.5 break-words">
                {status.text}
              </p>
            </>
          )}
          {status.kind === "done" && <SyncResult counts={status.counts} problems={errors.length} />}
        </CardContent>
      </Card>

      {errors.length > 0 && <ProblemList errors={errors} />}
    </div>
  );
}

function SyncResult({ counts, problems }: { counts: SyncCounts; problems: number }) {
  const stats = [
    { label: "Cadets updated", value: counts.matched },
    { label: "Records saved", value: counts.saved },
    { label: "Theory lessons ticked", value: counts.theory },
    { label: "Reads failed", value: counts.failed },
  ];
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-start gap-3">
        {problems ? (
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-500" />
        ) : (
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-green-600" />
        )}
        <div className="pt-0.5">
          <p className="font-medium">
            {problems
              ? "Sync finished with problems — see below."
              : "Sync complete — you can close this tab."}
          </p>
          {counts.unmatched > 0 && (
            <p className="text-muted-foreground">
              {counts.unmatched} people weren&apos;t in 317 SMS and were skipped.
            </p>
          )}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-muted/50 rounded-md px-3 py-2">
            <dt className="text-muted-foreground text-xs">{s.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{s.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Every failed portal call, grouped by data set, with a copy-all button. */
function ProblemList({ errors }: { errors: PortalError[] }) {
  const groups = new Map<string, PortalError[]>();
  for (const e of errors) groups.set(e.what || "other", [...(groups.get(e.what || "other") ?? []), e]);

  const copy = async () => {
    const text = errors.map((e) => `${e.what}\t${e.status}\t${e.path}\t${e.detail}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Problems copied");
    } catch {
      toast.error("Couldn't copy — select the text instead.");
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base">Problems ({errors.length})</CardTitle>
        <Button variant="outline" size="sm" onClick={copy}>
          <Copy className="size-4" /> Copy all
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {[...groups].map(([what, list]) => (
          <section key={what} aria-label={what} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold capitalize">{what.replaceAll("_", " ")}</h3>
              {[...new Set(list.map((e) => e.status))].map((s) => (
                <Badge key={s} variant="outline" className="whitespace-normal">
                  {s || "—"} · {explain(s)} · ×{list.filter((e) => e.status === s).length}
                </Badge>
              ))}
            </div>
            <ul className="bg-muted/40 max-h-48 overflow-y-auto rounded-md border font-mono text-xs">
              {list.map((e, i) => (
                <li key={i} className="border-b px-3 py-1.5 break-all last:border-b-0">
                  <span className="font-semibold">{e.status || "—"}</span> {e.path}
                  {e.detail && <span className="text-muted-foreground block">{e.detail}</span>}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </CardContent>
    </Card>
  );
}
