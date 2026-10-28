# AGENTS.md — Run-task sandbox

## Purpose

- Run the trusted harness and the separate unprivileged model process inside an isolated task image.
- Root `AGENTS.md` applies. Changes to network/provider behavior also require
  `apps/egress-proxy/AGENTS.md` and `infra/AGENTS.md`.

## Architecture

- The harness owns run tokens, proxy credentials, hook enforcement, audit writes, and scoped launches.
- The model process receives a scrubbed environment and a restricted filesystem view. The harness
  injects credentials on its behalf; provider keys never belong in the image or the agent process.
- Scoped producer queries use separate identities and mount namespaces; the harness persists their
  returned artifacts and producer evidence.

## Key Files

| File                                | Lines (approx) | Purpose                                                 |
| ----------------------------------- | -------------- | ------------------------------------------------------- |
| `apps/run-task/src/harness-main.ts` | ~450           | Trusted process bootstrap and service wiring.           |
| `apps/run-task/src/bootstrap.ts`    | ~100           | Scrubbed agent launch and privilege-drop specification. |
| `apps/run-task/src/scoped-phase.ts` | ~250           | Input-scoped producer launch and artifact persistence.  |
| `apps/run-task/src/secrets.ts`      | ~50            | Harness-only secret-file handling.                      |

## Build & Test

```bash
pnpm turbo build --filter=@rhema/run-task...
pnpm --filter @rhema/run-task typecheck
pnpm --filter @rhema/run-task lint
pnpm exec vitest run apps/run-task/src/bootstrap.test.ts apps/run-task/src/secrets.test.ts apps/run-task/src/scoped-phase.test.ts apps/run-task/src/credential-injector.test.ts
```

- Run from the repo root. The kernel proof is `apps/run-task/src/privsep.docker.test.ts`; it builds
  the production image and needs Docker plus the relevant Linux capabilities. It can skip unsupported
  legs; retain the explicit skip evidence. CI opts in through `RHEMA_DOCKER_TESTS=1` in integration.
- `ALLOW_PLACEHOLDER_SDK=1` permits a no-SDK image for privilege-separation checks only. Read
  the [vendor guide](vendor/README.md) for the separately supplied runtime; a placeholder image cannot
  prove model execution or a working deployment.

## Code Conventions

- Correct ✓: build the model environment with `buildAgentEnv` and validate it with `assertScrubbed`.
  Wrong ✗: spread `process.env` into an agent or scoped query subprocess.
- Launch executables by absolute path: the scrubbed environment has no `PATH`, including for
  `setpriv` and the Node entry command.
- Preserve supplementary-group clearing, ambient/inheritable capability clearing, and
  `--no-new-privs` at the agent privilege drop. The harness has different capabilities for namespace
  setup; do not apply the agent's posture to it indiscriminately.
- Keep the credential injector's trusted headers separate from model-supplied request headers;
  the latter must not choose credentials, phase identity, or attribution.

## Critical Gotchas

1. **A unit test cannot establish kernel isolation.** Namespace mounts, uid separation, secret
   access denial, and capability clearing need the production-image proof. A mocked spawn is only
   launch-spec evidence.
2. **The agent must not regain harness privileges.** Ambient capabilities survive exec unless
   cleared. Retain the negative controls proving the dropped process cannot return to the harness uid.
3. **Scoped inputs are an allowlist, not a directory suggestion.** Keep out-of-set reads and writes
   to read-only mounts denied. The scoped query returns text; the harness writes the artifact and
   producer identity, rather than accepting model-authored provenance as proof.
4. **The production image is distroless.** Do not introduce a runtime shell/package-manager
   dependency; exercise the same image shape and launch tuple that the pod uses.
5. **Research preflight is part of truthful delivery.** Preserve the unavailable-research outcome
   and server settlement path; never silently continue as if a failed probe proved research access.

## Do / Don't

- **Do:** verify environment, identity, mounts, and credential injection together when changing launch.
- **Don't:** expose a key to the model process or relax a boundary to make a local SDK invocation work.
