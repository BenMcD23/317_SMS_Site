"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import { Button } from "@/components/ui/button";
import { ChevronRight, FileText, ImageIcon, Loader2, Trash2 } from "lucide-react";
import type { SessionPlanAttachment } from "@/lib/session-plans";

/**
 * The attachments on a plan, each one an expandable box that previews the file
 * inline — image or PDF — rather than punting the reader to a new tab. Shared
 * by the detail page (staff reviewing, NCOs reading) and the edit page, which
 * passes `onRemove` to get delete buttons.
 *
 * Files are behind the API's auth, so a plain <img src> can't fetch them: each
 * box downloads the blob the first time it's opened and keeps the object URL.
 */
export function AttachmentList({
  planId,
  token,
  attachments,
  onRemove,
  busy,
}: {
  planId: number;
  token?: string;
  attachments: SessionPlanAttachment[];
  onRemove?: (id: number) => void;
  busy?: string | null;
}) {
  // attachment id → object URL, so reopening a box doesn't refetch.
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState<number | null>(null);
  const [failed, setFailed] = useState<Record<number, boolean>>({});
  const urlsRef = useRef(urls);
  urlsRef.current = urls;

  // Object URLs leak until revoked, and the page can be left at any time.
  useEffect(() => () => {
    Object.values(urlsRef.current).forEach(URL.revokeObjectURL);
  }, []);

  const load = async (id: number) => {
    if (!token || urls[id] || loading === id) return;
    setLoading(id);
    try {
      const res = await apiFetch(`${API_BASE}/session-plans/${planId}/attachments/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const url = URL.createObjectURL(await res.blob());
      setUrls((u) => ({ ...u, [id]: url }));
    } catch {
      setFailed((f) => ({ ...f, [id]: true }));
    } finally {
      setLoading(null);
    }
  };

  if (attachments.length === 0) return null;

  return (
    <ul className="flex flex-col gap-2">
      {attachments.map((a) => {
        const isPdf = a.mime_type === "application/pdf";
        const url = urls[a.id];
        return (
          <li key={a.id} className="rounded-lg border">
            <details
              className="group"
              onToggle={(e) => { if (e.currentTarget.open) load(a.id); }}
            >
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm [&::-webkit-details-marker]:hidden">
                <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
                {isPdf
                  ? <FileText className="size-4 shrink-0 text-muted-foreground" />
                  : <ImageIcon className="size-4 shrink-0 text-muted-foreground" />}
                <span className="flex-1 truncate">{a.filename}</span>
                {loading === a.id && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
                {onRemove && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    disabled={busy != null}
                    aria-label={`Remove ${a.filename}`}
                    // Inside a <summary>, so stop the click toggling the box open.
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(a.id); }}
                  >
                    {busy === `del-${a.id}`
                      ? <Loader2 className="animate-spin" />
                      : <Trash2 className="text-muted-foreground" />}
                  </Button>
                )}
              </summary>
              <div className="border-t p-3">
                {failed[a.id] ? (
                  <p className="text-sm text-destructive">Couldn&apos;t load this file.</p>
                ) : !url ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : isPdf ? (
                  <iframe src={url} title={a.filename} className="h-[70vh] w-full rounded border" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt={a.filename} className="max-h-[70vh] w-auto max-w-full rounded" />
                )}
                {url && (
                  <a
                    href={url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-xs text-muted-foreground hover:underline"
                  >
                    Open in a new tab
                  </a>
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ul>
  );
}
