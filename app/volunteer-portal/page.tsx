"use client";
import Link from "next/link";
import { CloudOff } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDate, formatTimestamp } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";
import {
  FIELDCRAFT_LEVELS,
  formatMinutes,
  timeSince,
  type PortalOverview,
  type PortalOverviewRow,
  type WhtState,
} from "@/lib/vp-sync";

const WHT_STYLE: Record<WhtState, string> = {
  current: "border-green-600/30 bg-green-600/10 text-green-700 dark:text-green-400",
  expiring: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400",
  expired: "border-destructive/40 bg-destructive/10 text-destructive",
};

/**
 * Squadron view of the Volunteer Portal data the 317 Sync bookmarklet
 * imports — WHTs, fieldcraft, classification exams, flying, e-learning and
 * service — one tab each, a row per cadet.
 */
export default function VolunteerPortalPage() {
  const { data, isLoading, error } = useApiQuery<PortalOverview>(["vp", "overview"], "/vp/overview");
  const cadets = data?.cadets ?? [];
  const synced = cadets.filter((c) => c.synced_at);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-16">
      <PageHeader
        title="Volunteer Portal"
        description={
          data?.last_synced
            ? `Last synced ${formatTimestamp(data.last_synced)} · ${synced.length} of ${cadets.length} cadets`
            : "Shooting, fieldcraft, exams, flying and e-learning from the Volunteer Portal"
        }
        actions={
          <Button variant="outline" size="sm" asChild>
            <Link href="/tools/scraper">How to sync</Link>
          </Button>
        }
      />

      <ErrorAlert message={error?.message ?? null} title="Could not load Volunteer Portal data" />
      {isLoading && <ListSkeleton rows={8} />}

      {data && synced.length === 0 && (
        <EmptyState
          icon={CloudOff}
          title="Nothing synced yet"
          description="Run the 317 Sync bookmark on the Volunteer Portal to import cadet data."
        >
          <Button asChild size="sm">
            <Link href="/tools/scraper">Set up the sync</Link>
          </Button>
        </EmptyState>
      )}

      {synced.length > 0 && (
        <>
          <Headline cadets={synced} />
          <Tabs defaultValue="shooting">
            <TabsList className="max-w-full justify-start overflow-x-auto overflow-y-hidden [scrollbar-width:none]">
              <TabsTrigger value="shooting">Shooting</TabsTrigger>
              <TabsTrigger value="fieldcraft">Fieldcraft</TabsTrigger>
              <TabsTrigger value="exams">Exams</TabsTrigger>
              <TabsTrigger value="flying">Flying</TabsTrigger>
              <TabsTrigger value="learning">E-learning</TabsTrigger>
              <TabsTrigger value="service">Service</TabsTrigger>
            </TabsList>
            <TabsContent value="shooting" className="mt-4">
              <ShootingTable cadets={synced} weapons={data!.weapons} />
            </TabsContent>
            <TabsContent value="fieldcraft" className="mt-4">
              <SimpleTable
                cadets={synced}
                columns={FIELDCRAFT_LEVELS.map((level) => ({
                  label: level,
                  cell: (c) => c.fieldcraft && <Count n={c.fieldcraft[level] ?? 0} />,
                }))}
                note="Lessons completed at each badge level."
              />
            </TabsContent>
            <TabsContent value="exams" className="mt-4">
              <SimpleTable
                cadets={synced}
                columns={[
                  { label: "Enrolled", cell: (c) => c.exams && <Count n={c.exams.enrolled} /> },
                  { label: "In progress", cell: (c) => c.exams && <Count n={c.exams.in_progress} /> },
                  { label: "Passed", cell: (c) => c.exams && <Count n={c.exams.completed} /> },
                  { label: "Leading", cell: (c) => stageDate(c, "Leading Cadet") },
                  { label: "Senior", cell: (c) => stageDate(c, "Senior Cadet") },
                ]}
                note="Passed exams also tick the matching ACP lessons in Theory Progress."
              />
            </TabsContent>
            <TabsContent value="flying" className="mt-4">
              <SimpleTable
                cadets={[...synced].sort((a, b) => (a.flying?.last ?? "").localeCompare(b.flying?.last ?? ""))}
                columns={[
                  { label: "Sorties", cell: (c) => c.flying && <Count n={c.flying.sorties} /> },
                  { label: "Time", cell: (c) => c.flying && (c.flying.minutes ? formatMinutes(c.flying.minutes) : "—") },
                  {
                    label: "Last flown",
                    cell: (c) =>
                      c.flying &&
                      (c.flying.last ? (
                        formatDate(c.flying.last)
                      ) : (
                        <Badge variant="outline">Never</Badge>
                      )),
                  },
                ]}
                note="Longest since flying first."
              />
            </TabsContent>
            <TabsContent value="learning" className="mt-4">
              <SimpleTable
                cadets={synced}
                columns={[
                  {
                    label: "Modules complete",
                    cell: (c) => c.learning && `${c.learning.complete} / ${c.learning.total}`,
                  },
                ]}
              />
            </TabsContent>
            <TabsContent value="service" className="mt-4">
              <SimpleTable
                cadets={synced}
                columns={[
                  { label: "Joined", cell: (c) => formatDate(c.joined) },
                  { label: "Time at 317", cell: (c) => timeSince(c.joined) ?? "—" },
                  { label: "1st Class", cell: (c) => stageDate(c, "First Class Cadet") },
                  { label: "Leading", cell: (c) => stageDate(c, "Leading Cadet") },
                  { label: "Senior", cell: (c) => stageDate(c, "Senior Cadet") },
                  { label: "MAC", cell: (c) => stageDate(c, "Master Air Cadet") },
                ]}
              />
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function stageDate(c: PortalOverviewRow, name: string) {
  return c.classification && formatDate(c.classification.find((s) => s.name === name)?.date);
}

function Count({ n }: { n: number }) {
  return <span className={cn("tabular-nums", n === 0 && "text-muted-foreground")}>{n}</span>;
}

/** The handful of numbers worth seeing before opening a tab. */
function Headline({ cadets }: { cadets: PortalOverviewRow[] }) {
  // Counted only over cadets whose data set actually synced — "0 expired"
  // when the portal refused every WHT read would be a false all-clear.
  const withWhts = cadets.filter((c) => c.whts);
  const whts = withWhts.flatMap((c) => Object.values(c.whts!));
  const withFlying = cadets.filter((c) => c.flying);
  const withExams = cadets.filter((c) => c.exams);
  const yearAgo = new Date();
  yearAgo.setFullYear(yearAgo.getFullYear() - 1);
  const flown = withFlying.filter((c) => c.flying!.last && new Date(c.flying!.last) >= yearAgo).length;
  const stats = [
    { label: "WHTs expired", value: withWhts.length ? whts.filter((w) => w.state === "expired").length : null, warn: true },
    {
      label: "WHTs expiring ≤90 days",
      value: withWhts.length ? whts.filter((w) => w.state === "expiring").length : null,
      warn: true,
    },
    { label: "Flown in last year", value: withFlying.length ? `${flown} / ${withFlying.length}` : null },
    { label: "Exams in progress", value: withExams.length ? withExams.reduce((n, c) => n + c.exams!.in_progress, 0) : null },
  ];
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <Card key={s.label} className="gap-1 px-4 py-3">
          <dt className="text-muted-foreground text-xs">{s.label}</dt>
          <dd
            className={cn(
              "text-2xl font-semibold tabular-nums",
              s.value == null && "text-muted-foreground",
              s.warn && !!s.value && "text-destructive"
            )}
            title={s.value == null ? "Not synced from the portal" : undefined}
          >
            {s.value ?? "—"}
          </dd>
        </Card>
      ))}
    </dl>
  );
}

