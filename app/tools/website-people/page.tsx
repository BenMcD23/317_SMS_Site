"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { ChevronRight, SquareUser, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/page-header";
import { CountTabs } from "@/components/count-tabs";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { EmptyState } from "@/components/empty-state";
import { useConfirm } from "@/components/confirm-dialog";
import { PersonDialog } from "@/components/website-people/person-dialog";
import { API_BASE } from "@/lib/config";
import { apiFetch, errorDetail } from "@/lib/api-fetch";
import { useApiQuery } from "@/lib/use-api-query";
import {
  GROUP_LABELS,
  PLACEHOLDER,
  displayName,
  personFormData,
  photoUrl,
  type PeopleGroup,
  type PersonForm,
  type WebsitePeople,
  type WebsitePerson,
} from "@/lib/website-people";

const PEOPLE_KEY = ["website-people"];
const GROUPS: PeopleGroup[] = ["staff", "ncos"];

/** The website's Our Staff and Our NCOs pages: who's on them, with what rank and photo. */
export default function WebsitePeoplePage() {
  const { data: session } = useSession();
  const idToken = session?.id_token as string | undefined;
  const query = useApiQuery<WebsitePeople>(PEOPLE_KEY, "/website-people");
  const error = query.error?.message ?? null;
  const loading = query.isPending && !error;
  const { confirm, confirmDialog } = useConfirm();

  const [group, setGroup] = useState<PeopleGroup>("staff");
  // undefined: closed; null: adding; a person: editing them.
  const [editing, setEditing] = useState<WebsitePerson | null | undefined>(undefined);

  const people = query.data?.[group] ?? [];

  // Every change is a commit to the website repo, so the reply is just the
  // saved entry; refetching gets the list back in the website's order.
  async function send(path: string, init: RequestInit): Promise<void> {
    if (!idToken) throw new Error("You're signed out. Sign in again and retry.");
    let res: Response;
    try {
      res = await apiFetch(`${API_BASE}${path}`, {
        ...init,
        headers: { Authorization: `Bearer ${idToken}` },
      });
    } catch {
      throw new Error("Couldn't reach the server. Check your connection and try again.");
    }
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(errorDetail(body) ?? "Couldn't publish the change. Try again.");
    }
    await query.refetch();
  }

  async function save(values: PersonForm) {
    const body = personFormData(values, group);
    if (editing) {
      await send(`/website-people/${group}/${encodeURIComponent(editing.name)}`, { method: "PATCH", body });
    } else {
      await send(`/website-people/${group}`, { method: "POST", body });
    }
    setEditing(undefined);
    toast.success(
      `${editing ? "Saved" : "Added"} ${values.rank} ${values.name.trim()}. The website updates in a minute or two.`
    );
  }

  function remove(person: WebsitePerson) {
    confirm(`Take ${displayName(person)} and their photo off the website?`, async () => {
      try {
        await send(`/website-people/${group}/${encodeURIComponent(person.name)}`, { method: "DELETE" });
        setEditing(undefined);
        toast.success(`Removed ${displayName(person)}. The website updates in a minute or two.`);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Couldn't remove them. Try again.");
      }
    });
  }

  const label = GROUP_LABELS[group];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 pb-16">
      <PageHeader
        title="Staff & NCO Photos"
        description="Who the website's Our Staff and Our NCOs pages show. Changes go live in a minute or two."
        actions={
          <Button onClick={() => setEditing(null)} disabled={!query.data}>
            <UserPlus data-icon="inline-start" />
            {group === "staff" ? "Add staff" : "Add NCO"}
          </Button>
        }
      />

      <CountTabs
        tabs={GROUPS.map((g) => ({ value: g, label: GROUP_LABELS[g], count: query.data?.[g].length ?? 0 }))}
        value={group}
        onValueChange={setGroup}
        loading={loading}
      />

      <ErrorAlert message={error} title="Couldn't load the website's people" />

      {loading && <ListSkeleton rows={6} className="h-20" />}

      {query.data && people.length === 0 && (
        <EmptyState
          icon={SquareUser}
          title={`No ${label === "NCOs" ? "NCOs" : "staff"} on the website yet`}
          description="Add someone and they'll appear on the website's page."
        />
      )}

      {people.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {people.map((person) => (
            <li key={person.name}>
              <button
                type="button"
                onClick={() => setEditing(person)}
                className="hover:bg-muted/50 focus-visible:ring-ring flex w-full items-center gap-4 px-4 py-3 text-left outline-none focus-visible:ring-2"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- served from the website repo on GitHub */}
                <img
                  src={photoUrl(group, person.image)}
                  alt=""
                  loading="lazy"
                  className="bg-muted aspect-3/4 w-12 shrink-0 rounded-md border object-cover object-top"
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{displayName(person)}</span>
                  {person.sortAs && (
                    <span className="text-muted-foreground text-sm">Listed under {person.sortAs}</span>
                  )}
                  {person.image === PLACEHOLDER && (
                    <span className="text-muted-foreground text-sm">No photo yet</span>
                  )}
                </span>
                <ChevronRight className="text-muted-foreground size-4 shrink-0" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {query.data && (
        <PersonDialog
          open={editing !== undefined}
          onOpenChange={(o) => !o && setEditing(undefined)}
          group={group}
          ranks={query.data.ranks[group]}
          person={editing ?? null}
          onSave={save}
          onRemove={editing ? () => remove(editing) : undefined}
        />
      )}

      {confirmDialog}
    </div>
  );
}
