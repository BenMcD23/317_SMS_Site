/*
 * 317 SMS – VP Sync collector.
 *
 * Loaded into a Volunteer Portal tab by the "317 VP Sync" bookmarklet from the
 * VP Sync page (app/tools/vp-sync). The browser won't let the SMS site read
 * VP's API (VP sends no CORS headers), but code running on VP's own page can:
 * it's same-origin there, with the user's VP session. So this reads VP and
 * hands each batch to the SMS popup the bookmarklet opened, via postMessage.
 * The popup is signed in to SMS and does the posting to /vp-sync/* on the API.
 *
 * The VP-reading logic mirrors vp-sync-extension/ in SMS_Scrapers_API, which
 * does the same job as a Chrome extension. Keep the two in step until one of
 * them is chosen. VP's API is described in that repo's docs/vp-sync.md.
 *
 * A plain script, not a module, so it loads from the SMS origin without CORS.
 */
(() => {
  "use strict";

  const ctx = window.__vpSync;
  if (!ctx || !ctx.popup) return;
  if (ctx.running) {
    alert("A 317 SMS sync is already running in this tab.");
    return;
  }
  ctx.running = true;

  const SMS_ORIGIN = ctx.origin;
  const popup = ctx.popup;

  // ── Settings (keep in step with vp-sync-extension/sync.js) ────────────────
  const UNIT_FILTER = "317";
  const CONCURRENCY = 3;
  const UPLOAD_BATCH = 100;
  const PAGE_SIZE = 1000;
  const RETRY_STATUSES = new Set([429, 502, 503, 504]);
  const MAX_RETRIES = 4;

  const PERSON_DATASETS = {
    learning: (id) => `api/person/${id}/learning/history`,
    agreements: (id) => `api/person/${id}/agreements`,
    whts: (id) => `api/shootingmanagement/${id}/whts`,
    shooting_log: (id) => `api/shootingmanagement/${id}/shootinglog`,
    fieldcraft: (id) => `api/fieldcraftmanagement/${id}/completions`,
    aviation: (id) => `api/person/${id}/aviation/history`,
  };
  const PROFILE_FIELDS = [
    "personnelId", "givenName", "familyName", "rankAbbreviation", "unitName",
    "wing", "classification", "flight", "activeStatusType", "serviceJoinDate",
    "appointmentType", "appointmentTitle",
  ];

  class NotSignedIn extends Error {}
  class NoPermission extends Error {}

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ── Banner on the VP page, so it's obvious the tab mustn't be closed ───────
  const banner = document.createElement("div");
  banner.style.cssText =
    "position:fixed;z-index:2147483647;left:16px;right:16px;bottom:16px;padding:12px 16px;" +
    "border-radius:8px;background:#1e3a8a;color:#fff;font:14px system-ui,sans-serif;" +
    "box-shadow:0 4px 16px rgba(0,0,0,.3)";
  document.body.appendChild(banner);
  const show = (text, bad) => {
    banner.textContent = `317 SMS sync: ${text}`;
    banner.style.background = bad ? "#991b1b" : "#1e3a8a";
  };
  show("waiting for the 317 SMS window…");

  // ── Talking to the SMS popup ───────────────────────────────────────────────
  // Every message carries vpSync: 1 and goes only to SMS_ORIGIN; replies are
  // only accepted from that origin and that window.
  let nextId = 1;
  const waiting = new Map();
  let ready = null;
  const readyPromise = new Promise((resolve) => (ready = resolve));

  window.addEventListener("message", (e) => {
    if (e.origin !== SMS_ORIGIN || e.source !== popup || !e.data || e.data.vpSync !== 1) return;
    if (e.data.op === "ready") return ready();
    const w = waiting.get(e.data.id);
    if (!w) return;
    waiting.delete(e.data.id);
    if (e.data.ok) w.resolve(e.data.result);
    else w.reject(new Error(e.data.error || "The 317 SMS window reported an error."));
  });

  function ask(op, body) {
    if (popup.closed) return Promise.reject(new Error("The 317 SMS window was closed."));
    const id = nextId++;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      popup.postMessage({ vpSync: 1, id, op, body }, SMS_ORIGIN);
    });
  }

  const progress = (text) => {
    show(text);
    ask("progress", { text }).catch(() => {});
  };

  // The popup may still be loading (or signing in); say hello until it answers.
  async function handshake() {
    for (let i = 0; i < 240; i += 1) {
      if (popup.closed) throw new Error("The 317 SMS window was closed.");
      popup.postMessage({ vpSync: 1, op: "hello" }, SMS_ORIGIN);
      const answered = await Promise.race([readyPromise.then(() => true), sleep(500).then(() => false)]);
      if (answered) return;
    }
    throw new Error("The 317 SMS window didn't answer. Are you signed in to 317 SMS?");
  }

  // ── VP API (same-origin here) ──────────────────────────────────────────────
  let csrf = null;

  async function token() {
    const res = await fetch("/api/antiforgery/token", { headers: { Accept: "application/json" } });
    const body = await res.text();
    if (res.ok && /^\s*\{/.test(body)) {
      const t = JSON.parse(body).token;
      if (typeof t === "string" && t.trim()) return t.trim();
    }
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content) return meta.content;
    throw new NotSignedIn("Couldn't get a VP session token. Sign in to VP, reload, and try again.");
  }

  async function vpGet(path) {
    let refreshed = false;
    for (let attempt = 0; ; attempt += 1) {
      if (!csrf) csrf = await token();
      const url = new URL(path, `${location.origin}/`);
      if (url.origin !== location.origin) throw new Error(`Refusing non-VP URL ${url}`);
      const res = await fetch(url, { headers: { Accept: "application/json", "X-CSRF-TOKEN": csrf } });
      if (res.status === 400 && !refreshed) {
        csrf = null;
        refreshed = true;
        continue;
      }
      if (RETRY_STATUSES.has(res.status) && attempt < MAX_RETRIES) {
        await sleep(500 * 2 ** attempt + Math.random() * 250);
        continue;
      }
      if (res.status === 401) throw new NotSignedIn("VP says you're signed out. Sign in and try again.");
      if (res.status === 403) throw new NoPermission(path);
      if (res.status === 404) return null;
      const body = await res.text();
      if (!res.ok) throw new Error(`VP ${res.status} for ${path}`);
      if (!/^\s*[[{]/.test(body)) throw new NotSignedIn("VP returned its sign-in page. Sign in and try again.");
      return JSON.parse(body);
    }
  }

  function rowsOf(data) {
    if (Array.isArray(data)) return data.filter((r) => r && typeof r === "object");
    if (!data || typeof data !== "object") return [];
    for (const key of ["data", "items", "results", "rows", "registers"]) {
      if (Array.isArray(data[key])) return data[key].filter((r) => r && typeof r === "object");
    }
    return [];
  }

  async function vpGetAll(path) {
    const rows = [];
    for (let page = 1; ; page += 1) {
      const data = await vpGet(`${path}?pageNumber=${page}&pageSize=${PAGE_SIZE}&sortBy=familyName&sortDesc=false`);
      const batch = rowsOf(data);
      rows.push(...batch);
      const totalPages = data && typeof data === "object" ? data.totalPages ?? data.pageCount : undefined;
      if (typeof totalPages === "number" ? page >= totalPages : batch.length < PAGE_SIZE) return rows;
    }
  }

  // ── The sync ───────────────────────────────────────────────────────────────
  async function rosterList(path, permission, skipped) {
    try {
      return await vpGetAll(path);
    } catch (e) {
      if (!(e instanceof NoPermission)) throw e;
      skipped.push(`${path.split("/").pop()} (needs '${permission}')`);
      return null;
    }
  }

  function toRosterPerson(row, personType) {
    const cin = Number(String(row.computerNumber ?? "").trim());
    const personnelWebId = String(row.personnelWebId ?? "").trim();
    if (!personnelWebId || !Number.isSafeInteger(cin) || cin <= 0) return null;
    const profile = {};
    for (const k of PROFILE_FIELDS) if (row[k] !== undefined && row[k] !== null) profile[k] = row[k];
    return { personnelWebId, cin, personType, profile };
  }

  async function unitWide(label, fn, skipped) {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof NoPermission) {
        skipped.push(label);
        return [];
      }
      throw e;
    }
  }

  async function mandatoryTraining(ids) {
    return rowsOf(await vpGet("api/trackers/mandatorytraining"))
      .filter((r) => ids.has(String(r.personnelWebId ?? "").trim()))
      .map((r) => ({ personnelWebId: String(r.personnelWebId).trim(), dataset: "mandatory_training", payload: r }));
  }

  async function examResults(ids) {
    const byPerson = new Map();
    for (const s of rowsOf(await vpGet("api/exams/management/subjects"))) {
      const examId = String(s.classificationExamId ?? "").trim();
      if (!examId) continue;
      const uri = String(s.resultsUri ?? "").trim() || `api/exams/management/subjects/${examId}/results`;
      const results = rowsOf(await vpGet(uri).catch((e) => {
        if (e instanceof NotSignedIn) throw e;
        return [];
      }));
      for (const r of results) {
        const id = String(r.personnelWebId ?? "").trim();
        if (!ids.has(id)) continue;
        if (!byPerson.has(id)) byPerson.set(id, []);
        byPerson.get(id).push({ ...r, classificationExamId: examId, cadetClassification: s.cadetClassification });
      }
    }
    return [...ids].map((id) => ({ personnelWebId: id, dataset: "exam_results", payload: byPerson.get(id) || [] }));
  }

  async function pool(tasks, limit) {
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(limit, tasks.length) }, async () => {
        while (next < tasks.length) await tasks[next++]();
      })
    );
  }

  async function run() {
    await handshake();

    progress("reading the unit roster from VP…");
    const skipped = [];
    const [cadets, staff] = await Promise.all([
      rosterList("api/persons/cadets", "Cadet Details – View", skipped),
      rosterList("api/persons/staff", "Staff Details – View", skipped),
    ]);
    if (cadets === null && staff === null) {
      throw new Error("Your VP account can't see the unit roster. It needs the VP permission " +
        "'Cadet Details – View' (and 'Staff Details – View' for staff).");
    }
    const inUnit = (r) => String(r.unitName ?? "").includes(UNIT_FILTER);
    const people = [
      ...(cadets || []).filter(inUnit).map((r) => toRosterPerson(r, "cadet")),
      ...(staff || []).filter(inUnit).map((r) => toRosterPerson(r, "staff")),
    ].filter(Boolean);
    if (people.length === 0) throw new Error(`VP shows nobody whose unit contains "${UNIT_FILTER}".`);

    const roster = await ask("people", { people });
    const ids = new Set(roster.acceptedIds);

    const pending = [];
    let stored = 0;
    const flush = async (force) => {
      while (pending.length >= UPLOAD_BATCH || (force && pending.length)) {
        const res = await ask("records", { records: pending.splice(0, UPLOAD_BATCH) });
        stored += res.stored;
      }
    };

    progress("reading mandatory training and exam results…");
    pending.push(...(await unitWide("mandatory training", () => mandatoryTraining(ids), skipped)));
    pending.push(...(await unitWide("exam results", () => examResults(ids), skipped)));
    await flush(false);

    const denied = new Set();
    let failed = 0;
    let done = 0;
    await pool(
      [...ids].map((id) => async () => {
        for (const [dataset, endpoint] of Object.entries(PERSON_DATASETS)) {
          if (denied.has(dataset)) continue;
          try {
            pending.push({ personnelWebId: id, dataset, payload: await vpGet(endpoint(id)) });
          } catch (e) {
            if (e instanceof NotSignedIn) throw e;
            if (e instanceof NoPermission) denied.add(dataset);
            else failed += 1; // keep the stored copy rather than overwrite it with nothing
          }
        }
        done += 1;
        progress(`reading records from VP… ${done}/${ids.size} people`);
        await flush(false);
      }),
      CONCURRENCY
    );
    await flush(true);

    skipped.push(...[...denied].map((d) => d.replace("_", " ")));
    return {
      people: roster.accepted,
      notOnSmsRoster: roster.skippedNotOnRoster,
      removed: roster.removed,
      recordsStored: stored,
      noPermission: skipped,
      failed,
    };
  }

  run()
    .then(async (summary) => {
      show(`done: ${summary.people} people, ${summary.recordsStored} records. You can close the 317 SMS window.`);
      await ask("done", summary).catch(() => {});
      setTimeout(() => banner.remove(), 15000);
    })
    .catch(async (e) => {
      const message = e && e.message ? e.message : String(e);
      show(message, true);
      await ask("error", { message }).catch(() => {});
    })
    .finally(() => {
      ctx.running = false;
    });
})();
