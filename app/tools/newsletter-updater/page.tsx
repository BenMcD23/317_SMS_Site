"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { toast } from "sonner";
import { Newspaper, Plus, Pencil, Trash2, ExternalLink } from "lucide-react";
import { API_BASE } from "@/lib/config";
import { NewsletterDialog } from "./NewsletterDialog";
import type { Newsletter } from "./types";

// Base URL of the public newsletter site, used for the "view PDF" link.
// Set NEXT_PUBLIC_NEWSLETTER_SITE to enable it; left blank the link is hidden.
const NEWSLETTER_SITE = process.env.NEXT_PUBLIC_NEWSLETTER_SITE ?? "";

export default function NewsletterManagementPage() {
  const { data: session } = useSession();
  const idToken = session?.id_token as string | undefined;

  const [newsletters, setNewsletters] = useState<Newsletter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Newsletter | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    if (idToken) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idToken]);

  async function load() {
    if (!idToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/newsletters`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error("Failed to load newsletters");
      const data: Newsletter[] = await res.json();
      // Highest issue first (the homepage 'current' one).
      data.sort((a, b) => b.issue - a.issue);
      setNewsletters(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(issue: number) {
    if (!idToken) return;
    setDeleting(issue);
    try {
      const res = await fetch(`${API_BASE}/newsletters/${issue}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to delete newsletter");
      }
      setNewsletters((prev) => prev.filter((n) => n.issue !== issue));
      setDeleteConfirm(null);
      toast.success("Newsletter deleted. The site will redeploy shortly.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete newsletter");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="Newsletters"
        description={
          loading
            ? "Loading…"
            : `${newsletters.length} newsletter${newsletters.length !== 1 ? "s" : ""} published`
        }
        actions={
          <Button size="sm" onClick={() => setAddOpen(true)} disabled={!session}>
            <Plus data-icon="inline-start" />
            Add newsletter
          </Button>
        }
      />

      <ErrorAlert message={error} title="Could not load newsletters" />

      {loading && (
        <div className="flex flex-col gap-2">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-14" />
          ))}
        </div>
      )}

      {!loading && !error && newsletters.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Newspaper />
            </EmptyMedia>
            <EmptyTitle>No newsletters yet</EmptyTitle>
            <EmptyDescription>Add a newsletter to publish the first one.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {/* List */}
      {!loading && newsletters.length > 0 && (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y">
              {newsletters.map((n, i) => (
                <li key={n.id} className="flex items-center gap-3 px-4 py-3">
                  <span
                    className="h-9 w-9 shrink-0 rounded-md border"
                    style={{ backgroundColor: n.coverColor ?? "#1F2E4A" }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium">{n.title}</p>
                      {i === 0 && <Badge className="text-xs">Current</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Issue #{n.issue} · {n.date}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {NEWSLETTER_SITE && (
                      <a
                        href={`${NEWSLETTER_SITE}${n.pdfPath}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View PDF"
                      >
                        <Button size="icon" variant="ghost" className="h-8 w-8">
                          <ExternalLink className="h-4 w-4" />
                        </Button>
                      </a>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => setEditTarget(n)}
                      aria-label="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    {deleteConfirm === n.issue ? (
                      <>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="h-8 px-2 text-xs"
                          disabled={deleting === n.issue}
                          onClick={() => handleDelete(n.issue)}
                        >
                          {deleting === n.issue ? "Deleting…" : "Confirm"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 px-2 text-xs"
                          disabled={deleting === n.issue}
                          onClick={() => setDeleteConfirm(null)}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => setDeleteConfirm(n.issue)}
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Changes are committed to GitHub and the newsletter site redeploys automatically — allow a minute or two to go live.
      </p>

      {/* Add dialog */}
      <NewsletterDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        mode="add"
        idToken={idToken}
        existingIssues={newsletters.map((n) => n.issue)}
        onSuccess={load}
      />

      {/* Edit dialog */}
      <NewsletterDialog
        open={editTarget !== null}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        mode="edit"
        newsletter={editTarget}
        idToken={idToken}
        onSuccess={load}
      />
    </div>
  );
}
