#!/usr/bin/env bash
# Run the whole local stack with fake sign-in: no Google, no cluster, no
# Postgres. The seeded API (:8000), this site (:3000) and, when they're checked
# out beside this repo, the cadet portal (:3001) and the squadron website
# (:5173, where parents fill in the joining form). One command from a fresh
# checkout (or a fresh cloud Claude session) to sites you can click through
# and screenshot.
#
#   scripts/preview.sh              start everything (installs what's missing first)
#   scripts/preview.sh --reset      same, but re-seed the API database
#   scripts/preview.sh --no-portal  skip the cadet portal and the website (API and this site only)
#   scripts/preview.sh stop         stop everything
#   scripts/preview.sh status       what's up?
#
# Expects the API checked out beside this repo (../SMS_Scrapers_API) or at
# $SMS_API_DIR, the portal at ../317_Cadet_Portal or $PORTAL_DIR, and the website
# at ../cadet-website or $WEBSITE_DIR. Logs,
# pids and the dev database go in .preview/ (gitignored), so nothing is
# written into the API checkout. The API's seed is described in its
# app/scripts/dev_server.py; screenshots: scripts/screenshot.mjs.
#
# Sign in at /login on either site with the STAFF / SNCO / NCO buttons. The
# portal also has CADET: an ordinary cadet, Cdt Kian Ashworth, with no NCO
# role. On the portal CADET, SNCO and NCO are cadets with a record; STAFF is an
# adult without one. CADET has DofE switched on (Bronze), for the activity log.
# The website has no login: open a recruit on /recruits here and use its link
# (http://localhost:5173/enrol/<token>) to fill the joining form in.
set -euo pipefail

SITE="$(cd "$(dirname "$0")/.." && pwd)"
API="${SMS_API_DIR:-$SITE/../SMS_Scrapers_API}"
STATE="$SITE/.preview"
PORTAL="${PORTAL_DIR:-$SITE/../317_Cadet_Portal}"
# Older checkouts cloned it lower-case.
[[ -d "$PORTAL" || -n "${PORTAL_DIR:-}" ]] || PORTAL="$SITE/../317_cadet_portal"
SITE_PORT="${SITE_PORT:-3000}"
API_PORT="${API_PORT:-8000}"
PORTAL_PORT="${PORTAL_PORT:-3001}"
WEBSITE="${WEBSITE_DIR:-$SITE/../cadet-website}"
# 5173 is also what the API's dev seed puts in recruits' joining links.
WEBSITE_PORT="${WEBSITE_PORT:-5173}"
# Kept out of the API checkout, whose data/ may not be writable by this user.
API_DB="${API_DB:-$STATE/dev.db}"
with_portal=1
[[ -d "$PORTAL/app" ]] || with_portal=0
with_website=1
[[ -f "$WEBSITE/vite.config.js" ]] || with_website=0
mkdir -p "$STATE"

stop() {
  for name in api site portal website; do
    if [[ -f "$STATE/$name.pid" ]]; then
      # The pid is a process group leader (setsid below), so this takes its
      # children too — next dev's workers, uvicorn.
      local group
      group="$(cat "$STATE/$name.pid")"
      kill -- -"$group" 2>/dev/null || true
      # uvicorn and next shut down gracefully; give them a moment, then insist,
      # so a restart never finds the old one still holding the port.
      for _ in $(seq 20); do
        kill -0 -- -"$group" 2>/dev/null || break
        sleep 0.5
      done
      kill -9 -- -"$group" 2>/dev/null || true
      rm -f "$STATE/$name.pid"
    fi
  done
}

up() { curl -s -o /dev/null --max-time 2 "$1"; }

status() {
  up "http://localhost:$API_PORT/reference" && echo "api   up   http://localhost:$API_PORT" || echo "api   down (log: $STATE/api.log)"
  up "http://localhost:$SITE_PORT/login" && echo "site  up   http://localhost:$SITE_PORT" || echo "site  down (log: $STATE/site.log)"
  if [[ $with_portal == 1 ]]; then
    up "http://localhost:$PORTAL_PORT/login" && echo "portal up  http://localhost:$PORTAL_PORT" || echo "portal down (log: $STATE/portal.log)"
  fi
  if [[ $with_website == 1 ]]; then
    up "http://localhost:$WEBSITE_PORT/" && echo "website up http://localhost:$WEBSITE_PORT" || echo "website down (log: $STATE/website.log)"
  fi
}

wait_for() {  # url, name, seconds
  for _ in $(seq "$3"); do
    up "$1" && return 0
    sleep 1
  done
  echo "$2 didn't come up in $3s — last lines of $STATE/$2.log:" >&2
  tail -20 "$STATE/$2.log" >&2
  exit 1
}

case "${1:-start}" in
  stop) stop; exit 0 ;;
  status) status; exit 0 ;;
  start | --reset | --no-portal) ;;
  *) sed -n '2,27p' "$0"; exit 1 ;;
