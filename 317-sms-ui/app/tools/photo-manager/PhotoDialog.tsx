"use client";

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ImagePlus, RefreshCw } from "lucide-react";
import { API_BASE, CADET_SITE } from "@/lib/config";
import { ImageEditor } from "./ImageEditor";
import { ranksForTeam, type Person, type Team } from "./types";

export function PhotoDialog({
  open,
  onOpenChange,
  mode,
  team: initialTeam,
  person,
  idToken,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "add" | "edit";
  team: Team;
  person?: Person | null;
  idToken?: string;
  onSuccess: () => void;
}) {
  const [team, setTeam] = useState<Team>(initialTeam);
  const [rank, setRank] = useState("");
  const [name, setName] = useState("");
  const [editorSrc, setEditorSrc] = useState<string | null>(null);
  const [processedBlob, setProcessedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Reset/prefill whenever the dialog opens.
  useEffect(() => {
    if (!open) return;
    setEditorSrc(null);
    setProcessedBlob(null);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (mode === "edit" && person) {
      setTeam(initialTeam);
      setRank(person.rank);
      setName(person.name);
    } else {
      setTeam(initialTeam);
      setRank("");
      setName("");
    }
  }, [open, mode, person, initialTeam]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith("image/")) {
      toast.error("Please select an image file.");
      return;
    }
    setEditorSrc(URL.createObjectURL(selected));
  };

  const handleEditorApply = (blob: Blob, url: string) => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setProcessedBlob(blob);
    setPreviewUrl(url);
    if (editorSrc) URL.revokeObjectURL(editorSrc);
    setEditorSrc(null);
  };

  const handleSubmit = async () => {
    if (!idToken) {
      toast.error("No ID token found. Please log out and back in.");
      return;
    }
    if (!rank) {
      toast.error("Please choose a rank.");
      return;
    }
    if (!name.trim()) {
      toast.error("Please enter a name.");
      return;
    }
    if (mode === "add" && !processedBlob) {
      toast.error("Please add a photo.");
      return;
    }

    setLoading(true);
    const formData = new FormData();
    formData.append("rank", rank);
    formData.append("name", name.trim());
    if (mode === "add") formData.append("team", team);
    if (processedBlob) formData.append("file", processedBlob, "photo.webp");

    const url =
      mode === "add" ? `${API_BASE}/people` : `${API_BASE}/people/${person!.id}`;

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
          ? "Person added! The site will redeploy shortly."
          : "Updated! The site will redeploy shortly.",
      );
      onOpenChange(false);
      onSuccess();
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setLoading(false);
    }
  };

  const ranks = ranksForTeam(team);
  const existingPhoto =
    mode === "edit" && person ? `${CADET_SITE}${person.image}` : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {mode === "add"
              ? `Add ${team === "staff" ? "staff member" : "NCO"}`
              : `Edit ${person?.rank} ${person?.name}`}
          </DialogTitle>
          <DialogDescription>
            {mode === "add"
              ? "Upload a photo, remove its background and crop it, then set the rank and name."
              : "Update the details below. Replacing the photo is optional."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          {/* Photo */}
          <div className="space-y-2">
            <Label>Photo</Label>
            {editorSrc ? (
              <ImageEditor
                initialSrc={editorSrc}
                onCancel={() => {
                  URL.revokeObjectURL(editorSrc);
                  setEditorSrc(null);
                  if (fileInputRef.current) fileInputRef.current.value = "";
                }}
                onApply={handleEditorApply}
              />
            ) : (
              <div className="flex items-center gap-4">
                <div
                  className="flex h-40 w-30 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40"
                  style={{ width: "7.5rem" }}
                >
                  {previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt="New photo" className="h-full w-full object-cover" />
                  ) : existingPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={existingPhoto}
                      alt={`${person?.rank} ${person?.name}`}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <ImagePlus className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <ImagePlus className="mr-2 h-4 w-4" />
                    {previewUrl || existingPhoto ? "Choose a different photo" : "Choose photo"}
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    You can remove the background and crop after selecting.
                  </p>
                </div>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* Team (add only) */}
          {mode === "add" && (
            <div className="space-y-2">
              <Label>Team</Label>
              <Select
                value={team}
                onValueChange={(v) => {
                  setTeam(v as Team);
                  setRank("");
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="staff">Adult Staff</SelectItem>
                  <SelectItem value="nco">Cadet NCO</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Rank + Name */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>Rank</Label>
              <Select value={rank} onValueChange={setRank}>
                <SelectTrigger>
                  <SelectValue placeholder="Rank" />
                </SelectTrigger>
                <SelectContent>
                  {ranks.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>{team === "nco" ? "Name (initial + surname)" : "Name"}</Label>
              <Input
                placeholder={team === "nco" ? "e.g. V Tyrell" : "e.g. Simon Doherty"}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={loading || editorSrc !== null}>
            {loading ? (
              <>
                <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : mode === "add" ? (
              "Add person"
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
