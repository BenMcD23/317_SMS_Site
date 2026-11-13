"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { AlertTriangle, Bookmark, CheckCircle2, Copy, GraduationCap, Loader2, XCircle } from "lucide-react";
import { toast } from "sonner";

import { PageHeader } from "@/components/page-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { API_BASE } from "@/lib/config";
import { apiRequest } from "@/lib/api-fetch";
import {
  BOOKMARKLET_VERSION,
  collectPortalData,
  collectStaffData,
  ENROL_VERSION,
  enrolledIds,
  enrolmentPlan,
  enrolmentRequest,
  VP_ORIGIN,
  type EnrolGroup,
  type ExamReady,
  type ExamSubject,
  type PortalError,
  type PortalFetch,
  type PortalStaff,
} from "@/lib/vp-sync";

const NO_OPENER = "Open this from the 317 Sync bookmark on the Volunteer Portal — see Bader Scrapers.";

type SyncCounts = {
  matched: number;
  unmatched: number;
  saved: number;
  failed: number;
  kept: number;
  theory: number;
  staff?: number;
};

/** What the page can ask the bookmark to do once the sync is in: GET, enrol, or stop. */
type Relay = {
  get: PortalFetch;
  enrol: (path: string, body: unknown, label: string) => Promise<{ status: number; body: string }>;
  done: (text: string) => void;
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
  const [enrolGroups, setEnrolGroups] = useState<EnrolGroup[] | null>(null);
  const [canEnrol, setCanEnrol] = useState(false);
  const relayRef = useRef<Relay | null>(null);

  useEffect(() => {
    if (!token) return;
    const portal = window.opener as Window | null;
    let cins = new Set<string>();
    let started = false;

    // Each relayed portal GET is a numbered request the bookmarklet answers.
    const pending = new Map<number, (reply: { status: number; body: string }) => void>();
    let nextId = 0;
    let staffCins = new Set<string>();
    const ask = (type: string, extra: Record<string, unknown>) =>
      new Promise<{ status: number; body: string }>((resolve) => {
        const id = ++nextId;
        pending.set(id, resolve);
        portal!.postMessage({ type, id, ...extra }, VP_ORIGIN);
      });
    const fetchPortal: PortalFetch = (path) => ask("sms-vp-get", { path });
    let finished = false;
    const done = (text: string) => {
      if (finished) return;
      finished = true;
      // Tells the bookmarklet to stop relaying.
      portal!.postMessage({ type: "sms-vp-done", text }, VP_ORIGIN);
    };
    relayRef.current = {
      get: fetchPortal,
      enrol: (path, body, label) => ask("sms-vp-enrol", { path, body, label }),
      done,
    };

    /** False if the import failed, so nothing more is offered. */
    const importCadets = async (cadets: unknown, found: PortalError[], staff?: PortalStaff[]) => {
      setErrors(found);
      setStatus({ kind: "waiting", text: `Importing ${Array.isArray(cadets) ? cadets.length : 0} cadets…` });
      try {
        const counts = await apiRequest<SyncCounts>(token, `${API_BASE}/vp-sync`, {
          method: "POST",
          body: staff ? { cadets, staff } : { cadets },
        });
        setStatus({ kind: "done", counts });
        return true;
      } catch (err) {
        setStatus({
          kind: "error",
          text: `Saving to 317 SMS failed: ${err instanceof Error ? err.message : err}`,
        });
        return false;
      }
    };

    /** Who is ready for each portal exam and not yet enrolled; [] if that can't be worked out. */
    const planEnrolment = async (subjects: ExamSubject[]): Promise<EnrolGroup[]> => {
      if (!subjects.length) return [];
      try {
        const ready = await apiRequest<ExamReady[]>(token, `${API_BASE}/vp-sync/exam-ready`, {
          method: "POST",
          body: { subjects: subjects.map((s) => ({ exam_id: s.examId, course_name: s.courseName })) },
        });
        return Array.isArray(ready) ? enrolmentPlan(subjects, ready) : [];
      } catch {
        // Enrolment is an extra: the sync itself has already succeeded.
        return [];
      }
    };

    const run = async (version: number) => {
      const found: PortalError[] = [];
      const subjects: ExamSubject[] = [];
      let keepOpen = false;
      try {
        const cadets = await collectPortalData(
          fetchPortal,
          cins,
          found,
          (n, total) => {
            setStatus({ kind: "waiting", text: `Read ${n} of ${total} cadets from the Volunteer Portal…` });
            portal!.postMessage(
              { type: "sms-vp-progress", text: `read ${n} of ${total} cadets…` },
              VP_ORIGIN
            );
          },
          subjects
        );
        setStatus({ kind: "waiting", text: "Reading staff DBS and training from the Volunteer Portal…" });
        const staff = await collectStaffData(fetchPortal, staffCins, found);
        if (await importCadets(cadets, found, staff)) {
          const groups = await planEnrolment(subjects);
          setEnrolGroups(groups);
          const enrollable = version >= ENROL_VERSION;
          setCanEnrol(enrollable);
          // Keep the bookmark listening while there's someone to enrol; the
          // Finish button (or closing this tab) lets it go.
          keepOpen = enrollable && groups.some((g) => g.toEnrol.length > 0);
        }
      } catch (err) {
        setErrors(found);
        setStatus({
          kind: "error",
          text: `Reading the Volunteer Portal failed: ${err instanceof Error ? err.message : err}`,
        });
      } finally {
        if (keepOpen) {
          portal!.postMessage(
            {
              type: "sms-vp-progress",
              text: "synced — cadets can be enrolled on exams from the 317 SMS tab.",
            },
            VP_ORIGIN
          );
        } else {
          done("done — check the 317 SMS tab.");
        }
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
        void run(Number(m.version) || 0);
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
    // Closing this tab mid-enrolment still lets the bookmark go.
    const onLeave = () => done("stopped — the 317 SMS tab was closed.");
    window.addEventListener("pagehide", onLeave);

    (async () => {
      try {
        if (!portal) throw new Error(NO_OPENER);
        const [roster, staffRoster] = await Promise.all([
          apiRequest<{ cin: number }[]>(token, `${API_BASE}/cadets`, { method: "GET" }),
          // Staff are an extra: if the roster can't be read, the cadets still sync.
          apiRequest<{ cin: number }[]>(token, `${API_BASE}/staff`, { method: "GET" }).catch(() => []),
        ]);
        cins = new Set(roster.map((c) => String(c.cin)));
        staffCins = new Set((Array.isArray(staffRoster) ? staffRoster : []).map((s) => String(s.cin)));
        // `cins` is only for bookmarks from before the relay, which filter themselves.
        portal.postMessage({ type: "sms-vp-ready", cins: roster.map((c) => c.cin) }, VP_ORIGIN);
        setStatus({ kind: "waiting", text: "Reading from the Volunteer Portal — keep that tab open…" });
      } catch (err) {
        setStatus({ kind: "error", text: err instanceof Error ? err.message : String(err) });
      }
    })();

    return () => {
      window.removeEventListener("message", onMessage);
      window.removeEventListener("pagehide", onLeave);
    };
  }, [token]);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="Volunteer Portal Sync"
        description="Importing cadet data from the Volunteer Portal"
      />

      {outdated && (
        <Alert className="border-warning/40 bg-warning/10">
          <Bookmark />
          <AlertTitle>Your 317 Sync bookmark is out of date</AlertTitle>
          <AlertDescription className="text-foreground/90">
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

      {status.kind === "done" && enrolGroups && enrolGroups.length > 0 && (
        <EnrolSection groups={enrolGroups} canEnrol={canEnrol} relay={relayRef} token={token ?? ""} />
      )}

      {errors.length > 0 && <ProblemList errors={errors} />}
    </div>
  );
}

function SyncResult({ counts, problems }: { counts: SyncCounts; problems: number }) {
  const stats = [
    { label: "Cadets updated", value: counts.matched },
    ...(counts.staff !== undefined ? [{ label: "Staff updated", value: counts.staff }] : []),
    { label: "Records saved", value: counts.saved },
    { label: "Theory lessons ticked", value: counts.theory },
    { label: "Reads failed", value: counts.failed },
  ];
  return (
    <div className="flex w-full flex-col gap-4">
      <div className="flex items-start gap-3">
        {problems ? (
          <AlertTriangle className="text-warning mt-0.5 size-5 shrink-0" />
        ) : (
          <CheckCircle2 className="text-success mt-0.5 size-5 shrink-0" />
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
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">
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

type EnrolOutcome = { enrolled: string[]; failed: string[] } | { error: string };

/**
 * Cadets 317 SMS says are ready for a classification exam (taught here, not
 * passed on the portal) who the portal hasn't got enrolled yet. Enrolling goes
 * through the bookmark, which asks on the portal tab before it sends; the
 * page then reads the enrolment list back to check who actually went on, and
 * notes it on the scrapers page's run history.
 */
function EnrolSection({
  groups,
  canEnrol,
  relay,
  token,
}: {
  groups: EnrolGroup[];
  canEnrol: boolean;
  /** Read when a button is pressed: the effect sets it after the first render. */
  relay: React.RefObject<Relay | null>;
  token: string;
}) {
  const [picked, setPicked] = useState<Record<string, Set<number>>>(() =>
    Object.fromEntries(groups.map((g) => [g.examId, new Set(g.toEnrol.map((c) => c.cin))]))
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, EnrolOutcome>>({});
  const [finished, setFinished] = useState(false);
  const pending = groups.filter((g) => g.toEnrol.length > 0);

  const toggle = (examId: string, cin: number) =>
    setPicked((prev) => {
      const next = new Set(prev[examId]);
      if (next.has(cin)) next.delete(cin);
      else next.add(cin);
      return { ...prev, [examId]: next };
    });

  async function enrol(group: EnrolGroup) {
    const portal = relay.current;
    if (!portal) return;
    const chosen = group.toEnrol.filter((c) => picked[group.examId]?.has(c.cin));
    if (!chosen.length) return;
    setBusy(group.examId);
    const { path, body } = enrolmentRequest(group.examId, chosen);
    try {
      const reply = await portal.enrol(path, body, `${group.lessonName} (${group.courseName})`);
      if (reply.status < 200 || reply.status >= 300) {
        setOutcomes((o) => ({
          ...o,
          [group.examId]: { error: reply.status ? `The portal said no (${reply.status}).` : reply.body },
        }));
        return;
      }
      // Read the list back rather than trusting the reply's shape, which isn't documented.
      const check = await portal.get(path);
      let now = new Set<string>();
      try {
        now = enrolledIds(JSON.parse(check.body));
      } catch {
        // Unreadable: every one counts as unconfirmed below.
      }
      const enrolled = chosen.filter((c) => now.has(c.personnelId));
      const failed = chosen.filter((c) => !now.has(c.personnelId));
      setOutcomes((o) => ({
        ...o,
        [group.examId]: { enrolled: enrolled.map((c) => c.name), failed: failed.map((c) => c.name) },
      }));
      await apiRequest(token, `${API_BASE}/vp-sync/enrolments`, {
        method: "POST",
        body: {
          exam_id: group.examId,
          course_name: group.courseName,
          enrolled: enrolled.map((c) => c.cin),
          failed: failed.map((c) => c.cin),
        },
      }).catch(() => toast.error("Enrolled on the portal, but the note in 317 SMS's history wasn't saved."));
    } finally {
      setBusy(null);
    }
  }

  function finish() {
    relay.current?.done("done — check the 317 SMS tab.");
    setFinished(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <GraduationCap className="size-5" /> Ready for a classification exam
        </CardTitle>
        <CardDescription>
          Taught here and not yet passed on the portal. Enrol them so they can sit the exam online.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {!canEnrol && pending.length > 0 && (
          <Alert className="border-warning/40 bg-warning/10">
            <Bookmark />
            <AlertTitle>Drag a fresh 317 Sync bookmark to enrol from here</AlertTitle>
            <AlertDescription className="text-foreground/90">
              <p>
                This bookmark can only read the portal. Until then, enrol them on the portal&apos;s Exams
                page.
              </p>
            </AlertDescription>
          </Alert>
        )}
        {groups.map((g) => {
          const outcome = outcomes[g.examId];
          const chosen = picked[g.examId]?.size ?? 0;
          const titleId = `enrol-${g.examId}`;
          return (
            <section key={g.examId} aria-labelledby={titleId} className="flex flex-col gap-2">
              <h3 id={titleId} className="font-semibold">
                {g.lessonName}
                <span className="text-muted-foreground block text-xs font-normal">{g.courseName}</span>
              </h3>
              {g.toEnrol.length > 0 && !outcome && (
                <ul className="divide-y rounded-md border">
                  {g.toEnrol.map((c) => {
                    const id = `enrol-${g.examId}-${c.cin}`;
                    return (
                      <li key={c.cin} className="flex min-h-11 items-center gap-3 px-3">
                        <Checkbox
                          id={id}
                          checked={picked[g.examId]?.has(c.cin) ?? false}
                          disabled={!canEnrol || finished}
                          onCheckedChange={() => toggle(g.examId, c.cin)}
                        />
                        <label htmlFor={id} className="flex-1 py-2 text-sm">
                          {c.name}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              {g.alreadyEnrolled.length > 0 && (
                <p className="text-muted-foreground text-sm">
                  Already enrolled: {g.alreadyEnrolled.join(", ")}
                </p>
              )}
              {g.notOnPortal.length > 0 && (
                <p className="text-muted-foreground text-sm">
                  Not on the portal&apos;s list for this exam, so enrol them there: {g.notOnPortal.join(", ")}
                </p>
              )}
              {outcome && "error" in outcome && (
                <p role="alert" className="text-destructive text-sm">
                  Not enrolled: {outcome.error}
                </p>
              )}
              {outcome && "enrolled" in outcome && (
                <div className="text-sm" role="status">
                  {outcome.enrolled.length > 0 && (
                    <p className="text-success">Enrolled: {outcome.enrolled.join(", ")}</p>
                  )}
                  {outcome.failed.length > 0 && (
                    <p className="text-destructive">
                      The portal doesn&apos;t show these as enrolled, so check its Exams page:{" "}
                      {outcome.failed.join(", ")}
                    </p>
                  )}
                </div>
              )}
              {g.toEnrol.length > 0 && canEnrol && !finished && (!outcome || "error" in outcome) && (
                <Button className="h-9 w-fit" disabled={!chosen || busy !== null} onClick={() => enrol(g)}>
                  {busy === g.examId ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Confirm on the portal tab…
                    </>
                  ) : (
                    `Enrol ${chosen} on the portal`
                  )}
                </Button>
              )}
            </section>
          );
        })}
        {canEnrol && pending.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
            <p className="text-muted-foreground text-sm">
              {finished
                ? "Finished. You can close this tab."
                : "The portal tab asks you to confirm each enrolment. Finish to disconnect it."}
            </p>
            {!finished && (
              <Button variant="outline" className="h-9" onClick={finish}>
                Finish
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
