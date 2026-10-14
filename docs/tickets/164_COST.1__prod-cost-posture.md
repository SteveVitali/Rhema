# COST.1 — Production cost-posture levers (REQ-COST-1..6)

- **Sequence:** 164 · **Phase:** round 5 · **Kind:** skeleton
- **base_branch:** current checkout
- **Depends on:** 163_HUMAN-H9 (posture ruling) + D-OPS.2-1 (billing export — REQ-COST-1's before/after read)
- **Gate status:** gated on 163_HUMAN-H9 — expand only after the ruling lands
- **Live stage:** operator-gated per-lever ($0 reads; preview-evidence per change)
- **Production mutations:** per-lever, each gated — IaC deltas only through `pulumi up` + provenance
- **Size budget:** TBD at expansion (lever-dependent)

> **Skeleton only** — gated on the HUMAN-H9 posture ruling + the billing-export prerequisite.
> Body expands at run time via `decompose-spec mode=extend` scoped to the ratified levers.

## Scope (one line)
Execute the operator-ratified cost levers against the $285.80/mo posture: FIRST the convert-svc
live-vs-IaC `cpu-throttling:"false"` drift reconcile (~−$44/mo, codify-or-revert — REQ-COST-2),
then the ruling-scoped levers (warm-floor/min-instances REQ-COST-1, `stages.ts` fact moves
REQ-COST-3, Redis degradation analysis REQ-COST-4 — `RedisHeartbeatStore` has NO fallback so
removal is a design change, worker right-size + soak leg REQ-COST-5, §13.5 SLO re-verify
REQ-COST-6).

## Spec §§
`docs/post-spa-disposition-spec.md` §7 BL-29 row · `docs/research/r5_d1_cost-levers.md` (lever
inventory verbatim) · DEFERRALS D-SLO.1-*

## REQ coverage
REQ-COST-1 REQ-COST-2 REQ-COST-3 REQ-COST-4 REQ-COST-5 REQ-COST-6 · closes D-OPS.2-2 (warm-floor lever execution) when expanded
