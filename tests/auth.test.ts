// auth.ts — who may sign in, how roles are looked up, and how a session's
// Google tokens are kept alive. NextAuth and googleapis are replaced so the
// callbacks can be driven directly.
import { beforeEach, describe, expect, it, vi } from "vitest";

type Callbacks = {
  jwt: (args: Record<string, unknown>) => Promise<Record<string, unknown>>;
  signIn: (args: Record<string, unknown>) => Promise<boolean>;
};
let config: { callbacks: Callbacks };

vi.mock("next-auth", () => ({
  default: (cfg: { callbacks: Callbacks }) => {
    config = cfg;
    return { handlers: {}, signIn: vi.fn(), signOut: vi.fn(), auth: vi.fn() };
  },
}));

// Group membership: email -> set of group keys. A group not listed is a 404.
let membership: Record<string, string[]> = {};
let lookupError: unknown = null;
vi.mock("googleapis", () => ({
  google: {
    auth: { JWT: class {} },
    admin: () => ({
      members: {
        get: async ({ groupKey, memberKey }: { groupKey: string; memberKey: string }) => {
          if (lookupError) throw lookupError;
          if (membership[memberKey]?.includes(groupKey)) return {};
          throw Object.assign(new Error("Not Found"), { code: 404 });
        },
      },
    }),
  },
}));

const now = () => Math.floor(Date.now() / 1000);
const idToken = (exp: number) => `h.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.sig`;

async function load() {
  vi.resetModules();
  await import("@/auth");
  return config.callbacks;
}

let googleToken: ReturnType<typeof vi.fn>;
function googleAnswers(...responses: (() => Response)[]) {
  googleToken = vi.fn(async () => (responses.length > 1 ? responses.shift()! : responses[0])());
  vi.stubGlobal("fetch", googleToken);
}

beforeEach(() => {
  membership = { "staff@317atc.co.uk": ["staff@317atc.co.uk"], "nco@317atc.co.uk": ["ncoteam@317atc.co.uk"] };
  lookupError = null;
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubEnv("GOOGLE_CLIENT_ID", "cid");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret");
});

describe("signIn", () => {
  it("admits members of any role group and refuses everyone else", async () => {
    const cb = await load();
    membership["snco@317atc.co.uk"] = ["snco@317atc.co.uk"];
    expect(await cb.signIn({ user: { email: "staff@317atc.co.uk" }, account: { provider: "google" } })).toBe(
      true
    );
    expect(await cb.signIn({ user: { email: "snco@317atc.co.uk" }, account: { provider: "google" } })).toBe(
      true
    );
    expect(await cb.signIn({ user: { email: "nco@317atc.co.uk" }, account: { provider: "google" } })).toBe(
      true
    );
    expect(await cb.signIn({ user: { email: "parent@gmail.com" }, account: { provider: "google" } })).toBe(
      false
    );
    expect(await cb.signIn({ user: {}, account: { provider: "google" } })).toBe(false);
  });

  it("refuses when the group lookup itself fails, rather than guessing", async () => {
    const cb = await load();
    lookupError = Object.assign(new Error("quota"), { code: 429 });
    expect(await cb.signIn({ user: { email: "staff@317atc.co.uk" }, account: { provider: "google" } })).toBe(
      false
    );
  });

  it("lets the dev bypass straight through", async () => {
    const cb = await load();
    expect(await cb.signIn({ user: {}, account: { provider: "credentials" } })).toBe(true);
  });
});

describe("jwt on sign-in", () => {
  it("keeps only the id_token, its own expiry and the role", async () => {
    const cb = await load();
    const exp = now() + 3600;
    const token = await cb.jwt({
      token: { email: "staff@317atc.co.uk" },
      account: {
        provider: "google",
        id_token: idToken(exp),
        refresh_token: "r1",
        access_token: "a",
        expires_at: 1,
      },
      user: { email: "staff@317atc.co.uk" },
    });
    expect(token).toMatchObject({
      id_token: idToken(exp),
      refresh_token: "r1",
      expires_at: exp,
      role: "staff",
    });
    expect(token).not.toHaveProperty("access_token");
    expect(token.error).toBeUndefined();
  });

  it("a silent re-auth without a refresh token keeps the one already held", async () => {
    const cb = await load();
    const token = await cb.jwt({
      token: { refresh_token: "kept", error: "RefreshAccessTokenError" },
      account: { provider: "google", id_token: idToken(now() + 3600) },
      user: { email: "nco@317atc.co.uk" },
    });
    expect(token.refresh_token).toBe("kept");
    expect(token.role).toBe("nco");
    expect(token.error).toBeUndefined();
  });

  it("an unreadable id_token falls back to the account's expiry", async () => {
    const cb = await load();
    const token = await cb.jwt({
      token: {},
      account: { provider: "google", id_token: "not-a-jwt", expires_at: 12345 },
      user: { email: "staff@317atc.co.uk" },
    });
    expect(token.expires_at).toBe(12345);
  });

  it("a failed role lookup leaves the role empty instead of failing the sign-in", async () => {
    const cb = await load();
    lookupError = new Error("network");
    const token = await cb.jwt({
      token: {},
      account: { provider: "google", id_token: idToken(now() + 3600) },
      user: { email: "staff@317atc.co.uk" },
    });
    expect(token.role).toBeUndefined();
  });

  it("the dev bypass gets a role-suffixed fake token that outlives the session", async () => {
    const cb = await load();
    const token = await cb.jwt({
      token: {},
      account: { provider: "credentials" },
      user: { email: "dev.snco@317atc.co.uk" },
    });
    expect(token).toMatchObject({ role: "snco", id_token: "dev-fake-token:snco" });
    expect(token.expires_at as number).toBeGreaterThan(now() + 365 * 24 * 3600);
  });
});

