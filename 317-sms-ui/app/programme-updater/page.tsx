"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { API_BASE } from "@/lib/config";

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
      const resp = await fetch(
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
      toast.success("Programme updated! Vercel will redeploy shortly.");
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="container max-w-lg mx-auto py-10 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Programme Updater</CardTitle>
          <CardDescription>
            Pulls the selected month's programme from Google Drive, converts it to images,
            and pushes everything to GitHub. Vercel will redeploy automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Month</Label>
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Year</Label>
              <Select value={year} onValueChange={setYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {YEARS.map((y) => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {result && (
            <div className="rounded-lg border bg-slate-50 dark:bg-slate-900 p-4 text-sm space-y-1">
              <p className="font-medium text-green-600 dark:text-green-400">✓ Update successful</p>
              <p className="text-muted-foreground">PDF: <span className="font-mono">{result.pdf}</span></p>
              <p className="text-muted-foreground">Pages converted: {result.pages_converted}</p>
            </div>
          )}

          <Button
            className="w-full py-6 text-lg"
            onClick={handleUpdate}
            disabled={loading || !session}
          >
            {loading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Updating...
              </>
            ) : (
              "Update Programme"
            )}
          </Button>

          <div className="pt-2 border-t">
            <Link href="/">
              <Button variant="ghost" className="w-full">← Back to Home</Button>
            </Link>
          </div>

        </CardContent>
      </Card>
    </main>
  );
}