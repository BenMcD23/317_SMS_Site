# 317 SMS — Squadron Management System

Staff and NCO web app for 317 (Failsworth) Squadron RAFAC: cadet records,
assessments, stores, comms, and squadron admin. Next.js (App Router) +
TypeScript + shadcn/ui, talking to the
[SMS Scrapers API](https://github.com/BenMcD23/SMS_Scrapers_API).

The cadet-facing site is a separate app:
[317 Cadet Portal](https://github.com/BenMcD23/317_Cadet_Portal).

## Running locally

```bash
cp .env.local.tmpl .env.local   # fill in Google OAuth + service account
npm install
npm run dev                     # http://localhost:3000
```

The API must be running too (see its README). With `AUTH_DEV_BYPASS=1` in
`.env.local` and `DEV_FAKE_AUTH=1` on the API, the login page shows
Staff / SNCO / NCO buttons that skip Google entirely.

## Checks

```bash
npm run check         # lint + typecheck — run before committing
npm run build         # full production build, for routing/config changes
npm run format        # prettier
```

CI runs all three on every push and pull request.

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

Conventions are in [`CLAUDE.md`](CLAUDE.md).

## Deployment

Vercel, from `main` (production) and `development` (preview). Environment
variables are set in the Vercel project; `NEXT_PUBLIC_*` values are baked in at
build time, so changing one needs a redeploy.
