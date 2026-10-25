# syntax=docker/dockerfile:1.7
# The SMS site for the cluster's preview stacks (k3s-homelab, ADR 0010): seeded
# data and the dev sign-in, reachable only over the tailnet. Production is
# Vercel and never builds this file.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# NEXT_PUBLIC_* are inlined at build time, but each stack has its own
# addresses. The build bakes in placeholders that docker-entrypoint.sh swaps
# for the stack's real ones when the pod starts. PREVIEW_BUILD is what lets a
# production build offer the dev sign-in (lib/config.ts devSignInBuild).
ENV NEXT_PUBLIC_PREVIEW_BUILD=1 \
    NEXT_PUBLIC_API_BASE=https://preview-api.invalid \
    NEXT_PUBLIC_PORTAL_URL=https://preview-portal.invalid \
    NEXT_PUBLIC_OC_EMAIL=ci.mcdonald@317atc.co.uk \
    AUTH_SECRET=build-placeholder
RUN npm run build && npm prune --omit=dev

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
ENTRYPOINT ["scripts/docker-entrypoint.sh"]
CMD ["node_modules/.bin/next", "start"]
