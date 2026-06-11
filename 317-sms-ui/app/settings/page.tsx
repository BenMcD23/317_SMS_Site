"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { PageHeader } from "@/components/page-header";
import { toast } from "sonner";
import { Eye, EyeOff, Upload, Trash2, CheckCircle2, PenLine, RotateCcw } from "lucide-react";
import { API_BASE } from "@/lib/config";
import { apiFetch } from "@/lib/api-fetch";

export default function SettingsPage() {
  const { data: session } = useSession();

  // ── Credentials ─────────────────────────────────────────────────────────────
  const [credsLoading, setCredsLoading] = useState(false);
  const [showRolePass, setShowRolePass] = useState(false);
  const [showPersPass, setShowPersPass] = useState(false);
  const [creds, setCreds] = useState({
    role_user: "", role_pass: "", pers_user: "", pers_pass: "",
  });

  // ── Signature ────────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [signaturePreview, setSignaturePreview] = useState<string | null>(null);
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [sigLoading, setSigLoading] = useState(false);
  const [hasSavedSignature, setHasSavedSignature] = useState(false);
  const [signatureMode, setSignatureMode] = useState<"draw" | "upload">("draw");
  const [hasDrawn, setHasDrawn] = useState(false);
  const [drawnDataUrl, setDrawnDataUrl] = useState<string | null>(null);

  // ── Assessor name ────────────────────────────────────────────────────────────
  const [assessorName, setAssessorName] = useState("");
  const [assessorNameLoading, setAssessorNameLoading] = useState(false);
  const [assessorNameDirty, setAssessorNameDirty] = useState(false);

  useEffect(() => {
    if (!session?.id_token) return;

    apiFetch(`${API_BASE}/get-signature`, {
      headers: { Authorization: `Bearer ${session.id_token}` },
    }).then((res) => {
      if (res.ok) res.blob().then((blob) => {
        setSignaturePreview(URL.createObjectURL(blob));
        setHasSavedSignature(true);
      });
    });

    apiFetch(`${API_BASE}/settings/assessor-name`, {
      headers: { Authorization: `Bearer ${session.id_token}` },
    }).then((res) => {
      if (res.ok) res.json().then((d) => setAssessorName(d.assessor_name ?? ""));
    });
  }, [session]);

  useEffect(() => {
    if (signatureMode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const getPos = (e: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      if ("touches" in e) return { x: (e.touches[0].clientX - rect.left) * scaleX, y: (e.touches[0].clientY - rect.top) * scaleY };
      return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
    };
    const start = (e: MouseEvent | TouchEvent) => { drawingRef.current = true; const p = getPos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
    const move = (e: MouseEvent | TouchEvent) => { if (!drawingRef.current) return; const p = getPos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); };
    const stop = () => { if (!drawingRef.current) return; drawingRef.current = false; setHasDrawn(true); setDrawnDataUrl(canvas.toDataURL()); };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", stop);
    canvas.addEventListener("mouseleave", stop);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", stop);
    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", stop);
      canvas.removeEventListener("mouseleave", stop);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", stop);
    };
  }, [signatureMode]);

  const clearDraw = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    setDrawnDataUrl(null);
  };

  // ── Handlers ─────────────────────────────────────────────────────────────────

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
    if (!session?.id_token) return;
    setSigLoading(true);
    try {
      let fileToSave: File | null = null;
      if (signatureMode === "draw" && drawnDataUrl) {
        const blob = await (await fetch(drawnDataUrl)).blob();
        fileToSave = new File([blob], "signature.png", { type: "image/png" });
      } else if (signatureMode === "upload" && signatureFile) {
        fileToSave = signatureFile;
      }
      if (!fileToSave) return;

      const formData = new FormData();
      formData.append("file", fileToSave);
      const res = await apiFetch(`${API_BASE}/save-signature`, {
        method: "POST",
        headers: { Authorization: `Bearer ${session.id_token}` },
        body: formData,
      });
      if (res.ok) {
        toast.success("Signature saved.");
        setHasSavedSignature(true);
        if (signatureMode === "draw" && drawnDataUrl) {
          setSignaturePreview(drawnDataUrl);
          clearDraw();
        } else {
          setSignatureFile(null);
        }
      } else {
        const err = await res.json();
        toast.error(err.detail ?? "Failed to save signature.");
      }
    } catch { toast.error("Server unreachable."); }
    finally { setSigLoading(false); }
  };

  const handleSignatureDelete = async () => {
    if (!session?.id_token) return;
    setSigLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/delete-signature`, {
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
    } catch { toast.error("Server unreachable."); }
    finally { setSigLoading(false); }
  };

  const handleAssessorNameSave = async () => {
    if (!session?.id_token) return;
    setAssessorNameLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/settings/assessor-name`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${session.id_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ assessor_name: assessorName }),
      });
      if (res.ok) {
        toast.success("Assessor name saved.");
        setAssessorNameDirty(false);
      } else {
        toast.error("Failed to save assessor name.");
      }
    } catch { toast.error("Server unreachable."); }
    finally { setAssessorNameLoading(false); }
  };

  const handleCredsSave = async () => {
    if (!session?.id_token) {
      toast.error("No ID Token found. Please log out and back in.");
      return;
    }
    setCredsLoading(true);
    try {
      const res = await apiFetch(`${API_BASE}/save-credentials`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.id_token}`,
        },
        body: JSON.stringify(creds),
      });
      if (res.ok) toast.success("Credentials saved!");
      else toast.error("Failed to save credentials.");
    } catch { toast.error("Server unreachable."); }
    finally { setCredsLoading(false); }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8 pb-16">
      <PageHeader
        title="Settings"
        description="Your assessor identity, signature and Bader credentials"
      />

      {/* ── Assessor identity ─────────────────────────────────────────────────── */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Assessor identity
        </h2>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Display Name</CardTitle>
            <CardDescription>
              Appears as the assessor name on all generated assessment sheets.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                value={assessorName}
                onChange={(e) => {
                  setAssessorName(e.target.value);
                  setAssessorNameDirty(true);
                }}
                placeholder="e.g. Sgt J. Bloggs"
                className="flex-1 max-w-sm"
              />
              <Button
                size="sm"
                onClick={handleAssessorNameSave}
                disabled={assessorNameLoading || !assessorName.trim() || !assessorNameDirty}
              >
                {assessorNameLoading ? "Saving…" : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Signature</CardTitle>
            <CardDescription>
              Embedded in assessment PDFs. Draw one below or upload an image.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Saved preview */}
            {hasSavedSignature && signaturePreview && !hasDrawn && !signatureFile && (
              <div className="relative w-fit overflow-hidden rounded-lg border bg-white p-4">
                <Badge
                  variant="outline"
                  className="absolute right-2 top-2 gap-1 border-success/40 bg-success/10 text-success"
                >
                  <CheckCircle2 className="size-3" /> Saved
                </Badge>
                <img src={signaturePreview} alt="Signature preview" className="max-h-20 object-contain" />
              </div>
            )}

            {/* Mode toggle */}
            <ToggleGroup
              type="single"
              variant="outline"
              size="sm"
              value={signatureMode}
              onValueChange={(v) => {
                if (!v) return;
                if (v === "draw") { setSignatureMode("draw"); setSignatureFile(null); }
                else { setSignatureMode("upload"); clearDraw(); }
              }}
            >
              <ToggleGroupItem value="draw">
                <PenLine /> Draw
              </ToggleGroupItem>
              <ToggleGroupItem value="upload">
                <Upload /> Upload
              </ToggleGroupItem>
            </ToggleGroup>

            {/* Draw mode */}
            {signatureMode === "draw" && (
              <div className="space-y-1.5">
                <div className="relative overflow-hidden rounded-md border bg-white">
                  <canvas
                    ref={canvasRef}
                    width={560}
                    height={120}
                    className="w-full cursor-crosshair touch-none"
                    style={{ height: "80px" }}
                  />
                  {!hasDrawn && (
                    <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
                      Sign here
                    </span>
                  )}
                </div>
                {hasDrawn && (
                  <button type="button" onClick={clearDraw} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive">
                    <RotateCcw className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
            )}

            {/* Upload mode */}
            {signatureMode === "upload" && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-8 text-sm text-muted-foreground transition-colors hover:border-primary/50 hover:bg-muted/30 hover:text-foreground"
              >
                <Upload className="h-6 w-6" />
                <span className="font-medium">{signatureFile ? signatureFile.name : "Click to upload signature"}</span>
                <span className="text-xs">PNG or JPEG · max 2 MB</span>
              </div>
            )}

            <input ref={fileInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={handleFileSelect} />

            {/* Actions */}
            <div className="flex gap-2">
              {(hasDrawn || signatureFile) && (
                <Button size="sm" onClick={handleSignatureSave} disabled={sigLoading}>
                  {sigLoading ? "Saving…" : "Save signature"}
                </Button>
              )}
              {hasSavedSignature && (
                <Button
                  variant="ghost" size="sm"
                  onClick={handleSignatureDelete} disabled={sigLoading}
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive ml-auto"
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Remove
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ── Bader credentials — staff only ────────────────────────────────────── */}
      {session?.role === "staff" && <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Bader credentials
        </h2>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Login Settings</CardTitle>
            <CardDescription>
              Used by the SMS scraper to log in to Bader on your behalf.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Role account */}
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-semibold">Role Account</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="role_user" className="text-xs">Username</Label>
                  <Input
                    id="role_user"
                    value={creds.role_user}
                    onChange={(e) => setCreds({ ...creds, role_user: e.target.value })}
                    placeholder="e.g. 317_adj"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="role_pass" className="text-xs">Password</Label>
                  <div className="relative">
                    <Input
                      id="role_pass"
                      type={showRolePass ? "text" : "password"}
                      value={creds.role_pass}
                      onChange={(e) => setCreds({ ...creds, role_pass: e.target.value })}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRolePass((v) => !v)}
                      className="absolute cursor-pointer right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showRolePass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Personal account */}
            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
              <p className="text-sm font-semibold">Personal Account</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="pers_user" className="text-xs">Username</Label>
                  <Input
                    id="pers_user"
                    value={creds.pers_user}
                    onChange={(e) => setCreds({ ...creds, pers_user: e.target.value })}
                    placeholder="e.g. j.bloggs100"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pers_pass" className="text-xs">Password</Label>
                  <div className="relative">
                    <Input
                      id="pers_pass"
                      type={showPersPass ? "text" : "password"}
                      value={creds.pers_pass}
                      onChange={(e) => setCreds({ ...creds, pers_pass: e.target.value })}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPersPass((v) => !v)}
                      className="absolute cursor-pointer right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPersPass ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <Button className="w-full" onClick={handleCredsSave} disabled={credsLoading || !session}>
              {credsLoading ? "Saving…" : "Save Credentials"}
            </Button>
          </CardContent>
        </Card>
      </section>}

    </div>
  );
}