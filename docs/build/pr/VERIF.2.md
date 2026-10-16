# VERIF.2 — Preview-leg wave on an owned `pr-<n>` stack (stream V-2)

**Ticket:** `docs/tickets/165_VERIF.2__preview-legs.md` · manifest row 165 · base
`stevevitali/cost-1-prod-cost-posture` @ `f20ee28` · requirement ids: REQ-OPS-5, REQ-G1-3 (V-2 half)

## Summary

Discharged the surviving stream-V-2 preview legs on an owned `pr-186` preview stood up with
chain-tip images (`verif-2` @ `1b1fee9`, redeployed `verif-2b` @ `e7b21aecb` after live-found
fixes), plus the carried `D-OPS.1-2` live paused-AlloyDB leg and `D-MAINT.6-1`'s real
session-mint proof. Gate H8 cleared same-day: `rhema-nonprod-resend-api-key` seeded in
`rhema-507501` (operator-delegated), so `preview-stack.mjs resend-pull` + `seed-invite` minted
real `test*@rhema.tools` mailbox sessions through the genuine magic-link path.

Post-SPA.28 the legs assert `data-renderer`/`data-ssr-cause` only — the retired
`x-rhema-renderer`/`rhema:spaSurfaces`/`--pin-renderer` vocabulary in the original D-rows is
honestly superseded by `TWO_LEG_PROCEDURE`'s expect-spa shape.

**Leg outcome:** 39/44 `paid:false` legs green across 10 committed runs
(`docs/build/reports/2026-10-16_verif2/` — mint, ssr-arm, gates, gates2, gates3, seeded,
seeded2, dossier-b, tail, posture). Every leg that can green on a `*.run.app` preview is green,
with zero `--expect-renderer` violations and provenance MATCH on `e7b21aecb`. The residual
non-greens are preview posture, not product: `N8` + `R10.keepalive` need the collab wire
(`COLLAB_WS_URL` is domains-only), `N9` lands on `?notice=stripe_unconfigured` (REQ-ARCH-38 —
previews never carry Stripe), `T8`'s 410 half needs D-FIX.1-1's 7-day expired-token recipe.

## What changed

- `apps/web` — **F-VERIF.2-3 (real product defect):** the per-finding Apply verb no longer
  leaks at phone width on the dossier (§10.1 compact contract; caught by `P1.dossier` live —
  prod's showcase findings were never applyable enough to expose it). Regression test added in
  `spa/dossier.dom.test.tsx`. `/healthz/` provenance alias for `*.run.app` GFE interception.
- `scripts/live/preview-stack.mjs` — F-VERIF.2-1: migrate-Job auto-name resolution +
  seed-invite execution verification; preview auth-origin config (F-VERIF.2-2).
- `infra/pulumi` — preview AlloyDB `availabilityType:"ZONAL"` (regional capacity refusal);
  `rhema:uploadCorsOrigins` for the user-content bucket (F-VERIF.2-6).
- `packages/journeys` — F-VERIF.2-4/5 harness fixes (real `IPHONE_USER_AGENT` mobile context
  for `P1.project`/`P1.runsheet`; `StepCtx.inviteCode` for invite-mode previews); registry
  `R10` flipped `red`→`green` on two `ready-to-flip` legs.
- `docs/tickets/DEFERRALS.md` — 13 rows flipped DONE with evidence pointers; 5 rows stay OPEN
  with dated re-owe notes + named carriers (append-only).
- `docs/build/reports/2026-10-16_verif2/` — committed evidence (98 files: reports + screenshots).
- `docs/build/runs/VERIF.2.md` — run ledger (gap table, audit-log-pinned spend ledger, evidence).

## DEFERRALS dispositions

**DONE (13):** D-OPS.1-2 (live pause: `activationPolicy=NEVER`/`STOPPED` + 0-drift refresh),
D-MAINT.6-1 (mint proof), D-SPA.12/13/14/15/17/18/19/21/22/23/25-1.

**OPEN, honestly re-owed (5):** D-OPS.1-1 (posture-bound legs → a domains-bearing stage),
D-SPA.6-1 (prod SSR arm → operator chain deploy), D-SPA.16-1 + D-SPA.20-1 (N9 →
stripe-bearing stage), D-SPA.24-1 (collab wire → domains-bearing stage).

## Verification

- `pnpm turbo build lint typecheck` — 135/135 tasks green.
- `pnpm test` — 501 files / 5,813 pass / 4 skip / 0 fail (F-VERIF.2-3 dossier regression
  test included; `privsep.docker` green).
- `ci-boundary --pr 186 --stack` — **pass `3cb92cf`** (run 38936484599 — all five checks;
  stack #185–#172 pass). The first read on `54766b8` surfaced a latent fetcher flake
  (F-VERIF.2-7 — `HostRateLimiter.take()` double clock read; fixed with a regression
  test, not waived).
- Live: 10 journey runs on `pr-186`, provenance MATCH on `e7b21aecb` where expected;
  D-OPS.1-2 pause leg executed + drift-free; `spend.weeklyMeteredUsd: 0` / `withinCap: true`
  on every report — no paid legs, zero prod writes.
- Teardown: `destroy` + `rm` complete; orphan enumeration across 20 resource classes → zero
  `rhema-pr-186*` resources remain; preview-scoped `iap-ssh` firewall rule removed.
- Cost: ≈ $2.9 list-price estimate (audit-log-pinned windows) vs the ≤$8 target.

## Boundaries

Preview resources only (`rhema-507501`, `rhema-pr-186*`); no prod mutations; no secrets in any
artifact (`provided: yes/no` only); mergePolicy OPERATOR — this PR is never merged by the run.
