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
- **Lists of records** are `DataTable` (`components/data-table.tsx`, TanStack
  Table): sortable headings with `aria-sort`, `rowHref` for click-through.
  Build columns with `dataTableColumns<Row>()`; give odd orders (ranks) a
  `sortFn`.
- **Forms in a dialog** use `ResponsiveDialog` (`components/responsive-dialog.tsx`):
  a dialog on a laptop, a bottom sheet on a phone, same parts as `Dialog`.
  Validation is react-hook-form + a zod schema (see `lib/stock-form.ts`).
- **Expandable orders** are `OrderDisclosure` rows in an `OrderList`
  (`components/order-disclosure.tsx`): the whole header toggles, the body
  animates open with motion.
- **Figures** go in a `StatGroup` of `Stat`s (one strip, hairline dividers),
  not a grid of boxed tiles; `DividedGrid` is the same frame for link lists.
- **Personal data** (email, phone, date of birth or age, address, medical,
  bank details, JPA number) is wrapped in `<Private>` or passed through
  `usePrivateText()` (`components/private.tsx`), so the "Hide personal data"
  switch (Settings, staff only) removes it. Nothing is left in its place, so
  wrap the label, column or section with the value. Names, ranks and CINs stay.
  SNCOs and NCOs are never sent anyone else's: the API strips it.
- **Badge names** come from `badgeLabel(key)` (`lib/stats.ts`), never a raw
  key. **Flight colours** are the chart hues, never the status colours.

## Page layout

- **Width**: every page wraps its content in `mx-auto flex w-full max-w-… flex-col gap-6 pb-16`,
  using one of three widths (`tests/page-widths.test.ts` enforces this):
  `max-w-3xl` for one form or document read top to bottom (marking sheets,
  session plans, settings); `max-w-5xl`, the default, for lists, tables,
  records and multi-column forms; `max-w-6xl` for dashboards and charts.
- **Tabs** are the shadcn `Tabs`. With counts ("Active 4"), use `CountTabs`
  (`components/count-tabs.tsx`). A tab row scrolls sideways on a phone by
  itself, so don't add overflow classes. Don't hand-build tab bars from buttons.
  Filters that narrow one list (All / A / B / C) are a `ToggleGroup`
  (`components/flight-filter.tsx`), not tabs.

## UI: how it should look and feel

Read `PRODUCT.md` first: the users are volunteers doing a task, often one-handed
on a phone on parade night, so the task beats the chrome. The look is the 317
identity (navy primary, cool neutrals, dark sidebar in both themes, Atkinson
Hyperlegible) refined, not restyled per page. These rules exist to stop pages
drifting back to the generic-template look.

**Look**

- **Flat and quiet.** Cards have a border and no shadow. Don't wrap every
  section in a `Card`, never nest cards, and don't build pages from rows of
  identical icon + heading + text tiles. A list of records is a framed list
  (`OrderList`, `DividedGrid`, `DataTable`), not a stack of cards.
- **Colour is a token, never a literal.** `text-warning`, `bg-primary/10`,
  `border-success/40` — not `orange-500`, `violet-100` or `amber-800`. The
  status colours (`success`, `warning`, `destructive`) mean a state and
  nothing else: a flight or a classification is never red. Badge metals
  (bronze, silver, gold) are the one domain exception, in `lib/stats.ts`.
- **No decoration.** No gradient text, no eyebrow labels above headings, no
  emoji or Unicode glyphs as icons (lucide only, one stroke weight), no
  hover-only affordances (a phone has no hover; show the chevron).
- **Type.** One family. Headings carry weight, not size jumps; tabular figures
  are already on for the whole app. Copy is plain British English, and a
  control names its action ("Add stock", not "Submit").

**Phone first**

- Design at 390px, then widen. Check every change at 390 and 1440, light and
  dark, with real-length names.
- Tap targets: icon buttons are at least `size-8` (32px), buttons that
  matter are `h-9` or more, and a whole row that opens something is
  clickable, not only its chevron. Item actions wrap under the
  item (`flex-wrap`), they don't sit in a fixed side column.
- A dialog with a form is a `ResponsiveDialog` (sheet on a phone), so its
  buttons stay in thumb reach. A plain yes/no confirm stays `useConfirm`.
- Tabs scroll sideways by themselves; filters that narrow one list are a
  `ToggleGroup`, never tabs.

**Components: reuse before you build**

| Need                     | Use                                                                             |
| ------------------------ | ------------------------------------------------------------------------------- |
| Sortable list of records | `DataTable` (TanStack Table), columns from `dataTableColumns<Row>()`            |
| Expandable orders        | `OrderDisclosure` in an `OrderList`, `OrderListSkeleton` while loading          |
| Headline figures         | `StatGroup` of `Stat`s                                                          |
| Framed list of links     | `DividedGrid as="ul"`                                                           |
| Form in a dialog         | `ResponsiveDialog` + react-hook-form + zod (`lib/stock-form.ts` is the pattern) |
| Empty, error, loading    | `EmptyState`, `ErrorAlert`, `ListSkeleton` / `OrderListSkeleton`                |

If the same markup appears on a second page, extract it into `components/`
with a doc comment saying why it exists, and give it a test. New shadcn parts:
`npx shadcn@latest add <name>`, then check the generated file's imports (the
`drawer` came with `import { cn } from "cn"`, a different npm package; it must
be `@/lib/utils`).

