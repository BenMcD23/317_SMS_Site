/// <reference types="vite/client" />
// Every app/api route handler is a thin proxy (see CLAUDE.md). This imports
// each one, calls every exported method with placeholder params, and pins the
// backend path and method it forwards to — so a renamed folder, a typo'd
// template string or a missed `await params` fails here, not in production.
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const proxied: { kind: "json" | "raw"; path: string; init?: { method?: string; body?: unknown } }[] = [];
vi.mock("@/lib/api-proxy", () => ({
  proxyToApi: async (p: string, init?: { method?: string; body?: unknown }) => {
    proxied.push({ kind: "json", path: p, init });
    return new Response("{}");
  },
  proxyToApiRaw: async (p: string) => {
    proxied.push({ kind: "raw", path: p });
    return new Response("");
  },
}));

// Not proxies: NextAuth's own handlers, and the status probe (tested separately).
const NOT_PROXIES = new Set(["auth/[...nextauth]", "status"]);

type RouteModule = Record<
  string,
  (req: NextRequest, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>
>;
const MODULES = import.meta.glob<RouteModule>("../app/api/**/route.ts");
const load = (route: string) => MODULES[`../app/api/${route}/route.ts`]();

const ROUTES = Object.keys(MODULES)
  .map((file) => file.slice("../app/api/".length, -"/route.ts".length))
  .filter((route) => !NOT_PROXIES.has(route))
  .sort();

// Folder params a route deliberately doesn't forward. Keep this short and
// explained — anything else unused is a bug.
const UNUSED_PARAMS: Record<string, string[]> = {
  // The backend deletes an issuance by its own id; the CIN is only in the URL
  // so the folder sits under the cadet it belongs to.
  "stores/issuances/[cin]/[issuanceId]": ["cin"],
};

const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

beforeEach(() => {
  proxied.length = 0;
});

describe("app/api route handlers", () => {
  it("finds the routes", () => {
    expect(ROUTES.length).toBeGreaterThan(40);
  });

  it.each(ROUTES)("%s forwards to the backend", async (route) => {
    const mod = await load(route);
    const params = Object.fromEntries(
      [...route.matchAll(/\[([A-Za-z]+)\]/g)].map(([, name]) => [name, `<${name}>`])
    );
    const exported = METHODS.filter((m) => typeof mod[m] === "function");
    expect(exported.length, "route exports no handlers").toBeGreaterThan(0);

    for (const method of exported) {
      proxied.length = 0;
      const url = `http://localhost/api/${route}`;
      const hasBody = !["GET", "DELETE"].includes(method);
      const req = new NextRequest(url, {
        method,
        ...(hasBody
          ? { body: JSON.stringify({ probe: true }), headers: { "Content-Type": "application/json" } }
          : {}),
      });
      await mod[method](req, { params: Promise.resolve(params) });

      expect(proxied, `${method} ${route} should proxy exactly once`).toHaveLength(1);
      const call = proxied[0];
      // Every [param] in the folder made it into the backend path.
      for (const [name, value] of Object.entries(params)) {
        if (!UNUSED_PARAMS[route]?.includes(name)) expect(call.path).toContain(value);
      }
      expect(call.path).not.toMatch(/undefined|\[|\]|\$\{/);
      expect(call.path.startsWith("/")).toBe(true);
      // The method forwarded matches the one handled (raw proxies are GET-only).
      if (call.kind === "json") expect(call.init?.method ?? "GET").toBe(method);
      else expect(method).toBe("GET");
      // A handler that reads the body forwards it untouched.
      if (call.init?.body !== undefined) expect(call.init.body).toEqual({ probe: true });
    }
  });

  it("forwards the register type for an attendance night, encoded", async () => {
    const mod = await load("attendance/nights/[date]");
    await mod.GET(
      new NextRequest("http://localhost/api/attendance/nights/2026-01-07?registerType=Parade Night&x=1"),
      {
        params: Promise.resolve({ date: "2026-01-07" }),
      }
    );
    expect(proxied[0].path).toBe("/attendance/nights/2026-01-07?registerType=Parade%20Night");
    proxied.length = 0;
    await mod.GET(new NextRequest("http://localhost/api/attendance/nights/2026-01-07"), {
      params: Promise.resolve({ date: "2026-01-07" }),
    });
    expect(proxied[0].path).toBe("/attendance/nights/2026-01-07");
  });

  it("matches the pinned list of backend routes", async () => {
    const table: string[] = [];
    for (const route of ROUTES) {
      const mod = await load(route);
      const params = Object.fromEntries([...route.matchAll(/\[([A-Za-z]+)\]/g)].map(([, n]) => [n, `:${n}`]));
      for (const method of METHODS.filter((m) => typeof mod[m] === "function")) {
        proxied.length = 0;
        const hasBody = !["GET", "DELETE"].includes(method);
        await mod[method](
          new NextRequest(`http://localhost/api/${route}`, { method, ...(hasBody ? { body: "{}" } : {}) }),
          { params: Promise.resolve(params) }
        );
        table.push(`${method} /api/${route} -> ${proxied[0].kind === "raw" ? "RAW " : ""}${proxied[0].path}`);
      }
    }
    expect(table).toMatchSnapshot();
  });
});
