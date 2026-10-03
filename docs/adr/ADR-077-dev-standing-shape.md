# ADR-077: `dev` is a warm, full-stack stage — the verification window, not a second preview

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** OPS.1
- **Requirement ids:** REQ-ARCH-38, REQ-ARCH-39
- **Spec:** §13.2, §13.3

## Context
Before OPS.1 the `dev` Pulumi stack was a 23-resource skeleton (STB.1 run ledger §1): a subnet,
five secret containers, nine service accounts, three buckets — no data plane, no compute. §13.2
calls `dev` the "shared integration" stage: it must be able to run the *full* program at
production parity whenever a ticket needs a non-prod live target, and it is the only stage allowed
to carry the three-real-project seed (`seedRealProjects`). Previews are the disposable shape —
paused AlloyDB, scale-to-zero services — but a paused `dev` would defeat its purpose: a shared
stage that every run has to cold-start is not shared infrastructure.

## Decision
`dev` deploys the complete Pulumi program — VPC + sandbox, AlloyDB (2 vCPU, **not** paused), BASIC
Memorystore, GKE + the SEC.3-confined run-task pool, the egress-proxy MIG, all seven Cloud Run
services, the convert + migrate Jobs, the external HTTPS LB — with `maxUsdPerRun=10`,
`signupMode=invite`, and production-parity image pins pushed to the `rhema-dev` Artifact Registry
repo (never `rhema-prod-*` refs). After the OPS.1 verification window the standing projection is
measured; if it exceeds the ticket's `$15/month` idle threshold `dev` returns to the idle posture
(destroy or a documented scale-down — the run ledger records which and why).

## Consequences
- Dev can host real migrations + the real-project seed + invite-mode smoke without any preview's
  lifecycle ceremony — its cost is the honest price of a shared warm stage.
- The skeleton config's hand-encrypted `rhema:*DatabaseUrl` values are retired; the generated-set
  boot (ADR-079) makes a fresh `dev` up a zero-hand-secret act.
- Warm means spend: the $15/month idle threshold is the tripwire that decides whether `dev` stands
  or idles after each exercise, and the ticket records the projection rather than assuming it.

## Alternatives considered
- **Paused/scale-to-zero dev (preview shape):** rejected — AlloyDB pause still bills the cluster
  minimum and every cold start would tax the shared stage; §13.2 already assigns the small/paused
  shape to previews.
- **Skeleton-plus-ad-hoc dev:** rejected — it is precisely the drift this ticket exists to close
  (the STB.1 finding).

## Revisit trigger
If `dev`'s measured standing projection exceeds `$15/month` for two consecutive review windows, or
a second shared stage appears, revisit the standing shape (e.g. scheduled pause, shared AlloyDB).
