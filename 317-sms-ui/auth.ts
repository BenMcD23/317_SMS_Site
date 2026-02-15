import NextAuth from "next-auth"
import Google from "next-auth/providers/google"

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [Google],
  callbacks: {
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
        "tyrell.v@317atc.co.uk"
      ];
      if (user.email && allowedEmails.includes(user.email)) {
        return true;
      }
      return false; // Access denied for anyone else
    },
  },
})