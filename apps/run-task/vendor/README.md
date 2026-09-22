# `apps/run-task/vendor/` — where the proprietary Agent SDK is vendored

The run-task image runs the model through `@anthropic-ai/claude-agent-sdk` (REQ-ARCH-4). The SDK is
**proprietary** — it is not a registry/workspace dependency and is **never fetched at run time** (the
sandbox subnet has no route out but the proxy). It is **vendored into the image at build time**.

## Operator step (before `pulumi up` / a live run — D-P0.06-4)

Drop the SDK package tree here so the Dockerfile can copy it into the runtime image's `node_modules`:

```
apps/run-task/vendor/claude-agent-sdk/   # the built @anthropic-ai/claude-agent-sdk package (package.json + dist)
```

The `apps/run-task/Dockerfile` runtime stage copies `vendor/` and, **if** `vendor/claude-agent-sdk`
exists, installs it as `node_modules/@anthropic-ai/claude-agent-sdk`. If it is absent (the Phase-0
stand-in / CI placeholder build), the image still builds and the run loop fails fast at
`loadSdkQuery()` (`sdk-adapter.ts`) with a clear error rather than running the model with no engine.

This directory is intentionally kept in the repo with only this README so the guarded `COPY vendor/`
always has a source; the SDK tree itself is gitignored (`apps/run-task/vendor/claude-agent-sdk/`).
