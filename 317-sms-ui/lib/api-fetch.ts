import { signIn } from "next-auth/react";

import { API_OUTAGE_EVENT } from "@/components/api-status-overlay";

let isRedirecting = false;

/**
 * Start a Google re-auth, at most once per page load. Shared by every caller so
 * two of them can't race: a second signIn() overwrites the `sms.state` cookie,
 * so the first callback comes back with a stale state and @auth/core throws
 * InvalidCheck — which it masks as `?error=Configuration`, even though the
 * other flow logged the user in fine.
 */
export async function reauth(callbackUrl = window.location.pathname): Promise<never> {
  if (!isRedirecting) {
    isRedirecting = true;
    await signIn("google", { callbackUrl });
  }
  // Never resolves — the page is navigating away.
  return new Promise<never>(() => {});
}

function flagPossibleOutage() {
  window.dispatchEvent(new Event(API_OUTAGE_EVENT));
}

export async function apiFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (e) {
    // Network-level failure — likely the API is down; tell the overlay.
    flagPossibleOutage();
    throw e;
  }
  if ([502, 503, 504].includes(res.status)) flagPossibleOutage();

  if (res.status === 401) return reauth();

  return res;
}