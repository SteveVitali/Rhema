# AGENTS.md — Infrastructure and live operations

## Purpose

- Define GCP stage facts, Pulumi resources, runtime isolation, and deployment configuration.
- Root `AGENTS.md` applies. These instructions also govern use of `scripts/live`; paid verification
  additionally requires `packages/journeys/AGENTS.md`.

## Architecture

- `infra` is the `@rhema/infra` workspace package for pure facts and tests.
- `infra/pulumi` is a separate operator-run program with its own dependencies; root Turbo/lint
  success does not typecheck or deploy that whole program.
- Cloud Run hosts services; run-task uses GKE; the egress proxy is a separate compute tier.
  Stage configuration is authoritative in `infra/config/stages.ts`, not a copied runbook snapshot.

| Stage    | Required posture                                                                                                  |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| `dev`    | Shared integration, AlloyDB; no production secrets.                                                               |
| `pr-<n>` | Isolated preview, small/paused AlloyDB facts, isolated GCS buckets, Base tier, $3/run cap, no production secrets. |
| `prod`   | Cloud SQL `db-g1-small`; current availability, service sizing, and activation modes come from stage facts.        |

## Key Files

| File                             | Lines (approx) | Purpose                                                               |
| -------------------------------- | -------------- | --------------------------------------------------------------------- |
| `infra/config/stages.ts`         | ~650           | Stage engines, service posture, public domains, and activation modes. |
| `infra/pulumi/index.ts`          | ~500           | Pulumi program composition and configuration.                         |
| `infra/pulumi/compute.ts`        | ~1.4k          | Service, job, and proxy compute resources.                            |
| `infra/pulumi/iam.ts`            | ~250           | Service identities and scoped IAM grants.                             |
| `scripts/live/preview-stack.mjs` | ~450           | Guarded preview lifecycle and secret provisioning.                    |

## Build & Test

```bash
pnpm turbo build --filter=@rhema/infra...
pnpm --filter @rhema/infra typecheck
pnpm --filter @rhema/infra lint
pnpm exec vitest run infra scripts/live/preview-stack.test.mjs
```

- Run from the repo root. The tests inspect pure plans, facts, and manifests; they do not establish
  live cloud posture. See `infra/pulumi/README.md` for separate program setup and validation.
- The workspace `deploy` script deliberately refuses. Do not replace it with an unguarded shortcut.

## Code Conventions

- Correct ✓: change a stage fact with its test, then use the authorized preview/apply procedure.
  Wrong ✗: hardcode a production posture in resource construction or assume a static test proves it live.
- Keep service dependencies and least-privilege grants explicit. Provider keys belong at the proxy;
  Secret Manager values must not be printed, committed, put in command arguments, or exposed to agents.
- Retain the sandbox's no-NAT/no-default-internet posture. Provider traffic uses the proxy;
  `infra/k8s/20-run-task-egress-policy.yaml` separately permits DNS, private-app HTTPS, the fixed
  Private Google APIs range, and Workload Identity metadata for infrastructure needs. These are
  pod-level allowances, distinct from node bootstrap rules; never widen them to arbitrary internet
  access or claim network policy alone enforces the process-identity boundary.

## Critical Gotchas

1. **Preview stacks have one lifecycle path.** Use `scripts/live/preview-stack.mjs` for `init`,
   `select`, `output`, `config`, `resend-pull`, `stripe-pull`, `preview`, `up`, `refresh`,
   `seed-invite`, `destroy`, and `rm`. Only `pr-<digits>` names are accepted. Prod is refused
   for every verb, including reads; there is no override. After creation, the guard requires
   `rhema:owner=ops-preview`; it cannot adopt somebody else's stack.
2. **Keep the session-capable preview recipe intact.** `init` → image/provenance `config` →
   `resend-pull` → `up` → the stack's migrate Job → `seed-invite` → journeys with `--invite-code`.
   `resend-pull` pipes the operator-seeded `rhema-nonprod-resend-api-key` into secret
   `rhema:resendApiKey` configuration on stdin, never logs it. The deterministic invite
   `prv-<n>-test` is non-secret and admits the designated test identities.
3. **Teardown has three acts.** `destroy` → verify zero orphan resources → `rm`.
   Never combine them as `destroy --remove` or remove state before orphan verification.
4. **A preview cannot borrow production secrets.** Extra posture stages still use the guarded
   path; `stripe-pull` accepts the operator-seeded nonproduction test key, not a production key.
   Preserve the fail-closed production override checks in stage configuration.
5. **A deploy must match its proof.** Follow `infra/PROD-BRINGUP.md` and
   `docs/build/INTEGRATION_PLAN.md`; verify the expected SHA with `check-deploy-provenance` before
   recording a live claim. Do not infer deployed state from a committed image pin or a passed CI job.
6. **Budget and safety decisions live outside static defaults.** Read current operator rulings and
   deferrals before running a funded window, changing account modes, or applying cloud mutations.
   Documentation cleanup grants no new spending or deployment authorization.
7. **Renderer rollback is a code rollback.** Use `git revert` + redeploy; the SPA renderer flags,
   request overrides, and Pulumi `rhema:spaSurfaces` key are deleted and must stay deleted.
8. **A web deploy ends with two recorded acts.** The image build asserts the demo corpus rides
   the web image (`apps/web/Dockerfile` fails without `corpus/PROVENANCE.md`,
   `snapshots/projects.json`, and an essay `index.json` — REQ-DOPS-2), and the deploy finishes
   with the scoped CDN invalidation `scripts/live/cdn-invalidate-demo.mjs --path '/bff/p/demo~*'`
   (dry-run equals the act; commit both outputs). Demo twins are edge-cached `public` with a
   `?b=<sha>` key, so skipping the invalidation leaves stale twin bodies on already-cached
   query-less URLs. Both acts were exercised at the 224/250/R7DEP.3 deploys; they are standing
   steps, not one-offs.

## Do / Don't

- **Do:** distinguish authored facts, preview output, applied resources, and verified live behavior.
- **Don't:** bypass ownership guards, weaken sandbox egress, or expose a secret to make deployment easier.
