"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { cn } from "@/lib/utils";
import { flightBadgeClass, cadetInitials } from "@/lib/cadet-format";
import { Search, ChevronRight, Users } from "lucide-react";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

type Cadet = {
  cin: number;
  first_name: string;
  last_name: string;
  rank: string | null;
  flight: string | null;
};

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
    apiFetch(`${API_BASE}/cadets`, {
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

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-16">
      <PageHeader
        title="Cadets"
        description={loading ? "Loading…" : `${cadets.length} cadets on strength`}
      />

      <InputGroup>
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        <InputGroupInput
          placeholder="Search by name, rank, flight or CIN…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </InputGroup>

      <ErrorAlert message={error} title="Could not load cadets" />

      {loading && (
        <div className="flex flex-col gap-2">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-12" />
          ))}
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <Users />
            </EmptyMedia>
            <EmptyTitle>No cadets found</EmptyTitle>
            <EmptyDescription>
              {search ? `Nothing matches "${search}".` : "Run the cadet scraper to populate this list."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {!loading && filtered.length > 0 && (
        <Card className="overflow-hidden py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Name</TableHead>
                <TableHead>CIN</TableHead>
                <TableHead>Rank</TableHead>
                <TableHead>Flight</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((c) => (
                <TableRow
                  key={c.cin}
                  className="cursor-pointer"
                  onClick={() => router.push(`/cadets/${c.cin}`)}
                >
                  <TableCell className="pl-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-7">
                        <AvatarFallback className="text-xs">
                          {cadetInitials(c.first_name, c.last_name)}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">
                        {c.last_name}, {c.first_name}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">{c.cin}</TableCell>
                  <TableCell className="text-muted-foreground">{c.rank ?? "—"}</TableCell>
                  <TableCell>
                    {c.flight ? (
                      <Badge variant="outline" className={cn(flightBadgeClass(c.flight))}>
                        {c.flight}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="w-8 pr-4">
                    <ChevronRight className="size-4 text-muted-foreground/50" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}