esac
[[ "${1:-}" == "--no-portal" ]] && with_portal=0 with_website=0

if [[ ! -d "$API/app" ]]; then
  echo "No API checkout at $API — clone SMS_Scrapers_API beside this repo or set SMS_API_DIR." >&2
  exit 1
fi

# ── dependencies, only when missing ──────────────────────────────────────────
if [[ ! -x "$API/venv/bin/python" ]]; then
  echo "Creating the API virtualenv (one-off, a couple of minutes)…"
  python3 -m venv "$API/venv"
  "$API/venv/bin/pip" install -q -r "$API/requirements-dev.txt"
fi
# Also when the lockfile has moved on since the last install, so a pull that
# adds a package doesn't leave dev failing on a missing module.
node_deps() {  # dir, label
  [[ -f "$1/node_modules/.package-lock.json" && ! "$1/package-lock.json" -nt "$1/node_modules/.package-lock.json" ]] && return
  echo "Installing $2 node modules…"
  (cd "$1" && npm ci --no-audit --no-fund)
}
node_deps "$SITE" site

if [[ $with_portal == 1 ]]; then
  node_deps "$PORTAL" portal
  if [[ ! -f "$PORTAL/.env.local" ]]; then
    cat > "$PORTAL/.env.local" <<ENVEOF
# Written by the site's scripts/preview.sh for the local preview. Not real credentials.
AUTH_SECRET="$(openssl rand -hex 32)"
GOOGLE_CLIENT_ID=preview
GOOGLE_CLIENT_SECRET=preview
NEXT_PUBLIC_API_BASE=http://localhost:$API_PORT
AUTH_DEV_BYPASS=1
ENVEOF
  fi
fi

if [[ $with_website == 1 ]]; then
  node_deps "$WEBSITE" website
fi

# Fake-auth settings only. An existing .env.local is someone's real config, so
# it's left alone — it just needs AUTH_DEV_BYPASS=1 and the API URL below.
if [[ ! -f "$SITE/.env.local" ]]; then
  cat > "$SITE/.env.local" <<EOF
# Written by scripts/preview.sh for the local preview. Not real credentials.
AUTH_SECRET="$(openssl rand -hex 32)"
GOOGLE_CLIENT_ID=preview
GOOGLE_CLIENT_SECRET=preview
NEXTAUTH_URL=http://localhost:$SITE_PORT
NEXT_PUBLIC_API_BASE=http://localhost:$API_PORT
# Where the lesson QR codes point. The portal isn't part of the preview, but
# the codes need an address to draw.
NEXT_PUBLIC_PORTAL_URL=http://localhost:3001
AUTH_DEV_BYPASS=1
EOF
elif ! grep -q '^AUTH_DEV_BYPASS=1' "$SITE/.env.local"; then
  echo "warning: .env.local has no AUTH_DEV_BYPASS=1, so the login page won't offer dev sign-in." >&2
fi

# ── start ────────────────────────────────────────────────────────────────────
stop
reset=()
[[ "${1:-}" == "--reset" ]] && reset=(--reset)

# Each server runs in its own process group with its pid (= group id) on file,
# so `stop` takes the whole tree. stdin/stdout are detached from this script so
# it returns as soon as both are up.
launch() {  # name, dir, command…
  local name="$1" dir="$2"
  shift 2
  setsid bash -c 'echo $$ > "$0"; cd "$1"; shift 2; exec "$@"' "$STATE/$name.pid" "$dir" -- "$@" \
    < /dev/null > "$STATE/$name.log" 2>&1 &
}
launch api "$API" "$API/venv/bin/python" app/scripts/dev_server.py --port "$API_PORT" --db "$API_DB" "${reset[@]}"
launch site "$SITE" npx next dev -p "$SITE_PORT"
# The portal's own dev script (ipv4-first DNS) runs on 3001; the env vars point
# it at this API and switch dev sign-in on whatever its .env.local says, so a
# real .env.local there is left untouched.
[[ $with_portal == 1 ]] && launch portal "$PORTAL" env "NEXT_PUBLIC_API_BASE=http://localhost:$API_PORT" AUTH_DEV_BYPASS=1 npm run dev
# The website's joining form talks to this API straight from the browser, so
# its API address is passed in; --strictPort so a busy port fails loudly (the
# links the API hands out assume this one).
[[ $with_website == 1 ]] && launch website "$WEBSITE" env "VITE_API_BASE=http://localhost:$API_PORT" npx vite --port "$WEBSITE_PORT" --strictPort

wait_for "http://localhost:$API_PORT/reference" api 60
wait_for "http://localhost:$SITE_PORT/login" site 120
[[ $with_portal == 1 ]] && wait_for "http://localhost:$PORTAL_PORT/login" portal 120
[[ $with_website == 1 ]] && wait_for "http://localhost:$WEBSITE_PORT/" website 60
status
echo "Sign in with the STAFF / SNCO / NCO buttons on /login (the portal's CADET is Cdt Kian Ashworth). Stop with: scripts/preview.sh stop"
