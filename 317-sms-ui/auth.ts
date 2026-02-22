import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // 1. When the user signs in, the 'account' object contains the id_token
      if (account) {
        token.id_token = account.id_token
      }
      return token
    },
    async session({ session, token }) {
      // 2. Pass the id_token from the JWT into the session object for the frontend
      session.id_token = token.id_token as string
      return session
    },

    async signIn({ user }) {
      const allowedEmails = [
        "ci.gill.jl@317atc.co.uk",
        "fs.gill@317atc.co.uk",
        "ci.boxall@317atc.co.uk",
        "ci.catterall@317atc.co.uk",
        "ci.mcdonald@317atc.co.uk",
        "ci.stone@317atc.co.uk",
        "fg.off.barker@317atc.co.uk",
        "flt.lt.doherty@317atc.co.uk",
        "sgt.lloydmorris@317atc.co.uk",
        "sgt.macgregor@317atc.co.uk",
        "si.quick@317atc.co.uk",
        "tyrell.v@317atc.co.uk",
      ];
      return !!(user.email && allowedEmails.includes(user.email));
    },

    // --- ADD THESE TWO CALLBACKS ---
    
    },
})