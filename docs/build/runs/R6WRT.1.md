# R6WRT.1 — Guarded one-off prod writes (run ledger)

- **Spec:** `docs/tickets/184_R6WRT.1__guarded-one-off-writes.md` (manifest row 184, round 6)
- **Normative loads:** `docs/round-6-draft-spec.md` §4.4 (REQ-WRT-1/2/3); LEDGER `GD-RES.2-1`
  (Round-6 ruling row — "Refund + relabel") + `GD-PREAUTH-ACTS.R6` (the scoped pre-authorization —
  the authority for every execute leg); DEFERRALS `D-RES.2-2`, `D-BL38.1-1`, `D-P1.04-2`;
  `docs/build/runs/RES.2.md` § Historical scan (the verbatim 4-row candidate list);
  `docs/build/runs/BL38.1.md` (the guarded-write precedent this run replicates);
  `scripts/live/cleanup-bl38-residue.mjs` (system-role, dry-run default, capture, one transaction);
  `packages/ledger/src/unverified-settle.ts` + `resume.ts` `refundPhases` (the canonical refund shape)
- **Base:** `stevevitali/r6cnt-1-launch-content-prep` @ `687856a`
- **Branch:** `stevevitali/r6wrt-1-guarded-one-off-writes` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-WRT-1 REQ-WRT-2 REQ-WRT-3
- **Authorization:** `GD-PREAUTH-ACTS.R6` (LEDGER GATE DECISIONS, 2026-10-20) — each act executes
  only after its dry-run matches the itemized scope exactly and its pre-state is captured;
  rollback material retained; expires GATE-LAUNCH. **VOID CONDITIONS:** a dry-run/scope mismatch
  voids the pre-authorization FOR THAT ACT (do not execute; record + flag first in report-back);
  a prod incident from an act voids the whole pre-auth.
- **Started:** 2026-10-21T21:52Z · **Closed:** (pending)
- **Live access:** prod via IAP tunnel → **system-role** `postgres` DSN (`rhema-prod-alloydb-password`);
  reads inside `BEGIN READ ONLY`; the three executes are the only writes, each one transaction.
- **ci:** (pending)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in this ticket's blast radius:
- **D-RES.2-2** — PARTIAL: scan ran live 2026-10-01; ruling GD-RES.2-1 "Refund + relabel" answered
  2026-10-20; execution (the writes + evidence) owed to this run → DONE on success.
- **D-BL38.1-1** — OPEN: fix shape ruled "rewrite the id in place" to the 40-char sha; execution
  owed to this run; closes when `cleanup-bl38-residue.mjs --dry-run` no longer reports the
  short-sha observation → DONE on success.
- **D-P1.04-2** — PARTIAL: the hand-date arm (verbatim: backdate a flagged scratch project's
  `deleted_at`/`pgboss.job.start_after` past the grace; the worker's next sweep tick fires the
  destruction leg) is this run's REQ-WRT-3. Destruction read is REQ-CLK-3 → R6CLK.1. This run
  notes it "armed — destruction read owed to R6CLK.1".

## Requirements (from the contract)

1. Three scripts, each `--dry-run` default printing the itemized set with row evidence, and
   `--execute` that fails closed unless the dry-run's set equals the ruled items exactly.
2. Execution under `GD-PREAUTH-ACTS.R6` with before/after evidence committed under
   `docs/build/reports/<date>_R6WRT.1/` (redacted dumps; verbatim dumps → gitignored
   `docs/build/logs/`).
