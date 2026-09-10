"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/page-header";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

const MONTHS = [
  { label: "January", value: "1" },
  { label: "February", value: "2" },
  { label: "March", value: "3" },
  { label: "April", value: "4" },
  { label: "May", value: "5" },
  { label: "June", value: "6" },
  { label: "July", value: "7" },
  { label: "August", value: "8" },
  { label: "September", value: "9" },
  { label: "October", value: "10" },
  { label: "November", value: "11" },
  { label: "December", value: "12" },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 3 }, (_, i) => currentYear - i);

export default function ProgrammeUpdaterPage() {
  const { data: session } = useSession();

  const now = new Date();
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ pdf: string; pages_converted: number } | null>(null);

  const handleUpdate = async () => {
    if (!session?.id_token) {
      toast.error("No ID token found. Please log out and back in.");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const resp = await apiFetch(
        `${API_BASE}/update-programme?month=${month}&year=${year}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${session.id_token}` },
        }
      );

      const data = await resp.json();

      if (!resp.ok) {
        toast.error(data.detail || "Failed to update programme.");
        return;
      }

      setResult(data);
      toast.success("Programme updated — Vercel will redeploy shortly.");
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6 pb-16">
      <PageHeader
        title="Programme"
        description="Publish a month's programme from Google Drive to the squadron website"
      />

      <Card>
        <CardContent>
          <FieldGroup>
            <div className="grid grid-cols-2 gap-3">
              <Field>
                <FieldLabel htmlFor="month">Month</FieldLabel>
                <Select value={month} onValueChange={setMonth}>
                  <SelectTrigger id="month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {MONTHS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>

              <Field>
                <FieldLabel htmlFor="year">Year</FieldLabel>
                <Select value={year} onValueChange={setYear}>
                  <SelectTrigger id="year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {YEARS.map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {result && (
              <Alert>
                <CheckCircle2 className="text-success" />
                <AlertTitle>Update successful</AlertTitle>
                <AlertDescription>
                  <span className="font-mono">{result.pdf}</span> · {result.pages_converted} page
                  {result.pages_converted !== 1 ? "s" : ""} converted. Vercel will redeploy automatically.
                </AlertDescription>
              </Alert>
            )}

            <Button className="w-full" onClick={handleUpdate} disabled={loading || !session}>
              {loading && <Spinner data-icon="inline-start" />}
              {loading ? "Updating…" : "Update programme"}
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
