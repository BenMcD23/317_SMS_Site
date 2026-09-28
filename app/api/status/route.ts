import { NextResponse } from "next/server";

import { API_BASE } from "@/lib/config";

// Well under the overlay's own client timeout, so a hung backend comes back as
// our clean 503 rather than the browser giving up and blaming its own network.
const READY_TIMEOUT = 4_000;

// A healthy answer is reused briefly so every open tab (and every user on a
// warm instance) shares one probe. Failures are never cached: the overlay
// re-checks a few times before declaring an outage, and each of those must be
// a fresh look or the confirmation means nothing.
const HEALTHY_CACHE_MS = 10_000;

type Readiness = { ok: true } | { ok: false; reason: "unreachable" | "not-ready" };

let healthyAt = 0;
let inflight: Promise<Readiness> | null = null;

async function probeReadyz(): Promise<Readiness> {
  const start = Date.now();
  try {
    const res = await fetch(`${API_BASE}/readyz`, {
      cache: "no-store",
      signal: AbortSignal.timeout(READY_TIMEOUT),
    });
    if (res.ok) return { ok: true };
    // The API answered but isn't ready — usually the database is unreachable.
    console.error(`[api-status] ${API_BASE}/readyz -> ${res.status} in ${Date.now() - start}ms`);
    return { ok: false, reason: "not-ready" };
  } catch (e) {
    const cause = e instanceof Error ? (e.cause ?? e.message) : e;
    console.error(`[api-status] ${API_BASE}/readyz unreachable after ${Date.now() - start}ms:`, cause);
    return { ok: false, reason: "unreachable" };
  }
}

async function readiness(): Promise<Readiness> {
  if (Date.now() - healthyAt < HEALTHY_CACHE_MS) return { ok: true };
  // Concurrent requests share one in-flight probe instead of each hitting /readyz.
  inflight ??= probeReadyz().then((result) => {
    if (result.ok) healthyAt = Date.now();
    inflight = null;
    return result;
  });
  return inflight;
}

/**
 * Same-origin API health check for the API-down overlay. Vercel's server asks
 * the backend's /readyz (which includes the database), so the browser gets an
 * answer that doesn't depend on its own connection: reaching this route at all
 * proves the user is online, and a 503 here means the API really is down.
 *
 * Deliberately not proxyToApi: /readyz is unauthenticated and the overlay also
 * runs for signed-out users, and a status check needs a hard timeout.
 */
export async function GET() {
  const result = await readiness();
  return NextResponse.json(result, {
    status: result.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
