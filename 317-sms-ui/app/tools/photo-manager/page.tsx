"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { toast } from "sonner";
import { ImagePlus, Pencil, Trash2, Users } from "lucide-react";
import { API_BASE, CADET_SITE } from "@/lib/config";
import { PhotoDialog } from "./PhotoDialog";
import { sortPeople, type PeopleData, type Person, type Team } from "./types";

const EMPTY_DATA: PeopleData = { staff: [], ncos: [] };

export default function PhotoManagerPage() {
  const { data: session } = useSession();
  const idToken = session?.id_token as string | undefined;

  const [data, setData] = useState<PeopleData>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [addTeam, setAddTeam] = useState<Team | null>(null);
  const [editTarget, setEditTarget] = useState<{ team: Team; person: Person } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    if (idToken) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idToken]);

  async function load() {
    if (!idToken) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/people`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error("Failed to load people");
      const json: PeopleData = await res.json();
      setData({ staff: json.staff ?? [], ncos: json.ncos ?? [] });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(team: Team, person: Person) {
    if (!idToken) return;
    setDeleting(person.id);
    try {
      const res = await fetch(`${API_BASE}/people/${person.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.detail || "Failed to delete");
      }
      const key = team === "staff" ? "staff" : "ncos";
      setData((prev) => ({ ...prev, [key]: prev[key].filter((p) => p.id !== person.id) }));
      setDeleteConfirm(null);
      toast.success("Removed. The site will redeploy shortly.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    } finally {
      setDeleting(null);
    }
  }

  const counts = { staff: data.staff.length, nco: data.ncos.length };

  function renderGrid(team: Team) {
    const people = sortPeople(team === "staff" ? data.staff : data.ncos, team);

    if (loading) {
      return (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="aspect-[3/4]" />
          ))}
        </div>
      );
    }

    if (people.length === 0) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>No one here yet</EmptyTitle>
            <EmptyDescription>Add a photo to get started.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {people.map((person) => (
          <Card key={person.id} className="overflow-hidden p-0">
            <CardContent className="p-0">
              <div className="aspect-[3/4] w-full overflow-hidden bg-muted/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${CADET_SITE}${person.image}`}
                  alt={`${person.rank} ${person.name}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              </div>
              <div className="space-y-2 p-3">
                <p className="truncate text-sm font-medium" title={`${person.rank} ${person.name}`}>
                  {person.rank} {person.name}
                </p>
                <div className="flex items-center justify-between">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setEditTarget({ team, person })}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                  </Button>
                  {deleteConfirm === person.id ? (
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 px-2 text-xs"
                        disabled={deleting === person.id}
                        onClick={() => handleDelete(team, person)}
                      >
                        {deleting === person.id ? "…" : "Confirm"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        disabled={deleting === person.id}
                        onClick={() => setDeleteConfirm(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => setDeleteConfirm(person.id)}
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Staff & NCO Photos"
        description={
          loading
            ? "Loading…"
            : `${counts.staff} staff · ${counts.nco} NCOs on the website`
        }
      />

      <ErrorAlert message={error} title="Could not load people" />

      <Tabs defaultValue="staff">
        <div className="flex items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="staff">Adult Staff</TabsTrigger>
            <TabsTrigger value="nco">Cadet NCOs</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="staff" className="mt-4">
          <div className="mb-4 flex justify-end">
            <Button size="sm" onClick={() => setAddTeam("staff")} disabled={!session}>
              <ImagePlus data-icon="inline-start" /> Add staff member
            </Button>
          </div>
          {renderGrid("staff")}
        </TabsContent>

        <TabsContent value="nco" className="mt-4">
          <div className="mb-4 flex justify-end">
            <Button size="sm" onClick={() => setAddTeam("nco")} disabled={!session}>
              <ImagePlus data-icon="inline-start" /> Add NCO
            </Button>
          </div>
          {renderGrid("nco")}
        </TabsContent>
      </Tabs>

      <p className="text-center text-xs text-muted-foreground">
        Photos are sorted by rank then first name. Changes are committed to GitHub and the cadet
        website redeploys automatically — allow a minute or two to go live.
      </p>

      {/* Add dialog */}
      <PhotoDialog
        open={addTeam !== null}
        onOpenChange={(o) => { if (!o) setAddTeam(null); }}
        mode="add"
        team={addTeam ?? "staff"}
        idToken={idToken}
        onSuccess={load}
      />

      {/* Edit dialog */}
      <PhotoDialog
        open={editTarget !== null}
        onOpenChange={(o) => { if (!o) setEditTarget(null); }}
        mode="edit"
        team={editTarget?.team ?? "staff"}
        person={editTarget?.person}
        idToken={idToken}
        onSuccess={load}
      />
    </div>
  );
}
