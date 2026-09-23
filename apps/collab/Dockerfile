# collab — the Hocuspocus WSS collab service (P1.03): the four-layer autosave's server half —
# `draft:<id>` documents, session-cookie auth, debounced materialization to canonical markdown,
# restore-point snapshots/deltas, and the M17 block-patch routes under /collab.

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
