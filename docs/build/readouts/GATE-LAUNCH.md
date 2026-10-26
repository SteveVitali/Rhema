<!--
  docs/build/readouts/GATE-LAUNCH.md (BM-INDEX-03) — append-only gate readout for the round-6
  marker 197a_GATE-LAUNCH__public-launch.md. The 13 pre-registered thresholds of
  docs/round-6-draft-spec.md §6, verbatim.
-->
# GATE-LAUNCH — Public launch of rhema.tools (round 6) — readout

Status: STAGED   <!-- the ONLY line that may change: → SIGNED | PASSED | SKIPPED-BY-OPERATOR | NOT-PASSABLE -->

- **Criterion (verbatim, `197a_GATE-LAUNCH__public-launch.md`, from `docs/round-6-draft-spec.md` §6):**
  "(1) zero launch-blocking OPEN DEFERRALS rows — the launch-blocking set is every row the §7
  accounting tags `LB`; (2) REQ-SEC-3 (pre-launch adversarial review) zero open criticals/highs;
  (3) REQ-LCH-1 `approved: true` on every page; (4) Showcase + sample dossier + H4 stamps signed
  off; (5) REQ-DISC-3 golden green on all four protocols at the launch-candidate SHA; (6) REQ-GO-2
  nightly green on `main` == prod; (7) REQ-DEP-2 drills all PASS + alerts paging; (8) REQ-DEP-3 HA
  live; (9) REQ-FOR-2 has no ledger defect; (10) REQ-FOR-4 exposure verdict recorded and, if yes,
  the approved notice sent; (11) REQ-DISC-1 is complete or its refusal is dispositioned; (12) the
  launch-surface lint is green; (13) the `debit-mode-flip.md` preconditions 1–3 hold (calibration
  adopted with ≤ 10% cap reach, notice sent, effective date reached) — or the operator rules on
  the recorded gap. The operator's go is recorded verbatim."

> An operator or authorized human record supplies the decision; an agent must not sign or
> assume silence is approval. This file is **staged** by R6CNT.2 — each threshold carries its
> evidence pointer and its honest state at staging time; the orchestrator re-reads the full
> corpus at presentation and ticks nothing without evidence.

## Threshold table — state at staging (2026-10-23, deployed `ba66c4b`)

