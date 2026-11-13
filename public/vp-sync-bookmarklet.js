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
// One write is allowed: enrolling cadets on a classification exam (the same
// call the portal's own Exams page makes). Only that path, only enrolling
// (never un-enrolling), at most MAX_ENROL people, and only after the person
// at the portal says OK to a prompt naming the exam and how many. 317 SMS
// can ask; it can't make the portal do it without them.
//
// Self-contained on purpose: it becomes a `javascript:` URL (see
// components/vp-sync-card.tsx), with __SMS_ORIGIN__ swapped for the site's origin.
// Bump VERSION only when this relay itself changes (lib/vp-sync.ts
// BOOKMARKLET_VERSION too) — the page then tells old bookmarks to re-drag.
(() => {
  const SMS = "__SMS_ORIGIN__";
  const VP = "https://volunteers.bader.mod.uk";
  const VERSION = 3;
  const CONCURRENCY = 8;
  const MAX_ENROL = 100;
  const ENROL_PATH = /^\/api\/exams\/management\/subjects\/([A-Za-z0-9-]{1,64})\/enrolments$/;
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

  // The ASP.NET antiforgery token writes need, from this page or the Exams page.
  const verification = async () => {
    const read = (doc) =>
      doc.querySelector('meta[name="RequestVerificationToken"]')?.getAttribute("content") ||
      doc.querySelector('input[name="__RequestVerificationToken"]')?.value ||
      "";
    const here = read(document);
    if (here) return here;
    try {
      const html = await (await fetch("/exams", { credentials: "include" })).text();
      return read(new DOMParser().parseFromString(html, "text/html"));
    } catch {
      return "";
    }
  };

  const enrol = async (path, body, label) => {
    const match = typeof path === "string" ? ENROL_PATH.exec(path) : null;
    const actions = body && typeof body === "object" ? body.actions : null;
    const ids = actions && typeof actions === "object" ? Object.keys(actions) : [];
    if (
      !match ||
      !actions ||
      body.examId !== match[1] ||
      !ids.length ||
      ids.length > MAX_ENROL ||
      !ids.every((id) => /^\d{1,12}$/.test(id) && actions[id] === true)
    ) {
      return { status: 0, body: "refused by the bookmark: only enrolling cadets on an exam is allowed" };
    }
    const name = String(label || "this exam").slice(0, 120);
    const ok = confirm(
      `317 SMS wants to enrol ${ids.length} cadet${ids.length === 1 ? "" : "s"} on ${name}.\n\n` +
        "Press OK to enrol them on the Volunteer Portal now."
    );
    if (!ok) return { status: 0, body: "cancelled on the portal" };
    const [token, request] = await Promise.all([csrf, verification()]);
    if (!token || !request)
      return { status: 0, body: "couldn't get the portal's sign-in tokens — reload it and try again" };
    try {
      const r = await fetch(new URL(path, VP).href, {
        method: "POST",
        credentials: "include",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-CSRF-TOKEN": token,
          RequestVerificationToken: request,
          "X-Requested-With": "XMLHttpRequest",
        },
        body: JSON.stringify({ examId: match[1], actions: Object.fromEntries(ids.map((id) => [id, true])) }),
      });
      return { status: r.status, body: await r.text() };
    } catch (e) {
      return { status: 0, body: "network error: " + (e && e.message) };
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
    } else if (m.type === "sms-vp-enrol") {
      say("waiting for you to confirm the enrolment…");
      const reply = await enrol(m.path, m.body, m.label);
      say(
        reply.status >= 200 && reply.status < 300
          ? "enrolment sent — check the 317 SMS tab."
          : "enrolment not sent."
      );
      win.postMessage({ type: "sms-vp-result", id: m.id, ...reply }, SMS);
    }
  };
  addEventListener("message", onMessage);
  setTimeout(() => stop("stopped — click 317 Sync again to re-sync."), 60 * 60 * 1000);
})();
