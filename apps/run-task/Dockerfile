# run-task — the two-uid Agent SDK task image (ledger M11; §12.1, §12.4 step 4). One GKE Job pod per run.
#
# Contract this image encodes:
#   • linux/amd64 (GKE default; arm64 optional), 1 vCPU / 2 GiB baseline (2/4 for Draft > 8k words) — set on
#     the GKE Job/Pod spec. Runs on GKE (not Cloud Run) because the input-scoped mount namespace needs
#     CAP_SYS_ADMIN, which Cloud Run/Autopilot cannot grant.
#   • The SDK is VENDORED into the image (a proprietary dependency, REQ-ARCH-4) — copied at build, never
#     fetched at run time; the sandbox subnet has no route out except the proxy.
#   • TWO uids: `harness` (uid 10001) holds the run token, the proxy credential, the hook daemon, and the
#     heartbeat/commit/audit clients; `agent` (uid 10002) runs the SDK + agent-entry (agent-entry.ts) with a
#     SCRUBBED env (@rhema/engine buildAgentEnv) and no secret in scope (REQ-SPEC-10).
#   • The secrets file lives under /run/secrets, mode 0600, owner harness — the agent uid cannot read it.
#   • Root filesystem READ-ONLY at run time (Pod `securityContext.readOnlyRootFilesystem: true`); a writable
#     tmpfs (emptyDir medium: Memory) is mounted only for the seat's writable namespaces (/work) and per-run
#     config (/run) — §11.5 mount mechanics.
#   • util-linux provides `setpriv` (irreversible uid drop, clear supplementary groups) and `unshare`/`mount`
#     (the private mount namespace for input-scoped subagents — §12.6 / scoped-subagent.ts).
#
# HARDENING TARGET (deferred — see DEFERRALS D-P0.06-3): a distroless runtime with statically-vendored
# util-linux applets and ambient CAP_SETUID/CAP_SYS_ADMIN scoped to the entrypoint. The slim base here is the
# buildable Phase-0 stand-in that exercises the same uid/namespace mechanics.

# ---- builder: install the workspace, build the run-task slice + its deps, produce a pruned prod bundle ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS builder
WORKDIR /repo
ENV CI=1
RUN corepack enable
# The whole workspace is the build context (turbo needs the graph); the preinstall resolves protocols + the
# evals stub. A .dockerignore keeps node_modules/dist out so the install is reproducible from the lockfile.
COPY . .
RUN pnpm install --frozen-lockfile
# Build @rhema/run-task and every workspace package it depends on (turbo resolves the order).
RUN pnpm --filter @rhema/run-task... build
# `pnpm deploy` writes a self-contained bundle (run-task's dist + its workspace deps + prod node_modules) to
# /bundle — the only thing the runtime image needs.
RUN pnpm --filter @rhema/run-task --prod deploy --legacy /bundle

# ---- runtime: two uids, util-linux, read-only-rootfs friendly ----
FROM --platform=$TARGETPLATFORM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production

# setpriv (uid drop) + unshare/mount (scoped-subagent mount namespaces) + tini (PID 1 reaping).
RUN apt-get update \
  && apt-get install -y --no-install-recommends util-linux tini \
  && rm -rf /var/lib/apt/lists/*

# Distinct, unprivileged uids. `harness` holds secrets; `agent` runs the model. `agent` is NOT in the
# harness group, so it cannot read harness-only files by group membership.
RUN groupadd --gid 10001 harness \
  && useradd  --uid 10001 --gid 10001 --home-dir /home/harness --create-home --shell /usr/sbin/nologin harness \
  && groupadd --gid 10002 agent \
  && useradd  --uid 10002 --gid 10002 --home-dir /home/agent --create-home --shell /usr/sbin/nologin agent \
  # the harness-only secrets mount point (the file is written 0600 harness at provision):
  && mkdir -p /run/secrets && chown harness:harness /run/secrets && chmod 0700 /run/secrets \
  # writable-namespace + scoped-subagent roots (tmpfs-mounted at run time):
  && mkdir -p /work /work/scoped && chown harness:harness /work /work/scoped

WORKDIR /app
# The built, pruned run-task bundle: /app/dist/agent-entry.js is the agent command; the harness modules run
# under uid harness. Owned by root, world-readable — no secret is in it.
COPY --from=builder /bundle /app
COPY apps/run-task/docker/entrypoint.sh /app/entrypoint.sh
COPY apps/run-task/docker/scoped-runner.sh /app/scoped-runner.sh
RUN chmod 0755 /app/entrypoint.sh /app/scoped-runner.sh

# Bake the ported @rhema/protocols skills at /app/skills — the `skillsDir` the run spec points the SDK at
# (D-P0.15c-6). World-readable, no secret; the agent uid loads the SKILL.md dirs from here. Copied explicitly
# (not relied on via the pnpm-deploy bundle) so the path is deterministic and independent of package `files`.
COPY packages/protocols/skills /app/skills

# Vendor the proprietary Agent SDK (REQ-ARCH-4 / D-P0.06-4). The operator drops the built package under
# apps/run-task/vendor/claude-agent-sdk/ (see vendor/README.md); it is copied into node_modules here, NEVER
# fetched at run time. If absent (a CI placeholder build) the image still builds and the run loop fails fast at
# loadSdkQuery() (sdk-adapter.ts) with a clear error — never a silent no-engine run. The agent uid consumes it.
COPY apps/run-task/vendor/ /app/vendor/
RUN if [ -d /app/vendor/claude-agent-sdk ]; then \
      mkdir -p /app/node_modules/@anthropic-ai \
      && cp -r /app/vendor/claude-agent-sdk /app/node_modules/@anthropic-ai/claude-agent-sdk \
      && chown -R agent:agent /app/node_modules/@anthropic-ai \
      && echo "vendored @anthropic-ai/claude-agent-sdk into the image"; \
    else \
      echo "WARNING: @anthropic-ai/claude-agent-sdk NOT vendored — placeholder build (no live run)"; \
    fi

# The container starts as root under tini ONLY so the entrypoint can drop the supervisor to `harness` and
# later launch `agent` (agent-entry) via setpriv; root does nothing else. Root filesystem is read-only at run time.
ENTRYPOINT ["/usr/bin/tini", "--", "/app/entrypoint.sh"]
