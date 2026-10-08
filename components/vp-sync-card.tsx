"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bookmark, Clock, ExternalLink, FileText, GripVertical, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { bookmarkletHref, VP_ORIGIN } from "@/lib/vp-sync";

const IMPORTS = [
  "WHTs",
  "Shooting log",
  "Fieldcraft",
  "Classification exams",
  "Flying",
  "E-learning",
  "Unit history",
];

/**
 * Bader Scrapers card for the Volunteer Portal sync. The portal sits behind
 * the RAFAC Microsoft login, so the server can't scrape it; instead the user
 * drags the 317 Sync bookmark to their bar once and clicks it on the portal.
 */
export function VpSyncCard({
  lastRan,
  failed,
  onLogs,
}: {
  lastRan: string;
  failed?: boolean;
  onLogs?: () => void;
}) {
  const link = useRef<HTMLAnchorElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Set by hand: React refuses to render a `javascript:` href.
    fetch("/vp-sync-bookmarklet.js")
      .then((r) => (r.ok ? r.text() : Promise.reject()))
      .then((src) => {
        link.current?.setAttribute("href", bookmarkletHref(src, window.location.origin));
        setReady(true);
      })
      .catch(() => {});
  }, []);

  return (
    <section
      aria-labelledby="vp-sync-title"
      className="bg-card flex flex-col gap-4 rounded-lg border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-md">
            <ShieldCheck className="size-5" />
          </div>
          <div className="min-w-0">
            <h3 id="vp-sync-title" className="text-sm font-semibold">
              Volunteer Portal Sync
            </h3>
            <p className="text-muted-foreground text-xs">Runs in your browser with your own portal login</p>
          </div>
        </div>
        <div className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <Clock size={12} />
          <span>{lastRan}</span>
          {failed && (
            <Badge variant="destructive" className="px-1.5 py-0">
              Failed
            </Badge>
          )}
          {onLogs && (
            <button
              onClick={onLogs}
              className="hover:bg-muted hover:text-primary flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors"
            >
              <FileText size={12} /> Logs
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {IMPORTS.map((name) => (
          <Badge key={name} variant="secondary" className="font-normal">
            {name}
          </Badge>
        ))}
      </div>

      <ol className="grid gap-3 sm:grid-cols-2">
        <li className="flex flex-col gap-3 rounded-md border border-dashed p-3">
          <p className="text-sm">
            <span className="text-muted-foreground mr-1.5 font-semibold tabular-nums">1</span>
            Drag this to your bookmarks bar <span className="text-muted-foreground">(once)</span>
          </p>
          <a
            ref={link}
            onClick={(e) => e.preventDefault()}
            aria-disabled={!ready}
            title="Drag me to your bookmarks bar"
            className="bg-primary text-primary-foreground inline-flex w-fit cursor-grab items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium shadow-sm active:cursor-grabbing aria-disabled:opacity-50"
          >
            <GripVertical className="size-4 opacity-70" />
            <Bookmark className="size-4" /> 317 Sync
          </a>
          {/* Touch screens only: on a computer this read as "you're on a phone". */}
          <p className="text-muted-foreground hidden text-xs pointer-coarse:block">
            Sync from a computer — phone browsers can&apos;t run bookmarks like this.
          </p>
        </li>
        <li className="flex flex-col gap-3 rounded-md border border-dashed p-3">
          <p className="text-sm">
            <span className="text-muted-foreground mr-1.5 font-semibold tabular-nums">2</span>
            Sign in to the Volunteer Portal, then click <b>317 Sync</b>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a href={VP_ORIGIN} target="_blank" rel="noopener noreferrer">
                Open Volunteer Portal <ExternalLink className="size-3.5" />
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/volunteer-portal">View dashboard</Link>
            </Button>
          </div>
        </li>
      </ol>
    </section>
  );
}