**Libraries.** TanStack Table for in-memory sortable lists; react-hook-form +
zod for any form with validation (inline error under the field once it's been
touched, the API's own message from `errorDetail` on a failed save); `motion`
for open/close and reorder; `vaul` only through `ResponsiveDialog`. Don't add a
UI library for something these or shadcn already do.

**Forms.** Every control has a visible `<Label htmlFor>` (or `FieldLabel`) tied
to its `id`. Keep Radix `Select` out of a `<form>` element: inside one it adds
a hidden native select that echoes programmatic values back through
`onValueChange` (see `StockItemFields`). Validation errors say what to do
("At least 1"), not what's wrong with the code.

**Motion.** 150–250ms, to show a state change (open, close, reorder) and
nothing else; no entrance choreography on page load. Use `motion/react`; the
app sets `MotionConfig reducedMotion="user"`, and tests skip animations
(`vitest.setup.ts`), so a closed panel is gone when a test looks.

**Before calling UI work done:** run `scripts/preview.sh`, screenshot the
pages you touched at `--mobile` and desktop in both themes, run `npm run check`,
and run `/impeccable detect` over the changed files. Every new page gets a
`PageHeader`, one of the three widths, a loading skeleton, an empty state and
an error state.

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

## Looking at the UI (works in a cloud session too)

Tests prove behaviour; for anything visual, also look at it. One command
starts the API on a seeded SQLite database (no Postgres, Google or cluster),
this site and, if `../317_cadet_portal` exists, the cadet portal, all with
fake sign-in:

```bash
scripts/preview.sh                 # API :8000 + site :3000 + portal :3001; installs what's missing
scripts/preview.sh --reset         # re-seed the API database from scratch
scripts/preview.sh --no-portal     # API and this site only
scripts/preview.sh status | stop
node scripts/screenshot.mjs /cadets/overview /stats          # → .preview/shots/*.png
node scripts/screenshot.mjs --mobile --role nco /session-plans
node scripts/screenshot.mjs --full --theme light /stores/uniform/orders
```

- It needs the API checked out beside this repo (`../SMS_Scrapers_API`) or at
  `$SMS_API_DIR`. In a cloud session, add the repo first (`add_repo`
  BenMcD23/SMS_Scrapers_API) and clone it there.
- First run creates the API's `venv/`, `node_modules` and a fake-auth
  `.env.local` in each site (an existing `.env.local` is never touched; it just
  needs `AUTH_DEV_BYPASS=1`). Logs and the dev database are in `.preview/`.
- On the portal, SNCO and NCO sign in as cadets with a record (orders, issued
  kit, details); STAFF is an adult with none, which is the other code path.
- Screenshots sign in through the login page's STAFF / SNCO / NCO buttons;
  `--role` picks one, so check each role a page treats differently. Staff is
  the owner account, so owner-only pages show too.
- Open the PNGs with the Read tool to see them. Look at phone width
  (`--mobile`) as well as desktop; most layout bugs only show there.
- The seed (the API's `app/scripts/dev_server.py`) is deterministic: about 60
  cadets in flights A–C, NCO ranks, attendance, qualifications with first aid
  expiries, staff, stores stock and open orders. It stores ranks, flights and
  qualification names the way the scrapers do, so what you see is what
  production shows. Data you add through the UI persists until `--reset`.
- **Changing the database means changing the seed.** Work that adds or alters
  an API table or column also updates the seed in `app/scripts/dev_server.py`
  (API repo) in the same change, so the preview shows it. The API's
  `test_dev_server.py` fails on a column the seed never sets. Check the page
  against the re-seeded data: `preview.sh` re-seeds by itself when the models
  have moved past the dev database, and `--reset` forces it.
- Stats trends need weeks of snapshots, so those charts show "not enough
  history" in the preview. That is expected.

### On your phone: a preview stack on the cluster

Label a pull request `preview` (here, in the API or in the portal) and the
k3s cluster runs that branch on the same seed with the same sign-in buttons,
on the tailnet: `https://pv-<branch>-sms.tail02e471.ts.net` and
`https://pv-<branch>-portal.tail02e471.ts.net`. A repo without the branch
runs main. The image is this repo's `Dockerfile`, built for every branch by
`.github/workflows/preview-image.yml`; how it fits together is in k3s-homelab's
ADR 0010.

## Navigation and reference data

- New pages are registered in `lib/navigation.ts` (sidebar, breadcrumbs and the
  ⌘K palette all read it) and gated in `lib/access.ts`.
- Item types, sizes and the badge catalogue come from `useReference()` in
  `lib/reference.ts` (the API's `/reference`). Never hardcode them.

## Branches and pull requests

- Branch off `main` and open a pull request into it. `main` takes nothing else:
  no direct pushes, force-pushes or deletion.
- CI must pass to merge: the `check` job (lint, prettier, typecheck, tests,
  build). `npm-audit` doesn't block, but fix a red one. Changes under
  `.github/` also need @BenMcD23's review (`.github/CODEOWNERS`).
- Fill in the pull request template: what changed, why, and how you checked it.
  A UI change includes phone and desktop screenshots from the preview.
- Before pushing: `npm run check && npm run format:check`, plus
  `npm run build` for anything that touches routing or config.
