"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * Static QR codes, drawn in the browser. Shared by the lesson check-in codes
 * and the recruitment-evening sign-up code so both look the same and download
 * at the same size.
 */

// Big enough to stay sharp on a projected slide or a printed poster.
const DOWNLOAD_PX = 1024;

/** The QR drawn as an SVG image; a skeleton while it renders. */
export function QrImage({ url, alt, className }: { url: string; alt: string; className?: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(null));
    return () => {
      live = false;
    };
  }, [url]);
  if (!svg) return <Skeleton className={cn("aspect-square w-full", className)} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a data: URI, nothing for next/image to optimise
    <img
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      alt={alt}
      className={cn("aspect-square w-full rounded-md bg-white p-1.5", className)}
    />
  );
}

/** Save the code as a PNG. False when the browser couldn't make the image. */
export async function downloadQr(url: string, fileName: string): Promise<boolean> {
  try {
    const href = await QRCode.toDataURL(url, { width: DOWNLOAD_PX, margin: 2, errorCorrectionLevel: "M" });
    const a = document.createElement("a");
    a.href = href;
    a.download = fileName;
    a.click();
    return true;
  } catch {
    return false;
  }
}
