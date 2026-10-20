"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/error-alert";
import { usePersonalDataHidden } from "@/lib/privacy";
import { apiFetch, errorDetail } from "@/lib/api-fetch";
import { saveResponseAsFile } from "@/lib/download";
import { recruitPdfPath, type PdfForm } from "@/lib/recruits";

/**
 * A filled 3822A or 3822H, shown inline the way the assessment sheets are. The
 * API draws it on request and needs the bearer token, so it's fetched into a
 * blob URL rather than linked.
 */
export function RecruitPdf({ id, form, fileLabel }: { id: number; form: PdfForm; fileLabel: string }) {
  const { data: session } = useSession();
  const token = session?.id_token;
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [personalHidden] = usePersonalDataHidden();

  useEffect(() => {
    if (!token) return;
    let objectUrl: string | null = null;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch(recruitPdfPath(id, form), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok)
          throw new Error(errorDetail(await res.json().catch(() => null)) ?? "Couldn't load the PDF.");
        objectUrl = URL.createObjectURL(await res.blob());
        if (!cancelled) setUrl(objectUrl);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Couldn't load the PDF.");
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [id, form, token]);

  async function download() {
    setSaving(true);
    try {
      const res = await apiFetch(recruitPdfPath(id, form), { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok)
        throw new Error(errorDetail(await res.json().catch(() => null)) ?? "Couldn't download the PDF.");
      await saveResponseAsFile(res, `${fileLabel}.pdf`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't download the PDF.");
    } finally {
      setSaving(false);
    }
  }

  if (error) return <ErrorAlert message={error} title="PDF unavailable" />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" onClick={download} disabled={saving}>
          <Download />
          {saving ? "Downloading…" : "Download PDF"}
        </Button>
      </div>
      {/* A drawn PDF can't be masked field by field, so it isn't shown at all. */}
      {personalHidden ? (
        <p className="text-muted-foreground py-8 text-sm italic">
          The form is hidden while personal data is hidden. Download it, or show personal data to preview it.
        </p>
      ) : url ? (
        <iframe
          src={url}
          className="w-full rounded-lg border"
          style={{ height: "min(900px, 75vh)" }}
          title={fileLabel}
        />
      ) : (
        <div className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
          <Loader2 className="size-4 animate-spin" /> Drawing the form…
        </div>
      )}
    </div>
  );
}
