#!/bin/sh
# Starts the preview image (Dockerfile) at this stack's addresses: swaps the
# placeholder origins the build inlined for PUBLIC_API_BASE and
# PUBLIC_PORTAL_URL. Covers the browser bundles, the server bundles and the
# CSP in routes-manifest.json, which all carry the build-time value.
set -eu
: "${PUBLIC_API_BASE:?set PUBLIC_API_BASE to the API address phones use}"
: "${PUBLIC_PORTAL_URL:?set PUBLIC_PORTAL_URL to the cadet portal address}"
grep -rlE 'https://preview-(api|portal)\.invalid' .next | xargs -r sed -i \
  -e "s#https://preview-api\.invalid#${PUBLIC_API_BASE}#g" \
  -e "s#https://preview-portal\.invalid#${PUBLIC_PORTAL_URL}#g"
exec "$@"
