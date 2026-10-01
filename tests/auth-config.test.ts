import { describe, expect, it, vi } from "vitest";

import { authConfig, DEV_USERS } from "@/auth.config";

type Authorized = (args: { auth: unknown; request: { nextUrl: URL } }) => boolean | Response;
const authorized = authConfig.callbacks!.authorized as unknown as Authorized;

function visit(path: string, auth: unknown) {
  const out = authorized({ auth, request: { nextUrl: new URL(`https://sms.test${path}`) } });
  return out instanceof Response ? `redirect:${new URL(out.headers.get("location")!).pathname}` : out;
}

const user = (role?: string) => ({ user: { email: "x@317atc.co.uk" }, role });

describe("middleware authorized()", () => {
  it("sends signed-out visitors to /login, and signed-in ones away from it", () => {
    expect(visit("/cadets", null)).toBe("redirect:/login");
    expect(visit("/", {})).toBe("redirect:/login");
    expect(visit("/login", null)).toBe(true);
    expect(visit("/login", user("staff"))).toBe("redirect:/");
  });

  it("sends a signed-in user with no role to /unauthorized, and lets them see it", () => {
    expect(visit("/", user())).toBe("redirect:/unauthorized");
    expect(visit("/unauthorized", user())).toBe(true);
  });

  it("applies the shared access rules", () => {
    expect(visit("/stores/uniform/stock", user("staff"))).toBe(true);
    expect(visit("/stores/uniform/stock", user("nco"))).toBe("redirect:/unauthorized");
    expect(visit("/assessments/inspection", user("snco"))).toBe(true);
    expect(visit("/assessments/inspection", user("nco"))).toBe("redirect:/unauthorized");
    expect(visit("/session-plans/3", user("nco"))).toBe(true);
  });
});

describe("session callback", () => {
  it("exposes only what the client needs", () => {
    const session = (authConfig.callbacks!.session as unknown as (a: unknown) => Record<string, unknown>)({
      session: { user: {} },
      token: { id_token: "t", role: "nco", error: undefined, refresh_token: "secret" },
    });
    expect(session).toEqual({ user: {}, id_token: "t", role: "nco", error: undefined });
  });
});

describe("config", () => {
  it("rolls the session for a year and re-signs hourly", () => {
    expect(authConfig.session?.maxAge).toBe(365 * 24 * 60 * 60);
    expect(authConfig.session?.updateAge).toBe(60 * 60);
  });

  it("namespaces every auth cookie and keeps them httpOnly", () => {
    for (const cookie of Object.values(authConfig.cookies ?? {})) {
      expect(cookie?.name?.startsWith("sms.")).toBe(true);
      expect(cookie?.options?.httpOnly).toBe(true);
    }
  });

  it("only offers the dev login when explicitly enabled", async () => {
    expect(authConfig.providers).toHaveLength(1);
    vi.stubEnv("AUTH_DEV_BYPASS", "1");
    vi.resetModules();
    const { authConfig: devConfig } = await import("@/auth.config");
    expect(devConfig.providers).toHaveLength(2);
  });

  it("dev accounts match the API's _dev_fake_email", () => {
    expect(DEV_USERS.staff.email).toBe("ci.mcdonald@317atc.co.uk");
    expect(DEV_USERS.snco.email).toBe("dev.snco@317atc.co.uk");
    expect(DEV_USERS.nco.email).toBe("dev.nco@317atc.co.uk");
  });
});
