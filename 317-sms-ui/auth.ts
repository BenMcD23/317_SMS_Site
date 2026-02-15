import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  callbacks: {
    // This part is CRITICAL: It locks the site to ONLY your email
    async signIn({ user }) {
      const allowedEmails = ["ci.mcdonald@317atc.co.uk"];
      if (user.email && allowedEmails.includes(user.email)) {
        return true;
      }
      return false; // Access denied for anyone else
    },
  },
})