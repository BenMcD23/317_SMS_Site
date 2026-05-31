"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Shirt, Pencil, Check, X, Loader2, UserCog } from "lucide-react";

type StaffUser = {
  id: number;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
};

type Issuance = {
  id: number;
  itemCategory: string;
  lastGiven: string;
  sizeGiven: string | null;
};

const ISSUANCE_CATEGORIES = [
  "Beret",
  "Wedgewood Shirt",
  "Working Blue Shirt",
  "Jumper",
  "Slacks/Trousers",
  "Skirt",
  "Tie",
  "Brassard",
  "Belt",
];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function StaffDetailPage() {
  const { id } = useParams<{ id: string }>();

  const [user, setUser] = useState<StaffUser | null>(null);
  const [issuances, setIssuances] = useState<Issuance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Inline editing state
  const [editing, setEditing] = useState<string | null>(null); // itemCategory being edited
  const [editDate, setEditDate] = useState("");
  const [editSize, setEditSize] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const [usersRes, issuancesRes] = await Promise.all([
          fetch("/api/staff/users"),
          fetch(`/api/stores/issuances/user/${id}`),
        ]);
        if (!usersRes.ok) throw new Error("Failed to load staff");
        const allUsers: StaffUser[] = await usersRes.json();
        const found = allUsers.find((u) => String(u.id) === id) ?? null;
        setUser(found);
        setIssuances(issuancesRes.ok ? await issuancesRes.json() : []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  function startEdit(category: string) {
    const record = issuances.find((i) => i.itemCategory === category);
    setEditing(category);
    setEditDate(record ? record.lastGiven.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setEditSize(record?.sizeGiven ?? "");
  }

  function cancelEdit() {
    setEditing(null);
  }

  async function saveEdit(category: string) {
    if (!editDate) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/stores/issuances/user/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ itemCategory: category, sizeGiven: editSize || null }],
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      const updated: Issuance[] = await res.json();
      setIssuances((prev) => {
        const next = prev.filter((i) => !updated.some((u) => u.itemCategory === i.itemCategory));
        return [...next, ...updated];
      });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) return <p className="text-sm text-destructive">{error}</p>;
  if (!user) return <p className="text-sm text-muted-foreground">Staff member not found.</p>;

  const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <UserCog className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">{name}</h1>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Shirt className="h-4 w-4 text-muted-foreground" />
            Uniform Issuances
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {ISSUANCE_CATEGORIES.map((category) => {
              const record = issuances.find((i) => i.itemCategory === category);
              const isEditing = editing === category;

              return (
                <div key={category} className="px-6 py-3">
                  {isEditing ? (
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <span className="text-sm font-medium w-40 shrink-0">{category}</span>
                      <div className="flex flex-1 items-center gap-2">
                        <Input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="h-8 text-sm"
                        />
                        <Input
                          placeholder="Size (optional)"
                          value={editSize}
                          onChange={(e) => setEditSize(e.target.value)}
                          className="h-8 text-sm w-32"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-green-600 hover:text-green-700"
                          onClick={() => saveEdit(category)}
                          disabled={saving || !editDate}
                        >
                          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={cancelEdit}
                          disabled={saving}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-medium">{category}</span>
                      <div className="flex items-center gap-3">
                        {record ? (
                          <div className="text-right">
                            <p className="text-sm text-muted-foreground">{formatDate(record.lastGiven)}</p>
                            {record.sizeGiven && (
                              <p className="text-xs text-muted-foreground">Size: {record.sizeGiven}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">N/A</span>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={() => startEdit(category)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
