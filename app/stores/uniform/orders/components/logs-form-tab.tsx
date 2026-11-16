"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, X, CheckCircle2, Download, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { LogsForm } from "@/lib/stores-types";
import { formatTimestamp } from "@/lib/format";

/**
 * The uniform orders page's Logs Form tab: the batch of items going on the
 * next logs form (download it, then mark it ordered), and the forms already
 * sent. Split out of the page, which had grown to 1,500 lines.
 */
export function LogsFormTab({
  openForm,
  pastForms,
  onRemoveEntry,
  onMarkOrdered,
}: {
  openForm: LogsForm | null;
  pastForms: LogsForm[];
  onRemoveEntry: (entryId: string) => void;
  onMarkOrdered: (formId: string) => void;
}) {
  const [expandedFormIds, setExpandedFormIds] = useState<Set<string>>(new Set());

  function toggleFormExpand(id: string) {
    setExpandedFormIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="font-semibold">Current Logs Form</p>
              <p className="text-muted-foreground text-xs">
                {openForm ? `Started ${formatTimestamp(openForm.createdAt)}` : "Nothing added yet"}
              </p>
            </div>
            <Badge variant="secondary" className="text-xs">
              {openForm?.entries.length ?? 0} item
              {(openForm?.entries.length ?? 0) !== 1 ? "s" : ""}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {!openForm || openForm.entries.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No items on the current logs form. Use &quot;Add to Logs Form&quot; on an order item.
            </p>
          ) : (
            <>
              <ul className="space-y-1.5">
                {openForm.entries.map((entry) => (
                  <li
                    key={entry.id}
                    className="bg-muted/30 flex items-center justify-between gap-2 rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">
                        {entry.itemType}
                        {entry.size && (
                          <span className="text-muted-foreground font-normal"> · {entry.size}</span>
                        )}
                      </p>
                      <p className="text-muted-foreground text-xs">{entry.cadetName}</p>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive h-6 w-6 shrink-0"
                      onClick={() => onRemoveEntry(entry.id)}
                      aria-label="Remove from logs form"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="outline" asChild>
                  <a href={`/api/stores/logs-forms/${openForm.id}/download`}>
                    <Download className="mr-2 h-4 w-4" />
                    Download Logs Form
                  </a>
                </Button>
                <Button
                  size="sm"
                  className="bg-success hover:bg-success/90 text-white"
                  onClick={() => onMarkOrdered(openForm.id)}
                >
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                  Mark as Ordered
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {pastForms.length > 0 && (
        <div className="space-y-3">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">Previous Orders</p>
          {pastForms.map((form) => {
            const expanded = expandedFormIds.has(form.id);
            return (
              <Card key={form.id} className="opacity-80">
                <CardHeader className="pb-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-1 flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">Logs Form</p>
                        <Badge className="border-success/40 bg-success/15 text-success text-xs">
                          <Lock className="mr-1 h-3 w-3" />
                          Ordered
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-xs">
                        Ordered {form.orderedAt ? formatTimestamp(form.orderedAt) : "—"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary" className="text-xs">
                        {form.entries.length} item{form.entries.length !== 1 ? "s" : ""}
                      </Badge>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => toggleFormExpand(form.id)}
                        aria-label={expanded ? "Collapse" : "Expand"}
                      >
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                {expanded && (
                  <CardContent className="space-y-3 pt-4">
                    <ul className="space-y-1.5">
                      {form.entries.map((entry) => (
                        <li key={entry.id} className="bg-muted/30 rounded-md border px-3 py-2">
                          <p className="text-sm font-medium">
                            {entry.itemType}
                            {entry.size && (
                              <span className="text-muted-foreground font-normal"> · {entry.size}</span>
                            )}
                          </p>
                          <p className="text-muted-foreground text-xs">{entry.cadetName}</p>
                        </li>
                      ))}
                    </ul>
                    <div className="flex justify-end pt-1">
                      <Button size="sm" variant="outline" asChild>
                        <a href={`/api/stores/logs-forms/${form.id}/download`}>
                          <Download className="mr-2 h-4 w-4" />
                          Download Logs Form
                        </a>
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
