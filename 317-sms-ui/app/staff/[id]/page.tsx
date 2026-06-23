"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { UniformIssuancesCard } from "@/components/uniform-issuances-card";

type StaffMember = {
  cin: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  rank: string | null;
  address: string | null;
  attendance: number | null;
  userId: number | null;
};

export default function StaffDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<StaffMember | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/staff/users")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load staff");
        const all: StaffMember[] = await res.json();
        setUser(all.find((u) => String(u.cin) === id) ?? null);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) return <ErrorAlert message={error} title="Could not load staff member" />;
  if (!user) return <p className="text-sm text-muted-foreground">Staff member not found.</p>;

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || `CIN ${user.cin}`;
  const description = [user.rank, user.email, `CIN ${user.cin}`].filter(Boolean).join(" · ");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title={name} description={description} />
      {user.address && (
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Address</p>
          <p className="text-sm">{user.address}</p>
        </Card>
      )}
      {user.attendance != null && (
        <Card className="p-4">
          <p className="text-xs font-medium text-muted-foreground">Parade attendance (this half-year)</p>
          <p className="text-sm">{user.attendance}</p>
        </Card>
      )}
      {user.userId ? (
        <UniformIssuancesCard baseUrl={`/api/stores/issuances/user/${user.userId}`} />
      ) : (
        <p className="text-sm text-muted-foreground">
          No linked portal account, so no uniform issuances to show.
        </p>
      )}
    </div>
  );
}
