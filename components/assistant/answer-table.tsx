"use client";

import Link from "next/link";

import { CsvButton } from "@/components/stats/csv-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { csvName, tableCsvRows, withoutPersonalColumns, type AssistantTable } from "@/lib/assistant";
import { usePersonalDataHidden } from "@/lib/privacy";

/**
 * One table from an assistant answer, with a CSV download. Its date of birth,
 * age and email columns are dropped while "Hide personal data" is on, even in
 * an answer saved before the switch was turned on. A cell that is exactly a
 * linked cadet's name opens their record.
 */
export function AnswerTable({
  table: raw,
  cadets = [],
}: {
  table: AssistantTable;
  cadets?: { cin: number; name: string }[];
}) {
  const [hidden] = usePersonalDataHidden();
  const cinOf = new Map(cadets.map((c) => [c.name, c.cin]));
  const table = hidden ? withoutPersonalColumns(raw) : raw;
  const numeric = table.columns.map((_, i) =>
    table.rows.every((r) => r[i] === null || typeof r[i] === "number")
  );

  return (
    <figure className="flex flex-col gap-2 rounded-lg border p-3 sm:p-4">
      <figcaption className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{table.title}</span>
        <CsvButton
          filename={csvName(table.title)}
          label={`Download ${table.title} as CSV`}
          rows={() => tableCsvRows(table)}
        />
      </figcaption>
      {table.rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing to list.</p>
      ) : (
        // Wide reports scroll inside their frame on a phone, not the page.
        <div className="max-h-96 overflow-auto print:max-h-none print:overflow-visible">
          <Table aria-label={table.title}>
            <TableHeader>
              <TableRow>
                {table.columns.map((c, i) => (
                  <TableHead key={i} className={numeric[i] ? "text-right" : undefined}>
                    {c}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((row, r) => (
                <TableRow key={r}>
                  {row.map((cell, i) => (
                    <TableCell key={i} className={numeric[i] ? "text-right tabular-nums" : undefined}>
                      {typeof cell === "string" && cinOf.has(cell) ? (
                        <Link href={`/cadets/${cinOf.get(cell)}`} className="underline underline-offset-4">
                          {cell}
                        </Link>
                      ) : (
                        (cell ?? "—")
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </figure>
  );
}
