"use client";

import { useState, useRef } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, RefreshCw, FileText } from "lucide-react";

import { API_BASE } from "@/lib/config";

const MONTHS = [
  { label: "January", value: "January" },
  { label: "February", value: "February" },
  { label: "March", value: "March" },
  { label: "April", value: "April" },
  { label: "May", value: "May" },
  { label: "June", value: "June" },
  { label: "July", value: "July" },
  { label: "August", value: "August" },
  { label: "September", value: "September" },
  { label: "October", value: "October" },
  { label: "November", value: "November" },
  { label: "December", value: "December" },
];

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 3 }, (_, i) => currentYear - i);

export default function NewsletterUpdaterPage() {
  const { data: session } = useSession();

  const now = new Date();
  const [title, setTitle] = useState("");
  const [month, setMonth] = useState(now.toLocaleString("en-GB", { month: "long" }));
  const [year, setYear] = useState(String(now.getFullYear()));
  const [issue, setIssue] = useState("");
  const [description, setDescription] = useState("");
  const [coverColor, setCoverColor] = useState("#1F2E4A");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ id: string; filename: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.type !== "application/pdf") {
      toast.error("Please select a PDF file.");
      return;
    }
    setFile(selected);
  };

  const handleUpload = async () => {
    if (!session?.id_token) {
      toast.error("No ID token found. Please log out and back in.");
      return;
    }
    if (!file) {
      toast.error("Please select a PDF file.");
      return;
    }
    if (!title.trim()) {
      toast.error("Please enter a title.");
      return;
    }
    if (!issue || isNaN(Number(issue)) || Number(issue) < 1) {
      toast.error("Please enter a valid issue number.");
      return;
    }
    if (!description.trim()) {
      toast.error("Please enter a description.");
      return;
    }

    setLoading(true);
    setResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("title", title.trim());
    formData.append("date", `${month} ${year}`);
    formData.append("issue", issue);
    formData.append("description", description.trim());
    formData.append("cover_color", coverColor);

    try {
      const resp = await fetch(`${API_BASE}/upload-newsletter`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.id_token}` },
        body: formData,
      });

      const data = await resp.json();

      if (!resp.ok) {
        toast.error(data.detail || "Failed to upload newsletter.");
        return;
      }

      setResult(data);
      toast.success("Newsletter uploaded! Vercel will redeploy shortly.");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg pb-16">
      <Card>
        <CardHeader>
          <CardTitle>Newsletter Updater</CardTitle>
          <CardDescription>
            Upload a new newsletter PDF. It will be pushed to GitHub and the newsletter
            site will redeploy automatically via Vercel.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">

          {/* PDF upload */}
          <div className="space-y-2">
            <Label>Newsletter PDF</Label>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/25 p-6 text-center transition-colors hover:border-primary/50 hover:bg-accent/5"
            >
              {file ? (
                <>
                  <FileText className="h-8 w-8 text-primary" />
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(1)} MB — click to change
                  </p>
                </>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Click to select a PDF</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Title */}
          <div className="space-y-2">
            <Label>Title</Label>
            <Input
              placeholder="e.g. Foundations of Leadership"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {/* Month / Year / Issue */}
          <div className="grid grid-cols-3 gap-4">
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

            <div className="space-y-2">
              <Label>Issue #</Label>
              <Input
                type="number"
                min="1"
                placeholder="e.g. 2"
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
              />
            </div>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              placeholder="Brief summary of this issue's content..."
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Cover colour */}
          <div className="space-y-2">
            <Label>Cover Colour</Label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={coverColor}
                onChange={(e) => setCoverColor(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded border bg-transparent p-0.5"
              />
              <span className="font-mono text-sm text-muted-foreground">{coverColor}</span>
            </div>
          </div>

          {result && (
            <div className="rounded-lg border bg-slate-50 dark:bg-slate-900 p-4 text-sm space-y-1">
              <p className="font-medium text-green-600 dark:text-green-400">✓ Upload successful</p>
              <p className="text-muted-foreground">ID: <span className="font-mono">{result.id}</span></p>
              <p className="text-muted-foreground">File: <span className="font-mono">{result.filename}</span></p>
            </div>
          )}

          <Button
            className="w-full py-6 text-lg"
            onClick={handleUpload}
            disabled={loading || !session}
          >
            {loading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              "Upload Newsletter"
            )}
          </Button>

          <div className="pt-2 border-t">
            <Link href="/">
              <Button variant="ghost" className="w-full">← Back to Home</Button>
            </Link>
          </div>

        </CardContent>
      </Card>
    </div>
  );
}
