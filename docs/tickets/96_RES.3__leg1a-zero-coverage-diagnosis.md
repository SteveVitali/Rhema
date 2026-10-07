# RES.3 — Leg-1a zero-coverage diagnosis: why did a funded research run retrieve nothing?

- **Sequence:** 96 (round 3 — maintenance/investigation row, post-chain) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** defect-investigation
- **base_branch:** `stevevitali/maint-3-funded-window-repairs` (the chain tip; stacked PR on `stevevitali/res-3-leg1a-zero-coverage`)
- **Depends on:** the funded window's recorded evidence (`docs/build/runs/FUNDED-2026-10-06-A.md` §B.4);
  CITE.1/RES.1/RES.2 context.
- **Scope (one line):** read-only diagnosis of run `01M48VNKY6F263TCQRVBJ8JRQA`'s 9/9-unverifiable /
  0-`claim_sources` delivery; fix the defect if contained, else record a deferral + backlog row.
- **Absorbs (backlog):** the Leg-1a diagnosis half of the CITE.1 residuals (`D-CITE.1-2/-3` context).
- **Run:** `implement-spec spec=docs/tickets/96_RES.3__leg1a-zero-coverage-diagnosis.md`
- **Gate status:** none — read-only prod access + code/tests only; `mergePolicy: OPERATOR`.
- **Spend:** **$0.** No paid legs, no deploys, no prod writes — SELECT-only queries.

## The incident (from FUNDED §B.4)

Leg 1a (`fact_check` probe, run `01M48VNKY6F263TCQRVBJ8JRQA`, $8.45) completed structurally but delivered
**zero coverage**: 9/9 claims `unverifiable`, **0 `claim_sources` rows**, 6 empty search events, null
completeness, auto-refund `platform_fault:zero_coverage` (165 cr). The same window's Leg 3
(`01M48YYS50Z6CNX517RJQXRCJ2`, Quick/Base Review) researched successfully (7/7 covered, `searchCovered=7`).
This resembles the RES.1 evidence-retention incident class and is the last unexplained research-truthfulness
gap — REQ-SPEC-31's unresolved evidence.

## Contract

1. **Reconstruct the run's research trace** (read-only): `run_events` (the 6 search events' payloads —
   queries issued? empty result sets? errors?), `fetch_log` (any allow/deny/error rows in the research
   window), `claim_sources`/`claims` rows, phase artifacts if persisted, and the run-task instance's Cloud
   Logging for the run id (tool errors, egress-proxy denials, credential provisioning). Compare the
   Leg-3 run's successful trace for the same dimensions.
   - Access: the sanctioned read channel — `cloud-sql-proxy`/IAP tunnel + system-role DSN via
     `JOURNEY_DATABASE_URL` (`scripts/live/funded-window.mjs`'s pattern; `funded-query.mjs` uses
     `DATABASE_URL` with `BEGIN READ ONLY` — either is fine, SELECTs only). **Prerequisite:** ambient
     operator GCP credentials + the tunnel must be available (precedent D-RES.2-2); if they aren't, stop
     and record `blockedOn` rather than guessing. REQ-SPEC-30: explicit workspace/run predicates on every
     query; secrets never in the ledger.
2. **Name the root cause** — pick from (or rule out): egress-proxy deny/path failure; proxy-credential
   mint or revocation failure for this run; search-provider outage/error swallowed upstream; claim
   extraction empty (no claims → no fetches); `claim_sources` persistence defect (fetched but not
   written — the RES.1 class); race between phases. The diagnosis must end at a specific mechanism with
   evidence, not "investigated, inconclusive" — if genuinely inconclusive, say so with the dead ends listed.
3. **Fix if contained:** if the root cause is a code defect that fits one PR (e.g. a swallowed error, a
   bad join, a dropped write), fix it + regression test in this ticket. If it's environmental or large,
   append a `D-RES.3-1` deferral + `BACKLOG.csv` row with the mechanism and the fix sketch.
4. **Truthfulness check:** does the delivered dossier + auto-refund behavior match what ADR-021/022/023
   promised for zero-coverage? If the refund path misfired or mislabeled, that's a finding too.

## Out of scope

- Deploys, prod writes, any paid leg (the CITE.1 probe-leg retries stay owed).
- N6 planted-error journey, Standard/Base excerpt leg (D-RES.1-2/-3 stay open).

## Verify

- Run ledger records the mechanism + evidence (queries + log excerpts, secrets never).
- If a code fix lands: `pnpm test` scoped green + `turbo build lint typecheck` green.
- `check-build-memory.sh` + `check-append-only.mjs --base <tip>` clean.
