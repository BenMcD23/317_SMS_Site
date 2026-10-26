"use client";

import { useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { PageHeader } from "@/components/page-header";
import { ErrorAlert } from "@/components/error-alert";
import { ListSkeleton } from "@/components/list-skeleton";
import { EmptyState } from "@/components/empty-state";
import { toast } from "sonner";
import { Images, Trash2, Upload, X } from "lucide-react";
import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";
import { useApiQuery, useSetApiQueryData } from "@/lib/use-api-query";

interface Photo {
  cat: string;
  file: string;
  w: number;
  h: number;
  alt: string;
}

// The website repo is public, so thumbnails come straight from GitHub.
// ponytail: raw.githubusercontent caches for a few minutes, so a just-added photo may not show yet.
const RAW = "https://raw.githubusercontent.com/BenMcD23/cadet-website/master/src/assets/gallery/";
const NEW_SECTION = "__new__";

const GALLERY_KEY = ["gallery"];

export default function GalleryUpdaterPage() {
  const { data: session } = useSession();
  const idToken = session?.id_token as string | undefined;

  const query = useApiQuery<Photo[]>(GALLERY_KEY, "/gallery");
  const photos = useMemo(() => query.data ?? [], [query.data]);
  const error = query.error?.message ?? null;
  const loading = query.isPending && !error;
  const setPhotos = useSetApiQueryData<Photo[]>(GALLERY_KEY);
  const load = () => void query.refetch();

  const [section, setSection] = useState("");
  const [newSection, setNewSection] = useState("");
  const [picked, setPicked] = useState<{ file: File; url: string; alt: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Same order the website shows them in: the order each section first appears.
  const sections = useMemo(() => [...new Set(photos.map((p) => p.cat))], [photos]);

  function addFiles(files: FileList | null) {
    const images = [...(files ?? [])].filter((f) => f.type.startsWith("image/"));
    setPicked((prev) => [
      ...prev,
      ...images.map((file) => ({ file, url: URL.createObjectURL(file), alt: "" })),
    ]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePicked(i: number) {
    setPicked((prev) => {
      URL.revokeObjectURL(prev[i].url);
      return prev.filter((_, j) => j !== i);
    });
  }

  async function handleUpload() {
    if (!idToken) {
      toast.error("No ID token found. Please log out and back in.");
      return;
    }
    const name = section === NEW_SECTION ? newSection.trim() : section;
    if (!name) {
      toast.error("Choose a section, or name a new one.");
      return;
    }
    if (picked.length === 0) {
      toast.error("Choose at least one photo.");
      return;
    }
    if (picked.some((p) => !p.alt.trim())) {
      toast.error("Describe every photo — it's read out to visitors who can't see it.");
      return;
    }

    const form = new FormData();
    form.append("section", name);
    for (const p of picked) {
      form.append("files", p.file);
      form.append("alts", p.alt.trim());
    }

    setUploading(true);
    try {
      const res = await apiFetch(`${API_BASE}/gallery`, {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.detail || "Upload failed.");
        return;
      }
      toast.success(
        `Added ${data.added.length} photo${data.added.length !== 1 ? "s" : ""} to ${data.section}. The site will redeploy shortly.`
      );
      picked.forEach((p) => URL.revokeObjectURL(p.url));
      setPicked([]);
      setSection(data.section);
      setNewSection("");
      load();
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(file: string) {
    if (!idToken) return;
    setDeleting(file);
    try {
      const res = await apiFetch(`${API_BASE}/gallery/${encodeURIComponent(file)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail || "Failed to delete photo");
      }
      setPhotos((prev) => prev?.filter((p) => p.file !== file));
      setDeleteConfirm(null);
      toast.success("Photo removed. The site will redeploy shortly.");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to delete photo");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 pb-16">
      <PageHeader
        title="Gallery"
        description={
          loading
            ? "Loading…"
            : `${photos.length} photo${photos.length !== 1 ? "s" : ""} in ${sections.length} section${sections.length !== 1 ? "s" : ""}`
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Add photos</CardTitle>
        </CardHeader>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="section">Section</FieldLabel>
              <Select value={section} onValueChange={setSection}>
                <SelectTrigger id="section">
                  <SelectValue placeholder="Choose a section" />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {sections.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                    <SelectItem value={NEW_SECTION}>+ New section…</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </Field>

            {section === NEW_SECTION && (
              <Field>
                <FieldLabel htmlFor="new-section">New section name</FieldLabel>
                <Input
                  id="new-section"
                  placeholder="e.g. Summer Camp"
                  maxLength={40}
                  value={newSection}
                  onChange={(e) => setNewSection(e.target.value)}
                />
              </Field>
            )}

            <Field>
              <FieldLabel>Photos</FieldLabel>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addFiles(e.dataTransfer.files);
                }}
                className="border-muted-foreground/25 hover:border-primary/50 hover:bg-accent/5 flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors"
              >
                <Upload className="text-muted-foreground h-8 w-8" />
                <span className="text-muted-foreground text-sm">
                  Click or drop photos here (JPEG, PNG or WebP)
                </span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => addFiles(e.target.files)}
              />
            </Field>

            {picked.length > 0 && (
              <ul className="flex flex-col gap-3">
                {picked.map((p, i) => (
                  <li key={p.url} className="flex items-center gap-3">
                    <img src={p.url} alt="" className="h-16 w-16 shrink-0 rounded-md object-cover" />
                    <Input
                      aria-label={`Description of ${p.file.name}`}
                      placeholder="What's in the photo? e.g. Cadets marching to the memorial"
                      value={p.alt}
                      onChange={(e) =>
                        setPicked((prev) => prev.map((q, j) => (j === i ? { ...q, alt: e.target.value } : q)))
                      }
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 shrink-0"
                      onClick={() => removePicked(i)}
                      aria-label="Remove"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            <Button className="w-full" onClick={handleUpload} disabled={uploading || !session}>
              {uploading && <Spinner data-icon="inline-start" />}
              {uploading ? "Uploading…" : `Add ${picked.length || ""} photo${picked.length !== 1 ? "s" : ""}`}
            </Button>
          </FieldGroup>
        </CardContent>
      </Card>

      <ErrorAlert message={error} title="Could not load the gallery" />

      {loading && <ListSkeleton rows={4} className="h-20" />}

      {!loading && !error && photos.length === 0 && (
        <EmptyState icon={Images} title="No photos yet" description="Add some photos to start the gallery." />
      )}

      {!loading &&
        sections.map((s) => (
          <Card key={s}>
            <CardHeader>
              <CardTitle>{s}</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {photos
                  .filter((p) => p.cat === s)
                  .map((p) => (
                    <li key={p.file} className="flex flex-col gap-1">
                      <img
                        src={RAW + p.file}
                        alt={p.alt}
                        loading="lazy"
                        className="aspect-square w-full rounded-md object-cover"
                      />
                      <div className="flex items-start gap-1">
                        <p className="text-muted-foreground line-clamp-2 flex-1 text-xs">{p.alt}</p>
                        {deleteConfirm === p.file ? (
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-7 px-2 text-xs"
                            disabled={deleting === p.file}
                            onClick={() => handleDelete(p.file)}
                          >
                            {deleting === p.file ? "Deleting…" : "Confirm"}
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-destructive hover:text-destructive h-7 w-7 shrink-0"
                            onClick={() => setDeleteConfirm(p.file)}
                            aria-label={`Delete ${p.alt}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </li>
                  ))}
              </ul>
            </CardContent>
          </Card>
        ))}

      <p className="text-muted-foreground text-center text-xs">
        Changes are committed to GitHub and the website redeploys automatically — allow a minute or two to go
        live.
      </p>
    </div>
  );
}