| # | threshold | state | evidence pointer |
|---|---|---|---|
| 1 | zero `LB` OPEN DEFERRALS rows | **ORCHESTRATOR-READ** — R6CNT.2 contributes: D-P1.21-1 discharged for the four evidence-backed rows; D-PRB.01-2 discharged (approved proposal landed); D-P1.17-1 discharged (Wells fixture landed + seeded on prod — ADR-121 authored-fixture deviation); D-P1.17-2's Showcase half discharged (fresh-account leg 1.7 s green on prod); D-SEC.1-2 already DONE (R6FOR.2). New row `D-R6CNT.2-1` (live Full-board fixture regeneration) — tagged PL in its entry, NOT `LB`: the launch-blocking "real essay seeded" criterion is met by the authored fixture; only the ticket-contract export path is deferred. The whole-§7 recount is the orchestrator's gate read. | `docs/tickets/DEFERRALS.md`; this run's dated notes |
| 2 | REQ-SEC-3 zero open criticals/highs | **OWED** — the pre-launch adversarial review ticket has not run as of staging. | manifest REQ-SEC-3 owner row |
| 3 | REQ-LCH-1 `approved: true` on every page | **MET** — `LEGAL_DETAILS` filled (Rhema Labs / NY, NY / contact@rhema.tools; `CONTACT_ADDRESS: null` — no postal address approved); all five `LEGAL_PAGES` `approved: true`; `legalApprovalViolations()` empty; live render verified on prod (`/terms` → "Rhema Labs" + "NY, NY"; `/privacy` → "Rhema Labs" + "contact@rhema.tools", no `⟦…⟧` marks). | `packages/contracts/src/legal.ts`; `docs/build/reports/2026-10-23_R6CNT.2/` |
| 4 | Showcase + sample dossier + H4 stamps signed off | **MET** — H11 A3/A4 approved (verbatim "I also approve A2, A3, and A4"; pick = Wells "The Extinction of Man"). Landed + deployed: `/showcase` serves the Wells dossier (verified live); `seedShowcaseProject` emits the fixture (2 membered workspaces backfilled; every new signup seeds it — the fresh-account leg rendered 12 finding rows); `venue_table_verified_at = 2026-10-21` on prod (`seedProtocols` applied). Residual honestly recorded: the 31 pre-existing showcase rows carry the prior fixture (replacing them is outside the named `seedShowcaseProject` mutation — a delete+reseed is the operator's call). | run ledger `R6CNT.2.md`; `fresh-showcase-leg/runs.jsonl` |
| 5 | REQ-DISC-3 golden green on all four protocols | **OWED** — golden = the 00 minimal four-protocol cohort (paid runs); the funded wave is parked under GD-R6B.R6 (operator-dispositioned "STAYS CLOSED"). Rides threshold 11's refusal arm OR a narrower re-ruled envelope at the launch-candidate SHA — the operator's recorded call. **Additional blocker live-found this run — F-R6CNT.2-1:** prod `rhema-prod-anthropic-api-key` v3 returns **401** on `GET /v1/models` (verified directly); every shared-secret model path (walkthrough, ingest reconstruction, pod calls) would 401 — **no paid run can complete on prod until the operator rotates/binds a live key**. | `docs/build/readouts/GATE-R6B.md`; `F-R6CNT.2-1` (LEDGER OPEN FINDINGS) |
| 6 | REQ-GO-2 nightly green on `main` == prod | **OWED** — merge policy OPERATOR: the operator merges the stack bottom-up, then the scheduled nightly must go green on the merged SHA. | GD-DEPLOY.R6 merge reading |
| 7 | REQ-DEP-2 drills all PASS + alerts paging | **PARTIAL** — drills PASS (R6OPS.1: restore RTO 579 s; rollback N−1 PASS; egress playbook PASS; on-call doc). Alerts: the worker `OPS_ALERT_WEBHOOK_URL` path is armed + proven (488 receipts) BUT `F-R6OPS.1-1` — the 14 Monitoring AlertPolicies carry zero notification channels (operator provisioning owed; flagged, not silently fixed). | `docs/build/runs/R6OPS.1.md`; `F-R6OPS.1-1` |
| 8 | REQ-DEP-3 HA live | **OWED** — the GD-HA.R6 levers (SQL HA + proxy×2) are pre-authorized "in any window before launch" but not applied as of staging. | `GD-HA.R6`; `GD-PREAUTH-ACTS.R6` item |
| 9 | REQ-FOR-2 has no ledger defect | **MET** — the `balance_divergence` defect was found + fixed + regression-tested (R6FOR.1); prod residue = test-tenant fixture contamination, no prod write owed. | `docs/build/runs/R6FOR.1.md`; LEDGER finding |
| 10 | REQ-FOR-4 verdict recorded + notice sent | **MET** — verdict YES recorded (252 confirmed cross-tenant reads; every identified party operator/staff-controlled). H11 "Approve as drafted" (GD-EXPOSURE-NOTICE.R6). **Sent this run:** 4 emails + 4 inbox rows (`security_notice`, dedup `rls-exposure-notice:v1`), scope = the real-workspace holders active in the window — dry-run scope re-verified identical to the approval basis before send. Counts-only log committed. | `exposure-notice/send-log.md` |
| 11 | REQ-DISC-1 complete or refusal dispositioned | **MET (as disposition)** — the funded wave parks under GD-R6B.R6; REQ-DISC-1 is carried as a refused-wave disposition per the pre-registered arm. | `docs/build/readouts/GATE-R6B.md` |
| 12 | launch-surface lint green | **MET** — `check:surface` leg green in this run's CI-boundary evidence (see the run's verify block); the launch-surface `SURFACE_FILES` list gained `legal.tsx` in R6LGL.1. | run ledger verify block |
| 13 | debit-mode-flip preconditions 1–3 — or the operator rules the gap | **GAP — operator ruling owed** — precondition state at staging: `cap_calibration_reports` = 0 (calibration not adopted); the metered notice IS sent (R6DEP.1, EFFECTIVE_DATE 2026-12-01 — not yet reached). Preconditions 1–3 do not all hold → the operator rules on the recorded gap at the gate. | `docs/ops/debit-mode-flip.md`; `R6DEP.1`/`R6MNY.1` ledgers |

## What this run contributed

- Deployed `dc7fb15` → **`ba66c4b`** under `GD-DEPLOY.R6` — all four conditions evidenced
  (`prod-preflight/preview-classification.md`); provenance all-PASS; `deployments` row recorded.
- Thresholds 3, 4, 10 discharged with live evidence; 9 and 11 confirmed by prior runs' records.
- The paid Full-board fixture-export path is honestly deferred (`D-R6CNT.2-1`, ADR-121) — a
  ticket-contract deviation, NOT a launch-blocker per the §7 accounting (the launch-blocking
  Showcase criterion is met by the authored fixture).
- **F-R6CNT.2-1 flagged first-class:** the prod Anthropic key (shared by every direct-API model
  path) is dead upstream — 401 verified on the shared secret's latest enabled version. Pre-existing
  (the `ba66c4b` deploy touched no secret) but launch-relevant: it blocks any paid model call —
  thresholds 5 + 11 and organic paid runs all ride the operator's key decision.

## Signature block — OWED

The operator's go is recorded verbatim here. _Not yet presented._