/** A cadet's name, linked to their portal tab; the column that stays put when
 *  a wide table scrolls sideways on a phone. */
function NameCell({ c }: { c: PortalOverviewRow }) {
  return (
    <TableCell className="bg-card sticky left-0 z-10 max-w-40 pl-4 sm:max-w-none">
      <Link href={`/cadets/${c.cin}?tab=portal`} className="block truncate font-medium hover:underline">
        {c.name}
      </Link>
      {c.flight && <span className="text-muted-foreground block text-xs">{c.flight}</span>}
    </TableCell>
  );
}

const NOT_SYNCED = <span className="text-muted-foreground text-xs">not synced</span>;

function SimpleTable({
  cadets,
  columns,
  note,
}: {
  cadets: PortalOverviewRow[];
  columns: { label: string; cell: (c: PortalOverviewRow) => React.ReactNode }[];
  note?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      {note && <p className="text-muted-foreground text-sm">{note}</p>}
      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="bg-muted sticky left-0 z-10 pl-4">Cadet</TableHead>
              {columns.map((col) => (
                <TableHead key={col.label} className="whitespace-nowrap">
                  {col.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {cadets.map((c) => (
              <TableRow key={c.cin}>
                <NameCell c={c} />
                {columns.map((col) => (
                  <TableCell key={col.label} className="whitespace-nowrap">
                    {col.cell(c) ?? NOT_SYNCED}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function ShootingTable({ cadets, weapons }: { cadets: PortalOverviewRow[]; weapons: string[] }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">
        WHT status per weapon — amber expires within 90 days, red has expired.
      </p>
      <Card className="overflow-hidden py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="bg-muted sticky left-0 z-10 pl-4">Cadet</TableHead>
              {weapons.map((w) => (
                <TableHead key={w} className="whitespace-nowrap">
                  {w}
                </TableHead>
              ))}
              <TableHead className="whitespace-nowrap">Last shoot</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cadets.map((c) => (
              <TableRow key={c.cin}>
                <NameCell c={c} />
                {weapons.map((w) => {
                  const wht = c.whts?.[w];
                  return (
                    <TableCell key={w} className="whitespace-nowrap">
                      {!c.whts ? (
                        NOT_SYNCED
                      ) : wht ? (
                        <Badge variant="outline" className={WHT_STYLE[wht.state]}>
                          {wht.expires ? formatDate(wht.expires) : wht.state}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell className="whitespace-nowrap">
                  {c.shooting ? formatDate(c.shooting.last) : NOT_SYNCED}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
