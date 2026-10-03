# turbo-cache — the self-hosted Turborepo remote cache (OPS.2; D-P0.01-4; the OPS.2 cache-server
# ADR). A thin non-root runtime wrapper around the MIT-licensed `turborepo-remote-cache` package
# (Ducktors — the license is recorded in the OPS.2 run ledger): `STORAGE_PROVIDER=
# google-cloud-storage` writes artifacts to the project-private GCS bucket the Pulumi program
# provisions via the service account's ADC identity, and `TURBO_TOKEN` (a Secret Manager
# secretKeyRef) is the Bearer credential every CI/local client presents. Exact-pinned in
# package.json; the root lockfile carries the integrity hash.

# ---- builder: install the workspace slice, ship a pruned prod bundle ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS builder
WORKDIR /repo
ENV CI=1
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rhema/turbo-cache --prod deploy --legacy /bundle

# ---- runtime: non-root, minimal ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN groupadd --gid 10008 turbocache \
  && useradd --uid 10008 --gid 10008 --home-dir /home/turbocache --create-home --shell /usr/sbin/nologin turbocache
WORKDIR /app
COPY --from=builder /bundle /app
USER turbocache
# The Fastify server binds $PORT (the Cloud Run container port — the program sets PORT=8080).
ENTRYPOINT ["node", "/app/node_modules/turborepo-remote-cache/dist/cli.js"]
