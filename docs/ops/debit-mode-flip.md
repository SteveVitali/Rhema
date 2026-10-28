# Debit-mode flip runbook — `committed` → `metered` (ECON.1; ADR-014 sequencing guard; ADR-031)

> **Status: operator-paused.** This procedure is never run unattended. The flag ships dark
> (`debitMode: "committed"` on every stage); the flip is a config change + deploy, preceded by the
> paid-account notice (step 0) whose timing is the operator's call (LEDGER GATE DECISIONS).

Run repository scripts from the repository root and Pulumi commands in `infra/pulumi`.
Bind the system DSN and mail credentials through the approved operator environment; never paste
them into a committed command or print a service's complete environment while checking one flag.

## Preconditions (all must hold)

1. The calibrated-cap deploy has landed: migration `0049_cost_calibration.sql` applied;
   `cost_observations` harvesting is running (`billing.estimator-refit` weekly job);
   `cap_calibration_reports` has `adopted=true` rows for the cells that drive paid surfaces
   (`select workflow, rigor, model_tier, size_band, cap_multiplier, cap_reach_pct, adopted, note
   from cap_calibration_reports order by computed_at desc`).
2. In-sample cap reach ≤ 10% on the adopted buckets (the report's `cap_reach_pct` column).
3. The notice (step 0) has been sent and the chosen effective date reached.
4. `DEBIT_MODE=committed` is the live env on `rhema-prod-api` and `rhema-prod-worker`.
   Read only that field using the filtered command in step 2, once per service.

## Step 0 — the paid-account notice (before anything flips)

```bash
# dry-run first — prints every recipient + the rendered copy; writes nothing, sends nothing
DATABASE_URL=postgres://… EFFECTIVE_DATE=YYYY-MM-DD \
  node scripts/live/send-metered-notice.mjs

# then send (writes inbox rows + claims delivery rows + mails via Resend; exactly-once on the
# dedup key, safe to re-run)
DATABASE_URL=… EFFECTIVE_DATE=YYYY-MM-DD APP_ORIGIN=https://rhema.tools \
  RESEND_API_KEY=… EMAIL_FROM='Rhema <hello@rhema.tools>' \
  node scripts/live/send-metered-notice.mjs --send
```

The notice names the effective date; the flip must not happen before it. The maintained
[launch order](launch-flips.md) requires at least 30 days after sending (REQ-BILL-2 / ADR-014).

## Step 1 — stamp the calibration cutovers (once, at the conformance deploy)

The harvest only fits caps on post-fix evidence. On the worker's env:

```
CALIBRATION_PRESET_CUTOVER = <this deploy's timestamp — the §6.5 conformance deploy>
CALIBRATION_RESEARCH_AFTER = <RES.1's research-restore deploy timestamp>
```

(`infra/config/stages.ts` carries the values for future stages; the runbook row is authoritative
until a stage lands them.)

## Step 2 — flip

```bash
# 1. infra/config/stages.ts — prod (and dev/preview if desired): debitMode: "metered"
# 2. rebuild api + worker images on the chain tip; pin digests in Pulumi.prod.yaml
# 3. checks BEFORE up:
(cd infra/pulumi && pulumi preview --stack prod --diff) # expect: api+worker env rolls only; ZERO create/replace/delete
node scripts/check-additive-migrations.mjs   # additive only
#    monthly delta ≤ $15/mo (the round-3 standing authorization)
# 4. deploy
(cd infra/pulumi && pulumi up --stack prod) # record the update number + the deployments row
node scripts/check-deploy-provenance.mjs     # /healthz build.gitSha == chain-tip SHA
# 5. verify the live env
gcloud run services describe rhema-prod-worker --region=us-central1 \
  --format=json | jq -r '.spec.template.spec.containers[].env[] | select(.name == "DEBIT_MODE") | .value'
# expect metered; repeat for rhema-prod-api
```

## Step 3 — verify (within one hour)

- A completed run's `credit_ledger` shows the settle debit `debit:<run>:settle:<attempt>` netting
  to the proxy meter (± the `metered_over_debit` refund when the pod-claim floor overshot).
- `credit_ledger` carries `reason='metered_over_debit'` refunds where the floor over-debited.
- A user-cancelled run settles to `min(metered, cap)` — debits before the release row.
- The stranded sweep's leg F (`metered_resettled` outcomes) re-settles late proxy rows.
- `Σ debits − Σ refunds ≤ cap` on every run (the DB trigger is the assertion of last resort).
- `beta-dashboard` COGS + the four-number reconciliation still agree.

## Rollback

The flag is pure config — rollback is a revert of `debitMode` to `"committed"` in `stages.ts` +
redeploy the same images (no code change, no migration, no stateful move). In-flight runs at the
flip boundary: a run committed under `metered` (metered-only debits, no floor) settles under
`committed` as a top-up to metered — the same figure; a run committed under `committed` (floor
debits) settling under `metered` refunds the over-debit. Both directions are safe; the 72 h
residue sweep (`resettleRun`) reconciles stragglers under whichever mode is live.

## Watch items after the flip

- `cap_calibration_reports.cap_reach_pct` > 10% on an adopted bucket → the caps are wrong, not the
  mode (ECON.2's criterion); consider reverting the multiplier, not the flag.
- `metered_over_debit` refunds > 1% of settled runs in a week → the pod-claim floor is mis-sized
  (ADR-031 revisit trigger).
- `adjustment(absorbed)` above-cap rows spike → the 2× circuit breaker should trip (REQ-SPEC-24(5));
  if it does not, check `circuit-breaker.ts` first.
