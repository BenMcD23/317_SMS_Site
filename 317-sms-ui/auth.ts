import NextAuth from "next-auth"
import { authConfig, withFreshTokens } from "./auth.config"
import { google } from "googleapis"

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

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  session: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, account, user }) {
      if (account) {
        // ponytail: dev-only fake session (AUTH_DEV_BYPASS=1); skips Google
        // role lookup and token refresh. Backend accepts the matching
        // dev-fake-token only when its own DEV_FAKE_AUTH=1 flag is set.
        if (account.provider === "credentials") {
          return {
            ...token,
            // DEV_FAKE_ROLE=nco/snco to browse as that role; defaults to staff.
            role: (process.env.DEV_FAKE_ROLE || "staff") as "staff" | "snco" | "nco",
            id_token: "dev-fake-token",
            expires_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          }
        }
        // Only id_token is ever sent to the API. Storing access_token too
        // pushed the encrypted cookie past 4096 bytes, so Auth.js chunked it
        // into sms.session-token.0/.1 — and stale chunks from an earlier login
        // shadow a later unchunked cookie, breaking the session permanently.
        token.id_token = account.id_token
        token.refresh_token = account.refresh_token
        token.expires_at = account.expires_at
        try {
          token.role = (await getUserRole(user!.email!)) ?? undefined
        } catch (e) {
          console.error("[jwt] role lookup failed:", e)
          token.role = undefined
        }
        return token
      }

      const fresh = await withFreshTokens(token)
      if (fresh.expires_at === token.expires_at || fresh.error) return fresh

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
