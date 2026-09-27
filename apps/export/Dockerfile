# export — the pandoc conversion container (PRB.11; §12.1, §13.4). The ONLY image carrying pandoc:
# `api`/`web`/`worker` reach it through the ExportRunner seam, never by exec'ing the binary. The image
# has no database, no secrets, no agent surface — one conversion per invocation. Typst/PDF + LaTeX
# arrive at P1.18 (the base already pins pandoc 3.x; adding Typst is a base-layer change then).

# ---- builder: install the workspace, build the export slice, produce a pruned prod bundle ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS builder
WORKDIR /repo
ENV CI=1
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rhema/export... build
RUN pnpm --filter @rhema/export --prod deploy --legacy /bundle

# ---- runtime: non-root, minimal, pandoc pinned ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ARG TARGETARCH=amd64
ARG PANDOC_VERSION=3.10
# The official pandoc release binary (static) — pandoc 3.10 per spec §12.1, fetched at image build.
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates \
  && curl -fsSL "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-${TARGETARCH}.tar.gz" -o /tmp/pandoc.tgz \
  && tar -xzf /tmp/pandoc.tgz -C /usr/local --strip-components=1 \
  && rm /tmp/pandoc.tgz \
  && pandoc --version \
  && apt-get purge -y curl && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
RUN groupadd --gid 10006 export \
  && useradd --uid 10006 --gid 10006 --home-dir /home/export --create-home --shell /usr/sbin/nologin export
WORKDIR /app
COPY --from=builder /bundle /app
USER export
# Job mode: `node /app/dist/main.js <input.md> <format> <output>` (one Cloud Run Job per export).
# Serve mode (the synchronous download path): `node /app/dist/main.js serve`.
EXPOSE 8080
CMD ["node", "/app/dist/main.js", "serve"]
