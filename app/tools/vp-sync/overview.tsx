"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, CloudDownload, ExternalLink, Search } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { PageHeader } from "@/components/page-header";
import { Stat } from "@/components/stat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatAgo, formatTimestamp } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";
import {
  VP_DATASETS,
  VP_ORIGIN,
  VP_PERMISSIONS,
  bookmarkletHref,
  datasetLabel,
  type VpPersonDetail,
  type VpPersonSummary,
  type VpSyncStatus,
} from "@/lib/vp-sync";

/**
 * The bookmark link. React refuses to render a `javascript:` href (it swaps in
 * one that throws), so the href is set on the element directly after mount.
 * It's built from this page's own origin, so a preview deploy's bookmark talks
 * to that preview.
 */
function BookmarkletLink() {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", bookmarkletHref(window.location.origin));
  }, []);
  return (
    <a
      ref={ref}
      onClick={(e) => e.preventDefault()}
      className="bg-primary text-primary-foreground inline-flex cursor-grab items-center gap-2 rounded-md px-3 py-2 text-sm font-medium shadow-xs"
      title="Drag me to your bookmarks bar"
    >
      <Bookmark className="size-4" />
      317 VP Sync
    </a>
  );
}

function PersonSheet({ cin, onClose }: { cin: number | null; onClose: () => void }) {
  const { data, error, isLoading } = useApiQuery<VpPersonDetail>(
    ["vp-sync", "person", cin],
    `/vp-sync/people/${cin}`,
    {
      enabled: cin !== null,
    }
  );
  const name = data
    ? [data.profile.rankAbbreviation, data.profile.givenName, data.profile.familyName]
        .filter(Boolean)
        .join(" ")
    : "";

  return (
    <Sheet open={cin !== null} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{name || `CIN ${cin}`}</SheetTitle>
          <SheetDescription>
            Raw Volunteer Portal data, exactly as VP returned it. What each dataset contains is still being
            worked out, so nothing is tidied up yet.
          </SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-3 px-4 pb-6">
          {isLoading && <ListSkeleton rows={4} />}
          <ErrorAlert message={error?.message} />
          {data &&
            VP_DATASETS.filter((d) => data.records[d.id]).map((d) => {
              const record = data.records[d.id];
              return (
                <Collapsible key={d.id} className="rounded-md border">
                  <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium">
                    {d.label}
                    <span className="text-muted-foreground text-xs font-normal">
                      {formatAgo(record.syncedAt)}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <pre className="bg-muted max-h-96 overflow-auto border-t p-3 text-xs">
                      {JSON.stringify(record.payload, null, 2)}
                    </pre>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          {data && Object.keys(data.records).length === 0 && (
            <p className="text-muted-foreground text-sm">
              Only the roster entry has been synced for this person.
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export function VpSyncOverview() {
  const status = useApiQuery<VpSyncStatus>(["vp-sync", "status"], "/vp-sync/status");
  const people = useApiQuery<VpPersonSummary[]>(["vp-sync", "people"], "/vp-sync/people");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people.data ?? [];
    return (people.data ?? []).filter((p) =>
      [p.givenName, p.familyName, p.rank, String(p.cin)].some((v) => v?.toLowerCase().includes(q))
    );
  }, [people.data, query]);

  const last = status.data?.lastRosterSync;
  const datasetsWithData = Object.keys(status.data?.datasets ?? {}).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="VP Sync"
        description="Records only the Volunteer Portal holds (training, WHTs, shooting, fieldcraft, flying, exams), copied in for 317's cadets and staff."
      />

      <ErrorAlert message={status.error?.message} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat size="lg" label="People synced" value={status.data?.people ?? "—"} />
        <Stat
          size="lg"
          label="Last synced"
          value={status.data ? formatAgo(last?.at) : "—"}
          hint={last ? `by ${last.by}` : undefined}
        />
        <Stat
          size="lg"
          label="Datasets with data"
          value={status.data ? `${datasetsWithData} / ${VP_DATASETS.length}` : "—"}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sync from the Volunteer Portal</CardTitle>
          <CardDescription>
            VP can&apos;t be scraped like SMS (it needs your Microsoft sign-in), so the sync runs in your
            browser using your VP session.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 text-sm">
          <ol className="flex list-decimal flex-col gap-3 pl-5">
            <li>
              <span className="block pb-2">Drag this to your bookmarks bar (once):</span>
              <BookmarkletLink />
            </li>
            <li>
              <span className="block pb-2">Open the Volunteer Portal and sign in.</span>
              <Button asChild variant="outline" size="sm">
                <a href={VP_ORIGIN} target="_blank" rel="noopener noreferrer">
                  Open Volunteer Portal <ExternalLink />
                </a>
              </Button>
            </li>
            <li>
              On the VP tab, click <strong>317 VP Sync</strong>. A small 317 SMS window opens and shows
              progress; keep both open until it says it&apos;s done (a minute or two). If nothing happens,
              allow pop-ups for volunteers.bader.mod.uk.
            </li>
          </ol>
          <div className="bg-muted/50 rounded-md border p-3">
            <p className="pb-1 font-medium">Your VP account needs these permissions</p>
            <ul className="text-muted-foreground list-disc pl-5">
              {VP_PERMISSIONS.map((p) => (
                <li key={p.name}>
                  <strong className="text-foreground">{p.name}</strong>: {p.unlocks}
                </li>
              ))}
            </ul>
            <p className="text-muted-foreground pt-2">
              Anything your account can&apos;t see is skipped and listed at the end. Only people already on
              the SMS roster are kept.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datasets</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Dataset</TableHead>
                <TableHead className="text-right">People</TableHead>
                <TableHead className="text-right">Last synced</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {VP_DATASETS.map((d) => {
                const s = status.data?.datasets[d.id];
                return (
                  <TableRow key={d.id}>
                    <TableCell>
                      <div className="font-medium">{d.label}</div>
                      <div className="text-muted-foreground text-xs">{d.description}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{s?.count ?? 0}</TableCell>
                    <TableCell
                      className="text-right"
                      title={s?.lastSyncedAt ? formatTimestamp(s.lastSyncedAt) : undefined}
                    >
                      {formatAgo(s?.lastSyncedAt)}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>People</CardTitle>
          <CardDescription>Select someone to see what was synced for them.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="relative max-w-sm">
            <Search className="text-muted-foreground absolute top-2.5 left-2.5 size-4" />
            <Input
              className="pl-8"
              placeholder="Search name or CIN"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ErrorAlert message={people.error?.message} />
          {people.isLoading && <ListSkeleton rows={6} />}
          {people.data && people.data.length === 0 && (
            <EmptyState
              icon={CloudDownload}
              title="Nothing synced yet"
              description="Run the bookmark from a Volunteer Portal tab to pull 317's records in."
            />
          )}
          {filtered.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>CIN</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Datasets</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((p) => (
                  <TableRow key={p.cin} className="cursor-pointer" onClick={() => setSelected(p.cin)}>
                    <TableCell className="font-medium">
                      {[p.rank, p.givenName, p.familyName].filter(Boolean).join(" ") || "—"}
                    </TableCell>
                    <TableCell className="tabular-nums">{p.cin}</TableCell>
                    <TableCell className="capitalize">{p.personType}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {p.datasets.map((d) => (
                          <Badge key={d} variant="secondary">
                            {datasetLabel(d)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <PersonSheet cin={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
