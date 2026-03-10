import NextAuth from "next-auth"
import { authConfig } from "./auth.config"
import { google } from "googleapis"

const GROUP_EMAIL = "staff@317atc.co.uk"
const IMPERSONATE_EMAIL = "ci.mcdonald@317atc.co.uk"

async function isInStaffGroup(userEmail: string): Promise<boolean> {
  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY
        ?.replace(/^"|"$/g, "")      // strip surrounding quotes if present
        ?.replace(/\\n/g, "\n"),     // convert literal \n to real newlines
      scopes: ["https://www.googleapis.com/auth/admin.directory.group.member.readonly"],
      subject: IMPERSONATE_EMAIL,
    })

    const admin = google.admin({ version: "directory_v1", auth })
    await admin.members.get({ groupKey: GROUP_EMAIL, memberKey: userEmail })
    return true
  } catch (e: unknown) {
    console.error("[isInStaffGroup] error:", e)
    return false
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  ...authConfig,
  callbacks: {
    async jwt({ token, account }) {
      if (account) token.id_token = account.id_token
      return token
    },
    async session({ session, token }) {
      session.id_token = token.id_token as string
      return session
    },
    async signIn({ user }) {
      if (!user.email) return false
      return await isInStaffGroup(user.email)
    },
  },
})