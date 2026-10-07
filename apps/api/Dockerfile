# api — the live Hono REST + SSE service (D-P0.08-1/D-P0.08b-1). Runs on Cloud Run inside the VPC so the
# sandbox run-task pods can reach it at API_INTERNAL_URL (the sandbox egresses only to the private-app tier
# + the proxy). Multi-stage: install the workspace, build the @rhema/api slice + its deps, ship a pruned
# prod bundle. The entrypoint is server.ts's self-invoking guard (`node dist/server.js`), which constructs
# every orchestrator DI seam from @rhema/live-clients and listens.
#
# (Replaces the P0.01 placeholder sleeper — the api now ships real logic for the Phase-0 live exit runs.)

# ---- builder: install the workspace, build the api slice, produce a pruned prod bundle ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS builder
WORKDIR /repo
ENV CI=1
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rhema/api... build
RUN pnpm --filter @rhema/api --prod deploy --legacy /bundle

# ---- runtime: non-root, minimal ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
# JOURNEY.1 (REQ-ARCH-39) — the deploy provenance field: `docker build --build-arg GIT_SHA=<sha>` bakes
# the commit into the image; /healthz serves it as `build.gitSha`. `unknown` fails the check closed.
ARG GIT_SHA=unknown
ENV RHEMA_BUILD_GIT_SHA=$GIT_SHA
RUN groupadd --gid 10004 api \
  && useradd --uid 10004 --gid 10004 --home-dir /home/api --create-home --shell /usr/sbin/nologin api
WORKDIR /app
COPY --from=builder /bundle /app
USER api
# Cloud Run injects PORT; env.ts reads it (default 8080). The DB/Redis/secret/bucket env come from the
# service config. Secrets (run-token keypair) are read from Secret Manager at boot via ADC.
EXPOSE 8080
CMD ["node", "/app/dist/server.js"]
