import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { API_BASE } from "@/lib/config";

// Server-side only: these land in the Vercel function logs.
function logFetchError(method: string, path: string, ms: number, e: unknown) {
  const cause = e instanceof Error ? (e.cause ?? e.message) : e;
  console.error(`[api-proxy] ${method} ${API_BASE}${path} unreachable after ${ms}ms:`, cause);
}

/**
 * Server-side proxy to the backend API, authenticated with the current
 * session's id_token. Shared by every route under app/api/* so the
 * token lookup, headers, and error handling live in one place.
 *
 * The backend's status code and JSON body (including error `detail`) are
 * passed through unchanged, so client code can surface real error messages.
 */
export async function proxyToApi(
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<NextResponse> {
  const session = await auth();
  const token = session?.id_token;
  // These routes are excluded from the auth middleware, so reject
  // unauthenticated calls here instead of forwarding a tokenless request.
  if (!token) {
    console.warn(`[api-proxy] ${path}: no id_token in session (error=${session?.error ?? "none"})`);
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const method = init.method ?? "GET";
  const start = Date.now();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch (e) {
    logFetchError(method, path, Date.now() - start, e);
    // Backend unreachable — surface a clean 503 (which the client treats as a
    // possible outage) instead of an opaque Next.js 500.
    return NextResponse.json({ error: "API unreachable" }, { status: 503 });
  }

  const ms = Date.now() - start;
  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`[api-proxy] ${method} ${path} -> ${res.status} in ${ms}ms:`, data ?? res.statusText);
  } else if (data === null) {
    console.error(`[api-proxy] ${method} ${path} -> ${res.status} in ${ms}ms but body was not JSON`);
  } else {
    console.log(`[api-proxy] ${method} ${path} -> ${res.status} in ${ms}ms`);
  }
  return NextResponse.json(data ?? { error: res.statusText }, { status: res.status });
}

/**
 * Same as proxyToApi but streams the backend response through untouched —
 * for file downloads where the body isn't JSON.
 */
export async function proxyToApiRaw(path: string): Promise<NextResponse> {
  const session = await auth();
  const token = session?.id_token;
  if (!token) {
    console.warn(`[api-proxy] ${path}: no id_token in session (error=${session?.error ?? "none"})`);
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const start = Date.now();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (e) {
    logFetchError("GET", path, Date.now() - start, e);
    return NextResponse.json({ error: "API unreachable" }, { status: 503 });
  }
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    console.error(
      `[api-proxy] GET ${path} -> ${res.status} in ${Date.now() - start}ms:`,
      data ?? res.statusText
    );
    return NextResponse.json(data ?? { error: res.statusText }, { status: res.status });
  }
  const headers = new Headers();
  for (const name of ["Content-Type", "Content-Disposition"]) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextResponse(res.body, { headers });
}
