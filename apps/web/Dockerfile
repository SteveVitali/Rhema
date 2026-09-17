# web — the React Router SSR beta shell (PRB.15). The public-facing Cloud Run service behind the
# external HTTPS LB (`rhema.tools` on prod); it forwards the session's `x-rhema-*` identity headers +
# cookies to the api at API_BASE_URL and serves the flat SSR shell + the bundled editor client
# (`public/editor.js`, built by `build-client.mjs` during `pnpm build`).
#
# (Replaces the P0.01 placeholder sleeper — the web image now ships the real server for prod.)

# ---- builder: install the workspace, build the web slice (tsc + the client bundle), ship a pruned bundle ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS builder
WORKDIR /repo
ENV CI=1
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rhema/web... build
RUN pnpm --filter @rhema/web --prod deploy --legacy /bundle

# ---- runtime: non-root, minimal ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN groupadd --gid 10005 web \
  && useradd --uid 10005 --gid 10005 --home-dir /home/web --create-home --shell /usr/sbin/nologin web
WORKDIR /app
COPY --from=builder /bundle /app
# The generated client bundle lives outside dist/ (server.ts serves ../public/editor.js); `pnpm deploy`
# only carries package files, so copy the built assets explicitly from the builder workspace.
COPY --from=builder /repo/apps/web/public /app/public
USER web
# Cloud Run injects PORT; main.ts reads it (default 8080) + API_BASE_URL / SIGNUP_MODE from the service env.
EXPOSE 8080
CMD ["node", "/app/dist/main.js"]
