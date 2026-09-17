# convert — the quarantined-bytes → canonical-markdown converter (§12.1/§13.3; PRB.15). Runs as a Cloud
# Run JOB per batch — "no network, no DB": the program creates the job; the ingest caller supplies the
# quarantine object per execution (D-PRB.02-1's live leg). The entrypoint is the real CLI
# (`node dist/main.js <input> [output.md]` → convert, print the §5.3 preview JSON, write the canonical
# markdown), so the Job's per-execution args pass straight through.
#
# (Replaces the P0.01 placeholder sleeper — the convert image now runs the real converter for prod.)

# ---- builder: install the workspace, build the convert slice, ship a pruned prod bundle ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS builder
WORKDIR /repo
ENV CI=1
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rhema/convert... build
RUN pnpm --filter @rhema/convert --prod deploy --legacy /bundle

# ---- runtime: non-root, minimal ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production
RUN groupadd --gid 10007 convert \
  && useradd --uid 10007 --gid 10007 --home-dir /home/convert --create-home --shell /usr/sbin/nologin convert
WORKDIR /app
COPY --from=builder /bundle /app
USER convert
# A Cloud Run Job runs the entrypoint with the execution's args — the CLI usage is
# `convert <input> [output.md]`; with no args it exits 2 (never a long-running listener).
ENTRYPOINT ["node", "/app/dist/main.js"]
