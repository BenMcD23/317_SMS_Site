"use client";

import Link from "next/link";

import { CsvButton } from "@/components/stats/csv-button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { flightBadgeClass } from "@/lib/cadet-format";
import { formatDate } from "@/lib/format";
import { type DrillCadet, flightLabel } from "@/lib/stats";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

/** What the page asked to see: the /stats/cadets filters and a heading. */
export type Drill = { query: Record<string, string>; title: string } | null;

/**
 * The cadets behind a number on the stats page, in a dialog. Staff can open
 * a cadet's record; NCOs see the names only, because cadet records are a
 * staff page (lib/access.ts).
 */
export function CadetDrilldown({
  drill,
  onClose,
  canOpenRecords,
}: {
  drill: Drill;
  onClose: () => void;
  canOpenRecords: boolean;
}) {
  const qs = new URLSearchParams(drill?.query ?? {}).toString();
  const { data, isLoading, error } = useApiQuery<{ as_of: string | null; cadets: DrillCadet[] }>(
    ["stats", "cadets", qs],
    `/stats/cadets?${qs}`,
    { enabled: drill !== null }
  );
  const cadets = Array.isArray(data?.cadets) ? data.cadets : [];
  const showLevel = !!drill?.query.badge;

  return (
    <Dialog open={drill !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-3 pr-6">
            <DialogTitle>{drill?.title}</DialogTitle>
            {cadets.length > 0 && (
              <CsvButton
                filename={`${(drill?.title ?? "cadets").replace(/[^\w-]+/g, "-").toLowerCase()}.csv`}
                label="Download this list as CSV"
                rows={() =>
                  cadets.map((c) => ({
                    name: c.name,
                    cin: c.cin,
                    flight: flightLabel(c.flight),
                    rank: c.rank,
                    classification: c.classification,
                    ...(showLevel ? { level: c.level } : {}),
                  }))
                }
              />
            )}
          </div>
          <DialogDescription>
            {data?.as_of ? `As of the snapshot taken ${formatDate(data.as_of)}` : "As they stand now"}
            {data && ` · ${cadets.length} cadet${cadets.length === 1 ? "" : "s"}`}
          </DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-40" />
        ) : error ? (
          <p className="text-muted-foreground text-sm" role="alert">
            {error.message.includes("snapshot")
              ? "There's no per-cadet history from that far back. It's recorded weekly from when it was switched on."
              : `Couldn't load the cadets: ${error.message}`}
          </p>
        ) : cadets.length === 0 ? (
          <p className="text-muted-foreground text-sm">Nobody matches.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Flight</TableHead>
                <TableHead className="hidden sm:table-cell">Rank</TableHead>
                <TableHead className="hidden sm:table-cell">Classification</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cadets.map((c) => (
                <TableRow key={c.cin}>
                  <TableCell className="font-medium">
                    {canOpenRecords ? (
                      <Link href={`/cadets/${c.cin}`} className="hover:underline">
                        {c.name}
                      </Link>
                    ) : (
                      c.name
                    )}
                  </TableCell>
                  <TableCell>
                    <span
                      className={cn(
                        "rounded border px-1.5 text-[11px]",
                        flightBadgeClass(c.flight === "Unknown" ? null : c.flight)
                      )}
                    >
                      {c.flight === "Unknown" ? "—" : c.flight}
                    </span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{c.rank || "—"}</TableCell>
                  <TableCell className="hidden sm:table-cell">{c.classification}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  );
}
