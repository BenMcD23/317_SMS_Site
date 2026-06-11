"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { UniformIssuancesCard } from "@/components/uniform-issuances-card";

type StaffUser = {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
};

export default function StaffDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<StaffUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/staff/users")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load staff");
        const all: StaffUser[] = await res.json();
        setUser(all.find((u) => String(u.id) === id) ?? null);
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

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader title={name} description={user.email} />
      <UniformIssuancesCard baseUrl={`/api/stores/issuances/user/${id}`} />
    </div>
  );
}
