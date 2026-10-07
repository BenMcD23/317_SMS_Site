"use client";

import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import { downloadCsv } from "@/lib/download";

/**
 * "Download CSV" for one chart or list, in its card header. Rows are built
 * only when clicked, so a page of charts doesn't build a dozen spreadsheets
 * on every render. Hidden on paper.
 */
export function CsvButton({
  filename,
  rows,
  label = "Download CSV",
}: {
  filename: string;
  rows: () => Record<string, unknown>[];
  label?: string;
}) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="no-print text-muted-foreground size-7"
      aria-label={label}
      title={label}
      onClick={() => downloadCsv(filename, rows())}
    >
      <Download className="size-3.5" />
    </Button>
  );
}
