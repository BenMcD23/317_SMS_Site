"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Upload, RefreshCw, FileText } from "lucide-react";
import { API_BASE } from "@/lib/config";
import type { Newsletter } from "./types";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const currentYear = new Date().getFullYear();
// A few years back and one ahead, so older issues can still be edited.
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear + 1 - i);

function parseDate(date: string): { month: string; year: string } {
  const [month, year] = (date ?? "").split(" ");
  return {
    month: MONTHS.includes(month) ? month : MONTHS[new Date().getMonth()],
    year: year && /^\d{4}$/.test(year) ? year : String(currentYear),
  };
}

export function NewsletterDialog({
  open,
  onOpenChange,
  mode,
  newsletter,
  idToken,
  existingIssues = [],
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  newsletter?: Newsletter | null;
  idToken?: string;
  existingIssues?: number[];
  onSuccess: () => void;
}) {
  const now = new Date();
  const [title, setTitle] = useState("");
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [issue, setIssue] = useState("");
  const [description, setDescription] = useState("");
  const [coverColor, setCoverColor] = useState("#1F2E4A");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset/prefill the form whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (mode === "edit" && newsletter) {
      const { month: m, year: y } = parseDate(newsletter.date);
      setTitle(newsletter.title);
      setMonth(m);
      setYear(y);
      setIssue(String(newsletter.issue));
      setDescription(newsletter.description);
      setCoverColor(newsletter.coverColor ?? "#1F2E4A");
    } else {
      setTitle("");
      setMonth(MONTHS[new Date().getMonth()]);
      setYear(String(new Date().getFullYear()));
      setIssue("");
      setDescription("");
      setCoverColor("#1F2E4A");
    }
  }, [open, mode, newsletter]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (selected.type !== "application/pdf") {
      toast.error("Please select a PDF file.");
      return;
    }
    setFile(selected);
  };

  const handleSubmit = async () => {
    if (!idToken) {
      toast.error("No ID token found. Please log out and back in.");
      return;
    }
    if (!title.trim()) {
      toast.error("Please enter a title.");
      return;
    }
    if (!description.trim()) {
      toast.error("Please enter a description.");
      return;
    }
    if (mode === "add") {
      if (!issue || isNaN(Number(issue)) || Number(issue) < 1) {
        toast.error("Please enter a valid issue number.");
        return;
      }
      if (existingIssues.includes(Number(issue))) {
        toast.error(`Issue ${issue} already exists. Edit it instead, or choose a different number.`);
        return;
      }
      if (!file) {
        toast.error("Please select a PDF file.");
        return;
      }
    }

    setLoading(true);

    const formData = new FormData();
    formData.append("title", title.trim());
    formData.append("date", `${month} ${year}`);
    formData.append("description", description.trim());
    formData.append("cover_color", coverColor);
    if (file) formData.append("file", file);
    if (mode === "add") formData.append("issue", issue);

    const url =
      mode === "add"
        ? `${API_BASE}/upload-newsletter`
        : `${API_BASE}/newsletters/${newsletter!.issue}`;

    try {
      const resp = await fetch(url, {
        method: mode === "add" ? "POST" : "PUT",
        headers: { Authorization: `Bearer ${idToken}` },
        body: formData,
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        toast.error(data.detail || "Request failed.");
        return;
      }
      toast.success(
        mode === "add"
          ? "Newsletter added! The site will redeploy shortly."
          : "Newsletter updated! The site will redeploy shortly."
      );
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{mode === "add" ? "Add Newsletter" : `Edit Issue #${newsletter?.issue}`}</DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Upload a new newsletter PDF and its details."
              : "Update the details below. Uploading a PDF is optional — leave it empty to keep the current one."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* PDF upload */}
          <div className="space-y-2">
            <Label>{mode === "add" ? "Newsletter PDF" : "Replace PDF (optional)"}</Label>
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
                  <p className="text-sm text-muted-foreground">
                    {mode === "add" ? "Click to select a PDF" : "Click to replace the current PDF"}
                  </p>
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
                    <SelectItem key={m} value={m}>{m}</SelectItem>
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
                disabled={mode === "edit"}
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                {mode === "add" ? "Uploading…" : "Saving…"}
              </>
            ) : mode === "add" ? (
              "Add Newsletter"
            ) : (
              "Save Changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
