// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const signIn = vi.fn();
vi.mock("next-auth/react", () => ({ signIn: (...args: unknown[]) => signIn(...args) }));

// Fresh module per test: `isRedirecting` is module state and must not leak.
async function load() {
  vi.resetModules();
  return import("@/lib/api-fetch");
}

function respond(status: number, body: unknown = {}, url = "http://api.test/thing") {
  const res = new Response(body === null ? null : JSON.stringify(body), { status });
  Object.defineProperty(res, "url", { value: url });
  return res;
}

beforeEach(() => {
  signIn.mockReset();
  sessionStorage.clear();
});

describe("apiFetch", () => {
  it("passes a good response straight through and clears the re-auth mark", async () => {
    const { apiFetch } = await load();
    sessionStorage.setItem("sms:reauth-started-at", String(Date.now()));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(200, { ok: true })));
    const res = await apiFetch("/x", { method: "POST" });
    expect(await res.json()).toEqual({ ok: true });
    expect(sessionStorage.getItem("sms:reauth-started-at")).toBeNull();
    expect(fetch).toHaveBeenCalledWith("/x", { method: "POST" });
  });

  it.each([502, 503, 504])("flags a possible outage on %i", async (status) => {
    const { apiFetch } = await load();
    const { API_OUTAGE_EVENT } = await import("@/components/api-status-overlay");
    const heard = vi.fn();
    window.addEventListener(API_OUTAGE_EVENT, heard);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(status)));
    expect((await apiFetch("/x")).status).toBe(status);
    expect(heard).toHaveBeenCalledOnce();
    window.removeEventListener(API_OUTAGE_EVENT, heard);
  });

  it("flags an outage and rethrows when the network fails", async () => {
    const { apiFetch } = await load();
    const { API_OUTAGE_EVENT } = await import("@/components/api-status-overlay");
    const heard = vi.fn();
    window.addEventListener(API_OUTAGE_EVENT, heard);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiFetch("/x")).rejects.toThrow("Failed to fetch");
    expect(heard).toHaveBeenCalledOnce();
    window.removeEventListener(API_OUTAGE_EVENT, heard);
  });

  it("does not flag an outage for ordinary errors", async () => {
    const { apiFetch } = await load();
    const { API_OUTAGE_EVENT } = await import("@/components/api-status-overlay");
    const heard = vi.fn();
    window.addEventListener(API_OUTAGE_EVENT, heard);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(400, { detail: "bad" })));
    expect((await apiFetch("/x")).status).toBe(400);
    expect(heard).not.toHaveBeenCalled();
    window.removeEventListener(API_OUTAGE_EVENT, heard);
  });

  it("re-auths on the first 401 and never settles (the page is leaving)", async () => {
    const { apiFetch } = await load();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(401)));
    const pending = apiFetch("/x");
    const outcome = await Promise.race([
      pending.then(() => "settled"),
      new Promise((r) => setTimeout(() => r("hung"), 20)),
    ]);
    expect(outcome).toBe("hung");
    expect(signIn).toHaveBeenCalledWith("google", { callbackUrl: window.location.pathname }, {});
    expect(sessionStorage.getItem("sms:reauth-started-at")).not.toBeNull();
  });

  it("returns the 401 instead of looping when a re-auth just happened", async () => {
    const { apiFetch, AUTH_LOOP_EVENT } = await load();
    sessionStorage.setItem("sms:reauth-started-at", String(Date.now() - 1000));
    const loop = vi.fn();
    window.addEventListener(AUTH_LOOP_EVENT, loop);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(401)));
    expect((await apiFetch("/x")).status).toBe(401);
    expect(signIn).not.toHaveBeenCalled();
    expect(loop).toHaveBeenCalledOnce();
    window.removeEventListener(AUTH_LOOP_EVENT, loop);
  });

  it("re-auths again once the cooldown has passed", async () => {
    const { reauth } = await load();
    sessionStorage.setItem("sms:reauth-started-at", String(Date.now() - 4 * 60 * 1000));
    expect(await reauth("/back")).toBe(true);
    expect(signIn).toHaveBeenCalledWith("google", { callbackUrl: "/back" }, {});
  });

  it("only starts one re-auth per page load", async () => {
    const { reauth } = await load();
    expect(await reauth("/a")).toBe(true);
    expect(await reauth("/b", { force: true })).toBe(true);
    expect(signIn).toHaveBeenCalledOnce();
  });

  it("a forced re-auth ignores the cooldown and asks for consent", async () => {
    const { reauth } = await load();
    sessionStorage.setItem("sms:reauth-started-at", String(Date.now()));
    expect(await reauth("/x", { force: true })).toBe(true);
    expect(signIn).toHaveBeenCalledWith("google", { callbackUrl: "/x" }, { prompt: "consent" });
  });

  it("fails closed when storage is blocked", async () => {
    const { reauth } = await load();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    expect(await reauth("/x")).toBe(false);
    expect(signIn).not.toHaveBeenCalled();
  });
});

