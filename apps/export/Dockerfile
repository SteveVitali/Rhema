# export — the conversion container (PRB.11 + P1.18; §12.1, §13.4). The ONLY image carrying pandoc
# and typst (the `--pdf-engine=typst` pdf path): `api`/`web`/`worker` reach it through the
# ExportRunner seam, never by exec'ing a binary (AC5). The image has no database, no secrets, no
# agent surface — one conversion per invocation.

# ---- builder: install the workspace, build the export slice, produce a pruned prod bundle ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS builder
WORKDIR /repo
ENV CI=1
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rhema/export... build
RUN pnpm --filter @rhema/export --prod deploy --legacy /bundle

# ---- runtime: non-root, minimal, pandoc + typst pinned ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
ARG TARGETARCH=amd64
ARG PANDOC_VERSION=3.10
ARG TYPST_VERSION=0.13.1
# The official pandoc release binary (static) — pandoc 3.10 per spec §12.1, fetched at image build.
# Typst is the pdf engine (pandoc `--pdf-engine=typst`): the official musl-static release binary,
# same confinement rule — it exists only here (license exception already recorded for `typst`).
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl ca-certificates xz-utils \
  && curl -fsSL "https://github.com/jgm/pandoc/releases/download/${PANDOC_VERSION}/pandoc-${PANDOC_VERSION}-linux-${TARGETARCH}.tar.gz" -o /tmp/pandoc.tgz \
  && tar -xzf /tmp/pandoc.tgz -C /usr/local --strip-components=1 \
  && rm /tmp/pandoc.tgz \
  && TYPST_ARCH="$(case "$TARGETARCH" in amd64) echo x86_64 ;; arm64) echo aarch64 ;; *) echo "$TARGETARCH" ;; esac)" \
  && curl -fsSL "https://github.com/typst/typst/releases/download/v${TYPST_VERSION}/typst-${TYPST_ARCH}-unknown-linux-musl.tar.xz" -o /tmp/typst.tar.xz \
  && tar -xJf /tmp/typst.tar.xz -C /tmp \
  && mv "/tmp/typst-${TYPST_ARCH}-unknown-linux-musl/typst" /usr/local/bin/typst \
  && rm -rf /tmp/typst.tar.xz "/tmp/typst-${TYPST_ARCH}-unknown-linux-musl" \
  && pandoc --version \
  && typst --version \
  && apt-get purge -y curl xz-utils && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*
RUN groupadd --gid 10006 export \
  && useradd --uid 10006 --gid 10006 --home-dir /home/export --create-home --shell /usr/sbin/nologin export
WORKDIR /app
COPY --from=builder /bundle /app
USER export
# Job mode: `node /app/dist/main.js <input.md> <format> <output>` (one Cloud Run Job per export).
# Serve mode (the synchronous download path): `node /app/dist/main.js serve`.
EXPOSE 8080
CMD ["node", "/app/dist/main.js", "serve"]
