// 317 Sync bookmarklet — runs on volunteers.bader.mod.uk, never on 317 SMS.
//
// The Volunteer Portal is behind the RAFAC Microsoft login, so only code running
// on the portal page, with the user's own session, can read its API. This is a
// deliberately dumb relay: it opens the 317 SMS sync page, and that page sends
// it one "get this portal path" request at a time; it fetches each with the
// user's session and hands back the reply. Everything about *what* to read
// lives in the 317 SMS site, so adding a data set never needs a re-drag.
//
// It only serves its own 317 SMS tab, only GETs /api/ paths on the portal, at
// most CONCURRENCY at once, and stops when the page says it's done (or after
// an hour). It never sees a 317 SMS token.
//
// Self-contained on purpose: it becomes a `javascript:` URL (see
// components/vp-sync-card.tsx), with __SMS_ORIGIN__ swapped for the site's origin.
// Bump VERSION only when this relay itself changes (lib/vp-sync.ts
// BOOKMARKLET_VERSION too) — the page then tells old bookmarks to re-drag.
(() => {
  const SMS = "__SMS_ORIGIN__";
  const VP = "https://volunteers.bader.mod.uk";
  const VERSION = 2;
  const CONCURRENCY = 8;
  // A portal API path and nothing else: no other host, no `..` tricks.
  const API_PATH = /^\/api\/[A-Za-z0-9\/_\-.~?=&%,]*$/;
  if (location.origin !== VP) {
    alert("Run 317 Sync on the Volunteer Portal (volunteers.bader.mod.uk).");
    return;
  }

  // Opened straight from the click, or the pop-up blocker stops it.
  const win = window.open(SMS + "/tools/scraper/vp-sync", "sms-vp-sync");
  if (!win) {
    alert("Allow pop-ups for the Volunteer Portal, then click 317 Sync again.");
    return;
  }

  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:320px;padding:12px 16px;" +
    "border-radius:8px;background:#0b1f3a;color:#fff;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px #0006";
  document.body.appendChild(box);
  const say = (text) => (box.textContent = "317 Sync: " + text);
  say("waiting for the 317 SMS tab…");

  // The portal's API wants its antiforgery token; the page carries a copy.
  const csrf = (async () => {
    try {
      const r = await fetch("/api/antiforgery/token", {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      const token = ((await r.json()) || {}).token;
      if (token) return token;
    } catch {
      // Fall back to the meta tag, as the portal's own pages do.
    }
    const meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute("content") || "" : "";
  })();

  let active = 0;
  const waiting = [];
  const relay = async (path) => {
    // Checked again after the browser normalises it: "%2e%2e" counts as "..".
    const url = typeof path === "string" && API_PATH.test(path) ? new URL(path, VP) : null;
    if (!url || url.origin !== VP || !url.pathname.startsWith("/api/")) {
      return { status: 0, body: "refused by the bookmark: not a portal API path" };
    }
    const token = await csrf;
    if (!token)
      return { status: 0, body: "not signed in to the Volunteer Portal — sign in, reload, try again" };
    while (active >= CONCURRENCY) await new Promise((r) => waiting.push(r));
    active++;
    try {
      const r = await fetch(url.href, {
        credentials: "include",
        headers: { Accept: "application/json", "X-CSRF-TOKEN": token },
      });
      return { status: r.status, body: await r.text() };
    } catch (e) {
      return { status: 0, body: "network error: " + (e && e.message) };
    } finally {
      active--;
      if (waiting.length) waiting.shift()();
    }
  };

  const stop = (text) => {
    removeEventListener("message", onMessage);
    say(text);
    setTimeout(() => box.remove(), 15000);
  };
  const onMessage = async (e) => {
    if (e.origin !== SMS || e.source !== win || !e.data) return;
    const m = e.data;
    if (m.type === "sms-vp-ready") {
      win.postMessage({ type: "sms-vp-hello", version: VERSION }, SMS);
      say("connected — reading the portal…");
    } else if (m.type === "sms-vp-progress") {
      say(String(m.text));
    } else if (m.type === "sms-vp-done") {
      stop(String(m.text || "done — check the 317 SMS tab."));
    } else if (m.type === "sms-vp-get") {
      const reply = await relay(m.path);
      win.postMessage({ type: "sms-vp-result", id: m.id, ...reply }, SMS);
    }
  };
  addEventListener("message", onMessage);
  setTimeout(() => stop("stopped — click 317 Sync again to re-sync."), 60 * 60 * 1000);
})();
