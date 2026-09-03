# egress-proxy — the only route out of the sandbox (§12.7; D-P0.07-1/4). Terminates the sandbox's
# `ANTHROPIC_BASE_URL`, resolves the per-run credential → RunContext, meters (usage_records{source:'proxy'} —
# the meter of record), enforces the cap (402 at Σ ≥ cap), rewrites/validates server-tool bodies, logs the fetch
# log of record, and forwards to the provider over its own TLS. Runs the built service (main.ts) — NOT the P0.01
# sleeper placeholder. A minimal, non-root image: the egress boundary carries no shell tools and no orchestrator
# graph (it uses a proxy-local DB resolver over pg).

# ---- builder: install the workspace, build the egress-proxy slice, produce a pruned prod bundle ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS builder
WORKDIR /repo
ENV CI=1
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rhema/egress-proxy... build
RUN pnpm --filter @rhema/egress-proxy --prod deploy /bundle

# ---- runtime: non-root, minimal ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN groupadd --gid 10003 proxy \
  && useradd --uid 10003 --gid 10003 --home-dir /home/proxy --create-home --shell /usr/sbin/nologin proxy
WORKDIR /app
COPY --from=builder /bundle /app
USER proxy
EXPOSE 8443
# The provider key is read from Secret Manager at boot + on SIGHUP (secret-manager.ts) — never baked in.
CMD ["node", "/app/dist/main.js"]
