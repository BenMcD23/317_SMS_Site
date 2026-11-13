"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { MonthPicker } from "@/components/month-picker";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { FieldGroup } from "@/components/ui/field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/page-header";
import { ProgrammeRecord } from "@/components/programme/programme-record";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

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
      const resp = await apiFetch(`${API_BASE}/update-programme?month=${month}&year=${year}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.id_token}` },
      });

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
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="Programme"
        description="Publish a month's programme from Google Drive to the squadron website, and copy it into the stats"
      />

      <Card>
        <CardContent>
          <FieldGroup>
            <MonthPicker
              value={{ month: Number(month), year: Number(year) }}
              onChange={(m) => {
                setMonth(String(m.month));
                setYear(String(m.year));
              }}
              min={{ month: 1, year: Math.min(...YEARS) }}
              max={{ month: 12, year: Math.max(...YEARS) }}
            />

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

      <ProgrammeRecord month={month} year={year} />
    </div>
  );
}
