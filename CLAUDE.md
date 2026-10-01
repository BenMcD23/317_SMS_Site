# 317 SMS conventions

Next.js (App Router) + TypeScript + shadcn/ui frontend. The conventions below
are what the codebase actually follows — match them rather than introducing new
patterns.

## Don't duplicate — reach for the shared helper

The recurring rule: when the same logic appears on more than one page, it lives
in a shared module and the pages import it. If you find yourself copy-pasting a
block, stop and extract it instead.

- **Server API routes** (`app/api/**/route.ts`) are thin wrappers over
  `proxyToApi` / `proxyToApiRaw` from `lib/api-proxy.ts`. A route handler just
  awaits `params`, then returns `proxyToApi("/backend/path", { method, body })`.
  Auth token lookup, headers, backend error pass-through, and unreachable-API
  handling all live in the proxy — never re-implement them per route.

  ```ts
  export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    return proxyToApi(`/stores/orders/${id}`, { method: "DELETE" });
  }
  ```

- **Date/time** goes through `lib/format.ts` (`formatDate`, `formatTimestamp`).
  Do not hand-roll `new Date(...).toLocaleString(...)` in a component.

- **Confirm-before-destructive** uses the `useConfirm()` hook from
  `components/confirm-dialog.tsx`: `const { confirm, confirmDialog } = useConfirm()`,
  call `confirm("Delete this?", () => doDelete())`, and render `{confirmDialog}`.
  Don't rebuild the open/message/pendingAction state by hand.

- **Client fetches** to internal API routes go through `apiFetch` (`lib/api-fetch.ts`)
  so 401s trigger re-auth and outages notify the status overlay. JSON writes use
  `apiRequest`, and error messages come from `errorDetail` — it flattens
  FastAPI's validation lists, which otherwise toast as "[object Object]".
- **Downloads** go through `saveResponseAsFile` (`lib/download.ts`), which reads
  the RFC 5987 `filename*` the API sends for non-ASCII names.
- **"Today" for a date input** is `todayLocal()` from `lib/format.ts`;
  `toISOString()` is UTC and gives yesterday after midnight in summer.

## Comments explain _why_, not _what_

Every shared helper opens with a short doc comment saying what it is and why it
exists ("Shared by every route so the token lookup lives in one place"). Inline
comments justify non-obvious decisions — e.g. why a 404 is swallowed but other
errors re-thrown, why polling slows while the tab is hidden. Skip comments that
merely restate the code.

## Error handling: distinguish "no" from "couldn't check"

See `auth.ts`. A definitive negative (Google 404 = not a group member) returns
`false`; any other failure (network, quota, auth) is re-thrown/propagated so
callers can tell "no role" apart from "the lookup itself failed" and choose a
safe fallback (e.g. keep the existing role rather than lock the user out).
Backend-unreachable in the proxy surfaces a clean `503`, not an opaque `500`.

## Style

- Two-space indent; double-quoted strings; semicolons in `.ts`/`.tsx` under
  `app/`, `components/`, `lib/`. (`auth.ts` omits them — match the file you edit.)
- Import order: framework/third-party first, then `@/` aliases; always use the
  `@/` path alias, never deep relative paths.
- `"use client"` at the top of any component using hooks/browser APIs.
- Tailwind utility classes via shadcn tokens (`text-muted-foreground`,
  `bg-destructive`, `size-4`); compose conditional classes with `cn()` from
  `lib/utils.ts`.
- Route `params` are a `Promise` in this Next version — always `await` them.

## Tests are part of every change

Every change ships with tests — a feature with tests for what it does, a bug fix
with a test that fails without the fix (run it against the old code once to
prove it). Test the unhappy paths as hard as the happy one: the API answering
4xx/5xx or not at all, an error body (`{detail}`) where a list was expected,
empty and missing data, a 401 mid-session, and every role that should and
shouldn't get in. "It renders" is not a test of a feature.

**Tooling.** Vitest + Testing Library. `npm test` runs once (CI runs it);
`npm run test:watch` while working; `npm run test:coverage` for a report.

**Where tests live.** Next to the code: `lib/format.ts` → `lib/format.test.ts`,
`components/cadet-search.tsx` → `components/cadet-search.test.tsx`. Cross-cutting
suites live in `tests/` (auth, middleware, every API route, every page).

**How to write them.**

- Tests run in Node. A test that needs a DOM starts with
  `// @vitest-environment jsdom` on line 1.
- Mock the edges, not our own code: `fetch` via `vi.stubGlobal("fetch", …)`,
  `next-auth/react`, `next/navigation`, `@/auth`. Return a _fresh_ `Response`
  per call — a body can only be read once.
- Never hit the network or the real API. Nothing may depend on the time zone
  (the setup pins `Europe/London`) or on test order — mocks, env and globals are
  restored after each test (`vitest.config.mts`), so don't rely on leftovers.
- `useSession` mocks must return one stable object; pages key effects on it.
- Query by role and accessible name (`getByRole("button", { name: "Save" })`).
  If a control can't be found that way, give it an accessible name — that's an
  accessibility bug, not a testing inconvenience.
- Name a test after the behaviour: "an error response shows 'No cadet found'
  instead of crashing", not "test search".

**What's already covered for you** (keep it that way):

- `tests/api-routes.test.ts` imports every `app/api/**/route.ts`, calls each
  method and pins the backend path in a snapshot. A new or changed route shows
  up as a snapshot diff — check it, then `npx vitest run -u` to accept.
- `tests/pages-smoke.test.tsx` renders every page while loading and after the
  API returns 500. A new page must survive both; guard `res.ok` before using a
  body (`loadError`, `apiRequest` and `errorDetail` in `lib/api-fetch.ts`).
- `lib/navigation.test.ts` fails if a sidebar link has no page.
- `lib/assessment-fields.test.ts` pins the pass rules and limits the API also
  enforces — change both repos together.

## Before committing

Run `npm run check` (lint + typecheck + tests); `npm run build` for anything that
touches routing or config. ESLint config is `eslint.config.mjs`; formatting is
prettier (`npm run format`).

## Navigation and reference data

- New pages are registered in `lib/navigation.ts` (sidebar, breadcrumbs and the
  ⌘K palette all read it) and gated in `lib/access.ts`.
- Item types, sizes and the badge catalogue come from `useReference()` in
  `lib/reference.ts` (the API's `/reference`). Never hardcode them.
