# collab — the Hocuspocus WSS collab service (skeleton; PRB.15). The real Yjs surface lands with its own
# ticket; what prod deploys must still be a REAL image, not a sleeper — the image runs the honest
# minimum (a `/healthz` listener that keeps the Cloud Run service healthy and serving) until the collab
# ticket builds the real endpoint.
#
# (Replaces the P0.01 placeholder sleeper — the collab image now runs a real server for prod.)

# ---- builder: install the workspace, build the collab slice, ship a pruned prod bundle ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS builder
WORKDIR /repo
ENV CI=1
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rhema/collab... build
RUN pnpm --filter @rhema/collab --prod deploy --legacy /bundle

# ---- runtime: non-root, minimal ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN groupadd --gid 10008 collab \
  && useradd --uid 10008 --gid 10008 --home-dir /home/collab --create-home --shell /usr/sbin/nologin collab
WORKDIR /app
COPY --from=builder /bundle /app
USER collab
# Cloud Run injects PORT; server.ts reads it (default 8080).
EXPOSE 8080
CMD ["node", "/app/dist/server.js"]
