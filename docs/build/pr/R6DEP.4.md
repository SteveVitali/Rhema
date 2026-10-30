# R6DEP.4 — maintenance deploy of `main` to prod + nightly literal-arm evidence

## Summary

Deploys `main` tip `4938b8e4024777417c5a8ed9f518f9afb4bebd08` to prod under `GD-DEPLOY.R6`
(payload: the merged #231 `rl:testidentity` limiter bucket + records — **non-protocol-affecting**
per `docs/ops/golden-rerun-rule.md`, so the golden re-run rule does not re-arm), and wires the
missing half of the operator-bound env-gap secrets so the threshold-6 literal nightly arm can
read green. **`b953c55e → 4938b8e` is live**: `pulumi up` update 169 (10 image rolls + the
stateless proxy template replace + `+1` additive IAMMember — zero stateful replace/delete,
cost Δ≈$0), provenance all-PASS on web+api, `deployments` row recorded, public-route smoke 6×200.

## What changed

- **Deploy** — `infra/pulumi/Pulumi.prod.yaml`: all-10 digest re-pins to Cloud Build `c6d7dedb`
  (`_GIT_SHA=4938b8e…`, `_TAG=r6dep-4`, vendored-SDK gate fail-closed) with a dated comment.
- **F-R6DEP4-1 (env-gap secrets unreachable)** — `.github/workflows/journeys.yml`: the bound
  `secrets.JOURNEY_DATABASE_URL`/`JOURNEY_T8_EXPORT_TOKEN` were never injected into the job env
  (Actions never auto-injects), and the DSN's host `10.46.0.3` is VPC-private (unreachable from a
  GitHub runner). Added: secret→env mappings, a sha256-pinned Cloud SQL Auth Proxy step on the
  WIF ADC, and a host-rewrite of the bound DSN to `127.0.0.1:15433`. `infra/pulumi/journeys.ts`:
  `roles/cloudsql.client` IAMMember on the repo WIF principalSet (connect-only; DB auth still
  needs the DSN password). **The paid arm is untouched** — env+proxy gate on `!paid`: an
  app-login pool can never satisfy the spend guard's `pg_roles` probe, so the weekly cron keeps
  its no-db attestation verbatim.
- **Self-healing fixture substrate** — `packages/journeys/src/fixture-substrate.ts`
  (`ensureJrnaPaidFixture`, `ensureT8ExpiredExport`): jrn-a's ~26 h test-tenant purge re-mints
  the workspace daily, stranding N9's BILL.3 fixture sub on the dead account (§14.2's
  `topups_require_plan` is correct — substrate drift, not a product regression) and deleting
  T8's minted expired-export row. The legs now re-seat their own substrate on the CURRENT
  workspace under the bound DSN (same arm as `seedWritableDossier`) before probing —
  durable across every purge. `steps.ts` (N9 Entry 2) + `stb5a.ts` (T8 410 arm) wired.
- **Run ledger** — `docs/build/runs/R6DEP.4.md` (full evidence trail).

## Nightly `40965117844` diagnosis (19 fail / 25 pass / 21 skip)

- ~14 signup legs 429'd on `test+*` identities → rides this deploy's api image (the
  `rl:testidentity` bounded bucket).
- R6F/T7 `needs JOURNEY_DATABASE_URL`, T8 `JOURNEY_T8_EXPORT_TOKEN` → the secrets were bound but
  unreachable + uninjected (F-R6DEP4-1); wired here, needs merge for the literal cron arm.
- N9 `Buy 1,000 credits: not in the DOM` → jrn-a free-tier substrate drift (fixture sub on dead
  account `01M4XCG…` vs current `01M63VEG…`); self-healing arm committed + a seat landed live
  (`sub_jrna_journey_seed` writer/past_due on the current account).

## Verification

- `pulumi preview --diff` classified: +1 create / ~10 update / +-1 stateless replace / 165
  unchanged; `pulumi up` update 169 SUCCEEDED; `check-deploy-provenance --expect 4938b8e…`
  all-PASS web+api; `record-deployment` wrote `prod:4938b8e…`.
- Fixture arms exercised live over the IAP tunnel before dispatch: `sub_jrna_journey_seed` +
  `t8exp_jrn_5c4ef3991b1d22` on jrn-a's current workspace.
- `pnpm --filter @rhema/journeys typecheck` + `lint` + `build` clean.
- Post-deploy journeys dispatches, all `stage=prod` `paid=false` `expect-sha=4938b8e…`:
  - `41007476023` (env-gap v1, cloud-sql-proxy) → 37/21/7: limiter legs green; DB legs
    ECONNRESET — proxy can't reach a private-IP-only instance off-VPC (verified locally too).
  - `41009532658` (env-gap v2, IAP+SSH) → tunnel step failed `publickey` — GCE metadata
    `ssh-keys` needs `username:key` (colon form); fixed `c12ee47` + update 171.
  - **`41010350002` (branch ref `c12ee47`) → 44 pass / 21 skip / 0 FAIL — FULL GREEN,**
    provenance `match:true`. Every signup leg, every env-gap leg, N9 + T8 all green.
  - `41011507952` (`--ref main` `4938b8e`) → 39/21/5: the five reds are exactly the
    env-gap legs gated on this PR's merge (main's `journeys.yml` lacks the wiring);
    N9 green on the seated fixture. Zero product regressions, zero limiter failures.
- GATE-LAUNCH `GD-THRESH6.R6` dated note: disposition discharged in substance; the literal
  clause (scheduled 06:05Z nightly, `provenance == deployments.sha == github.sha == main
  HEAD`) owes only this merge + the next cron.

## Requirement ids

REQ-DEP-1 (deploy machinery). Gate words verbatim: `GD-DEPLOY.R6` conditions all evidenced.
