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
 * @param force    Bypass the cooldown — for an explicit user click on
 *                 "sign in again", which should always be honoured. Implies
 *                 `consent`.
 * @param consent  Ask Google for the consent screen, the only thing that mints
 *                 a fresh refresh token. Needed when the grant we had is dead:
 *                 a silent re-auth returns no refresh token, so it would hand
 *                 back a session that strands itself again an hour later. The
 *                 cooldown still applies, so a consent screen that doesn't fix
 *                 anything can't become a loop. Ordinary expiry re-auths leave
 *                 this off and the user sees a redirect flicker, not a login.
 * @returns whether the page is now navigating to Google. `false` means we
 *          decided *not* to redirect, so the caller has to carry on and deal
 *          with its failed request itself.
 */
export async function reauth(
  callbackUrl = window.location.pathname,
  { force = false, consent = force }: { force?: boolean; consent?: boolean } = {}
): Promise<boolean> {
  if (isRedirecting) return true;

  if (!force && reauthAttemptedRecently()) {
    // Already went to Google and came back to the same 401 — stop circling.
    window.dispatchEvent(new Event(AUTH_LOOP_EVENT));
    return false;
  }

  isRedirecting = true;
  try {
    sessionStorage.setItem(REAUTH_MARK, String(Date.now()));
  } catch {
    // Best effort — the loop guard above already fails closed without it.
  }
  await signIn("google", { callbackUrl }, consent ? { prompt: "consent" } : {});
  return true;
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

  if (res.status === 401) {
    // Only hang when the page really is leaving — the promise below can never
    // settle. When reauth() declines to redirect we must return the 401 so the
    // caller fails normally; returning the dead promise there left every query
    // stuck loading until the user refreshed by hand.
    if (await reauth()) return new Promise<never>(() => {});
  }

  // The API accepted this token, so the last re-auth worked — reset the guard.
  if (res.ok) clearReauthMark();

  return res;
}
