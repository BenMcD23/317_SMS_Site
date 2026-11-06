"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Download, Link2, QrCode, RefreshCw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";

import { useConfirm } from "@/components/confirm-dialog";
import { ErrorAlert } from "@/components/error-alert";
import { downloadQr, QrImage } from "@/components/qr-code";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@/components/responsive-dialog";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { copyText } from "@/lib/clipboard";
import { checkInUrl, newCheckInCode, type CheckInCode } from "@/lib/check-ins";
import { formatDate } from "@/lib/format";
import { useApiQuery, useSetApiQueryData } from "@/lib/use-api-query";

const KEY = ["check-ins", "code"] as const;

function CodeBody() {
  const { data: session } = useSession();
  const token = session?.id_token;
  const [making, setMaking] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const portalSet = !!checkInUrl("x");
  // No portal address, no code worth fetching: it couldn't be printed.
  const codeQuery = useApiQuery<CheckInCode>(KEY, "/check-ins/code", { enabled: portalSet });
  const setCode = useSetApiQueryData<CheckInCode>(KEY);

  if (!portalSet) {
    return (
      <Alert>
        <TriangleAlert />
        <AlertTitle>The cadet portal&apos;s address isn&apos;t set</AlertTitle>
        <AlertDescription>
          Set NEXT_PUBLIC_PORTAL_URL to the portal&apos;s address in the site&apos;s environment and redeploy.
          The code would otherwise point nowhere.
        </AlertDescription>
      </Alert>
    );
  }
  if (codeQuery.isPending) return <Skeleton className="mx-auto aspect-square w-full max-w-64" />;
  const code = codeQuery.data;
  if (codeQuery.isError || typeof code?.code !== "string") {
    return <ErrorAlert message={codeQuery.error?.message ?? "The code didn't load."} />;
  }
  const url = checkInUrl(code.code)!;

  async function copy() {
    if (await copyText(url)) toast.success("Link copied.");
    else toast.error("Couldn't copy — the link is under the code.");
  }

  async function download() {
    if (!(await downloadQr(url, "squadron-check-in.png"))) toast.error("Couldn't make the image.");
  }

  function replace() {
    confirm(
      "Make a new code? Every printed QR code and NFC tag stops working until you replace it.",
      async () => {
        if (!token) return;
        setMaking(true);
        try {
          const next = await newCheckInCode(token);
          setCode(() => next);
          toast.success("New code made. Print it and rewrite the NFC tag.");
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "Couldn't make a new code.");
          codeQuery.refetch();
        } finally {
          setMaking(false);
        }
      }
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <QrImage url={url} alt="QR code for checking in tonight" className="mx-auto max-w-64" />
      <p className="text-muted-foreground text-center text-xs break-all">{url}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="outline" className="h-9" onClick={download}>
          <Download />
          Download QR code
        </Button>
        <Button variant="outline" className="h-9" onClick={copy}>
          <Link2 />
          Copy link for an NFC tag
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
        <p className="text-muted-foreground text-xs">
          Made {formatDate(code.changed_at)}
          {code.changed_by ? ` by ${code.changed_by}` : ""}. Make a new one if it&apos;s been shared about.
        </p>
        <Button variant="ghost" className="h-9" disabled={making} onClick={replace}>
          <RefreshCw />
          New code
        </Button>
      </div>
      {confirmDialog}
    </div>
  );
}

/**
 * The squadron's check-in code (staff only): the QR code to print by the door
 * and the link to write onto an NFC tag. Both open the portal's
 * /check-in/<code>. One code serves every night, so staff make a new one if a
 * cadet shares it around.
 */
export function DoorCode() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" className="h-9" onClick={() => setOpen(true)}>
        <QrCode />
        QR code and NFC
      </Button>
      <ResponsiveDialog open={open} onOpenChange={setOpen}>
        <ResponsiveDialogContent className="sm:max-w-md">
          <ResponsiveDialogHeader>
            <ResponsiveDialogTitle>Check-in code</ResponsiveDialogTitle>
            <ResponsiveDialogDescription>
              Print the QR code for the door, or write the link onto an NFC tag. Cadets scan or tap it with
              their phone to check in.
            </ResponsiveDialogDescription>
          </ResponsiveDialogHeader>
          {open && <CodeBody />}
        </ResponsiveDialogContent>
      </ResponsiveDialog>
    </>
  );
}
