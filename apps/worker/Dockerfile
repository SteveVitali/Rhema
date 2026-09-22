# worker — the always-on run-lifecycle service (D-P0.08-1/D-P0.11-1). Runs the pg-boss consumers
# (run.start/resume/cancel) + crons (reaper, parked sweep, run-event retention/partition), mints run tokens,
# and launches the two-uid run-task GKE Jobs. Deployed on Cloud Run with min-instances=1 + CPU always
# allocated (it consumes a queue + runs crons, so it cannot scale to zero); a tiny health server (main.ts)
# answers the Cloud Run startup probe. Multi-stage, mirroring apps/api/Dockerfile: install the workspace,
# build the @rhema/worker slice, ship a pruned prod bundle. The entrypoint is main.ts's self-invoking guard
# (`node dist/main.js`), which constructs every seam from @rhema/live-clients and registers the consumers.
#
# (Replaces the P0.01 placeholder sleeper — the worker now ships real logic for the Phase-0 live exit runs.)

# ---- builder: install the workspace, build the worker slice, produce a pruned prod bundle ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS builder
WORKDIR /repo
ENV CI=1
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rhema/worker... build
RUN pnpm --filter @rhema/worker --prod deploy --legacy /bundle

# ---- runtime: non-root, minimal ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN groupadd --gid 10005 worker \
  && useradd --uid 10005 --gid 10005 --home-dir /home/worker --create-home --shell /usr/sbin/nologin worker
WORKDIR /app
COPY --from=builder /bundle /app
USER worker
# Cloud Run injects PORT; main.ts's health server reads it (default 8080). The DB/Redis/bucket + GKE-launcher
# env come from the service config. Secrets (the RS256 run-token keypair) are read from Secret Manager at
# boot via ADC.
EXPOSE 8080
CMD ["node", "/app/dist/main.js"]
