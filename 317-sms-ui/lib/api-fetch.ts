import { signIn } from "next-auth/react";

import { API_OUTAGE_EVENT } from "@/components/api-status-overlay";

/**
 * Fired when a re-auth has already been tried and the API *still* rejects our
 * token. At that point bouncing through Google again can't help — the session
 * is fine, the backend just won't accept the id_token — so the UI shows a
 * manual "sign in again" prompt instead of looping.
 */
export const AUTH_LOOP_EVENT = "sms:auth-loop-detected";

// sessionStorage (not a module variable) because the re-auth is a full-page
// navigation to Google and back: anything held in memory is wiped by the time
// we're in a position to notice the redirect didn't help. sessionStorage is
// per-tab and survives navigations, so it's exactly the lifetime we want.
const REAUTH_MARK = "sms:reauth-started-at";

// A re-auth that hasn't fixed the 401 within this window isn't an expired
// token, it's a loop: Google just handed us a brand-new session and the API
// rejected it anyway. Long enough to cover the round trip through the consent
// screen, short enough that a genuine expiry an hour later still re-auths.
const REAUTH_COOLDOWN_MS = 3 * 60 * 1000;

let isRedirecting = false;

function reauthAttemptedRecently(): boolean {
  try {
    const at = Number(sessionStorage.getItem(REAUTH_MARK));
    return !!at && Date.now() - at < REAUTH_COOLDOWN_MS;
  } catch {
    // Storage blocked (private mode / third-party restrictions). Without a
    // durable marker we can't detect a loop, so treat it as "already tried"
    // and let the user re-auth by hand — a stuck badge beats a redirect loop.
    return true;
  }
}

/** Called after any authenticated request the API accepts, so the next genuine
 *  token expiry gets a fresh re-auth instead of hitting the cooldown. */
export function clearReauthMark() {
  try {
    sessionStorage.removeItem(REAUTH_MARK);
  } catch {
    // Nothing to clear if storage is unavailable.
  }
}

/**
 * Start a Google re-auth, at most once per page load *and* at most once per
 * cooldown window across page loads.
 *
 * The per-page-load guard stops two callers racing: a second signIn()
 * overwrites the `sms.state` cookie, so the first callback comes back with a
 * stale state and @auth/core throws InvalidCheck — which it masks as
 * `?error=Configuration`, even though the other flow logged the user in fine.
 *
 * The cooldown stops the worse failure: if the API keeps returning 401 for a
 * token Google is happily issuing (clock skew on the API host, a client-ID
 * mismatch, an id_token the backend can't verify), every page load fires
 * another signIn and the user is bounced through the consent screen forever.
 * Once that's detected we stop redirecting and let the UI ask for a manual
 * sign-in instead.
 *
 * @param force  Bypass the cooldown — for an explicit user click on
 *               "sign in again", which should always be honoured.
 */
export async function reauth(
  callbackUrl = window.location.pathname,
  { force = false }: { force?: boolean } = {}
): Promise<never> {
  if (!isRedirecting) {
    if (!force && reauthAttemptedRecently()) {
      // Already went to Google and came back to the same 401 — stop circling.
      isRedirecting = true; // suppress further attempts this page load too
      window.dispatchEvent(new Event(AUTH_LOOP_EVENT));
      return new Promise<never>(() => {});
    }
    isRedirecting = true;
    try {
      sessionStorage.setItem(REAUTH_MARK, String(Date.now()));
    } catch {
      // Best effort — the loop guard above already fails closed without it.
    }
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

  // The API accepted this token, so the last re-auth worked — reset the guard.
  if (res.ok) clearReauthMark();

  return res;
}
