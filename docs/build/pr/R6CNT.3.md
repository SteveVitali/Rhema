# R6CNT.3 — Showcase Full-board regeneration (D-R6CNT.2-1 paid leg; run executed, swap not applicable)

## Summary

Executes the deferred **paid leg of D-R6CNT.2-1** under GD-REMAINING.R6 item 4 ("approve all
remaining tasks, proceed" — bounded **≤ $40 measured**): **one real Full-board `review` run of the
Wells showcase essay on prod** (`80db0d5`), on the flagged `is_test` workspace
`01M5M2C6NC3058T528ZX2D44SG`, never retried.

**Run `01M5NGSTDRVN42JHTAA9C2SDDW` → `completed`** (23:16→23:52Z, 7/7 phases): 14 artifacts, 14
claims, 15 findings, 8-dimension rubric, 24 KB letter. **Measured spend $10.68 list / 1,991 cr**
(`usage_records`, 117 rows) — inside the bound; net charge 323 cr after the 6,696-cr hold released
and **the two unclosed research phases auto-refunded** (verification 256 + discourse 120 —
REQ-SPEC-32 live).

**The delivered bundle is contract-ineligible → the authored fixture stays.** The run honestly
self-reports that `verification` and `discourse` never closed (blocking findings 0–1): all 14
claims `unverifiable`, zero `claim_sources`, **zero contradicted tier-1 claims** → the verbatim
export fails `assertShowcaseFixture`'s REQ-POS-3 half. Per the deferral's own conditional
("materially better") and the brief's "replace only if appropriate," **no swap, no reseed, no
redeploy** — `/showcase` continues to serve the authored H11-approved dossier (verified live
unchanged). `D-R6CNT.2-1` stays **OPEN** with the dated tail; `F-R6CNT.3-1` records the
phase-completion defect the run surfaced.

## What changed

- `scripts/live/showcase-regen.mjs` — the driver: `--estimate` (deterministic re-check, refuses
  >$40), `--dispatch` (provenance `gitSha` check → `is_test` check → funded-balance check →
  magic-link session → ingest the fixture essay → refined estimate → **one** launch → poll to
  terminal → measured spend + §12.8 fields → scores JSON), `--export` (delivered bundle →
  `showcase-bundle.json`), `--emit` (bundle → the generated seed module — kept for the discharge
  run; intentionally not run against the seed this time). Fail-closed:
  `REGEN_BUDGET_RULING=approved`, same-tag idempotent dispatch, terminal failure recorded not
  retried.
- `scripts/live/showcase-regen.test.mjs` — 13 source-scan pins on the driver's refusal/dedupe/
  measurement arms.
- `packages/db/src/seed/showcase.ts` — the discharge-path machinery (behavior-identical today):
  `DossierRunCard` parameterizes the dossier run row (estimate/cap/spent/model tier/phase credits/
  fetch + access rows); the writable journey dossiers keep `AUTHORED_DOSSIER_RUN_CARD` (the
  run-report fixture's charged=spent=3,860 fold is untouched); claim inserts now carry
  `url`/`normalized_url` and `claim_sources.normalized_url`; evidence/rubricDims/anchor reads are
  null-safe for real-run field shapes.
- `docs/` — run ledger, this PR body, `reports/2026-10-23_R6CNT.3/` (estimate, scores, the
  delivered bundle export, pod spec + logs, `live-exercise.md`), BUILD_INDEX row 223, LEDGER
  (F-R6CNT.3-1 + PHASE LOG), DEFERRALS dated tails, GATE-LAUNCH threshold-4 note.

## Dispatch record (evidence)

- Provenance: `/healthz` `80db0d5` on api+web at dispatch; run-task image
  `run-task@sha256:b9002347`.
- Funding: tripped circuit breaker doubled the hold to 6,696 cr → `402 insufficient_balance`
  (pre-launch refusal, $0, no run row); a **1,000-cr audited house grant** (`admin-cli
  house-grant`, ledger `01M5NGSCAXQHHVCGZETQ8V2EP5`, audit `01M5NGSCMSH6KZG9WQ6360M8J3`) funded
  the documented seam; same-tag re-dispatch created the one run.
- Delivered: `completed`; correspondence `01M5NJWVS5SQ0P2R5E4K3KKX7E` (`essay@1`).
- Spend: `$10.68` list / 1,991 cr metered; `runs.spent_credits` 697; ledger net −323 (refunds +
  breaker absorption); balance 7,227 → 6,904.
- §12.8: see `reports/2026-10-23_R6CNT.3/live-exercise.md` — (a) real fetches through the proxy,
  (e) second-read isolation (`explicit_files: ["drafts/v1.md"]`), (f) two-uid sandbox, hook-layer
  allow/deny in the run's own `access_log`; (b)/(c)/(d)/`egress.denied` carried.
- New live finding **F-R6CNT.3-1**: `verification`/`discourse` done-gates pass a schema-valid but
  unclosed ledger (`inventoryCount:0` at exit 0) — the harness fact was visible, the phase still
  marked done; downstream honesty (blocking findings, entailment caps, refunds) worked.

## Design decisions

- **No swap.** The contract (`assertShowcaseFixture` / REQ-POS-3) is the arbiter; the delivered
  bundle has nothing to contradict and nothing sourced — swapping would break every provisioning
  seed and misrepresent the product. The authored bundle is ADR-121-approved content; the gap it
  carries is provenance-only and stays recorded on the deferral.
- **Keep the machinery.** The refactor + emit path are behavior-identical today and make the
  eventual swap a generated-file drop + one import — the deferral's closure no longer needs seed
  surgery.
- **`usage_records` is the meter of record** ($10.68); `runs.spent_credits` (697) and the ledger
  fold (−323 net) are recorded alongside so the three money surfaces reconcile honestly.

## Verification

- `pnpm vitest run packages/db/src/seed/showcase.test.ts` — 7/7 green (seed unchanged in behavior).
- `pnpm vitest run scripts/live/showcase-regen.test.mjs` — 13/13 green.
- `pnpm test` — full suite **517 files / 6,111 pass** (4 skipped).
- `pnpm turbo build lint typecheck` — **135/135** clean.
- `check-build-memory.sh` — 0 violations; `check-append-only.mjs --base c1f20f5` — OK.
- Live: run `completed`; `/showcase` 200 serving the authored dossier; `regen-scores.json`,
  `showcase-bundle.json`, `live-exercise.md`, pod spec/logs committed.

## Stack

Base `stevevitali/r6ops-2-alert-channels` @ `be4c12d`. mergePolicy `OPERATOR` — worker does not
merge.

## Carries / asks

- `D-R6CNT.2-1` stays OPEN — owed: a run producing a *showcase-grade* bundle (likely gated on
  `F-R6CNT.3-1` or a stronger-tier authorization; base tier exhausted its verification budget on
  research without closing verdicts).
- `D-R6SECR.1-1` stays OPEN — dated tail added (exercised vs carried legs).
- `F-R6CNT.3-1` — new finding: phase-completion gate accepts an unclosed claim ledger.
- Operator ask: none blocking; a future ruling on whether the regeneration retries at
  frontier/balanced tier (fresh estimate then) or waits on the F-R6CNT.3-1 fix.
