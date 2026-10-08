#!/usr/bin/env node
// Signs in with the dev bypass and screenshots pages of the running preview
// (scripts/preview.sh), so a UI change can be looked at, not just tested.
//
//   node scripts/screenshot.mjs /cadets/overview /stats
//   node scripts/screenshot.mjs --mobile --role nco /session-plans
//   node scripts/screenshot.mjs --full --theme light --out /tmp/shots /
//
// Options:
//   --role staff|snco|nco   which dev account to sign in as (default staff)
//   --mobile                390x844 phone viewport (default 1440x900)
//   --size WxH              any other viewport
//   --full                  whole scrolling page, not just the first screen
//   --theme light|dark      force a theme (default: the app's own, dark)
//   --out DIR               where the PNGs go (default .preview/shots)
//   --base URL              site URL (default http://localhost:3000)
//
// Files are named after the path: /cadets/overview -> cadets_overview.png.
// Uses Playwright from the project if installed, otherwise the global one the
// cloud containers ship with (and its pre-installed Chromium).
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

function loadPlaywright() {
  const require = createRequire(import.meta.url);
  try {
    return require("playwright");
  } catch {
    const globalRoot = execSync("npm root -g", { encoding: "utf8" }).trim();
    return require(path.join(globalRoot, "playwright"));
  }
}

function parseArgs(argv) {
  const opts = { role: "staff", width: 1440, height: 900, full: false, theme: null, paths: [] };
  opts.out = path.join(process.cwd(), ".preview", "shots");
  opts.base = "http://localhost:3000";
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--role") opts.role = argv[++i];
    else if (arg === "--mobile") [opts.width, opts.height] = [390, 844];
    else if (arg === "--size") [opts.width, opts.height] = argv[++i].split("x").map(Number);
    else if (arg === "--full") opts.full = true;
    else if (arg === "--theme") opts.theme = argv[++i];
    else if (arg === "--out") opts.out = path.resolve(argv[++i]);
    else if (arg === "--base") opts.base = argv[++i].replace(/\/$/, "");
    else if (arg.startsWith("--")) throw new Error(`unknown option ${arg}`);
    else opts.paths.push(arg.startsWith("/") ? arg : `/${arg}`);
  }
  if (!opts.paths.length) opts.paths.push("/");
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const { chromium } = loadPlaywright();
mkdirSync(opts.out, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: opts.width, height: opts.height },
  locale: "en-GB",
  timezoneId: "Europe/London",
});
// next-themes reads its choice from localStorage before first paint.
if (opts.theme) await context.addInitScript((t) => localStorage.setItem("theme", t), opts.theme);
const page = await context.newPage();

// The dev sign-in buttons only exist with AUTH_DEV_BYPASS=1 in .env.local.
await page.goto(`${opts.base}/login`);
await page.getByRole("button", { name: opts.role, exact: true }).click();
await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });

let failed = 0;
for (const p of opts.paths) {
  const file = path.join(opts.out, `${p.replace(/^\/|\/$/g, "").replace(/\//g, "_") || "dashboard"}.png`);
  try {
    // The first visit to a page compiles it in next dev, which can take a while.
    await page.goto(`${opts.base}${p}`, { timeout: 120_000 });
    await page.waitForLoadState("networkidle", { timeout: 30_000 }).catch(() => {});
    // Let skeletons resolve and animations settle.
    await page.waitForTimeout(1000);
    await page.screenshot({ path: file, fullPage: opts.full });
    console.log(file);
  } catch (e) {
    failed++;
    console.error(`${p}: ${e.message.split("\n")[0]}`);
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
