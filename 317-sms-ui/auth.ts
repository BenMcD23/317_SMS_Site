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

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    async jwt({ token, account, user }) {
      if (account) {
        token.id_token = account.id_token
        token.role = (await getUserRole(user!.email!)) ?? undefined
      }
      return token
    },
    async session({ session, token }) {
      session.id_token = token.id_token as string
      session.role = token.role
      return session
    },
    async signIn({ user }) {
      if (!user.email) return false
      const role = await getUserRole(user.email)
      return role !== null
    },
  },
})
