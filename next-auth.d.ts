import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    id_token?: string;
    role?: "staff" | "snco" | "nco";
    error?: string;
    user: {
      id?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id_token?: string;
    refresh_token?: string;
    expires_at?: number;
    role?: "staff" | "snco" | "nco";
    error?: string;
  }
}
