// 317 Sync bookmarklet — runs on volunteers.bader.mod.uk, never on 317 SMS.
//
// The Volunteer Portal is behind the RAFAC Microsoft login, so only code running
// on the portal page, with the user's own session, can read its API. This opens
// the 317 SMS sync page, waits for it to say which CINs we hold, reads those
// cadets' data from the portal and posts it to that page — which does the
// authenticated import. It never sees a 317 SMS token.
//
// Self-contained on purpose: it becomes a `javascript:` URL (see
// components/vp-sync-card.tsx), with __SMS_ORIGIN__ swapped for the site's origin.
(async () => {
  const SMS = "__SMS_ORIGIN__";
  const VP = "https://volunteers.bader.mod.uk";
  const CONCURRENCY = 8; // requests in flight at once
  if (location.origin !== VP) {
    alert("Run 317 Sync on the Volunteer Portal (volunteers.bader.mod.uk).");
    return;
  }

  // Opened straight away: a pop-up opened after the slow fetches below no
  // longer counts as a click and gets blocked.
  const win = window.open(SMS + "/tools/scraper/vp-sync", "sms-vp-sync");
  if (!win) {
    alert("Allow pop-ups for the Volunteer Portal, then click 317 Sync again.");
    return;
  }
  // Listen before anything is awaited so the page's "ready" can't be missed.
  const ready = new Promise((resolve) => {
    addEventListener("message", function onReady(e) {
      if (e.origin !== SMS || e.source !== win || !e.data || e.data.type !== "sms-vp-ready") return;
      removeEventListener("message", onReady);
      resolve(new Set((e.data.cins || []).map(String)));
    });
  });

  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;z-index:2147483647;right:16px;bottom:16px;max-width:320px;padding:12px 16px;" +
    "border-radius:8px;background:#0b1f3a;color:#fff;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px #0006";
  document.body.appendChild(box);
  const say = (text) => (box.textContent = "317 Sync: " + text);

  // Every failed portal call, shown on the 317 SMS tab so whoever runs a sync
  // can see (and copy) exactly what the portal refused and why.
  const errors = [];
  const MAX_ERRORS = 300;
  const logError = (what, path, status, detail) => {
    if (errors.length < MAX_ERRORS) errors.push({ what, path, status, detail: String(detail || "").slice(0, 300) });
  };

  try {
    say("getting a portal token…");
    let csrf = "";
    try {
      const r = await fetch("/api/antiforgery/token", { credentials: "include", headers: { Accept: "application/json" } });
      csrf = ((await r.json()) || {}).token || "";
    } catch {
      // Same fallback the portal's own pages use.
    }
    if (!csrf) {
      const meta = document.querySelector('meta[name="csrf-token"]');
      csrf = meta ? meta.getAttribute("content") || "" : "";
    }
    if (!csrf) throw new Error("not signed in to the Volunteer Portal — sign in, reload, try again");

    // One cap on requests in flight across everything below, so the parallel
    // reads are fast without hammering the portal.
    let active = 0;
    const waiting = [];
    const get = async (path, what) => {
      while (active >= CONCURRENCY) await new Promise((r) => waiting.push(r));
      active++;
      const url = "/api/" + path.replace(/^https?:\/\/[^/]+/, "").replace(/^\/?(api\/)?/, "");
      try {
        let r;
        try {
          r = await fetch(url, { credentials: "include", headers: { Accept: "application/json", "X-CSRF-TOKEN": csrf } });
        } catch (e) {
          logError(what, url, 0, "network error: " + (e && e.message));
          throw e;
        }
        if (!r.ok) {
          const body = await r.text().catch(() => "");
          logError(what, url, r.status, body);
          throw new Error(what + " → " + r.status);
        }
        try {
          return await r.json();
        } catch (e) {
          // A sign-in page instead of JSON means the portal session expired.
          logError(what, url, r.status, "not JSON (signed out?)");
          throw e;
        }
      } finally {
        active--;
        if (waiting.length) waiting.shift()();
      }
    };
    // The portal wraps lists in different envelopes; the extension checks these.
    const rows = (body) => {
      if (Array.isArray(body)) return body;
      for (const k of ["data", "items", "results", "rows", "registers"]) if (body && Array.isArray(body[k])) return body[k];
      return [];
    };

    // Started before the 317 SMS tab answers — neither needs its CIN list.
    say("reading the cadet list and classification exams…");
    const peopleP = (async () => {
      const people = [];
      for (let page = 1; page <= 50; page++) {
        const batch = rows(await get("persons/cadets?pageNumber=" + page + "&pageSize=100&sortBy=familyName&sortDesc=false", "cadet list"));
        people.push(...batch);
        if (batch.length < 100) break;
      }
      return people;
    })();
    // Exams are listed per subject for the whole unit; split them per cadet.
    // null = "couldn't read", so the import keeps what it had.
    const examsP = get("exams/management/subjects", "exams").then(
      async (subjects) => {
        const exams = { enrolments: {}, results: {} };
        await Promise.all(
          rows(subjects).map(async (s) => {
            const id = s.classificationExamId;
            const tag = { courseName: s.courseName, cadetClassification: s.cadetClassification };
            const [enr, res] = await Promise.all([
              get(s.enrolmentsUri || "exams/management/subjects/" + id + "/enrolments", "exams").then(rows, () => []),
              get(s.resultsUri || "exams/management/subjects/" + id + "/results", "exams").then(rows, () => []),
            ]);
            for (const e of enr) (exams.enrolments[String(e.computerNumber).trim()] ||= []).push({ ...tag, ...e });
            for (const r of res) (exams.results[String(r.personnelWebId).trim()] ||= []).push({ ...tag, ...r });
          })
        );
        return exams;
      },
      () => null
    );
    peopleP.catch(() => {}); // awaited below; don't let it go unhandled while we wait

    const cins = await ready;
    const exams = await examsP;
    const people = await peopleP;
    const cadets = people
      .map((p) => ({ cin: String(p.computerNumber || "").trim(), webId: String(p.personnelWebId || "").trim() }))
      .filter((p) => p.webId && cins.has(p.cin));
    if (!cadets.length) {
      logError("cadet list", "/api/persons/cadets", 0,
        "the portal listed " + people.length + " people but none match the " + cins.size + " CINs in 317 SMS");
    }

    const ENDPOINTS = {
      whts: (w) => "shootingmanagement/" + w + "/whts",
      shooting_log: (w) => "shootingmanagement/" + w + "/shootinglog",
      fieldcraft: (w) => "fieldcraftmanagement/" + w + "/completions",
      classification: (w) => "person/" + w + "/classification",
      flying: (w) => "person/" + w + "/aviation/history",
      learning: (w) => "person/" + w + "/learning/history",
      unit_history: (w) => "person/" + w + "/service/unithistory",
    };
    let done = 0;
    const out = await Promise.all(
      cadets.map(async (c) => {
        const data = {};
        await Promise.all(
          Object.entries(ENDPOINTS).map(async ([name, path]) => {
            // A failed call is sent as null so the import keeps the stored copy.
            data[name] = await get(path(c.webId), name).catch(() => null);
          })
        );
        data.exams = exams && { enrolments: exams.enrolments[c.cin] || [], results: exams.results[c.webId] || [] };
        say("read " + ++done + " of " + cadets.length + " cadets…");
        return { cin: Number(c.cin), data };
      })
    );

    win.postMessage({ type: "sms-vp-data", cadets: out, errors }, SMS);
    say("sent " + out.length + " cadets to 317 SMS — check that tab.");
  } catch (err) {
    say("failed — " + (err && err.message ? err.message : err));
    try {
      win.postMessage({ type: "sms-vp-error", message: String(err && err.message ? err.message : err), errors }, SMS);
    } catch {
      // The 317 SMS tab was closed; the message above is all we can do.
    }
  }
  setTimeout(() => box.remove(), 15000);
})();
