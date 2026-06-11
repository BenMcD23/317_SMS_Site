"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { cadetInitials } from "@/lib/cadet-format";
import { Search, ChevronRight, UserCog } from "lucide-react";

type StaffUser = {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
};

export default function StaffOverviewPage() {
  const router = useRouter();
  const [users, setUsers] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/staff/users")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load staff");
        return res.json();
      })
      .then((data: StaffUser[]) => setUsers(data.filter((u) => u.role === "staff")))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = users.filter((u) => {
    const q = search.toLowerCase();
    const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.toLowerCase();
    return !q || name.includes(q) || u.email.toLowerCase().includes(q);
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

      <ErrorAlert message={error} title="Could not load staff" />

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 && !error ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <UserCog />
            </EmptyMedia>
            <EmptyTitle>No staff members found</EmptyTitle>
            {search && <EmptyDescription>Nothing matches &quot;{search}&quot;.</EmptyDescription>}
          </EmptyHeader>
        </Empty>
      ) : (
        <Card className="overflow-hidden py-0">
          <div className="divide-y">
            {filtered.map((u) => {
              const name = [u.firstName, u.lastName].filter(Boolean).join(" ") || u.email;
              return (
                <button
                  key={u.id}
                  onClick={() => router.push(`/staff/${u.id}`)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <Avatar className="size-8">
                    <AvatarFallback className="text-xs">
                      {cadetInitials(u.firstName, u.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />
                </button>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
