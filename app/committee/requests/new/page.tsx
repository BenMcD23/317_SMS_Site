"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Loader2, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { formatGBP } from "@/lib/committee";

interface ItemDraft {
  id: number;
  description: string;
  cost: string;
}

let nextId = 1;
const newItem = (): ItemDraft => ({ id: nextId++, description: "", cost: "" });

export default function NewCommitteeRequestPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const queryClient = useQueryClient();

  const [title, setTitle] = useState("");
  const [justification, setJustification] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([newItem()]);
  const [submitting, setSubmitting] = useState(false);

  const total = items.reduce((sum, i) => sum + (parseFloat(i.cost) || 0), 0);

  const updateItem = (id: number, field: "description" | "cost", value: string) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
  const addItem = () => setItems((list) => [...list, newItem()]);
  const removeItem = (id: number) =>
    setItems((list) => (list.length > 1 ? list.filter((i) => i.id !== id) : list));

  const canSubmit =
    title.trim().length > 0 &&
    items.some((i) => i.description.trim() && parseFloat(i.cost) > 0);

  const submit = async () => {
    if (!session?.id_token) {
      toast.error("No session token. Please sign in again.");
      return;
    }
    const cleanItems = items
      .filter((i) => i.description.trim())
      .map((i) => ({ description: i.description.trim(), cost: parseFloat(i.cost) || 0 }));
    if (cleanItems.length === 0) {
      toast.error("Add at least one item with a description.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch(`${API_BASE}/committee-requests`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.id_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: title.trim(), justification, items: cleanItems }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.detail ?? "Failed to submit request.");
        return;
      }
      const created = await res.json();
      queryClient.invalidateQueries({ queryKey: ["committee-requests"] });
      toast.success(`Request ${created.reference} submitted — the OC has been notified.`);
      router.push(`/committee/requests/${created.id}`);
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        title="New Committee Request"
        description="Submit a purchase request — the OC is emailed a PDF for approval"
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/committee/requests"><ArrowLeft /> Back</Link>
          </Button>
        }
      />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Request Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. New handheld radios for radio badge"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="justification">Justification</Label>
            <Textarea
              id="justification"
              value={justification}
              onChange={(e) => setJustification(e.target.value)}
              placeholder="Why is this needed?"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label>Items</Label>
            <div className="flex flex-col gap-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-start gap-2">
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(item.id, "description", e.target.value)}
                    placeholder="Item description"
                    className="flex-1"
                  />
                  <div className="relative w-32 shrink-0">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">£</span>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={item.cost}
                      onChange={(e) => updateItem(item.id, "cost", e.target.value)}
                      placeholder="0.00"
                      className="pl-6 text-right tabular-nums"
                    />
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeItem(item.id)}
                    disabled={items.length === 1}
                    aria-label="Remove item"
                  >
                    <Trash2 className="text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between pt-1">
              <Button variant="outline" size="sm" onClick={addItem}>
                <Plus /> Add item
              </Button>
              <div className="text-sm">
                <span className="text-muted-foreground">Total </span>
                <span className="font-semibold tabular-nums">{formatGBP(total)}</span>
              </div>
            </div>
          </div>

          <Button className="w-full" onClick={submit} disabled={!canSubmit || submitting}>
            {submitting ? <Loader2 className="animate-spin" /> : null}
            {submitting ? "Submitting…" : "Submit Request"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
