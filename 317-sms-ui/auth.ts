import NextAuth from "next-auth"
import type { JWT } from "next-auth/jwt"
import { authConfig, DEV_USERS, type DevRole } from "./auth.config"
import { google } from "googleapis"

// The client sends the raw Google id_token to the API, and Google only issues
// those with a 1-hour life — that ceiling is Google's, not ours, so the only
// thing that keeps someone signed in for months is the refresh token behind it.
// Renew with this much headroom left so a token handed to the browser stays
// valid until the next session refetch (5 minutes, see
// components/providers.tsx) — otherwise the API 401s and the UI bounces the
// user through Google again. The headroom doubles as retry budget: a renewal
// that fails on a blip gets many more attempts before anything actually dies.
const REFRESH_MARGIN_S = 10 * 60

// The API allows 60s of clock skew either way (core/security.py CLOCK_SKEW_S),
// so an id_token is worth sending until this close to its own `exp`. Below that
// we stop pretending the session still works and surface an error.
const ID_TOKEN_GRACE_S = 60

// How long a failed or in-flight renewal is reused before we call Google
// again. Long enough to collapse the burst of parallel requests one page makes,
// short enough that a blip doesn't strand the session.
const REUSE_FLOOR_S = 30

const STAFF_GROUP = "staff@317atc.co.uk"
const SNCO_GROUP = "snco@317atc.co.uk"
const NCO_GROUP = "ncoteam@317atc.co.uk"
const IMPERSONATE_EMAIL = "ci.mcdonald@317atc.co.uk"

function makeAdminClient() {
  const auth = new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
      ?.replace(/^"|"$/g, "")
      ?.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/admin.directory.group.member.readonly"],
    subject: IMPERSONATE_EMAIL,
  })
  return google.admin({ version: "directory_v1", auth })
}

async function isGroupMember(
  admin: ReturnType<typeof makeAdminClient>,
  group: string,
  userEmail: string
): Promise<boolean> {
  try {
    await admin.members.get({ groupKey: group, memberKey: userEmail })
    return true
  } catch (e: unknown) {
    const err = e as { code?: number | string; response?: { status?: number } }
    const status = Number(err.code ?? err.response?.status)
    // 404 = definitively not a member. Anything else (network, quota, auth)
    // means the lookup itself failed — propagate so callers can tell
    // "no role" apart from "couldn't check".
    if (status === 404) return false
    throw e
  }
}

/** Role from Workspace group membership. Throws if the lookup itself fails. */
async function getUserRole(userEmail: string): Promise<"staff" | "snco" | "nco" | null> {
  const admin = makeAdminClient()
  if (await isGroupMember(admin, STAFF_GROUP, userEmail)) return "staff"
  if (await isGroupMember(admin, SNCO_GROUP, userEmail)) return "snco"
  if (await isGroupMember(admin, NCO_GROUP, userEmail)) return "nco"
  return null
}

function idTokenExp(idToken: string): number {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString())
    return payload.exp ?? 0
  } catch {
    return 0
  }
}

type FreshTokens = { id_token: string; expires_at: number; refresh_token: string }

/**
 * The refresh grant is gone for good — revoked, expired, or superseded. Only a
 * consent-screen sign-in mints a replacement, so this is the one renewal
 * failure that has to reach the user; everything else is retried in the
 * background where they never see it.
 */
class RefreshGrantDeadError extends Error {}

/**
 * Renewals already asked for, keyed by the refresh token that started them.
 *
 * `auth()` inside a route handler can't persist a Set-Cookie, so proxyToApi
 * re-runs the whole jwt callback for every API call a page makes. Without this
 * each of those would fire its own POST to Google, and a single page could open
 * a dozen renewals of the same session at once.
 */
const renewals = new Map<string, { promise: Promise<FreshTokens>; reuseUntil: number }>()

async function requestTokens(refreshToken: string, currentIdToken?: string): Promise<FreshTokens> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  })
  if (!res.ok) {
    // Google puts the reason in the body (invalid_grant = the refresh token was
    // revoked, expired or replaced). Without it a renewal failure is
    // indistinguishable from any other, and the user just gets bounced to
    // Google with no trace of why.
    const detail = await res.text().catch(() => "")
    // Split the one unrecoverable failure from every retryable one. A dead
    // grant can only be replaced at the consent screen; a 5xx, a timeout or a
    // quota blip is not a dead session and must not cost the user a login.
    if (detail.includes("invalid_grant")) {
      throw new RefreshGrantDeadError(`Refresh token rejected: ${res.status} ${detail}`)
    }
    throw new Error(`Token refresh failed: ${res.status} ${detail}`)
  }
  const refreshed = await res.json()

  // Google normally returns a fresh id_token alongside the access token; if it
  // didn't, the one we already hold has to carry us to the next renewal.
  const idToken: string | undefined = refreshed.id_token ?? currentIdToken
  if (!idToken) throw new Error("Token refresh returned no id_token")

  // Expire on the id_token's own `exp`, not the access token's `expires_in`:
  // the id_token is the credential the API checks, so that's the clock that
  // decides when the session is stale. Falling back to expires_in would also
  // quietly produce NaN whenever Google omits it.
  const now = Math.floor(Date.now() / 1000)
  const expiresAt = idTokenExp(idToken)
  if (expiresAt < now + 60) throw new Error("Token refresh produced a stale id_token")

  return {
    id_token: idToken,
    expires_at: expiresAt,
    refresh_token: refreshed.refresh_token ?? refreshToken,
  }
}

