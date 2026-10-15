#!/usr/bin/env bash
# Run the whole local stack with fake sign-in: no Google, no cluster, no
# Postgres. The seeded API (:8000), this site (:3000) and, when it's checked
# out beside this repo, the cadet portal (:3001). One command from a fresh
# checkout (or a fresh cloud Claude session) to sites you can click through
# and screenshot.
#
#   scripts/preview.sh              start everything (installs what's missing first)
#   scripts/preview.sh --reset      same, but re-seed the API database
#   scripts/preview.sh --no-portal  API and this site only
#   scripts/preview.sh stop         stop everything
#   scripts/preview.sh status       what's up?
#
# Expects the API checked out beside this repo (../SMS_Scrapers_API) or at
# $SMS_API_DIR, and the portal at ../317_cadet_portal or $PORTAL_DIR. Logs,
# pids and the dev database go in .preview/ (gitignored), so nothing is
# written into the API checkout. The API's seed is described in its
# app/scripts/dev_server.py; screenshots: scripts/screenshot.mjs.
#
# Sign in at /login on either site with the STAFF / SNCO / NCO buttons. On the
# portal SNCO and NCO are cadets with a record; STAFF is an adult without one.
set -euo pipefail

SITE="$(cd "$(dirname "$0")/.." && pwd)"
API="${SMS_API_DIR:-$SITE/../SMS_Scrapers_API}"
STATE="$SITE/.preview"
PORTAL="${PORTAL_DIR:-$SITE/../317_cadet_portal}"
SITE_PORT="${SITE_PORT:-3000}"
API_PORT="${API_PORT:-8000}"
PORTAL_PORT="${PORTAL_PORT:-3001}"
# Kept out of the API checkout, whose data/ may not be writable by this user.
API_DB="${API_DB:-$STATE/dev.db}"
with_portal=1
[[ -d "$PORTAL/app" ]] || with_portal=0
mkdir -p "$STATE"

stop() {
  for name in api site portal; do
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
  *) sed -n '2,20p' "$0"; exit 1 ;;
esac
[[ "${1:-}" == "--no-portal" ]] && with_portal=0

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
if [[ ! -d "$SITE/node_modules" ]]; then
  echo "Installing node modules…"
  (cd "$SITE" && npm ci --no-audit --no-fund)
fi

if [[ $with_portal == 1 ]]; then
  [[ -d "$PORTAL/node_modules" ]] || { echo "Installing portal node modules…"; (cd "$PORTAL" && npm ci --no-audit --no-fund); }
  if [[ ! -f "$PORTAL/.env.local" ]]; then
    cat > "$PORTAL/.env.local" <<ENVEOF
# Written by the site's scripts/preview.sh for the local preview. Not real credentials.
AUTH_SECRET="$(openssl rand -hex 32)"
GOOGLE_CLIENT_ID=preview
GOOGLE_CLIENT_SECRET=preview
NEXT_PUBLIC_API_BASE=http://localhost:$API_PORT
AUTH_DEV_BYPASS=1
ENVEOF
  elif ! grep -q '^AUTH_DEV_BYPASS=1' "$PORTAL/.env.local"; then
    echo "warning: the portal's .env.local has no AUTH_DEV_BYPASS=1, so its login page won't sign you in." >&2
  fi
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
# The dev API treats the STAFF (owner) login as the OC, so /oc opens.
NEXT_PUBLIC_OC_EMAIL=ci.mcdonald@317atc.co.uk
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
# The portal's own dev script (ipv4-first DNS) runs on 3001; the env var points
# it at this API whatever its .env.local says.
[[ $with_portal == 1 ]] && launch portal "$PORTAL" env "NEXT_PUBLIC_API_BASE=http://localhost:$API_PORT" npm run dev

wait_for "http://localhost:$API_PORT/reference" api 60
wait_for "http://localhost:$SITE_PORT/login" site 120
[[ $with_portal == 1 ]] && wait_for "http://localhost:$PORTAL_PORT/login" portal 120
status
echo "Sign in with the STAFF / SNCO / NCO buttons on /login. Stop with: scripts/preview.sh stop"
