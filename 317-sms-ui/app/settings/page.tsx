"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { toast } from "sonner";
import { Eye, EyeOff, Upload, Trash2, CheckCircle2 } from "lucide-react";
import { API_BASE } from "@/lib/config";
import { cn } from "@/lib/utils";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(false);

  const [showRolePass, setShowRolePass] = useState(false);
  const [showPersPass, setShowPersPass] = useState(false);

  const [creds, setCreds] = useState({
    role_user: "",
    role_pass: "",
    pers_user: "",
    pers_pass: "",
  });

  // ── Signature state ─────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [sigLoading, setSigLoading] = useState(false);
  const [hasSavedSignature, setHasSavedSignature] = useState(false);

  // Load existing signature on mount
  useEffect(() => {
    if (!session?.id_token) return;

    fetch(`${API_BASE}/get-signature`, {
      headers: { Authorization: `Bearer ${session.id_token}` },
    }).then((res) => {
      if (res.ok) {
        res.blob().then((blob) => {
          setSignaturePreview(URL.createObjectURL(blob));
          setHasSavedSignature(true);
        });
      }
    });
  }, [session]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      toast.error("Please upload a PNG or JPEG image.");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Image must be under 2 MB.");
      return;
    }

    setSignatureFile(file);
    setSignaturePreview(URL.createObjectURL(file));
  };

  const handleSignatureSave = async () => {
    if (!signatureFile) return;
    if (!session?.id_token) {
      toast.error("Not authenticated.");
      return;
    }

    setSigLoading(true);
    try {
      const formData = new FormData();
      formData.append("file", signatureFile);

      const res = await fetch(`${API_BASE}/save-signature`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.id_token}` },
        body: formData,
      });

      if (res.ok) {
        toast.success("Signature saved.");
        setHasSavedSignature(true);
        setSignatureFile(null);
      } else {
        const err = await res.json();
        toast.error(err.detail ?? "Failed to save signature.");
      }
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setSigLoading(false);
    }
  };

  const handleSignatureDelete = async () => {
    if (!session?.id_token) return;
    setSigLoading(true);
    try {
      const res = await fetch(`${API_BASE}/delete-signature`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.id_token}` },
      });
      if (res.ok) {
        setSignaturePreview(null);
        setSignatureFile(null);
        setHasSavedSignature(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        toast.success("Signature removed.");
      }
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setSigLoading(false);
    }
  };

  // ── Credentials ─────────────────────────────────────────────────────────────
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCreds({ ...creds, [e.target.id]: e.target.value });
  };

  const handleSave = async () => {
    if (!session?.id_token) {
      toast.error("No ID Token found. Please log out and back in.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/save-credentials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.id_token}`,
        },
        body: JSON.stringify(creds),
      });
      if (response.ok) {
        toast.success("Credentials saved!");
      } else {
        toast.error("Failed to save credentials.");
      }
    } catch {
      toast.error("Server unreachable.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-16">
      <div>
        <h1 className="text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">Manage your Bader credentials and assessor signature.</p>
      </div>

      {/* ── Signature ─────────────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Assessor Signature</CardTitle>
          <CardDescription>
            Upload a PNG or JPEG of your signature. It will be used automatically on
            assessment sheets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Preview */}
          {signaturePreview ? (
            <div className="relative overflow-hidden rounded-md border bg-white p-3">
              {hasSavedSignature && !signatureFile && (
                <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-700">
                  <CheckCircle2 className="h-3 w-3" /> Saved
                </span>
              )}
              <img
                src={signaturePreview}
                alt="Signature preview"
                className="max-h-24 object-contain"
              />
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className={cn(
                "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed py-8 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
              )}
            >
              <Upload className="h-6 w-6" />
              <span>Click to upload signature image</span>
              <span className="text-xs">PNG or JPEG, max 2 MB</span>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={handleFileSelect}
          />

          <div className="flex gap-2">
            {/* Show upload button if no preview yet, or change button if there is one */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={sigLoading}
            >
              <Upload className="mr-2 h-3.5 w-3.5" />
              {signaturePreview ? "Change image" : "Upload image"}
            </Button>

            {/* Only show Save when a new file has been selected but not yet saved */}
            {signatureFile && (
              <Button size="sm" onClick={handleSignatureSave} disabled={sigLoading}>
                {sigLoading ? "Saving…" : "Save signature"}
              </Button>
            )}

            {/* Only show Delete when there's a saved signature on the server */}
            {hasSavedSignature && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSignatureDelete}
                disabled={sigLoading}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Remove
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Bader credentials ────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Bader Login Settings</CardTitle>
          <CardDescription>Configure your SMS scraper credentials.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Role account */}
          <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
            <h3 className="font-semibold">Role Account</h3>
            <div className="grid gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="role_user">Username</Label>
                <Input
                  id="role_user"
                  value={creds.role_user}
                  onChange={handleChange}
                  placeholder="e.g. 317_adj"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="role_pass">Password</Label>
                <div className="relative">
                  <Input
                    id="role_pass"
                    type={showRolePass ? "text" : "password"}
                    value={creds.role_pass}
                    onChange={handleChange}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRolePass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showRolePass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Personal account */}
          <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
            <h3 className="font-semibold">Personal Account</h3>
            <div className="grid gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="pers_user">Username</Label>
                <Input
                  id="pers_user"
                  value={creds.pers_user}
                  onChange={handleChange}
                  placeholder="e.g. j.bloggs100"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pers_pass">Password</Label>
                <div className="relative">
                  <Input
                    id="pers_pass"
                    type={showPersPass ? "text" : "password"}
                    value={creds.pers_pass}
                    onChange={handleChange}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPersPass((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPersPass ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handleSave}
            disabled={loading || !session}
          >
            {loading ? "Saving…" : "Save All Credentials"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}