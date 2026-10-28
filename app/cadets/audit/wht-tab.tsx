"use client";

import { Fragment, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorAlert } from "@/components/error-alert";
import { formatDate } from "@/lib/format";
import { useApiQuery } from "@/lib/use-api-query";

type Wht = {
  weapon: string;
  date_passed: string;
  date_expires: string | null;
  awarded_by: string | null;
  status: "current" | "expired";
};

type WhtCadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
  latest: Record<string, Wht>;
  history: Wht[];
};

type WhtAudit = { weapons: string[]; cadets: WhtCadet[] };

type Status = "current" | "expired" | "never";
export type StatusFilter = "all" | Status | "not-current";

// A current WHT this close to expiry is flagged so retests can be booked.
const SOON_DAYS = 30;

export type { WhtCadet };

export function whtStatus(cadet: WhtCadet, weapon: string): Status {
  return cadet.latest[weapon]?.status ?? "never";
}

/** Cadets matching the filters. `weapons` are the columns in view; a cadet
 * matches when any of them has the status, except "never" over every weapon,
 * which means no WHT at all. */
export function filterCadets(cadets: WhtCadet[], weapons: string[], all: boolean, status: StatusFilter) {
  return cadets.filter((c) => {
    if (status === "all") return true;
    const statuses = weapons.map((w) => whtStatus(c, w));
    if (status === "never" && all) return statuses.every((s) => s === "never");
    if (status === "not-current") return statuses.some((s) => s !== "current");
    return statuses.includes(status);
  });
}

function expiresSoon(wht: Wht, now: Date = new Date()): boolean {
  if (!wht.date_expires) return false;
  return new Date(wht.date_expires).getTime() - now.getTime() < SOON_DAYS * 86_400_000;
}

function WhtCell({ wht }: { wht: Wht | undefined }) {
  if (!wht) return <span className="text-muted-foreground">—</span>;
  if (wht.status === "expired")
    return (
      <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700">
        {wht.date_expires ? `Expired ${formatDate(wht.date_expires)}` : "No expiry date"}
      </Badge>
    );
  const soon = expiresSoon(wht);
  return (
    <Badge
      variant="outline"
      className={
        soon ? "border-amber-300 bg-amber-50 text-amber-800" : "border-green-200 bg-green-50 text-green-700"
      }
    >
      Until {formatDate(wht.date_expires)}
    </Badge>
  );
}

export function WhtAuditTab() {
  const { data, isLoading, error } = useApiQuery<WhtAudit>(["audit-whts"], "/cadets/audit/whts");
  const [weapon, setWeapon] = useState("all");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [open, setOpen] = useState<Set<number>>(new Set());

  if (isLoading) return <p className="text-muted-foreground text-sm">Loading…</p>;
  if (error || !data) return <ErrorAlert message={error?.message ?? "No data"} title="Couldn't load WHTs" />;

  const shown = weapon === "all" ? data.weapons : [weapon];
  const rows = filterCadets(data.cadets, shown, weapon === "all", status);

  function toggle(cin: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(cin)) next.delete(cin);
      else next.add(cin);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {data.weapons.map((w) => {
          const count = (s: Status) => data.cadets.filter((c) => whtStatus(c, w) === s).length;
          return (
            <Card key={w} className="py-0">
              <CardContent className="px-4 py-3">
                <p className="text-sm font-medium">{w}</p>
                <p className="text-muted-foreground text-xs">
                  {count("current")} current · {count("expired")} expired · {count("never")} never tested
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3">
        <Select value={weapon} onValueChange={setWeapon}>
          <SelectTrigger className="w-56" aria-label="Weapon">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All weapons</SelectItem>
            {data.weapons.map((w) => (
              <SelectItem key={w} value={w}>
                {w}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
          <SelectTrigger className="w-48" aria-label="Status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="current">Current</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
            <SelectItem value="never">Never tested</SelectItem>
            <SelectItem value="not-current">Not current</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground self-center text-sm">{rows.length} cadets</span>
      </div>

      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cadet</TableHead>
              <TableHead>Flight</TableHead>
              {shown.map((w) => (
                <TableHead key={w}>{w}</TableHead>
              ))}
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((c) => (
              <Fragment key={c.cin}>
                <TableRow>
                  <TableCell className="font-medium">
                    {c.last_name}, {c.first_name}
                    {c.rank && <span className="text-muted-foreground ml-1 text-xs">{c.rank}</span>}
                  </TableCell>
                  <TableCell>{c.flight ?? "—"}</TableCell>
                  {shown.map((w) => (
                    <TableCell key={w}>
                      <WhtCell wht={c.latest[w]} />
                    </TableCell>
                  ))}
                  <TableCell className="text-right">
                    {c.history.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => toggle(c.cin)}>
                        {open.has(c.cin) ? "Hide" : `History (${c.history.length})`}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
                {open.has(c.cin) && (
                  <TableRow className="bg-muted/40">
                    <TableCell colSpan={shown.length + 3}>
                      <ul className="flex flex-col gap-1 text-sm">
                        {c.history.map((h, i) => (
                          <li key={i}>
                            <span className="font-medium">{h.weapon}</span>: passed{" "}
                            {formatDate(h.date_passed)}, {h.status === "current" ? "valid until" : "expired"}{" "}
                            {formatDate(h.date_expires)}
                            {h.awarded_by && <span className="text-muted-foreground"> · {h.awarded_by}</span>}
                          </li>
                        ))}
                      </ul>
                    </TableCell>
                  </TableRow>
                )}
              </Fragment>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