3. Per act: pre-state capture = full row dumps; one transaction; rollback = restore from capture.
4. REQ-WRT-3's hand-date target is a scratch project on an `is_test` workspace, purge-exempt from
   the 26 h test-tenant purge (create it if needed — a test-tenant write inside this item's scope).
5. DEFERRALS: D-RES.2-2 + D-BL38.1-1 → DONE with evidence; D-P1.04-2 noted "armed — destruction
   read owed to R6CLK.1".

### The itemized scope (verbatim from GD-PREAUTH-ACTS.R6 / GD-RES.2-1)

- **REQ-WRT-1** — credit grants: run `01M3EAAZG2AQ289B6ZFEP5XYN2` **56 cr** + run
  `01M3SK62YZST272B35CG12K6TW` **340 cr** (the `refundPhases` shape — per-research-phase per-bucket
  `refund` rows, `reason='platform_fault:zero_coverage'`), plus
  `delivery.label='unverified'` on the zero-coverage deliveries. Test-tenant probes
  (`01M3VT9R…`, `01M3VYSGV…` fact_checks) get **no** credit action and stay `delivery=null`
  (no class exists yet — the GD row's verbatim note).
- **REQ-WRT-2** — `deployments` id `prod:d5a74cc` → its 40-char SHA (`prod:<git_sha>` where the
  row's `git_sha` is 40-char hex).
- **REQ-WRT-3** — back-date one purpose-made, purge-exempt test tombstone's `deleted_at` by 30 d
  (+ the `pgboss.job` `project.purge` row armed past grace — the D-P1.04-2 arm verbatim).

## Acceptance criteria

- [x] Each dry-run lists exactly the ruled items with row evidence *(live-executed)*
- [x] Each execute ran only on an exact scope match; before/after evidence committed *(live-executed)*
- [x] `cleanup-bl38-residue.mjs --dry-run` no longer reports the short-sha observation *(live-executed)*
- [x] verification green; every new behaviour has a test; requirement ids stamped; DEFERRALS rows
  written; BUILD_INDEX row + LEDGER advanced; operating clauses met *(agentic — universal AC)*

## Plan

- `scripts/live/res2-retro-apply.mjs` — resolves each ruled run: `state='completed'`,
  `workflow='review'`, `delivery is null`, `is_test=false`, zero-coverage predicate recomputed
  (≥1 checkable T1/2, 0 covered), research-class step ids (`verification`/`discourse`,
  `state='done'`), net debit per (step,bucket) == ruled totals (56/340). `--execute`: refund rows
  verbatim to `refundPhases` (`platform-fault:<runId>:<step>#<bucket>` idempotency keys,
  `reason='platform_fault:zero_coverage'`, `source='run'`) + `credit_balances` +available in the
  same transaction + `runs.delivery` stamped `{label:'unverified',checkableClaims,coveredClaims,
  platformFaultSettledAt,refundedCredits,alerted:false}` (the settle markers — prevents the
  stranded sweep's leg E re-drive / surprise ops page; documented deviation note).
- `scripts/live/bl38-stamp-rewrite.mjs` — resolves `prod:d5a74cc` exactly once, guards
  `git_sha ~ '^[0-9a-f]{40}$'`, confirms target id free; `--execute` updates the id in place.
- `scripts/live/hand-date-tombstone.mjs` — resolves/creates a scratch project on an `is_test`
  workspace that the 26 h tenant purge cannot reach before `project.purge` fires (fresh workspace
  or the funded purge-exempt tenant); back-dates `deleted_at` past the 30 d grace; ensures the
  `pgboss.job` `project.purge` row exists armed in the past (insert or `start_after` rewrite).
- `*.test.mjs` source-pin suites per script (dry-run default, execute fail-closed on scope
  mismatch, verbatim ids/amounts, capture-before-write, one transaction, redaction list).
- Evidence: `docs/build/reports/2026-10-21_R6WRT.1/{req-wrt-1,req-wrt-2,req-wrt-3}/` —
  dry-run.json + apply.json + redacted pre/post-state dumps; verbatim dumps →
  `docs/build/logs/r6wrt1-capture/` (gitignored).

## Test matrix

- `res2-retro-apply.test.mjs` — pins: dry-run default; `--execute` refuses when env go unset or
  resolved set ≠ ruled set; verbatim run ids + amounts; `platform_fault:zero_coverage` reason;
  idempotency-key shape; capture precedes write; one transaction; test-tenant exclusion.
- `bl38-stamp-rewrite.test.mjs` — pins: verbatim `prod:d5a74cc`; 40-char sha guard; id-rewrite SQL;
  twin/target-free guard; execute fail-closed.
- `hand-date-tombstone.test.mjs` — pins: dry-run default; is_test guard; purge-exempt (freshness)
  guard; `deleted_at` back-date ≥30 d; `project.purge` job armed; singleton key shape.
- Live legs (per act): dry-run → scope verdict → execute → post-state reads.

## Progress

- 2026-10-21T21:52Z — run ledger seeded; context loaded (contract + §4.4 + GD-RES.2-1 +
  GD-PREAUTH-ACTS.R6 + the three deferral rows + RES.2/BL38.1 run ledgers + canonical settle/refund
  shape + `project.purge` machinery + the pgboss schedule probe).
- 2026-10-21T21:56Z — three scripts + three source-pin suites landed (39/39 local vitest green).
- 2026-10-21T21:58Z — IAP tunnel `15433→10.46.0.3:5432` up (`rhema-prod-proxy-3ms6`),
  `postgres` system role bound (rolsuper|rolbypassrls). All reads inside `BEGIN READ ONLY`.
- 2026-10-21T21:58:28Z — **REQ-WRT-1 DRY-RUN: scope exact.** Both ruled runs `applicable`:
  `01M3EAAZG2…` 56cr (1 promo draw on `verification` step `01M3ECGB…`); `01M3SK62…` 340cr
  (290 promo on `verification` `01M3SMCD…` + 50 promo on `discourse` `01M3SMHJ…`). Zero-coverage
  recomputed (5/0, 13/0), `delivery=null`, `is_test=false`, no prior platform-fault keys. The two
  test-tenant probes are **absent from prod** (already swept — observation, untouched).
- 2026-10-21T21:58:34Z — REQ-WRT-2 first dry-run `blocked`: the row's `git_sha` column carries the
  SHORT sha `d5a74cc` — the 40-char target is not derivable from the row. Resolved `d5a74cc` →
  `d5a74cc1c23047f471b9d32680ebac55fd8d0c4d` via `git rev-parse` (unique in `--all`; commit
  2026-10-14T15:00:43Z ≤ deploy stamp 15:24:36Z; ARMB run ledger §6 names `d5a74cc` as the
  corrective deploy — provenance-consistent). Guard upgraded to fail-closed unique-expansion;
  NOT a scope mismatch — the resolved write set is still the one ruled row, and "its 40-char SHA"
  is deterministic.
- 2026-10-21T21:59:19Z — **REQ-WRT-2 DRY-RUN: scope exact** (`prod:d5a74cc` →
  `prod:d5a74cc1c23047f471b9d32680ebac55fd8d0c4d`, signature verbatim, target free, commit ≤ stamp).
- 2026-10-21T21:59:22Z — **REQ-WRT-3 DRY-RUN: scope exact.** No fresh `is_test` workspace exists
  (5 stale test workspaces 150–165h → not purge-exempt) → plan-create `r6wrt1-tombstone-probe-tenant`
  (fresh ⇒ inside the 26h sweep window) + probe project + 1 draft + `project.purge` job armed past.
- 2026-10-21T21:59:27Z — **REQ-WRT-1 EXECUTED** (`R6WRT_OPERATOR_GO=confirmed`, one transaction):
  3 `refund` rows (`platform_fault:zero_coverage`, `platform-fault:<run>:<step>#<bucket>` keys,
  `source='run'`, balances +available) + 2 write-once `delivery` stamps
  (`{label:'unverified',checkable,covered,platformFaultSettledAt,refundedCredits,alerted:false}`).
  Post-state green: labels stamped, refund totals 56+340, probes untouched.
- 2026-10-21T21:59:32Z — **REQ-WRT-2 EXECUTED** (one transaction): `deployments.id`
  `prod:d5a74cc` → `prod:d5a74cc1c23047f471b9d32680ebac55fd8d0c4d`. Post-state: short id 0,
  target 1, remaining short-sha rows 0. (Observation: the row's `git_sha` column still reads the
  short `d5a74cc` — same defect instance the ruling covered by id; noted, not a new write.)
- 2026-10-21T21:59:38Z — **REQ-WRT-3 EXECUTED** (one transaction): billing account
  `01M5G7M7HDNGE1JTWYVERXQJE9`, `is_test` workspace `01M5G7M7HC43N87M1Q903SFGQX`,
  project `01M5G7M7RHWX8F0DYHGT2869JR` tombstoned `2026-09-21T20:59:38Z` (30.04d) + draft +
  `project.purge` job `357a8ba1-5260-4a8e-98a6-f182eaa78c38` (`start_after` past).
- 2026-10-21T21:59:40Z — **destruction fired live**: the worker consumed the armed job at
  21:59:40.564Z — `state=completed`; the project + draft are gone (cascade), zero
  runs/analytics residue (`post-destruction.json`). The arm → destruction leg is proven
  end-to-end; the REQ-CLK-3 read (R6CLK.1) cites this + its own read.
- 2026-10-21T21:59:43Z — post-verify: `cleanup-bl38-residue.mjs --dry-run` no longer reports the
  `prod:d5a74cc` short-sha observation (7 known out-of-scope observations only). AC3 green.
- 2026-10-21T22:00Z — tunnel closed. Zero metered spend (all legs were DB writes/reads — $0).
- 2026-10-21T22:02Z — self-review (mechanical + design pass): two rerun-path hardenings landed in
  `hand-date-tombstone.mjs` (`probe-placement` vacuous-on-create bug; job-state armed check now
  requires live pg-boss states); bl38 header comment corrected. Executed paths unaffected.
  39/39 pin tests re-green. DEFERRALS flips written (D-RES.2-2 DONE, D-BL38.1-1 DONE, D-P1.04-2
  armed note). Gap table + evidence log/report filled.
- 2026-10-21T22:07Z — verification: `pnpm turbo build lint typecheck` 135/135 (FULL TURBO);
  `pnpm test` 510 files / 6016 passed / 6 skipped; `check:licenses` (822 pkgs),
  `check:protocol-markers` (251 files), `check:no-cookies` (257), `check:spa-budget`,
  `check:spa-env`, `check:dom-contract` — all OK. New pins: 39/39.

## Gap table

| # | Contract clause | Achieved? | Evidence |
|---|---|---|---|
| R1 | 3 scripts; `--dry-run` default prints the itemized set with row evidence | MET | the 3 scripts; `*/dry-run.json` artifacts list the ruled set verbatim with row + guard evidence |
| R2 | `--execute` fails closed unless resolved set == ruled set exactly | MET | `scopeExact` gates; `refused.json` written + exit 4 on mismatch (unit-pinned); WRT-2's first dry-run correctly BLOCKED until the sha-resolution guard was hardened |
| R3 | Execution under GD-PREAUTH-ACTS.R6 | MET | `R6WRT_OPERATOR_GO=confirmed` required; scope re-validated inside `--execute`; all 3 executes ran only after exact matches |
| R4 | Before/after evidence committed (redacted), verbatim captures gitignored | MET | `prestate-*`/`apply.json`/`post-state.json` committed under `reports/2026-10-21_R6WRT.1/`; verbatim dumps in `docs/build/logs/r6wrt1-capture/` (gitignored) |
| R5 | One transaction per act; rollback = restore-from-capture | MET | single `begin/commit` per script (rollback on any error); verbatim captures name the restore set |
| R6 | REQ-WRT-3 target: purge-exempt `is_test` scratch project (create-if-needed inside scope) | MET | fresh `is_test` workspace + project minted (no fresh test tenant existed — plan-create branch); tombstone 30d+1h; job armed; the REAL `handleProjectPurge` destroyed it |
| R7 | DEFERRALS flips verbatim | MET | D-RES.2-2 → DONE, D-BL38.1-1 → DONE, D-P1.04-2 noted "armed — destruction read owed to R6CLK.1" |
| R8 | System-role postgres via IAP; never the app role; tunnel closed after | MET | `SYSTEM_DATABASE_URL` only; `BEGIN READ ONLY` for resolve; tunnel killed 22:00Z |
| R9 | No secrets/PII in committed artifacts | MET | redactor on all committed dumps; deployments/plan rows carry no secrets; nothing in reports contains a DSN/password |
| R10 | Out-of-scope respected — new findings observed, never written | MET | 7 pre-existing cleanup observations + 2 absent probes reported verbatim; zero out-of-scope writes |
| U | Universal AC (verify green, tests, ids stamped, ledgers, budget) | MET | § Verification + § Evidence report; REQ-WRT-1/2/3 stamped |

**Decisions recorded (execution-shaping, not design — no ADR owned):**
- REQ-WRT-1 writes `refund` rows (the `refundPhases` shape verbatim, `platform_fault:zero_coverage`)
  rather than free `grant` rows — the GD row's ruled shape.
- The write-once `delivery` blob carries `settleUnverifiedDelivery`'s settle markers
  (`platformFaultSettledAt`, `refundedCredits`, `alerted:false`) — `alerted:false` dispositions the
  stranded-sweep alert leg truthfully without paging for a 25-day-old run.
- `run.unverified`/`cost.refunded` event rows deliberately not emitted — minimal verbatim scope;
  every surface reads `runs.delivery`/`credit_ledger` directly.
- REQ-WRT-2 sha-source: the row's `git_sha` column itself held the short `d5a74cc`; resolved by
  unique `git rev-parse` expansion guarded `commit_time ≤ deployed_at` — deterministic, still "its
  40-char SHA".
- Self-review hardening post-execution: `probe-placement` guard now requires a pre-existing probe to
  sit on the resolved fresh `is_test` workspace (was vacuous on the create path), and job-state
  checks require live pg-boss states (`created`/`retry`/`active`) — executed path unaffected
  (create branch, fresh job).

## Evidence log

- `scripts/live/res2-retro-apply.mjs` + `.test.mjs` (15 pins) — REQ-WRT-1
- `scripts/live/bl38-stamp-rewrite.mjs` + `.test.mjs` (11 pins) — REQ-WRT-2
- `scripts/live/hand-date-tombstone.mjs` + `.test.mjs` (13 pins) — REQ-WRT-3
- `docs/build/reports/2026-10-21_R6WRT.1/` — committed redacted evidence:
  - `req-wrt-1/`: dry-run.json, apply.json, post-state.json, 10 prestate-*.json (runs/steps/
    credit_ledger/credit_balances/workspaces per run — redacted)
  - `req-wrt-2/`: dry-run.json, apply.json, post-state.json, prestate-deployments.json
  - `req-wrt-3/`: dry-run.json, apply.json, post-state.json, post-destruction.json,
    prestate-plan.json
  - `bl38-postverify/dry-run.json` — the AC3 observation-gone read
- `docs/build/logs/r6wrt1-capture/` — verbatim pre-state dumps (gitignored; rollback material)
- DEFERRALS flips: D-RES.2-2 DONE, D-BL38.1-1 DONE, D-P1.04-2 armed note (above)

## Evidence report

Live leg executed 2026-10-21T21:58–22:00Z via system-role `postgres` over the IAP tunnel; zero
metered spend (all DB reads/writes). Per-act: REQ-WRT-1 **executed** (2 runs relabeled
`unverified`, 3 refund rows = 396cr, one txn); REQ-WRT-2 **executed** (1 deployments id rewrite,
one txn); REQ-WRT-3 **executed** (1 test ws/project/draft/job set, one txn) + destruction observed
live at 21:59:40.564Z. No incident; no void; nothing refused. Post-verify `cleanup-bl38-residue
--dry-run`: the `prod:d5a74cc` observation is gone (7 pre-existing out-of-scope observations
remain — reported verbatim, untouched).
