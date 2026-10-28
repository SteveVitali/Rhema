# Agent SDK image inputs

The run-task image uses the separately licensed `@anthropic-ai/claude-agent-sdk`. Its files are supplied by the operator at image-build time and are gitignored. A fresh clone does not include them; installing the workspace is sufficient for deterministic development, but does not prepare a runnable model image.

## Required layout

Populate both trees with compatible SDK packages obtained under the applicable provider terms:

```text
apps/run-task/vendor/claude-agent-sdk/                # wrapper package: package.json, sdk.mjs, types
apps/run-task/vendor/claude-agent-sdk-linux-x64/claude # Linux x64 native executable
```

The wrapper launches the native executable over a stdio protocol. The runtime is glibc Linux x64 (`gcr.io/distroless/nodejs22-debian12`); a macOS or musl binary is not the runtime input. The harness selects the vendored executable explicitly in [`src/sdk-adapter.ts`](../src/sdk-adapter.ts).

## Build checks

The [Dockerfile](../Dockerfile) requires both inputs and verifies that the `agent` uid can execute the native binary. The shared [Cloud Build image definition](../../../infra/cloudbuild/image-set.yaml) also checks the uploaded context and built image before pushing `run-task`.

Build from a checkout containing the vendor inputs. Managed worktrees and clean CI checkouts do not inherit these ignored files from another checkout.

An explicit `--build-arg ALLOW_PLACEHOLDER_SDK=1` permits an image for checks that never launch a model. Cloud Build exposes the same choice as `_ALLOW_PLACEHOLDER_SDK=1`. Such an image is not a working run-task deployment: the harness fails when it tries to load the absent SDK. Production image preparation must pass the real SDK checks.

This README keeps the directory present for Docker's `COPY vendor/`. Do not commit the vendor trees or treat the repository's MIT license as a license to redistribute them. See [LICENSES.md](../../../LICENSES.md).
