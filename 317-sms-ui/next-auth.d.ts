import NextAuth, { DefaultSession } from "next-auth"
import { JWT } from "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    id_token?: string;
    role?: "staff" | "nco";
    error?: string;
    user: {
      id?: string;
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id_token?: string;
    access_token?: string;
    refresh_token?: string;
    expires_at?: number;
    role?: "staff" | "nco";
    error?: string;
  }
}