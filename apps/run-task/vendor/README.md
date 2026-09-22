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
(the GKE node arch is `node:22-bookworm-slim` = glibc `linux-x64`; use the `-musl` variant only on an Alpine
base). Vendoring only the wrapper makes the first live `query()` throw `Native CLI binary for linux-x64 not
found` **before any inference** (preflight audit F1).

The `apps/run-task/Dockerfile` runtime stage copies `vendor/` and:

- **if** `vendor/claude-agent-sdk` exists, installs it as `node_modules/@anthropic-ai/claude-agent-sdk`;
- **if** `vendor/claude-agent-sdk-linux-x64/claude` exists, makes it executable by uid `agent` and ASSERTS
  that at build time (the build fails if it is missing execute permission). The harness pins this path via
  `options.pathToClaudeCodeExecutable` (`sdk-adapter.VENDORED_CLAUDE_BINARY`).

If either is absent (the Phase-0 stand-in / CI placeholder build), the image still builds and the run loop
fails fast at `loadSdkQuery()` (`sdk-adapter.ts`) with a clear error rather than running the model with no
engine. The native-binary tree is gitignored alongside the wrapper.

This directory is intentionally kept in the repo with only this README so the guarded `COPY vendor/`
always has a source; the SDK tree itself is gitignored (`apps/run-task/vendor/claude-agent-sdk/`).
