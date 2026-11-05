"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Download, ExternalLink, Link2, Lock, LockOpen } from "lucide-react";
import { toast } from "sonner";

import { ErrorAlert } from "@/components/error-alert";
import { downloadQr, QrImage } from "@/components/qr-code";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/confirm-dialog";
import { copyText } from "@/lib/clipboard";
import { setSignupOpen, SIGNUP_KEY, type SignupState } from "@/lib/recruits";
import { useApiQuery, useSetApiQueryData } from "@/lib/use-api-query";

const QR_FILE = "317-recruit-sign-up.png";

/**
 * The recruitment-evening sign-up page, from the staff side: one switch to
 * open it on the night, and the QR code parents scan. The code never changes,
 * so it can be printed once and used every evening; scanned while shut, it
 * says sign-ups aren't open.
 */
export function SignupPanel() {
  const { data: session } = useSession();
  const { data, isLoading, error } = useApiQuery<SignupState>(SIGNUP_KEY, "/recruits/sign-up");
  const setData = useSetApiQueryData<SignupState>(SIGNUP_KEY);
  const [busy, setBusy] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  // An error body ({detail}) where the state should be is treated as unknown.
  const state = data && typeof data.url === "string" ? data : null;

  async function flip(open: boolean) {
    if (!session?.id_token) return;
    setBusy(true);
    try {
      const next = await setSignupOpen(session.id_token, open);
      setData(() => next);
      toast.success(open ? "Sign-up page open until midnight." : "Sign-up page closed.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "That didn't work.");
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    if (await copyText(url)) toast.success("Link copied.");
    else toast.error("Couldn't copy — the link is under the code.");
  }

  async function download(url: string) {
    if (!(await downloadQr(url, QR_FILE))) toast.error("Couldn't make the image.");
  }

  return (
    <section aria-labelledby="sign-up-heading" className="rounded-lg border">
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id="sign-up-heading" className="font-semibold">
              Recruitment evening sign-up
            </h2>
            {state && (
              <Badge
                variant="outline"
                className={
                  state.open ? "border-success/40 bg-success/10 text-success" : "text-muted-foreground"
                }
              >
                {state.open ? <LockOpen /> : <Lock />}
                {state.open ? "Open" : "Closed"}
              </Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm">
            {state?.open
              ? "Parents can scan the code and sign their child up now. Each one is added below and emailed their joining-form link. It closes itself at midnight."
              : "Parents scan the code to sign their child up instead of filling in the sheet. Open it on the night: it closes itself at midnight, and until then the code just says sign-ups aren't open."}
          </p>

          <ErrorAlert message={error?.message ?? null} title="Couldn't load the sign-up page" />

          {isLoading ? (
            <Skeleton className="h-9 w-48" />
          ) : (
            state && (
              <div className="flex flex-wrap gap-2">
                {state.open ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() =>
                      confirm(
                        "Close the sign-up page? Parents who scan the code won't be able to sign up.",
                        () => flip(false)
                      )
                    }
                  >
                    <Lock />
                    Close sign-up
                  </Button>
                ) : (
                  <Button disabled={busy} onClick={() => flip(true)}>
                    <LockOpen />
                    Open sign-up
                  </Button>
                )}
                <Button variant="outline" onClick={() => download(state.url)}>
                  <Download />
                  Download QR code
                </Button>
                <Button variant="ghost" onClick={() => copy(state.url)}>
                  <Link2 />
                  Copy link
                </Button>
              </div>
            )
          )}
        </div>

        {state && (
          <div className="flex flex-col items-center gap-1.5 self-center sm:self-start">
            <a
              href={state.url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open the sign-up page"
              className="focus-visible:ring-ring/50 block size-36 rounded-md outline-none focus-visible:ring-[3px]"
            >
              <QrImage url={state.url} alt="QR code for the recruit sign-up page" />
            </a>
            <a
              href={state.url}
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground inline-flex items-center gap-1 text-xs break-all hover:underline"
            >
              {state.url.replace(/^https?:\/\//, "")}
              <ExternalLink className="size-3 shrink-0" />
            </a>
          </div>
        )}
      </div>
      {confirmDialog}
    </section>
  );
}
