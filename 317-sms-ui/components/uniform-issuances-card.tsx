"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Shirt, Pencil, Check, X, Loader2 } from "lucide-react";
import { formatDate } from "@/lib/format";

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

interface Props {
  /** GET + POST endpoint (e.g. /api/stores/issuances/123 or /api/stores/issuances/user/5) */
  baseUrl: string;
}

export function UniformIssuancesCard({ baseUrl }: Props) {
  const [issuances, setIssuances] = useState<Issuance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editing, setEditing] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editSize, setEditSize] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(baseUrl)
      .then((r) => (r.ok ? r.json() : []))
      .then(setIssuances)
      .catch(() => setIssuances([]))
      .finally(() => setLoading(false));
  }, [baseUrl]);

  function startEdit(category: string) {
    const record = issuances.find((i) => i.itemCategory === category);
    setEditing(category);
    setEditDate(record ? record.lastGiven.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setEditSize(record?.sizeGiven ?? "");
    setError(null);
  }

  async function save(category: string) {
    if (!editDate) return;
    setSaving(true);
    try {
      const res = await fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [{ itemCategory: category, sizeGiven: editSize || null, lastGiven: editDate }],
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

  async function remove(issuanceId: number) {
    setSaving(true);
    try {
      const res = await fetch(`/api/stores/issuances/item/${issuanceId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setIssuances((prev) => prev.filter((i) => i.id !== issuanceId));
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Shirt className="h-4 w-4 text-muted-foreground" />
          Uniform Issuances
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {error && (
          <p className="px-6 py-2 text-sm text-destructive">{error}</p>
        )}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="divide-y">
            {ISSUANCE_CATEGORIES.map((category) => {
              const record = issuances.find((i) => i.itemCategory === category);
              const isEditing = editing === category;

              return (
                <div key={category} className="px-6 py-3">
                  {isEditing ? (
                    <div className="space-y-2">
                      <span className="text-sm font-medium">{category}</span>
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          type="date"
                          value={editDate}
                          onChange={(e) => setEditDate(e.target.value)}
                          className="h-8 text-sm w-full sm:w-40"
                        />
                        <Input
                          placeholder="Size (optional)"
                          value={editSize}
                          onChange={(e) => setEditSize(e.target.value)}
                          className="h-8 text-sm w-full sm:w-32"
                        />
                        <div className="flex items-center gap-1">
                          <Button
                            size="icon" variant="ghost"
                            className="h-8 w-8 text-success hover:text-success"
                            onClick={() => save(category)}
                            disabled={saving || !editDate}
                          >
                            {saving
                              ? <Loader2 className="h-4 w-4 animate-spin" />
                              : <Check className="h-4 w-4" />}
                          </Button>
                          <Button
                            size="icon" variant="ghost"
                            className="h-8 w-8 text-muted-foreground"
                            onClick={() => setEditing(null)}
                            disabled={saving}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                          {record && (
                            <Button
                              variant="ghost"
                              className="h-8 px-2 text-xs text-muted-foreground hover:text-destructive"
                              onClick={() => remove(record.id)}
                              disabled={saving}
                            >
                              Clear
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-4">
                      <span className="text-sm font-medium">{category}</span>
                      <div className="flex items-center gap-1">
                        {record ? (
                          <div className="text-right mr-1">
                            <p className="text-sm text-muted-foreground">{formatDate(record.lastGiven)}</p>
                            {record.sizeGiven && (
                              <p className="text-xs text-muted-foreground">Size: {record.sizeGiven}</p>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground italic mr-1">N/A</span>
                        )}
                        <Button
                          size="icon" variant="ghost"
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
        )}
      </CardContent>
    </Card>
  );
}
