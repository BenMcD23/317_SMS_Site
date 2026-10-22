"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { AlertTriangle } from "lucide-react";

import { API_OUTAGE_EVENT } from "@/components/api-status-overlay";
import { AUTH_LOOP_EVENT, clearReauthMark, reauth } from "@/lib/api-fetch";
import { API_BASE } from "@/lib/config";

export type ApiStatus = "checking" | "ok" | "auth-error";

/**
 * Confirms, once per session change, that the API accepts our token.
 *
 * A 401 usually means the id_token expired, and one re-auth fixes it; if that
 * has just been tried, `reauth()` declines and fires AUTH_LOOP_EVENT, which
 * turns into the "sign in again" badge instead of another lap through Google.
 * A 403 is an account outside the Workspace, which no re-auth can fix.
 *
 * Any other failure isn't a token problem, and one failed request from the
 * browser can't tell an API outage from a flaky connection — so it's handed to
 * the API-down overlay to confirm rather than shown here as "API offline".
 */
export function useApiStatus(): ApiStatus {
  const { data: session } = useSession();
  const [status, setStatus] = useState<ApiStatus>("checking");

  useEffect(() => {
    const onLoop = () => setStatus("auth-error");
    window.addEventListener(AUTH_LOOP_EVENT, onLoop);
    return () => window.removeEventListener(AUTH_LOOP_EVENT, onLoop);
  }, []);

  const token = session?.id_token;
  const sessionError = session?.error;

  useEffect(() => {
    if (!token) return;

    // The server couldn't renew this token, so it's already dead — don't spend
    // a request proving it. RefreshTokenExpired means only the consent screen
    // can mint a new grant; a silent re-auth would strand the session again.
    if (sessionError) {
      void reauth(window.location.pathname, { consent: sessionError === "RefreshTokenExpired" });
      return;
    }

    let cancelled = false;
    fetch(`${API_BASE}/health`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setStatus("ok");
          clearReauthMark();
        } else if (res.status === 401) {
          void reauth("/");
        } else if (res.status === 403) {
          setStatus("auth-error");
        } else {
          window.dispatchEvent(new Event(API_OUTAGE_EVENT));
        }
      })
      .catch(() => {
        if (!cancelled) window.dispatchEvent(new Event(API_OUTAGE_EVENT));
      });
    return () => {
      cancelled = true;
    };
  }, [token, sessionError]);

  return status;
}

export function ApiStatusBadge({ status }: { status: ApiStatus }) {
  if (status !== "auth-error") return null;

  return (
    <div
      role="status"
      className="bg-warning/15 text-warning flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium"
    >
      <AlertTriangle className="size-3.5" />
      <span className="hidden sm:inline">Session expired —&nbsp;</span>
      <button
        type="button"
        // force: an explicit click is always honoured, even inside the
        // cooldown that stops automatic re-auth from looping.
        onClick={() => void reauth(window.location.pathname, { force: true })}
        className="underline underline-offset-2"
      >
        sign in again
      </button>
    </div>
  );
}
