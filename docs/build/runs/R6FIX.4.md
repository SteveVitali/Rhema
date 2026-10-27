# R6FIX.4 — F-R6CNT.3-1: phase done-gate accepts an unclosed claim ledger (run ledger)

- **Spec:** operator per-ticket worker brief (no manifest ticket file; insert row).
  Root-cause + fix F-R6CNT.3-1: the R6CNT.3 $10.68 Showcase run's `verification`
  phase committed `done` on a schema-valid but UNCLOSED claim ledger
  (`claimRowCount:14, inventoryCount:0`; all 14 rows `unverifiable` with
  `url`/`sourceCheck`/`note` NULL, zero `claim_sources`) and `discourse`
  likewise delivered unresolved. GATE-LAUNCH threshold 9 ("no REQ-FOR-2 ledger
  defect") is implicated — this is the honest defect it points at.
- **Normative loads:** `docs/build/runs/R6CNT.3.md` (the finding detail +
  `reports/2026-10-23_R6CNT.3/showcase-bundle.json` — the real placeholder
  rows); `packages/orchestrator/src/completion-oracle.ts` (the three-leg
  done-gate + `PredicateFacts`); `apps/run-task/src/work-reader.ts`
  (`factsForPhase` — the fact producer); `apps/run-task/src/harness-loop.ts`
  (the pod commit loop + RES.3 dead-budget resolution);
  `packages/contracts/src/delivery-label.ts` + `packages/ledger/src/
  unverified-settle.ts` (the REQ-SPEC-31(3) downstream honesty machinery);
  `packages/protocols/skills/editorial-review/` (the sidecar emission contract).
- **Base:** `stevevitali/r6fix-3-meter-race` @ `f1ea2b6` (pushed chain tip; PR base = same).
  mergePolicy=OPERATOR — never merge.
- **Branch:** `stevevitali/r6fix-4-donegate`
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills`
- **Started:** 2026-10-27T10:4xZ · **Closed:** 2026-10-27T12:1xZ @ `0079876` — PR #224
  green at the final head, unmerged (OPERATOR).
- **Live stage:** none — code + records only; $0 expected (no paid rerun).
  Deployed re-proof rides the next DEP ticket (prod `dc3a8f6` runs pre-fix code).
- **Production mutations:** none.

## Root cause (confirmed on disk)

Two compounding defects in the oracle's leg (c), both in
`apps/run-task/src/work-reader.ts` `factsForPhase`:

1. **`claim_rows_gte_inventory` is vacuous.** It reads
   `ledger?.inventoryCount ?? 0` off `01-claim-ledger.json` — but the field is
   in neither `claimLedgerSidecarSchema` (sidecars.ts) nor the SKILL's
   documented exact-shape, so no agent ever emits it. `required =
   min(0, cap) = 0` and `claimRowCount ≥ 0` is tautological: the coverage
   check could never fail. (The run's `claimRowCount:14, inventoryCount:0`
   is exactly this.)
2. **Row count ≠ closure.** Even populated, the fact counts ledger ROWS
   regardless of disposition — a placeholder row (`unverifiable`, no note,
   no url, no sources, no sourceCheck) counts identically to a checked
   claim. Nothing in the phase contract asks "did a check produce a
   disposition".

Downstream honesty did its job (blocking findings 0–1, entailment-capped
rubric, `platform_fault:zero_coverage` refunds 256+120 under the write-once
`runs.delivery` Unverified label) — the defect is the GATE letting the
unclosed ledger ride to `done` at all.

## Design decision — hard gate, in the phase contract's own vocabulary

The phase contract is `completionPredicates` + the oracle's leg (c). The fix
is a NEW predicate kind **`claim_ledger_closed`** declared on every
claim-ledger-producing phase (review.verification, fact_check.verification,
draft.grounding):

- **Row rule:** a row is UNCLOSED when it asserts no check outcome —
  `verdict` absent/`unverifiable` (canonicalized) AND no evidence trail
  (`note` | `url` | `normalizedUrl` | `accessedAt` | `sourceCheck` |
  non-empty `sources`). A justified `unverifiable` IS a closed disposition
  (per the ticket's checked|unverifiable|disputed enumeration and §4 of
  verification-protocol: "cannot be checked in principle… noted so the
  author can decide" — the "noted" is the evidence).
- **Ledger rule:** `unclosedClaimOrdinals` must be empty. Absent facts fail
  (the oracle's own proven-not-assumed rule).
- **`inventoryCount` honesty:** drop the `?? 0` — absent `inventoryCount` →
  `required` undefined → coverage FAILS ("proven, never assumed"). The field
  is declared optional on `claimLedgerSidecarSchema` + documented in
  SKILL.md's exact-shape so the agent emits it.
- **Failure path (the R6CNT.3 shape):** predicates fail →
  `incomplete/artifact_missing` → research-phase checkpoint → live budget
  consult → exhausted → `resolveDeadBudget` → checkpointed ledger fails the
  SAME predicates → `research_budget_exhausted` → failStep TERMINAL → run
  `failed` + net-debit refund + hold release (internal-api.ts:1583–1655).
  With budget alive: ONE guided retry naming `claim_ledger_closed` + the
  unclosed ordinals. A run may not mark `done` while claims sit unchecked —
  and REQ-SPEC-31(3) is preserved: a ledger of JUSTIFIED `unverifiable`
  rows closes honestly, commits, and the delivery layer's Unverified label
  + refund still fires on zero post-strip coverage.
- **Not a terminal-flag design:** the phase contract IS the predicate set —
  a flag parallel to it would be a second gate the contract doesn't read.

## Re-stamp decision — NOT needed (recorded honestly)

The $10.68 run's card already renders the truthful state: `runs.delivery`
carries the write-once `unverified` label (proven — the recorded
`platform_fault:zero_coverage` refunds fire ONLY under
`deliveryLabelFromRow === "unverified"`, unverified-settle.ts:67), the
blocking findings self-report both unclosed phases, the rubric caps are
stamped, and `assertShowcaseFixture` independently measured 0 contradicted
tier-1 / 0 sourced claims. The card does NOT assert completed-as-grade —
no re-stamp, and per the append-only rule none could rewrite it anyway.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). No row this ticket
unblocks: D-R6CNT.2-1 (the owed showcase-grade regeneration) stays OPEN —
it is blocked on this fix deploying + a fresh ruling, not on this ticket
closing it; D-R6SECR.1-1 unaffected.

## Requirements (operator directive)

1. Root-cause the phase `done` gate + where claim-ledger closure is (not)
   asserted. **DONE — see above.**
2. Gate must require the ledger's closure invariants (hard gate or honest
   terminal flag — hard gate chosen, matching the contract's expression).
3. Deterministic tests: `done` attempt with unchecked claims refused/flagged;
   closed ledger passes.
4. Decide + record re-stamp honestly. **DONE — no re-stamp; card already
   truthful.**
5. Verify: `pnpm turbo build lint typecheck` + `pnpm test` touched;
   `check-build-memory.sh .` 0 violations; `check-append-only.mjs --base c1f20f5` OK.
6. Records: this ledger + `pr/R6FIX.4.md` + PR + BUILD_INDEX row 230 +
   LEDGER (F-R6CNT.3-1 → RESOLVED-IN-CODE, PHASE LOG, `nextTicket` stays
   `196a_HUMAN-H12`) + GATE-LAUNCH threshold-9 dated note.
7. Push; `ci-boundary.sh --ledger docs/build/LEDGER.md --ticket R6FIX.4
   --json docs/build/logs/ci-R6FIX.4.json`.

## Acceptance criteria

- [ ] `claim_ledger_closed` declared on review + fact_check verification
      phases (and the draft grounding ledger — same envelope, same defect
      class) *(engineered)*
- [ ] `inventoryCount` absent OR declared `0` → coverage predicate fails (never vacuous)
      *(engineered)*
- [ ] R6CNT.3-shaped ledger (all-`unverifiable` placeholders) → phase
      refused; with dead budget → `research_budget_exhausted` terminal
      *(fixture-verified via unit/integration tests)*
- [ ] Closed ledger (incl. justified-`unverifiable` rows) → phase passes
      *(fixture-verified)*
- [ ] Re-stamp decision recorded *(done above)*
- [ ] Universal phase-gate AC *(agentic)*

## Test matrix

- `completion-oracle.test.ts` — `claim_ledger_closed`: all-closed passes;
  bare `unverifiable` rows fail; justified `unverifiable` passes;
  verdict-absent row fails; absent fact fails; coverage `inventoryCount`
  absent → fails with honest detail.
- `work-reader.test.ts` — `factsForPhase` on real ledger JSONs: R6CNT.3
  placeholder rows → all 14 ordinals unclosed; evidence-bearing
  `unverifiable` → closed; `inventoryCount` carried/absent.
- `harness-loop.test.ts` — verification `done` with
  `unclosedClaimOrdinals:[…]` → incomplete → guided retry (or terminal on
  dead bound); closed facts → commit. Update existing verification facts
  for the new predicate (they pass facts directly).
- Gates: `pnpm turbo build lint typecheck`, `pnpm test` touched,
  check-build-memory + append-only.

## Plan

1. `manifest-types.ts` — `claim_ledger_closed` predicate kind.
2. `completion-oracle.ts` — `PredicateFacts.unclosedClaimOrdinals` +
   evaluator case; honest absent-inventory detail on
   `claim_rows_gte_inventory`.
3. `work-reader.ts` — `factsForPhase`: shared ledger read; closure fact;
   `inventoryCount` no longer defaults to 0 (numeric-string tolerant).
4. `review.ts` / `fact_check.ts` / `draft.ts` manifests — declare the
   predicate + display labels.
5. `sidecars.ts` — `inventoryCount` optional on `claimLedgerSidecarSchema`.
6. `SKILL.md` (editorial-review) — document `inventoryCount` + the
   evidence-bearing-`unverifiable` closure rule.
7. Tests per the matrix; harness-loop facts updates.
8. Records + closeout.

## Progress

- 2026-10-27T10:4xZ — branch cut @ `f1ea2b6`; root cause confirmed on disk
  (see above); re-stamp decision recorded (not needed — card already
  truthful via the persisted Unverified label).
- 2026-10-27 — implemented: `claim_ledger_closed` predicate kind +
  `unclosedClaimOrdinals` fact + evaluator case; `inventoryCount ?? 0`
  vacuity removed (absent ⇒ coverage fails); predicate declared on
  review/fact_check `verification` + draft `grounding`; `inventoryCount`
  optional on `claimLedgerSidecarSchema`; both SKILL.md sidecar sections
  document `inventoryCount` + the Closure rule — regenerated through
  `upstream-port.manifest.mjs` (`check-upstream-diff` clean);
  `PROTOCOLS_VERSION` → `0.4.0+9c2b880dbee74bd8`.
- 2026-10-27 — tests: oracle +5, work-reader +5 (real ledger JSONs incl.
  the R6CNT.3 14-placeholder-row shape), harness-loop +3 (refusal →
  guided retry → fail / retry-closes → commit / dead bound →
  `research_budget_exhausted`). Existing verification facts updated for
  the third predicate. `pnpm turbo build lint typecheck` green;
  full `pnpm test` green.
- 2026-10-27 — records: `F-R6CNT.3-1` → RESOLVED-IN-CODE (LEDGER finding
  amended); GATE-LAUNCH threshold-9 dated note; ADR-123 authored
  (closure-as-predicate design + evidence-bearing `unverifiable` rule +
  honest discourse residual); `pr/R6FIX.4.md`; BUILD_INDEX row 230.

## Gap table

| Spec item | Disposition |
|---|---|
| Phase cannot complete while claims unchecked | **MET** — `claim_ledger_closed` fails `done` on any placeholder row |
| Every emitted claim has a meaningful verdict/disposition (checked\|unverifiable\|disputed) | **MET** — verdict absent/`unverifiable`-without-evidence ⇒ unclosed; a substantive verdict or an evidence-bearing `unverifiable` closes |
| Discourse contested-claim outcomes must resolve | **MET-DIFFERENTLY (deferred, D-R6FIX.4-1 / ADR-123)** — discourse has no machine-readable outcome contract (markdown artifact, no sidecar); its closure cannot be gated until a `02-discourse-report.json` shape exists. Verification's gate blocks the whole-run lie F-R6CNT.3-1 measured; the discourse-side contract is tracked as its own deferral rather than silently scoped out |
| Hard gate vs terminal flag | **MET** — hard gate chosen (the phase contract's own vocabulary); rationale + alternatives in ADR-123 |
| Closed ledger passes | **MET** — deterministic tests (justified `unverifiable` incl.) |
| Failing-open not acceptable | **MET** — absent closure fact, absent `inventoryCount`, AND a declared-zero inventory all fail (proven, never assumed — `min(0, cap) = 0` is the same bypass through a second channel) |
| No fake closure on the historical record | **MET** — no re-stamp owed: the card already carries the write-once `unverified` label + blocking findings; recorded honestly |

## Evidence log

- `pnpm turbo build` 45/45 green; `lint typecheck` 39/39 green (touched set).
- `pnpm exec vitest run` on the six touched test files: 192/192 after the
  fixture-verdict fix (oracle 16, work-reader 41, harness-loop 39,
  contract 13, manifests 77, version 6).
- Full `pnpm test` — recorded in Evidence report.
- `node scripts/check-upstream-diff.mjs` — 22 ported files reconcile,
  only sanctioned edits.
- `node scripts/compute-protocols-version.mjs --write` — froze
  `0.4.0+9c2b880dbee74bd8` (43 trio files).
- `bash ~/agent-skills/skills/build-memory/scripts/adr-index.sh docs/adr` —
  README regenerated with ADR-123.

## Evidence report

- **`pnpm turbo build`**: 45/45 packages green. **`pnpm turbo lint typecheck`**: 135/135 tasks
  green (whole workspace).
- **`pnpm test`** (whole suite): **517 test files passed / 1 skipped; 6,136 tests passed /
  4 skipped; 0 failures** (~400 s, incl. the 197 s privsep docker leg).
- **`check:protocol-markers`**: OK — sentinels armed, 251 public-facing files scanned, no
  markers/provenance leaks.
- **`check-upstream-diff`**: OK — 22 ported files reconcile with the vendored pin (5fef4165)
  + only sanctioned edits.
- **`check-build-memory.sh .`**: **0 violations** (11 baseline warnings — same class as prior
  tickets: manifest banner rows, nextTicket HUMAN row, legacy PHASE LOG sizes).
- **`check-append-only.mjs --base c1f20f5`**: OK — protected regions only grew.
- **Deterministic tests added:** oracle +5, work-reader +5 (the literal R6CNT.3
  14-placeholder-row shape), harness-loop +3 (refusal→retry→fail; retry-closes→commit;
  dead-bound→`research_budget_exhausted`).
- **CI:** `ci-boundary --ledger --stack` reads **pass** at the final head `0079876`
  (run 40501911743 — all seven legs + `ci-pass` anchor, cache-fast; code+records head
  `81c28a1` pass at run 40494204433, unit leg 42m33s after the 2700s-cap re-read precedent;
  stack #223–#219 pass). Record `docs/build/logs/ci-R6FIX.4.json`.
- **Spend:** $0 — code + records only; no paid run, no prod write.
