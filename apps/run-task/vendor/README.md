# `apps/run-task/vendor/` — where the proprietary Agent SDK is vendored

The run-task image runs the model through `@anthropic-ai/claude-agent-sdk` (REQ-ARCH-4). The SDK is
**proprietary** — it is not a registry/workspace dependency and is **never fetched at run time** (the
sandbox subnet has no route out but the proxy). It is **vendored into the image at build time**.

## Operator step (before `pulumi up` / a live run — D-P0.06-4, F1)

Drop **two** trees here so the Dockerfile can copy them into the runtime image:

```
apps/run-task/vendor/claude-agent-sdk/                  # the @anthropic-ai/claude-agent-sdk wrapper (package.json + sdk.mjs + *.d.ts)
apps/run-task/vendor/claude-agent-sdk-linux-x64/claude  # the platform NATIVE binary (~216 MB), the GKE runtime arch (glibc linux-x64)
```

**Both are required for a live run.** The wrapper (`sdk.mjs`) is a thin control-plane shim: its `query()`
spawns the separate **native `claude` CLI binary** and speaks a stdio protocol to it. That binary is NOT in
the wrapper package — it ships as the platform optionalDependency `@anthropic-ai/claude-agent-sdk-linux-x64`
(the runtime is `gcr.io/distroless/nodejs22-debian12` since SEC.3 — still glibc `linux-x64`; use the
`-musl` variant only on an Alpine base). Vendoring only the wrapper makes the first live `query()` throw
`Native CLI binary for linux-x64 not found` **before any inference** (preflight audit F1).

The `apps/run-task/Dockerfile` runtime stage copies `vendor/` and:

- **if** `vendor/claude-agent-sdk` exists, installs it as `node_modules/@anthropic-ai/claude-agent-sdk`;
- **if** `vendor/claude-agent-sdk-linux-x64/claude` exists, makes it executable by uid `agent` and ASSERTS
  that at build time (the build fails if it is missing execute permission). The harness pins this path via
  `options.pathToClaudeCodeExecutable` (`sdk-adapter.VENDORED_CLAUDE_BINARY`).

If either is absent the build **fails closed** (R6FIX.2 / F-R6H11-2): the Dockerfile exits 1 unless the
caller explicitly opts into a placeholder image with `--build-arg ALLOW_PLACEHOLDER_SDK=1`
(`image-set.yaml`'s `_ALLOW_PLACEHOLDER_SDK` for Cloud Build; CI provenance + preview posture builds
opt in deliberately). The run loop still fails fast at `loadSdkQuery()` (`sdk-adapter.ts`) on an
explicit placeholder image rather than running the model with no engine. The native-binary tree is
gitignored alongside the wrapper — **a clean worktree/clone does not carry these trees**, so image
builds must run from a checkout where they were populated (the e04a8c8 no-SDK image came from a
clean worktree's `gcloud builds submit` under the old warn-and-continue contract).

This directory is intentionally kept in the repo with only this README so the guarded `COPY vendor/`
always has a source; the SDK tree itself is gitignored (`apps/run-task/vendor/claude-agent-sdk/`).
