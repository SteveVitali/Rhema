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
RUN pnpm --filter @rhema/egress-proxy --prod deploy --legacy /bundle

# ---- runtime: non-root, minimal ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
# NOTE: the user/group is `proxyd`, NOT `proxy` — Debian bookworm ships a system group named `proxy`
# (gid 13), so `groupadd proxy` fails (exit 9, name already in use). Any non-root, non-reserved name works.
RUN groupadd --gid 10003 proxyd \
  && useradd --uid 10003 --gid 10003 --home-dir /home/proxyd --create-home --shell /usr/sbin/nologin proxyd
WORKDIR /app
COPY --from=builder /bundle /app
USER proxyd
EXPOSE 8443
# The provider key is read from Secret Manager at boot + on SIGHUP (secret-manager.ts) — never baked in.
CMD ["node", "/app/dist/main.js"]
