# R7DEP.1 — golden re-run classification of the R7a deploy payload (GD-GOLDEN.R7)

- **Committed:** 2026-11-04, **before any Part B act** (ticket deliverable 1).
- **Payload:** `a34eb51` (round-7 fork point, `main` HEAD 2026-11-03) → `8f6ef4781d470172e4e2c4bb15ab8543288c107a`
  (the R7a chain tip = the deploy SHA). `git diff --name-only` over the range.
- **Rule:** `docs/ops/golden-rerun-rule.md` — protocol-affecting ⇒ ONE minimal-cohort re-run
  ≤ $100; in doubt ⇒ affecting.

## Verdict: **NOT protocol-affecting — no golden re-run** (zero spend)

Item-by-item against "What counts as protocol-affecting":

| Rule item | Touched? | Evidence |
|---|---|---|
| Protocol seeds, manifests, rubrics, phase defaults (`packages/protocols`) | **No** | `packages/protocols` does not appear in `git diff --name-only a34eb51..8f6ef478` at all. The api's `dossier-routes.ts` drops a `WORKFLOW_MANIFESTS` import but `phasesForRun` still resolves the manifest itself — a read-model change, not a manifest change. |
| The run/dispatch path (protocol resolution, phase-default layering, URL-policy freezing, delivery) | **No** | `packages/orchestrator` diff = `index.ts`/`queue.ts`/`notifications.ts` — the `run.walkthrough` export+queue-name removal and prettier formatting; `apps/worker` diff = `walkthrough-generator.ts` deleted, `env.ts` slot→legacy-ingest-fallback rename, `run-jobs.ts`/`main.ts`/`ingest-jobs.ts` formatting + the retired consumer. `run.resume`/`run.deliver`/dispatch/`settleUnverifiedDelivery` semantics are untouched (`-w` diff shows no functional change outside the removal). Per **213's ADR-130 classification argument**: the walkthrough was a *lazy post-delivery call outside the Review output* — a read/compose path, never a dispatch or phase path — checked against the diff and it holds: no `run.*` dispatch, phase-launch, URL-policy or delivery-settlement file changed functionally. |
| The harness and skill phase machinery | **No** | `apps/run-task` does not appear in the diff. |
| The egress proxy's research/fetch policy | **No** | `apps/egress-proxy` does not appear in the diff. |
| Boundary security fixes (REQ-SEC-3 class — the boundary a run executes behind) | **No** | The only security-shaped change is `0061_demo_events.sql` + `POST /analytics/demo` — a NEW insert-only channel on the user-serving API (`rhema_demo_writer` NOLOGIN, `SECURITY DEFINER`, `GRANT EXECUTE` only). It is not a fix to the run-execution boundary (the GKE sandbox + egress proxy a run executes behind), and it cannot change what a golden Review produces. |

## What the payload IS

Demo serving (`apps/web` SSR/BFF + SPA demo surfaces, `@rhema/demo-corpus` corpus/snapshots —
data, not code the run path reads), UI/theme/stopgap work (`packages/ui`, `packages/tokens`,
`packages/ide`), the walkthrough retirement (ADR-130), the `demo_events` append-only table +
beacon channel (REQ-TOUR-9), journey/registry/test additions, and docs/records. 2,703 files
changed but ~2,279 are `packages/demo-corpus` (corpus data).

## Consequence under GD-GOLDEN.R7

**No dispatch. No estimate needed. $0.** Recorded as "no re-run (classified non-affecting)"
per ticket deliverable 7's second arm. If Part B's deploy SHA changes from `8f6ef478…` (e.g.
the operator merges and the payload grows), this classification is re-derived on the new range
before any `pulumi up`.
