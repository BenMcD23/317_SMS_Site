# 317 SMS — Squadron Management System

Staff and NCO web app for 317 (Failsworth) Squadron RAFAC: cadet records,
assessments, stores, comms, and squadron admin. Next.js (App Router) +
TypeScript + shadcn/ui, talking to the
[SMS Scrapers API](https://github.com/BenMcD23/SMS_Scrapers_API).

The cadet-facing site is a separate app:
[317 Cadet Portal](https://github.com/BenMcD23/317_Cadet_Portal).

## Running locally

### Preview: seeded data, no setup

```bash
scripts/preview.sh                 # API :8000, this site :3000, cadet portal :3001
scripts/preview.sh --reset         # re-seed the API database
scripts/preview.sh --no-portal     # API and this site only
scripts/preview.sh status | stop
```

This starts the API on a seeded SQLite database, this site and the cadet
portal, all with fake sign-in: the login page shows STAFF / SNCO / NCO buttons.
It needs no Google, Postgres or cluster access. It does need the
[API](https://github.com/BenMcD23/SMS_Scrapers_API) cloned beside this repo
(`../SMS_Scrapers_API`, or set `$SMS_API_DIR`), and the portal at
`../317_cadet_portal` if you want that too. The first run installs what's
missing. Logs and the dev database are in `.preview/`.

To screenshot pages (written to `.preview/shots/`):

```bash
node scripts/screenshot.mjs /cadets/overview /stats
node scripts/screenshot.mjs --mobile --role nco /session-plans
node scripts/screenshot.mjs --full --theme light /stores/uniform/orders
```

### Against a real API

```bash
cp .env.local.tmpl .env.local   # fill in Google OAuth + service account
npm install
npm run dev                     # http://localhost:3000
```

The API must be running too (see its README). With `AUTH_DEV_BYPASS=1` in
`.env.local` and `DEV_FAKE_AUTH=1` on the API, the login page shows the same
fake sign-in buttons instead of Google.

## Checks

```bash
npm run check          # lint + typecheck + tests, run before committing
npm run format         # prettier (CI fails on unformatted files)
npm run build          # full production build, for routing/config changes
npm run test:watch     # vitest while you work
```

CI (`.github/workflows/ci.yml`) runs lint, formatting, typecheck, tests and the
build on every push and pull request. `security.yml` runs `npm audit` on pull
requests and weekly. It doesn't block merging, but a red audit should be fixed.

## How it fits together

- **Auth** — `auth.ts` / `auth.config.ts`. Google sign-in; the role (staff,
  SNCO, NCO) comes from Workspace group membership and is re-checked on every
  token renewal. The session carries a Google `id_token` which is what the API
  authenticates. `proxy.ts` is the route guard; `lib/access.ts` is the single
  list of which roles may reach which routes.
- **Navigation** — `lib/navigation.ts` defines the sidebar, the header
  breadcrumbs and the ⌘K palette in one place. Add a page there and it shows
  up in all three, gated by `lib/access.ts`.
- **Layout** — `components/layout/*` (sidebar, header, user menu, API status).
- **Talking to the API** — `lib/use-api-query.ts` for cached GETs,
  `lib/api-fetch.ts` for everything else (handles 401 → re-auth and outage
  detection). Server routes under `app/api/**` are thin wrappers over
  `lib/api-proxy.ts` for the cases where the browser shouldn't call the API
  directly (file downloads, larger payloads).
- **Reference data** — uniform sizes, badge catalogue and the like come from
  the API's `/reference` endpoint via `lib/reference.ts`, not from constants in
  this repo, so the two sites and the API can't drift.

## Deployment

Vercel, from `main` (production) and `development` (preview). Environment
variables are set in the Vercel project; `NEXT_PUBLIC_*` values are baked in at
build time, so changing one needs a redeploy.

## Contributing

- Branch off `main` and open a pull request back into it. `main` only accepts
  pull requests: no direct pushes, force-pushes or deletion.
- The CI `check` job must pass before merging.
- Changes under `.github/` need a review from @BenMcD23
  (`.github/CODEOWNERS`). Everything else merges on green CI.
- Every change ships with tests, and UI changes are checked in the preview at
  phone and desktop width. [`CLAUDE.md`](CLAUDE.md) has the conventions.
