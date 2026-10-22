import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.fn();
vi.mock("@/auth", () => ({ auth: () => auth() }));

import { API_BASE } from "@/lib/config";
import { proxyToApi, proxyToApiRaw } from "@/lib/api-proxy";

beforeEach(() => {
  auth.mockResolvedValue({ id_token: "tok" });
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const backend = (res: Response | (() => Response) | Error) => {
  const fn = vi.fn<(...args: unknown[]) => Promise<Response>>(async () => {
    if (res instanceof Error) throw res;
    return typeof res === "function" ? res() : res;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
};

describe("proxyToApi", () => {
  it("refuses without a session token rather than forwarding anonymously", async () => {
    const fetchMock = backend(new Response("{}"));
    for (const session of [null, {}, { error: "RefreshTokenExpired" }]) {
      auth.mockResolvedValueOnce(session);
      const res = await proxyToApi("/cadets");
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Not authenticated" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards method, bearer token and JSON body", async () => {
    const fetchMock = backend(new Response(JSON.stringify({ id: 1 }), { status: 201 }));
    const res = await proxyToApi("/stores/orders", { method: "POST", body: { items: [] } });
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: 1 });
    expect(fetchMock).toHaveBeenCalledWith(`${API_BASE}/stores/orders`, {
      method: "POST",
      headers: { Authorization: "Bearer tok", "Content-Type": "application/json" },
      body: '{"items":[]}',
    });
  });

  it("sends no body or content type on a GET", async () => {
    const fetchMock = backend(new Response("[]"));
    await proxyToApi("/cadets");
    expect(fetchMock.mock.calls[0][1]).toEqual({
      method: "GET",
      headers: { Authorization: "Bearer tok" },
      body: undefined,
    });
  });

  it("forwards a falsy body (0, false, empty string) rather than dropping it", async () => {
    const fetchMock = backend(() => new Response("{}"));
    await proxyToApi("/x", { method: "POST", body: false });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ body: "false" });
  });

  it("passes the backend's error status and detail straight through", async () => {
    backend(new Response(JSON.stringify({ detail: "Box already exists" }), { status: 400 }));
    const res = await proxyToApi("/stores/structure", { method: "POST", body: {} });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ detail: "Box already exists" });
  });

  it("keeps a 204 empty", async () => {
    backend(new Response(null, { status: 204 }));
    const res = await proxyToApi("/stores/orders/1", { method: "DELETE" });
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("turns a non-JSON body into an error object with the status kept", async () => {
    backend(new Response("<html>Bad gateway</html>", { status: 502, statusText: "Bad Gateway" }));
    const res = await proxyToApi("/cadets");
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Bad Gateway" });
  });

  it("an unreachable backend is a clean 503, not a 500", async () => {
    backend(new TypeError("fetch failed", { cause: new Error("ECONNREFUSED") }));
    const res = await proxyToApi("/cadets");
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "API unreachable" });
  });
});

describe("proxyToApiRaw", () => {
  it("streams the file through with only its type and filename headers", async () => {
    backend(
      new Response("%PDF-1.4", {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="Plan.pdf"; filename*=UTF-8''Plan.pdf`,
          "Set-Cookie": "leak=1",
        },
      })
    );
    const res = await proxyToApiRaw("/session-plans/1/pdf");
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("%PDF-1.4");
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toContain("filename*=");
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("returns errors as JSON, and 401/503 like proxyToApi", async () => {
    backend(new Response(JSON.stringify({ detail: "Session plan not found" }), { status: 404 }));
    const res = await proxyToApiRaw("/session-plans/9/pdf");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ detail: "Session plan not found" });

    backend(new Error("down"));
    expect((await proxyToApiRaw("/x")).status).toBe(503);

    auth.mockResolvedValueOnce(null);
    expect((await proxyToApiRaw("/x")).status).toBe(401);
  });
});
