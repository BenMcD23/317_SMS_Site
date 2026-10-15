"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Download, Link2, QrCode, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { ErrorAlert } from "@/components/error-alert";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { copyText } from "@/lib/clipboard";
import { categoriesOf, lessonLabel, lessonUrl, qrFileName, THEORY_KEYS, type LessonCode } from "@/lib/theory";
import { useApiQuery } from "@/lib/use-api-query";
import { cn } from "@/lib/utils";

// Big enough to stay sharp on a projected slide.
const DOWNLOAD_PX = 1024;

/** The QR drawn as an SVG image; empty while it renders. */
function QrImage({ url, alt }: { url: string; alt: string }) {
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
  if (!svg) return <Skeleton className="aspect-square w-full" />;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a data: URI, nothing for next/image to optimise
    <img
      src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
      alt={alt}
      className="aspect-square w-full rounded-md bg-white p-1.5"
    />
  );
}

function LessonQr({ lesson, url }: { lesson: LessonCode; url: string }) {
  const label = lessonLabel(lesson, lesson.part);
  const alt = `QR code for ${lesson.name} ${label}`;

  async function download() {
    try {
      const href = await QRCode.toDataURL(url, { width: DOWNLOAD_PX, margin: 2, errorCorrectionLevel: "M" });
      const a = document.createElement("a");
      a.href = href;
      a.download = qrFileName(lesson, lesson.part);
      a.click();
    } catch {
      toast.error("Couldn't make the image.");
    }
  }

  async function copy() {
    if (await copyText(url)) toast.success("Link copied.");
    else toast.error("Couldn't copy — the link is under the code.");
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <QrImage url={url} alt={alt} />
      <p className="text-sm font-medium">{label}</p>
      <div className="flex gap-1">
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={download}
          aria-label={`Download ${alt}`}
        >
          <Download className="size-4" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          onClick={copy}
          aria-label={`Copy link for ${lesson.name} ${label}`}
        >
          <Link2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/**
 * Every lesson's check-in QR, to put on its slides. A cadet scans it, signs in
 * to the cadet portal, and the lesson is recorded against them. The codes
 * never change, so slides made once keep working.
 */
export function LessonQrCodes() {
  const { data, isLoading, error } = useApiQuery<LessonCode[]>(THEORY_KEYS.codes, "/cadets/theory/qr-codes", {
    staleTime: Infinity,
  });
  const codes = Array.isArray(data) ? data : [];
  const categories = categoriesOf(codes);
  const [picked, setPicked] = useState<string | null>(null);
  const category = picked ?? categories[0] ?? "";

  if (!lessonUrl("x")) {
    return (
      <Alert>
        <TriangleAlert />
        <AlertTitle>The cadet portal&apos;s address isn&apos;t set</AlertTitle>
        <AlertDescription>
          Set NEXT_PUBLIC_PORTAL_URL to the portal&apos;s address (e.g. https://portal.example.com) in the
          site&apos;s environment and redeploy. The codes would otherwise point nowhere.
        </AlertDescription>
      </Alert>
    );
  }

  // One card per subject, its lessons side by side.
  const subjects = [...new Map(codes.filter((c) => c.category === category).map((c) => [c.key, c])).values()];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Subjects"
          value={category}
          onValueChange={(v) => v && setPicked(v)}
        >
          {categories.map((c) => (
            <ToggleGroupItem key={c} value={c} className="px-3">
              {c}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
          <QrCode className="size-3.5" />
          Put each on its lesson&apos;s slides. They never change.
        </p>
      </div>

      <ErrorAlert message={error?.message} title="Couldn't load the codes" />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[0, 1].map((i) => (
            <Skeleton key={i} className="h-64" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {subjects.map((s) => (
            <Card key={s.key} className="gap-0 py-0">
              <CardHeader className="px-4 py-3">
                <CardTitle className="text-base">
                  <h3>{s.name}</h3>
                </CardTitle>
              </CardHeader>
              <CardContent
                className={cn(
                  "grid gap-3 border-t px-4 py-4",
                  // Badge theory is one code; keep it the size a lesson's would be.
                  s.parts === 1 ? "mx-auto w-1/2 grid-cols-1" : "grid-cols-3"
                )}
              >
                {codes
                  .filter((c) => c.key === s.key)
                  .map((lesson) => (
                    <LessonQr key={lesson.part} lesson={lesson} url={lessonUrl(lesson.code)!} />
                  ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
