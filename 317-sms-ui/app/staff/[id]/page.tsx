"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { UniformIssuancesCard } from "@/components/uniform-issuances-card";
import { AttendanceCard } from "@/components/attendance-card";
import { Home, CalendarRange } from "lucide-react";

type StaffMember = {
  cin: number;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  rank: string | null;
  address: string | null;
  attendance: Record<string, number> | null; // { "YYYY-MM": count }
  userId: number | null;
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function formatMonth(key: string): string {
  const [year, month] = key.split("-");
  const idx = Number(month) - 1;
  return `${MONTHS[idx] ?? month} ${year}`;
}

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
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) return <ErrorAlert message={error} title="Could not load staff member" />;
  if (!user) return <p className="text-sm text-muted-foreground">Staff member not found.</p>;

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || `CIN ${user.cin}`;
  const description = [user.rank, user.email, `CIN ${user.cin}`].filter(Boolean).join(" · ");
  const htdMonths = Object.entries(user.attendance ?? {}).sort(([a], [b]) => a.localeCompare(b));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <PageHeader title={name} description={description} />

      <Tabs defaultValue="overview">
        <TabsList className="max-w-full justify-start overflow-x-auto overflow-y-hidden">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="uniform">Uniform</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Home className="h-4 w-4 text-muted-foreground" />
                Address
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className={user.address ? "text-sm" : "text-sm italic text-muted-foreground"}>
                {user.address ?? "No address recorded."}
              </p>
            </CardContent>
          </Card>

          {/* The monthly counts that prefill the HTD claim — distinct from the
              full register on the Attendance tab, which is unbounded. */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <CalendarRange className="h-4 w-4 text-muted-foreground" />
                Parade nights per month
              </CardTitle>
            </CardHeader>
            <CardContent>
              {htdMonths.length === 0 ? (
                <p className="text-sm text-muted-foreground">No attendance recorded.</p>
              ) : (
                <>
                  <p className="mb-3 text-xs text-muted-foreground">
                    Nights attended in the current HTD claim window — these are the figures
                    the HTD form prefills.
                  </p>
                  <div className="divide-y">
                    {htdMonths.map(([month, count]) => (
                      <div key={month} className="flex justify-between py-1 text-sm">
                        <span className="text-muted-foreground">{formatMonth(month)}</span>
                        <span className="font-medium tabular-nums">{count}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="attendance" className="mt-4">
          <AttendanceCard baseUrl={`/api/staff/${user.cin}/attendance`} />
        </TabsContent>

        <TabsContent value="uniform" className="mt-4">
          {user.userId ? (
            <UniformIssuancesCard baseUrl={`/api/stores/issuances/user/${user.userId}`} />
          ) : (
            <p className="text-sm text-muted-foreground">
              No linked portal account, so no uniform issuances to show.
            </p>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
