import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── proxy.ts (middleware) ─────────────────────────────────────────────────────

let middlewareResponse: Response;
vi.mock("next-auth", () => ({
  default: () => ({ auth: async () => middlewareResponse }),
}));

describe("middleware proxy", () => {
  it("never lets middleware re-sign the session cookie, but keeps other cookies and headers", async () => {
    const headers = new Headers({ location: "/login", "x-extra": "1" });
    headers.append("set-cookie", "sms.session-token=OLD; Path=/; HttpOnly");
    headers.append("set-cookie", "sms.callback-url=%2F; Path=/");
    headers.append("set-cookie", "sms.session-token.0=chunk; Path=/");
    middlewareResponse = new Response("body", { status: 307, statusText: "Temporary Redirect", headers });

    const { default: proxy } = await import("@/proxy");
    const res = await proxy(new NextRequest("https://sms.test/cadets"), {} as never);

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/login");
    expect(res.headers.get("x-extra")).toBe("1");
    const cookies = res.headers.getSetCookie();
    expect(cookies).toContain("sms.callback-url=%2F; Path=/");
    expect(cookies.some((c) => c.startsWith("sms.session-token="))).toBe(false);
    // A chunk is a different cookie name and passes through untouched.
    expect(cookies).toContain("sms.session-token.0=chunk; Path=/");
    expect(await res.text()).toBe("body");
  });

  it("runs on pages but never on API routes, Next internals or images", async () => {
    const { config } = await import("@/proxy");
    const matcher = new RegExp(`^${config.matcher[0]}$`);
    for (const path of ["/", "/cadets", "/api-logs", "/stores/uniform/stock"])
      expect(matcher.test(path)).toBe(true);
    for (const path of [
      "/api/status",
      "/api/auth/session",
      "/_next/static/x.js",
      "/favicon.ico",
      "/logo.png",
    ]) {
      expect(matcher.test(path)).toBe(false);
    }
  });
});

// ── app/api/status ────────────────────────────────────────────────────────────

describe("/api/status", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  const load = async () => (await import("@/app/api/status/route")).GET;

  it("is 200 when the API's /readyz is, and never cached by the browser", async () => {
    const fetchMock = vi.fn<(...args: unknown[]) => Promise<Response>>(
      async () => new Response("{}", { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await (await load())();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/\/readyz$/);
  });

  it("distinguishes a not-ready API from an unreachable one", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 503 }))
    );
    let res = await (await load())();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, reason: "not-ready" });

    vi.resetModules();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("fetch failed")))
    );
    res = await (await load())();
    expect(await res.json()).toEqual({ ok: false, reason: "unreachable" });
  });

  it("reuses a healthy answer briefly but re-probes every failure", async () => {
    const GET = await load();
    const ok = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", ok);
    await GET();
    await GET();
    expect(ok).toHaveBeenCalledOnce();

    vi.resetModules();
    const GET2 = await load();
    const down = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", down);
    await GET2();
    await GET2();
    expect(down).toHaveBeenCalledTimes(2);
  });

  it("concurrent checks share one probe", async () => {
    const GET = await load();
    let release!: () => void;
    const fetchMock = vi.fn(
      () => new Promise<Response>((resolve) => (release = () => resolve(new Response("{}", { status: 503 }))))
    );
    vi.stubGlobal("fetch", fetchMock);
    const all = Promise.all([GET(), GET(), GET()]);
    await Promise.resolve();
    release();
    const results = await all;
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(results.every((r) => r.status === 503)).toBe(true);
  });
});
