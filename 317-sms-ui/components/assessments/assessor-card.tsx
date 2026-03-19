"use client";

import { useRef, useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle2, RotateCcw, Pencil, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

// ─── Signature section ────────────────────────────────────────────────────────
function SignatureSection({
  savedSignatureUrl,
  onOverride,
  overrideSignature,
  onClearOverride,
  showDraw,
  onSetShowDraw,
}: {
  savedSignatureUrl: string | null;
  onOverride: (dataUrl: string | null) => void;
  overrideSignature: string | null;
  onClearOverride: () => void;
  showDraw: boolean;
  onSetShowDraw: (v: boolean) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) return {
      x: (e.touches[0].clientX - rect.left) * scaleX,
      y: (e.touches[0].clientY - rect.top) * scaleY,
    };
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  useEffect(() => {
    if (!showDraw && savedSignatureUrl) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 1.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    const start = (e: MouseEvent | TouchEvent) => { drawing.current = true; const p = getPos(e, canvas); ctx.beginPath(); ctx.moveTo(p.x, p.y); e.preventDefault(); };
    const move = (e: MouseEvent | TouchEvent) => { if (!drawing.current) return; const p = getPos(e, canvas); ctx.lineTo(p.x, p.y); ctx.stroke(); e.preventDefault(); };
    const stop = () => { if (!drawing.current) return; drawing.current = false; setHasDrawn(true); onOverride(canvas.toDataURL()); };

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
  }, [showDraw, onOverride]);

  const clearDraw = () => {
    const canvas = canvasRef.current;
    if (canvas) canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
    onOverride(null);
  };

  if (savedSignatureUrl && !showDraw) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex-1 overflow-hidden rounded-md border bg-white p-2">
            <img src={savedSignatureUrl} alt="Saved signature" className="max-h-16 object-contain" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Badge variant="secondary" className="gap-1 whitespace-nowrap text-[11px]">
              <CheckCircle2 className="h-3 w-3 text-green-600" />
              From account
            </Badge>
            <button
              type="button"
              onClick={() => onSetShowDraw(true)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3 w-3" />
              Draw instead
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {savedSignatureUrl && showDraw && (
        <button
          type="button"
          onClick={() => { onSetShowDraw(false); setHasDrawn(false); onClearOverride(); }}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          ← Use saved signature
        </button>
      )}
      <div className="relative overflow-hidden rounded-md border bg-white">
        <canvas
          ref={canvasRef}
          width={560}
          height={80}
          className="w-full cursor-crosshair touch-none"
        />
        {!hasDrawn && !overrideSignature && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">
            Sign here
          </span>
        )}
      </div>
      {hasDrawn && (
        <button
          type="button"
          onClick={clearDraw}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
        >
          <RotateCcw className="h-3 w-3" /> Clear
        </button>
      )}
      {!savedSignatureUrl && (
        <p className="text-xs text-muted-foreground">
          Save a signature in{" "}
          <Link href="/settings" className="underline hover:text-foreground">Settings</Link>{" "}
          to auto-fill this next time.
        </p>
      )}
    </div>
  );
}

// ─── Assessor card ────────────────────────────────────────────────────────────
export type AssessorCardProps = {
  assessorName: string;
  onAssessorNameChange: (v: string) => void;
  date: string;
  onDateChange: (v: string) => void;
  showNameFromAccount: boolean;
  // Signature
  sigLoading: boolean;
  savedSignatureUrl: string | null;
  overrideSignature: string | null;
  onOverrideSignature: (v: string | null) => void;
  showDraw: boolean;
  onSetShowDraw: (v: boolean) => void;
};

export function AssessorCard({
  assessorName,
  onAssessorNameChange,
  date,
  onDateChange,
  showNameFromAccount,
  sigLoading,
  savedSignatureUrl,
  overrideSignature,
  onOverrideSignature,
  showDraw,
  onSetShowDraw,
}: AssessorCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Assessor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="assessorName">
              Name
              {showNameFromAccount && (
                <span className="ml-2 text-[11px] font-normal text-muted-foreground">(from account)</span>
              )}
            </Label>
            <Input
              id="assessorName"
              placeholder="Assessor full name"
              value={assessorName}
              onChange={(e) => onAssessorNameChange(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="date">Date</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => onDateChange(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Signature</Label>
          {sigLoading ? (
            <div className="flex h-14 items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading signature…
            </div>
          ) : (
            <SignatureSection
              savedSignatureUrl={savedSignatureUrl}
              onOverride={onOverrideSignature}
              overrideSignature={overrideSignature}
              onClearOverride={() => onOverrideSignature(null)}
              showDraw={showDraw}
              onSetShowDraw={onSetShowDraw}
            />
          )}
        </div>

        {!sigLoading && !savedSignatureUrl && !overrideSignature && (
          <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            No signature - You can draw above or save one in{" "}
            <Link href="/settings" className="underline">Settings</Link>.
          </div>
        )}
      </CardContent>
    </Card>
  );
}