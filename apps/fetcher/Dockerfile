# fetcher — the network-only link-read service (§12.1/§13.3; PRB.15). The only component allowed
# arbitrary egress: `POST /fetch` runs `fetchGuarded` (SSRF/redirect/size guards), the per-host ≤1 req/s
# politeness limiter, and robots.txt checks — it PARSES NOTHING and returns raw bytes + metadata for the
# convert Job. `/healthz` answers Cloud Run's probes.
#
# (Replaces the P0.01 placeholder sleeper — the fetcher image now runs the real server for prod.)

# ---- builder: install the workspace, build the fetcher slice, ship a pruned prod bundle ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS builder
WORKDIR /repo
ENV CI=1
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rhema/fetcher... build
RUN pnpm --filter @rhema/fetcher --prod deploy --legacy /bundle

# ---- runtime: non-root, minimal ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN groupadd --gid 10006 fetcher \
  && useradd --uid 10006 --gid 10006 --home-dir /home/fetcher --create-home --shell /usr/sbin/nologin fetcher
WORKDIR /app
COPY --from=builder /bundle /app
USER fetcher
# Cloud Run injects PORT; server.ts reads it (default 8080).
EXPOSE 8080
CMD ["node", "/app/dist/server.js"]
