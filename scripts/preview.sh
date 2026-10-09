#!/usr/bin/env bash
# Run the site against a local, seeded API with fake sign-in: no Google, no
# cluster, no Postgres. One command from a fresh checkout (or a fresh cloud
# Claude session) to a site you can click through and screenshot.
#
#   scripts/preview.sh            start both (installs what's missing first)
#   scripts/preview.sh --reset    same, but re-seed the API database
#   scripts/preview.sh stop       stop both
#   scripts/preview.sh status     are they up?
#
# Expects the API checked out beside this repo (../SMS_Scrapers_API) or at
# $SMS_API_DIR. Logs and pids go in .preview/ (gitignored). The API's seed is
# described in its app/scripts/dev_server.py; screenshots: scripts/screenshot.mjs.
set -euo pipefail

SITE="$(cd "$(dirname "$0")/.." && pwd)"
API="${SMS_API_DIR:-$SITE/../SMS_Scrapers_API}"
STATE="$SITE/.preview"
SITE_PORT="${SITE_PORT:-3000}"
API_PORT="${API_PORT:-8000}"
mkdir -p "$STATE"

stop() {
  for name in api site; do
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
  start | --reset) ;;
  *) sed -n '2,13p' "$0"; exit 1 ;;
esac

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
launch api "$API" "$API/venv/bin/python" app/scripts/dev_server.py --port "$API_PORT" "${reset[@]}"
launch site "$SITE" npx next dev -p "$SITE_PORT"

wait_for "http://localhost:$API_PORT/reference" api 60
wait_for "http://localhost:$SITE_PORT/login" site 120
status
echo "Sign in with the STAFF / SNCO / NCO buttons on /login. Stop with: scripts/preview.sh stop"
