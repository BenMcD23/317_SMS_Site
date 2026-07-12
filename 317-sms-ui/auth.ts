import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { google } from "googleapis"

const STAFF_GROUP = "staff@317atc.co.uk"
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
async function getUserRole(userEmail: string): Promise<"staff" | "nco" | null> {
  const admin = makeAdminClient()
  if (await isGroupMember(admin, STAFF_GROUP, userEmail)) return "staff"
  if (await isGroupMember(admin, NCO_GROUP, userEmail)) return "nco"
  return null
}

function getIdTokenExp(idToken: string): number {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString())
    return payload.exp ?? 0
  } catch {
    return 0
  }
}

async function refreshGoogleToken(refreshToken: string) {
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
  if (!res.ok) throw new Error("Token refresh failed")
  return res.json()
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  session: {
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async jwt({ token, account, user }) {
      if (account) {
        // ponytail: dev-only fake session (AUTH_DEV_BYPASS=1); skips Google
        // role lookup and token refresh. Backend accepts the matching
        // dev-fake-token only when its own DEV_FAKE_AUTH=1 flag is set.
        if (account.provider === "credentials") {
          return {
            ...token,
            role: "staff" as const,
            id_token: "dev-fake-token",
            expires_at: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          }
        }
        token.id_token = account.id_token
        token.access_token = account.access_token
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

      const now = Math.floor(Date.now() / 1000)
      if ((token.expires_at as number) > now + 300) return token

      if (!token.refresh_token) return { ...token, error: "RefreshTokenMissing" }

      try {
        const refreshed = await refreshGoogleToken(token.refresh_token as string)
        const newIdToken = refreshed.id_token ?? token.id_token
        if (!refreshed.id_token && getIdTokenExp(newIdToken as string) < now + 60) {
          return { ...token, error: "RefreshAccessTokenError" }
        }
        // Re-check group membership on each refresh (~hourly) so someone
        // removed from staff/NCO loses access promptly instead of keeping
        // their role for the rest of the 30-day session. If the lookup
        // itself fails, keep the current role rather than locking them out.
        let role = token.role
        try {
          role = (await getUserRole(token.email as string)) ?? undefined
        } catch (e) {
          console.error("[jwt] role re-check failed, keeping existing role:", e)
        }
        return {
          ...token,
          id_token: newIdToken,
          access_token: refreshed.access_token,
          expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in,
          refresh_token: refreshed.refresh_token ?? token.refresh_token,
          role,
          error: undefined,
        }
      } catch (e) {
        console.error("[jwt] Token refresh failed:", e)
        return { ...token, error: "RefreshAccessTokenError" }
      }
    },
    async session({ session, token }) {
      session.id_token = token.id_token as string
      session.role = token.role
      if (token.error) session.error = token.error as string
      return session
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
