"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { Search, ChevronRight, Users } from "lucide-react";
import { API_BASE } from "@/lib/config";

type Cadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
};

const FLIGHT_COLOURS: Record<string, string> = {
  Alpha:   "bg-blue-100 text-blue-700 border-blue-200",
  Bravo:   "bg-red-100 text-red-700 border-red-200",
  Charlie: "bg-green-100 text-green-700 border-green-200",
  Delta:   "bg-yellow-100 text-yellow-700 border-yellow-200",
};

function flightClass(flight: string | null) {
  if (!flight) return "bg-muted text-muted-foreground border-muted";
  return FLIGHT_COLOURS[flight] ?? "bg-muted text-muted-foreground border-muted";
}

export default function CadetsPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [cadets, setCadets] = useState<Cadet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!session?.id_token) return;
    setLoading(true);
    fetch(`${API_BASE}/cadets`, {
      headers: { Authorization: `Bearer ${session.id_token}` },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json()).detail ?? res.statusText);
        return res.json();
      })
      .then(setCadets)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [session?.id_token]);

  const filtered = cadets.filter((c) => {
    const q = search.toLowerCase();
    return (
      !q ||
      c.first_name.toLowerCase().includes(q) ||
      c.last_name.toLowerCase().includes(q) ||
      String(c.cin).includes(q) ||
      c.rank?.toLowerCase().includes(q) ||
      c.flight?.toLowerCase().includes(q)
    );
  });

  // Group by first letter of last name
  const grouped = filtered.reduce<Record<string, Cadet[]>>((acc, c) => {
    const letter = c.last_name[0]?.toUpperCase() ?? "#";
    (acc[letter] ??= []).push(c);
    return acc;
  }, {});
  const letters = Object.keys(grouped).sort();

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Cadets</h1>
          <p className="text-muted-foreground">
            {loading ? "Loading…" : `${cadets.length} cadets enrolled`}
          </p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
          <Users className="h-5 w-5 text-primary" />
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by name, rank, flight or CIN…"
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && filtered.length === 0 && (
        <p className="py-12 text-center text-sm text-muted-foreground">
          {search ? `No cadets match "${search}"` : "No cadets found."}
        </p>
      )}

      {/* List grouped by letter */}
      {!loading && letters.map((letter) => (
        <div key={letter}>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {letter}
          </p>
          <Card className="overflow-hidden p-0">
            <CardContent className="p-0">
              <div className="divide-y">
                {grouped[letter].map((c) => (
                  <button
                    key={c.cin}
                    type="button"
                    onClick={() => router.push(`/cadets/${c.cin}`)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {/* Avatar */}
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {c.first_name[0]}{c.last_name[0]}
                    </div>

                    {/* Name + CIN */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">
                        {c.first_name} {c.last_name}
                      </p>
                      <p className="text-xs text-muted-foreground">CIN {c.cin}</p>
                    </div>

                    {/* Badges */}
                    <div className="flex shrink-0 items-center gap-2">
                      {c.rank && (
                        <Badge variant="secondary" className="hidden text-xs sm:inline-flex">
                          {c.rank}
                        </Badge>
                      )}
                      {c.flight && (
                        <Badge className={cn("hidden text-xs border sm:inline-flex", flightClass(c.flight))}>
                          {c.flight}
                        </Badge>
                      )}
                      <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      ))}
    </div>
  );
}