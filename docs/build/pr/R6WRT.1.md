## Summary

R6WRT.1 — guarded one-off prod writes (REQ-WRT-1/2/3; spec `docs/round-6-draft-spec.md` §4.4;
manifest row 184). Executes the three ruled production mutations under `GD-PREAUTH-ACTS.R6` with
the BL38.1 discipline: each act resolved its itemized set in a `BEGIN READ ONLY` dry-run, compared
it to the ruled set verbatim, captured full pre-state, and wrote exactly once inside a single
transaction via the **system-role** `postgres` DSN over the IAP tunnel. All three acts **EXECUTED**
on exact scope matches — nothing refused, no incident, zero out-of-scope writes, $0 metered spend.

## What changed

- `scripts/live/res2-retro-apply.mjs` (+ `.test.mjs`, 15 pins) — **REQ-WRT-1 (EXECUTED):** the
  GD-RES.2-1 "refund + relabel" retro apply. Resolved both ruled runs `applicable`
  (`state=completed`, `workflow=review`, `delivery=null`, `is_test=false`, zero-coverage predicate
  recomputed 5/0 + 13/0, refund draws == ruled totals, no prior platform-fault keys), then in ONE
  transaction wrote 3 `refund` rows verbatim to `refundPhases`
  (`reason='platform_fault:zero_coverage'`, `platform-fault:<run>:<step>#<bucket>` idempotency
  keys, `source='run'`; `credit_balances` +available maintained in the same transaction) + the
  write-once `delivery={label:'unverified',…,platformFaultSettledAt,refundedCredits,alerted:false}`
  stamps. Totals: 56cr on `01M3EAAZG2AQ289B6ZFEP5XYN2`, 340cr on `01M3SK62YZST272B35CG12K6TW`
  (290+50 promo). The two test-tenant probes are absent from prod (swept) — observed, untouched.
- `scripts/live/bl38-stamp-rewrite.mjs` (+ `.test.mjs`, 11 pins) — **REQ-WRT-2 (EXECUTED):**
  `deployments.id` `prod:d5a74cc` → `prod:d5a74cc1c23047f471b9d32680ebac55fd8d0c4d`, one
  transaction. The row's `git_sha` column itself held the short sha; the 40-char target is the
  unique `git rev-parse` expansion guarded by row-signature + `commit_time ≤ deployed_at` +
  target-free checks. Post-state: target row present with identical payload, zero remaining
  `^prod:[0-9a-f]{7}$` rows; the BL38 cleanup dry-run no longer reports the observation.
- `scripts/live/hand-date-tombstone.mjs` (+ `.test.mjs`, 13 pins) — **REQ-WRT-3 (EXECUTED):** no
  fresh `is_test` workspace existed (5 stale test tenants inside the 26h sweep window), so the
  create-if-needed branch minted workspace `01M5G7M7HC43N87M1Q903SFGQX` (`is_test`), project
  `01M5G7M7RHWX8F0DYHGT2869JR` (`r6wrt1-tombstone-probe`) tombstoned 30d+1h, one draft, and an
  armed `project.purge` job — ONE transaction. The worker's real `handleProjectPurge` then
  destroyed the project + draft at 2026-10-21T21:59:40.564Z (job `completed`; residue
  runs=0/analytics=0).
- `docs/build/reports/2026-10-21_R6WRT.1/` — committed redacted before/after evidence per act
  (dry-run/apply/post-state + prestate dumps + the post-destruction read + the bl38-postverify
  observation-gone dry-run). Verbatim full-row captures stay gitignored under
  `docs/build/logs/r6wrt1-capture/` (rollback = restore-from-capture).
- `docs/tickets/DEFERRALS.md` — **D-RES.2-2 → DONE** (refund+relabel evidence); **D-BL38.1-1 →
  DONE** (rewrite + observation-gone evidence); **D-P1.04-2** dated note — "armed — destruction
  read owed to R6CLK.1".
- `docs/build/runs/R6WRT.1.md` — run ledger with the live-leg progress log, gap table, evidence
  log/report, and recorded decisions (refund-not-grant shape; delivery settle markers +
  `alerted:false`; no `run.unverified`/`cost.refunded` event rows — minimal verbatim scope;
  repo-expansion sha source for REQ-WRT-2).

## Verification

`pnpm turbo build lint typecheck` — 135/135 · `pnpm test` — 510 files, **6,016 pass / 6 skip /
0 fail** (new pins 39/39) · `check:licenses` (822 pkgs), `check:protocol-markers` (251),
`check:no-cookies` (257), `check:spa-budget`, `check:spa-env`, `check:dom-contract` — all OK ·
`check-build-memory.sh` 0 violations · `check-append-only.mjs --base 687856a` OK.

Live leg 2026-10-21T21:58–22:00Z, system-role `postgres` over IAP; dry-run → exact-match → one
transaction → post-state per act; tunnel closed. $0 metered spend.

## Acceptance criteria → evidence

| AC | verdict | evidence |
|---|---|---|
| Each dry-run lists exactly the ruled items with row evidence | met | `req-wrt-{1,2,3}/dry-run.json` — resolved sets == ruled sets verbatim |
| Each execute ran only on an exact scope match; before/after evidence committed | met | `scopeExact` gates + `apply.json`/`post-state.json`/prestate dumps per act |
| `cleanup-bl38-residue.mjs --dry-run` no longer reports the short-sha observation | met | `bl38-postverify/dry-run.json` |
| Universal phase-gate | met | this table + run-ledger § Gap table / Evidence log; REQ-WRT-1/2/3 stamped; D-rows written |

Requirement ids: **REQ-WRT-1 · REQ-WRT-2 · REQ-WRT-3**.

Size: ~350 budget → ~1,234 code+pin lines (3 guarded live drivers à la the 485-line BL38.1
precedent) + ~1,350 generated evidence JSON + run ledger/DEFERRALS — overage recorded as a
deviation.
