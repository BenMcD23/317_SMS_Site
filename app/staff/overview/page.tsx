"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { ErrorAlert } from "@/components/error-alert";
import { cadetInitials } from "@/lib/cadet-format";
import { ListSkeleton } from "@/components/list-skeleton";
import { Search, ChevronRight, UserCog } from "lucide-react";

type StaffMember = {
  cin: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  rank: string | null;
  userId: number | null;
};

export default function StaffOverviewPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");

  const {
    data: users = [],
    isLoading: loading,
    error,
  } = useQuery<StaffMember[], Error>({
    queryKey: ["staff", "users"],
    queryFn: async () => {
      const res = await fetch("/api/staff/users");
      if (!res.ok) throw new Error("Failed to load staff");
      return (await res.json()) as StaffMember[];
    },
  });

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
    return !q || name.includes(q) || (u.email ?? "").toLowerCase().includes(q);
  });

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="Staff"
        description={loading ? "Loading…" : `${users.length} staff member${users.length !== 1 ? "s" : ""}`}
      />

      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </InputGroup>

      <ErrorAlert message={error?.message ?? null} title="Could not load staff" />

      {loading ? (
        <ListSkeleton rows={6} className="h-14" />
      ) : filtered.length === 0 && !error ? (
        <EmptyState
          icon={UserCog}
          title="No staff members found"
          description={search ? `Nothing matches "${search}".` : undefined}
        />
      ) : (
        <Card className="overflow-hidden py-0">
          <div className="divide-y">
            {filtered.map((u) => {
              const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email || `CIN ${u.cin}`;
              const subtitle = [u.rank, u.email].filter(Boolean).join(" · ");
              return (
                <button
                  key={u.cin}
                  onClick={() => router.push(`/staff/${u.cin}`)}
                  className="hover:bg-muted/50 flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors"
                >
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs">
                      {cadetInitials(u.firstName, u.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="text-muted-foreground truncate text-xs">{subtitle}</p>
                  </div>
                  <ChevronRight className="text-muted-foreground/50 size-4 shrink-0" />
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