function renewTokens(refreshToken: string, currentIdToken?: string): Promise<FreshTokens> {
  const now = Math.floor(Date.now() / 1000)
  const existing = renewals.get(refreshToken)
  if (existing && now < existing.reuseUntil) return existing.promise

  const entry = { promise: requestTokens(refreshToken, currentIdToken), reuseUntil: now + REUSE_FLOOR_S }
  renewals.set(refreshToken, entry)
  entry.promise
    .then((fresh) => {
      // Hold the result until it's the one going stale, so the next renewal is
      // driven by the token's life rather than by request volume.
      entry.reuseUntil = Math.max(fresh.expires_at - REFRESH_MARGIN_S, entry.reuseUntil)
    })
    // A failure keeps REUSE_FLOOR_S of backoff instead of retrying per request.
    .catch(() => {})

  for (const [key, value] of renewals) {
    if (value !== entry && now >= value.reuseUntil) renewals.delete(key)
  }
  return entry.promise
}

/**
 * Renew the Google tokens once they're within REFRESH_MARGIN_S of expiry.
 *
 * Only ever reports an error the client should act on. While the id_token we
 * already hold is still usable, a failed renewal is kept quiet and retried on
 * the next session read: the client treats `session.error` as "this session is
 * dead" and redirects to Google, so raising it for a transient blip charges the
 * user a login for a problem that would have cleared itself.
 */
async function withFreshTokens(token: JWT): Promise<JWT> {
  const now = Math.floor(Date.now() / 1000)
  if ((token.expires_at ?? 0) > now + REFRESH_MARGIN_S) return token

  // Still inside the token's real life — a failure here costs nothing yet.
  const stillUsable = (token.expires_at ?? 0) > now + ID_TOKEN_GRACE_S

  if (!token.refresh_token) {
    // Nothing to renew with, so this session ends when the id_token does. Say
    // so only once it actually has: RefreshTokenExpired asks the client for a
    // consent-screen sign-in, which is the only thing that mints a new grant.
    return stillUsable ? token : { ...token, error: "RefreshTokenExpired" }
  }

  try {
    const fresh = await renewTokens(token.refresh_token, token.id_token)
    return { ...token, ...fresh, error: undefined }
  } catch (e) {
    if (e instanceof RefreshGrantDeadError) {
      console.error("[jwt] refresh token no longer valid:", e)
      // Drop the dead grant rather than replaying it against Google every
      // session read, and ask the client for a consent-screen sign-in.
      return { ...token, refresh_token: undefined, error: "RefreshTokenExpired" }
    }
    console.error("[jwt] token refresh failed, will retry:", e)
    return stillUsable ? token : { ...token, error: "RefreshAccessTokenError" }
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  // `session` (and everything else) comes from authConfig, so middleware and
  // the Node routes agree on how long a session lasts.
  ...authConfig,
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account, user }) {
      if (account) {
        // ponytail: dev-only fake session (AUTH_DEV_BYPASS=1); skips Google
        // role lookup and token refresh. Backend accepts the matching
        // dev-fake-token only when its own DEV_FAKE_AUTH=1 flag is set.
        if (account.provider === "credentials") {
          // The login page picks the role; the account it signed in as is what
          // names it, and the API derives the same role from the token suffix.
          const role = (Object.keys(DEV_USERS) as DevRole[]).find(
            (r) => DEV_USERS[r].email === user?.email
          ) ?? "staff"
          return {
            ...token,
            role,
            id_token: `dev-fake-token:${role}`,
            // No Google behind it to renew from, so just outlive the session.
            expires_at: Math.floor(Date.now() / 1000) + 366 * 24 * 60 * 60,
          }
        }
        // Only id_token is ever sent to the API. Storing access_token too
        // pushed the encrypted cookie past 4096 bytes, so Auth.js chunked it
        // into sms.session-token.0/.1 — and stale chunks from an earlier login
        // shadow a later unchunked cookie, breaking the session permanently.
        token.id_token = account.id_token
        // Google returns a refresh_token only on a consent-granting sign-in.
        // Every silent re-auth after that comes back without one, so assigning
        // it blindly overwrote the only credential that can renew the session —
        // and the user was back at Google an hour later, then every hour after
        // that. Keep the grant we already hold unless Google sends a new one.
        token.refresh_token = account.refresh_token ?? token.refresh_token
        // The id_token's own `exp`, matching what the renewal path stores: the
        // id_token is what the API checks, and account.expires_at describes the
        // access token, which we neither send nor keep.
        token.expires_at =
          (account.id_token ? idTokenExp(account.id_token) : 0) || account.expires_at
        // A fresh sign-in clears whatever went wrong with the previous one.
        token.error = undefined
        try {
          token.role = (await getUserRole(user!.email!)) ?? undefined
        } catch (e) {
          console.error("[jwt] role lookup failed:", e)
          token.role = undefined
        }
        return token
      }

      const fresh = await withFreshTokens(token)
      // Identity, not expires_at: withFreshTokens hands back the very same
      // object when nothing needed renewing.
      if (fresh === token || fresh.error) return fresh

      // We actually refreshed (~hourly), so re-check group membership: someone
      // removed from staff/NCO loses access promptly instead of keeping their
      // role for the rest of the 30-day session. If the lookup itself fails,
      // keep the current role rather than locking them out.
      try {
        fresh.role = (await getUserRole(fresh.email as string)) ?? undefined
      } catch (e) {
        console.error("[jwt] role re-check failed, keeping existing role:", e)
      }
      return fresh
    },
    async signIn({ user, account }) {
      if (account?.provider === "credentials") return true // dev bypass only
      if (!user.email) return false
      try {
        return (await getUserRole(user.email)) !== null
      } catch (e) {
        console.error("[signIn] role lookup failed:", e)
        return false
      }
    },
  },
})