describe("errorDetail", () => {
  it("flattens FastAPI's string and validation-list details", async () => {
    const { errorDetail } = await load();
    expect(errorDetail({ detail: "Nope" })).toBe("Nope");
    expect(errorDetail({ detail: [{ msg: "field required" }, { msg: "must be an email" }, {}] })).toBe(
      "field required, must be an email"
    );
    expect(errorDetail({ detail: [] })).toBeNull();
    expect(errorDetail({ detail: { odd: true } })).toBeNull();
    expect(errorDetail(null)).toBeNull();
    expect(errorDetail("text")).toBeNull();
  });
});

describe("apiRequest", () => {
  it("sends JSON with the bearer token and returns the body", async () => {
    const { apiRequest } = await load();
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { id: 1 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await apiRequest("tok", "http://api.test/x", { method: "POST", body: { a: 1 } })).toEqual({
      id: 1,
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers).toEqual({ Authorization: "Bearer tok", "Content-Type": "application/json" });
    expect(init.body).toBe('{"a":1}');
  });

  it("sends no body or content type when there is nothing to send", async () => {
    const { apiRequest } = await load();
    const fetchMock = vi.fn().mockResolvedValue(respond(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    await apiRequest("tok", "/x", { method: "DELETE" });
    expect(fetchMock.mock.calls[0][1]).toMatchObject({
      headers: { Authorization: "Bearer tok" },
      body: undefined,
    });
  });

  it("rejects with the backend's message, a flattened 422, or the fallback", async () => {
    const { apiRequest } = await load();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respond(409, { detail: "Already booked" })));
    await expect(apiRequest("t", "/x", { method: "POST" })).rejects.toThrow("Already booked");

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respond(422, { detail: [{ msg: "date_from: invalid" }] }))
    );
    await expect(apiRequest("t", "/x", { method: "POST" })).rejects.toThrow("date_from: invalid");

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>oops</html>", { status: 500 })));
    await expect(apiRequest("t", "/x", { method: "POST" }, "Couldn't save.")).rejects.toThrow(
      "Couldn't save."
    );
  });

  it("reports an unreachable server plainly", async () => {
    const { apiRequest } = await load();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")));
    await expect(apiRequest("t", "/x", { method: "GET" })).rejects.toThrow("Server unreachable.");
  });
});

describe("loadError", () => {
  it("names each failed response with its path, status and reason", async () => {
    const { loadError } = await load();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const err = await loadError(
      respond(200, {}, "http://api.test/ok"),
      respond(404, { detail: "Cadet not found" }, "http://api.test/cadets/1"),
      respond(500, null, "http://api.test/stats")
    );
    expect(err.message).toBe("Failed to load: /cadets/1 → 404 (Cadet not found); /stats → 500");
  });
});
