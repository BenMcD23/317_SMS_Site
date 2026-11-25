"use client";

import { useEffect, useRef, useState } from "react";
import { CameraOff } from "lucide-react";

import { Button } from "@317/ui-common/components/ui/button";
import { ErrorAlert } from "@317/ui-common/components/error-alert";
import { createDetector } from "@/lib/barcode";

// Fast enough that a barcode held up reads at once, slow enough to leave a
// phone's CPU for the video itself.
const SCAN_EVERY_MS = 200;

/**
 * The back camera, reading barcodes until it's closed. Every code seen is
 * passed up as it's read, every frame it's in view: the caller decides what
 * counts (a stock number) and ignores repeats.
 *
 * Kept apart from the Book in page so a second scanning page (issuing kit)
 * can reuse it.
 */
export function BarcodeScanner({
  onDetected,
  onClose,
}: {
  onDetected: (rawValue: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  // The latest callback, without restarting the camera when it changes.
  const detectedRef = useRef(onDetected);
  useEffect(() => {
    detectedRef.current = onDetected;
  }, [onDetected]);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("This browser can't use the camera here. Type the stock number instead.");
        setStarting(false);
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        const blocked =
          e instanceof DOMException && (e.name === "NotAllowedError" || e.name === "SecurityError");
        setError(
          blocked
            ? "The camera is blocked for this site. Allow it in your browser's settings, or type the stock number."
            : "Couldn't start the camera. Type the stock number instead."
        );
        setStarting(false);
        return;
      }
      if (stopped) return;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        // Autoplay refused: muted inline video normally isn't, and frames
        // still reach the reader once it starts.
      }

      let detector;
      try {
        detector = await createDetector();
      } catch {
        setError("Couldn't load the barcode reader. Type the stock number instead.");
        setStarting(false);
        return;
      }
      setStarting(false);

      const tick = async () => {
        if (stopped) return;
        if (video.readyState >= 2) {
          try {
            for (const code of await detector.detect(video)) detectedRef.current(code.rawValue);
          } catch {
            // A frame that couldn't be read; the next one will be.
          }
        }
        timer = setTimeout(tick, SCAN_EVERY_MS);
      };
      tick();
    }

    start();
    return () => {
      stopped = true;
      clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="flex flex-col gap-3">
      <ErrorAlert message={error} />
      {!error && (
        <div className="bg-muted relative aspect-[4/3] w-full overflow-hidden rounded-lg border">
          <video
            ref={videoRef}
            className="size-full object-cover"
            muted
            playsInline
            aria-label="Camera view: hold a barcode up to it"
          />
          {/* Where to hold the barcode: the reader looks at the whole frame,
              this only helps people aim. */}
          <div
            aria-hidden
            className="border-primary-foreground/80 pointer-events-none absolute inset-x-[10%] top-1/2 h-1/3 -translate-y-1/2 rounded-md border-2"
          />
          {starting && (
            <p className="text-muted-foreground absolute inset-0 grid place-items-center text-sm">
              Starting the camera…
            </p>
          )}
        </div>
      )}
      <Button type="button" variant="outline" className="h-10 self-start" onClick={onClose}>
        <CameraOff data-icon="inline-start" />
        Stop scanning
      </Button>
    </div>
  );
}
