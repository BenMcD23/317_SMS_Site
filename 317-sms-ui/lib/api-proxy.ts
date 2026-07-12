import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { API_BASE } from "@/lib/config";

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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const res = await fetch(`${API_BASE}${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });

  if (res.status === 204) return new NextResponse(null, { status: 204 });
  const data = await res.json().catch(() => null);
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    return NextResponse.json(data ?? { error: res.statusText }, { status: res.status });
  }
  const headers = new Headers();
  for (const name of ["Content-Type", "Content-Disposition"]) {
    const value = res.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new NextResponse(res.body, { headers });
}
