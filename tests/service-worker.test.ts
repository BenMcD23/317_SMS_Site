import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it, vi } from "vitest";

/**
 * public/sw.js runs in the browser's worker, not through our build, so it is
 * loaded here into a sandbox with a fake `self` and driven by firing the same
 * events the browser would.
 */
const SOURCE = readFileSync(join(import.meta.dirname, "../public/sw.js"), "utf8");
const ORIGIN = "https://sms.317atc.co.uk";

type Handler = (event: Record<string, unknown>) => void;

function load({ fetch = vi.fn(), windows = [] as Array<Record<string, unknown>> } = {}) {
  const handlers: Record<string, Handler> = {};
  const cache = { add: vi.fn().mockResolvedValue(undefined) };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue(["sms-offline-v0", "sms-offline-v1"]),
    delete: vi.fn().mockResolvedValue(true),
    match: vi.fn().mockResolvedValue("offline page"),
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: Handler) => (handlers[type] = fn),
    skipWaiting: vi.fn(),
    registration: { showNotification: vi.fn().mockResolvedValue(undefined) },
    clients: {
      claim: vi.fn(),
      matchAll: vi.fn().mockResolvedValue(windows),
      openWindow: vi.fn().mockResolvedValue(undefined),
    },
  };
  // Node's Request wants an absolute URL; the browser's resolves against the worker.
  const Request = class {
    constructor(
      public url: string,
      public init?: RequestInit
    ) {}
  };
  runInNewContext(SOURCE, { self, caches, fetch, Request, URL, Promise });

  /** Fire an event and wait for whatever it handed to waitUntil/respondWith. */
  async function fire(type: string, event: Record<string, unknown> = {}) {
    let pending: Promise<unknown> | undefined;
    const keep = (p: Promise<unknown>) => (pending = p);
    handlers[type]({ ...event, waitUntil: keep, respondWith: keep });
    return pending;
  }

  return { self, cache, caches, fire };
}

function pushEvent(payload: unknown) {
  return {
    data: {
      json: () => (typeof payload === "string" ? JSON.parse(payload) : payload),
      text: () => String(payload),
    },
  };
}

describe("service worker", () => {
  it("stores the offline page on install and clears old caches on activate", async () => {
    const { cache, caches, self, fire } = load();
    await fire("install");
    // Fetched fresh, never from the HTTP cache, so a new version always lands.
    expect(cache.add.mock.calls[0][0]).toMatchObject({ url: "/offline.html", init: { cache: "reload" } });
    expect(self.skipWaiting).toHaveBeenCalled();
    await fire("activate");
    expect(caches.delete).toHaveBeenCalledWith("sms-offline-v0");
    expect(caches.delete).not.toHaveBeenCalledWith("sms-offline-v1");
  });

  it("shows the offline page when a page load has no signal", async () => {
    const fetch = vi.fn().mockRejectedValue(new TypeError("offline"));
    const { fire } = load({ fetch });
    expect(await fire("fetch", { request: { mode: "navigate" } })).toBe("offline page");
  });

  it("passes a page load with signal straight to the network", async () => {
    const fetch = vi.fn().mockResolvedValue("live page");
    const { caches, fire } = load({ fetch });
    expect(await fire("fetch", { request: { mode: "navigate" } })).toBe("live page");
    expect(caches.match).not.toHaveBeenCalled();
  });

  it("never touches data or asset requests, so nothing is served stale", async () => {
    const fetch = vi.fn();
    const { fire } = load({ fetch });
    expect(await fire("fetch", { request: { mode: "cors" } })).toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows a pushed notification with its link", async () => {
    const { self, fire } = load();
    await fire(
      "push",
      pushEvent({ title: "New uniform order", body: "Cdt Ava Smith", url: "/stores", tag: "orders" })
    );
    expect(self.registration.showNotification).toHaveBeenCalledWith("New uniform order", {
      body: "Cdt Ava Smith",
      tag: "orders",
      icon: "/icons/icon-192.png",
      data: { url: "/stores" },
    });
  });

  it("still shows something for an empty or plain-text push", async () => {
    const { self, fire } = load();
    await fire("push", {});
    expect(self.registration.showNotification).toHaveBeenLastCalledWith(
      "317 SMS",
      expect.objectContaining({ body: "", data: { url: "/" } })
    );
    await fire("push", pushEvent("not json"));
    expect(self.registration.showNotification).toHaveBeenLastCalledWith(
      "317 SMS",
      expect.objectContaining({ body: "not json" })
    );
  });

  it("a tap focuses an open window and takes it to the page", async () => {
    const win = { url: `${ORIGIN}/cadets`, focus: vi.fn(), navigate: vi.fn() };
    win.focus.mockResolvedValue(win);
    const { self, fire } = load({ windows: [win] });
    const close = vi.fn();
    await fire("notificationclick", { notification: { close, data: { url: "/session-plans/4" } } });
    expect(close).toHaveBeenCalled();
    expect(win.navigate).toHaveBeenCalledWith(`${ORIGIN}/session-plans/4`);
    expect(self.clients.openWindow).not.toHaveBeenCalled();
  });

  it("a tap with no window open opens one", async () => {
    const { self, fire } = load();
    await fire("notificationclick", { notification: { close: vi.fn(), data: { url: "/stats" } } });
    expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/stats`);
  });

  it.each(["https://evil.example/phish", "javascript:alert(1)", "http://[bad"])(
    "a tap never leaves the app, whatever the payload says (%s)",
    async (url) => {
      const { self, fire } = load();
      await fire("notificationclick", { notification: { close: vi.fn(), data: { url } } });
      expect(self.clients.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
    }
  );
});
