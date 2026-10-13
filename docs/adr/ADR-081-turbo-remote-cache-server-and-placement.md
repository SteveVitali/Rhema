# ADR-081: Self-hosted Turborepo remote cache — turborepo-remote-cache on scale-to-zero Cloud Run, GCS-backed, in the prod stack

- **Status:** Proposed
- **Date:** 2026-10-03
- **Ticket:** OPS.2
- **Requirement ids:** REQ-ARCH-39, REQ-ARCH-30, REQ-ARCH-28
- **Spec:** §13.1/§13.2 (the pnpm + Turborepo stack; D-P0.01-4 discharged)

## Context

D-P0.01-4 deferred the remote cache since P0.01: `turbo.json` has `remoteCache.enabled` and the CI
workflow already exports `TURBO_API`/`TURBO_TOKEN`/`TURBO_TEAM`, but no cache endpoint existed, so
every CI job rebuilt the full graph. OPS.2's Stage B is authorized for a *stateless* cache service
in the prod stack at ≤ $15/mo delta, with the cache token in Secret Manager and no
protocol-bearing artifact cached to an externally reachable store.

Options considered:

1. **Vercel's hosted remote cache** — the default. Rejected: it stores build outputs
   *outside the project* — `@rhema/protocols` build artifacts (the committed private package's
   compiled output, which carries the vendored protocol text) would leave the GCP boundary.
2. **Ducktors `turborepo-remote-cache` (MIT) on Cloud Run + GCS** — a mature self-hosted server
   implementing the turborepo v8 artifacts API, with a native `google-cloud-storage` provider that
   uses the workload's ADC identity — no storage credentials in the container at all.
3. **Run it inside GKE / on the proxy MIG** — reuses compute but couples the CI-critical path to
   the sandbox cluster and gives up scale-to-zero.

## Decision

Deploy `turborepo-remote-cache` (exact-pinned `2.14.2`, wrapped as `apps/turbo-cache` so the root
lockfile carries the integrity hash; MIT — license recorded in the OPS.2 run ledger) as a Cloud Run
service **inside the prod stack** (`infra/pulumi/turbo-cache.ts`), in front of a per-stack GCS
bucket `${project}-turbo-cache-<stack>` with `publicAccessPrevention=enforced`, uniform bucket
IAM, and a 30-day delete lifecycle (cache entries are content-addressed and reproducible — expiry
is free invalidation).

**Auth boundary.** The service is deliberately *unauthenticated* at the Cloud Run layer
(`allUsers` invoker): GitHub-hosted runners carry no GCP identity, so the server's `static`
auth mode — the `TURBO_TOKEN` Bearer — is the only authz, and it is IaC-minted
(`random.RandomPassword`), written by the program into `rhema-<stack>-turbo-cache-token` on every
stage, mounted via `secretKeyRef`, and read by CI from Secret Manager into the `TURBO_TOKEN`
repository secret. Nothing else needs the endpoint — the artifacts API is the whole surface.

**Cost posture.** `minInstanceCount=0`, `maxInstanceCount=2`: the warm floor is $0; billed seconds
accrue only during builds. The measured-bill recomputation (ADR-082) carries it at ≈ $0–2/mo —
inside the ≤ $15/mo delta cap with orders of magnitude of headroom.

**Protocol containment.** Artifacts land in a project-private bucket behind the token-gated
endpoint; no `packages/protocols` artifact reaches a store outside the project. The bucket is not
public, is never mounted into user surfaces, and its lifecycle bounds retention.

## Consequences

- CI gains real remote-cache hits on `build` once `TURBO_API`/`TURBO_TOKEN` are set (OPS.2 Stage B
  verifies with two same-SHA runs). Local devs can opt in by exporting the same two vars.
- `ignoreChanges: ["scaling"]` on the service carries the same readback-drift fix OPS.2 applied to
  every Cloud Run service (the `-scaling` cosmetic diff since STB.1).
- The token is shared between server + all clients; rotation = rewrite the secret version and the
  repo secret (no client state survives the 30-day lifecycle anyway).
- `remoteCache.signature` was considered (the ticket asks): not enabled — artifact HMAC signing adds
  a second shared secret for tamper-evidence, but a writer already needs `TURBO_TOKEN`, so the token
  IS the integrity boundary at this posture. Revisit if the cache ever serves multiple teams or an
  artifact could be planted by a non-token path (a bucket-write compromise).

## Revisit trigger
If the shared Bearer token proves too coarse (per-team scoping, read/write split), the server
supports `AUTH_MODE=jwt` with JWKS + per-team claims — that supersedes the static-token decision.
If the cache ever needs sub-minute cold starts, a `minInstanceCount: 1` prod override trades ~$10/mo
for warmth — the ADR-082 lever table is where that call gets priced.
