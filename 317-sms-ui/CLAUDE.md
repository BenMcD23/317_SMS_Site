# 317-sms-ui conventions

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
  so 401s trigger re-auth and outages notify the status overlay.

## Comments explain *why*, not *what*

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

## Before committing

Run `npm run lint` (and `npm run build` for type-level changes) from
`317-sms-ui/`. ESLint config is `eslint.config.mjs`.
