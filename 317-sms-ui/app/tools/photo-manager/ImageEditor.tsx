"use client";

import { useCallback, useEffect, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Check, RefreshCw, Sparkles, X, ZoomIn } from "lucide-react";
import { getCroppedWebp } from "@/lib/image-utils";

// Portrait crop to match the 3:4 photo cards on the cadet website.
const ASPECT = 3 / 4;

export function ImageEditor({
  initialSrc,
  onCancel,
  onApply,
}: {
  initialSrc: string;
  onCancel: () => void;
  onApply: (blob: Blob, previewUrl: string) => void;
}) {
  const [imageSrc, setImageSrc] = useState(initialSrc);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [removingBg, setRemovingBg] = useState(false);
  const [applying, setApplying] = useState(false);
  const [bgRemoved, setBgRemoved] = useState(false);

  // Revoke any object URL we created (the bg-removed image) on unmount/replace.
  useEffect(() => {
    return () => {
      if (imageSrc !== initialSrc) URL.revokeObjectURL(imageSrc);
    };
  }, [imageSrc, initialSrc]);

  const onCropComplete = useCallback((_: Area, areaPixels: Area) => {
    setCroppedAreaPixels(areaPixels);
  }, []);

  const handleRemoveBackground = async () => {
    setRemovingBg(true);
    try {
      // Loaded lazily so the (large) model bundle isn't pulled into the page
      // until someone actually removes a background.
      const { removeBackground } = await import("@imgly/background-removal");
      const blob = await removeBackground(imageSrc);
      const url = URL.createObjectURL(blob);
      setImageSrc((prev) => {
        if (prev !== initialSrc) URL.revokeObjectURL(prev);
        return url;
      });
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setBgRemoved(true);
      toast.success("Background removed");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Background removal failed");
    } finally {
      setRemovingBg(false);
    }
  };

  const handleApply = async () => {
    if (!croppedAreaPixels) return;
    setApplying(true);
    try {
      const blob = await getCroppedWebp(imageSrc, croppedAreaPixels);
      onApply(blob, URL.createObjectURL(blob));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not crop image");
    } finally {
      setApplying(false);
    }
  };

  const busy = removingBg || applying;

  return (
    <div className="space-y-4">
      {/* Crop surface — checkerboard shows through transparent areas */}
      <div
        className="relative h-72 w-full overflow-hidden rounded-lg border"
        style={{
          backgroundImage:
            "linear-gradient(45deg,#e5e7eb 25%,transparent 25%),linear-gradient(-45deg,#e5e7eb 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#e5e7eb 75%),linear-gradient(-45deg,transparent 75%,#e5e7eb 75%)",
          backgroundSize: "16px 16px",
          backgroundPosition: "0 0,0 8px,8px -8px,-8px 0",
        }}
      >
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={ASPECT}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onCropComplete}
          restrictPosition={false}
        />
      </div>

      {/* Zoom */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ZoomIn className="h-3.5 w-3.5" /> Zoom
        </Label>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="w-full accent-primary"
          disabled={busy}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={handleRemoveBackground}
          disabled={busy}
        >
          {removingBg ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          {bgRemoved ? "Remove background again" : "Remove background"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Drag to reposition · scroll or use the slider to zoom
        </span>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={busy}>
          <X className="mr-1.5 h-4 w-4" /> Cancel
        </Button>
        <Button type="button" size="sm" onClick={handleApply} disabled={busy || !croppedAreaPixels}>
          {applying ? (
            <RefreshCw className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Check className="mr-1.5 h-4 w-4" />
          )}
          Use this photo
        </Button>
      </div>
    </div>
  );
}
