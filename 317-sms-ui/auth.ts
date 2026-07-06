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

async function getUserRole(userEmail: string): Promise<"staff" | "nco" | null> {
  try {
    const admin = makeAdminClient()

    try {
      await admin.members.get({ groupKey: STAFF_GROUP, memberKey: userEmail })
      return "staff"
    } catch {}

    try {
      await admin.members.get({ groupKey: NCO_GROUP, memberKey: userEmail })
      return "nco"
    } catch {}

    return null
  } catch (e: unknown) {
    console.error("[getUserRole] error:", e)
    return null
  }
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
        token.role = (await getUserRole(user!.email!)) ?? undefined
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
        return {
          ...token,
          id_token: newIdToken,
          access_token: refreshed.access_token,
          expires_at: Math.floor(Date.now() / 1000) + refreshed.expires_in,
          refresh_token: refreshed.refresh_token ?? token.refresh_token,
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
      const role = await getUserRole(user.email)
      return role !== null
    },
  },
})