describe("jwt renewal", () => {
  const fresh =
    (exp = now() + 3600, extra: Record<string, unknown> = {}) =>
    () =>
      new Response(JSON.stringify({ id_token: idToken(exp), ...extra }), { status: 200 });

  it("leaves a token with plenty of life alone — same object, no Google call", async () => {
    const cb = await load();
    googleAnswers(fresh());
    const token = {
      email: "staff@317atc.co.uk",
      expires_at: now() + 3000,
      refresh_token: "r",
      role: "staff",
    };
    expect(await cb.jwt({ token })).toBe(token);
    expect(googleToken).not.toHaveBeenCalled();
  });

  it("renews near expiry, re-checks the role, and keeps the refresh token Google didn't resend", async () => {
    const cb = await load();
    const exp = now() + 3600;
    googleAnswers(fresh(exp));
    membership["staff@317atc.co.uk"] = []; // removed from staff since signing in
    membership["nco2@317atc.co.uk"] = [];
    const token = await cb.jwt({
      token: {
        email: "staff@317atc.co.uk",
        expires_at: now() + 120,
        refresh_token: "r",
        role: "staff",
        id_token: "old",
      },
    });
    expect(token).toMatchObject({ id_token: idToken(exp), expires_at: exp, refresh_token: "r" });
    expect(token.role).toBeUndefined();
    const body = googleToken.mock.calls[0][1].body as URLSearchParams;
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("r");
  });

  it("keeps the existing role when the re-check can't reach Google", async () => {
    const cb = await load();
    googleAnswers(fresh());
    lookupError = new Error("directory down");
    const token = await cb.jwt({
      token: { email: "staff@317atc.co.uk", expires_at: now() + 120, refresh_token: "r2", role: "staff" },
    });
    expect(token.role).toBe("staff");
  });

  it("a blip while the token still works stays invisible to the user", async () => {
    const cb = await load();
    googleAnswers(() => new Response("backend error", { status: 503 }));
    const token = { email: "s", expires_at: now() + 300, refresh_token: "r3", role: "staff" };
    expect(await cb.jwt({ token })).toBe(token);
  });

  it("a blip after the token has died is reported as retryable", async () => {
    const cb = await load();
    googleAnswers(() => new Response("backend error", { status: 503 }));
    const token = await cb.jwt({ token: { email: "s", expires_at: now() - 10, refresh_token: "r4" } });
    expect(token.error).toBe("RefreshAccessTokenError");
    expect(token.refresh_token).toBe("r4");
  });

  it("a dead grant drops the refresh token and asks for a consent sign-in", async () => {
    const cb = await load();
    googleAnswers(() => new Response('{"error":"invalid_grant"}', { status: 400 }));
    const token = await cb.jwt({ token: { email: "s", expires_at: now() + 300, refresh_token: "r5" } });
    expect(token.error).toBe("RefreshTokenExpired");
    expect(token.refresh_token).toBeUndefined();
  });

  it("with no refresh token, the session lasts exactly as long as the id_token", async () => {
    const cb = await load();
    googleAnswers(fresh());
    const usable = { expires_at: now() + 300 };
    expect(await cb.jwt({ token: usable })).toBe(usable);
    expect((await cb.jwt({ token: { expires_at: now() + 30 } })).error).toBe("RefreshTokenExpired");
    expect(googleToken).not.toHaveBeenCalled();
  });

  it("keeps the current id_token when Google sends none, unless it's already stale", async () => {
    const cb = await load();
    const current = idToken(now() + 300);
    googleAnswers(() => new Response(JSON.stringify({ access_token: "a" }), { status: 200 }));
    const kept = await cb.jwt({
      token: { email: "s", expires_at: now() + 120, refresh_token: "r6", id_token: current },
    });
    // Five minutes left is plenty, so the current id_token is carried forward.
    expect(kept.id_token).toBe(current);

    const stale = idToken(now() + 30);
    const cb2 = await load();
    googleAnswers(() => new Response(JSON.stringify({}), { status: 200 }));
    const out = await cb2.jwt({
      token: { email: "s", expires_at: now() + 120, refresh_token: "r7", id_token: stale },
    });
    // Google's answer would leave a token with under a minute to live, so the
    // renewal fails — but the session hasn't died yet, so it stays quiet.
    expect(out.id_token).toBe(stale);
    expect(out.error).toBeUndefined();
  });

  it("parallel requests share one renewal", async () => {
    const cb = await load();
    googleAnswers(fresh());
    const token = () => ({
      email: "staff@317atc.co.uk",
      expires_at: now() + 120,
      refresh_token: "shared",
      role: "staff",
    });
    await Promise.all([cb.jwt({ token: token() }), cb.jwt({ token: token() }), cb.jwt({ token: token() })]);
    expect(googleToken).toHaveBeenCalledOnce();
  });

  it("a failed renewal backs off instead of hitting Google on every request", async () => {
    const cb = await load();
    googleAnswers(() => new Response("err", { status: 500 }));
    const token = () => ({ email: "s", expires_at: now() + 300, refresh_token: "backoff" });
    await cb.jwt({ token: token() });
    await cb.jwt({ token: token() });
    expect(googleToken).toHaveBeenCalledOnce();
  });
});
