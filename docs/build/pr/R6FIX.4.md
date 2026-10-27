# R6FIX.4 — F-R6CNT.3-1: phase done-gate accepts an unclosed claim ledger

**Root cause · gate design · re-stamp:** The `done`-gate's coverage leg was **vacuous**
(`inventoryCount ?? 0` → `min(0, cap) = 0` — a field no agent was ever told to emit, so coverage
could never fail) and **no closure concept existed** — row count stood in for disposition, so a
ledger of bare `unverifiable` placeholders counted identical to checked claims. **Gate design:
hard gate** in the phase contract's own vocabulary — a new `claim_ledger_closed` completion
predicate on every claim-ledger-producing phase; a `done` verdict on an unclosed ledger can no
longer commit (guided retry names the unclosed ordinals; a dead research bound ends
`research_budget_exhausted` + honest refund). **Re-stamp: none owed** — the R6CNT.3 run card
already renders the truthful state (write-once `unverified` label proven by the recorded
`platform_fault:zero_coverage` refunds; blocking findings; capped rubric; `assertShowcaseFixture`
measured 0/0). ADR-123 records the design.

## What changes

- **`packages/protocols/src/manifest-types.ts`** — new `CompletionPredicate` kind
  `claim_ledger_closed`.
- **`packages/orchestrator/src/completion-oracle.ts`** — `PredicateFacts.unclosedClaimOrdinals`;
  evaluator case (empty ⇒ pass, absent ⇒ fail, non-empty ⇒ fail naming the ordinals);
  `claim_rows_gte_inventory` now reports the absent-`inventoryCount` failure honestly instead of
  a `14 ≥ undefined` detail.
- **`apps/run-task/src/work-reader.ts`** — `factsForPhase` gains the closure fact: shared
  `readClaimLedger` (artifact `.md`→`.json` twin via the same resolveKey cascade), the
  `unclosedClaimOrdinals` row rule (verdict absent/`unverifiable` AND no
  note/url/normalizedUrl/accessedAt/sourceCheck/sources ⇒ unclosed), and **`inventoryCount` is
  never defaulted to 0** — absent ⇒ fact unset ⇒ coverage predicate fails (proven, never
  assumed); a numeric string coerces (LLM-tolerant, matching the sidecar coercion).
- **`packages/protocols/manifests/{review,fact_check,draft}.ts`** — `claim_ledger_closed`
  declared on `verification` (both) and `grounding` — every claim-ledger-producing phase.
- **`packages/contracts/src/sidecars.ts`** — `inventoryCount` optional on
  `claimLedgerSidecarSchema` (documents the coverage denominator agents must emit).
- **`packages/protocols/skills/{editorial-review,draft-from-outline}/SKILL.md`** — regenerated
  through `upstream-port.manifest.mjs`: `inventoryCount` in the exact-shape example + the
  **Closure** contract (a bare `unverifiable` row is a placeholder, not a disposition).
  `check-upstream-diff` clean; `PROTOCOLS_VERSION` re-frozen `0.4.0+ec61156725a895ab` →
  `0.4.0+d0c1b01a8c9516df` per the regenerated trio.

## How the R6CNT.3 shape fails now

`01-claim-ledger.json` with 14 bare-`unverifiable` rows (no note/url/sources) →
`unclosedClaimOrdinals: [0..13]` → `claim_ledger_closed` fails → `incomplete(artifact_missing)`
→ research-phase checkpoint → live consult: alive ⇒ ONE guided retry naming the ordinals;
exhausted ⇒ `resolveDeadBudget` ⇒ checkpointed ledger fails the same predicates ⇒
`research_budget_exhausted` ⇒ `failStep` terminal ⇒ run `failed` + net-debit refund + hold
release (the path internal-api.ts:1583–1655 already owns).

**REQ-SPEC-31(3) preserved:** an *evidence-bearing* `unverifiable` (the note/trail is the
check's record per verification-protocol §4) IS a closed disposition — the honest Unverified
delivery path (dead-bound commit → Unverified label → zero-coverage refund) still rides.

**Honest residual:** `discourse` has no machine-readable outcome contract (markdown artifact,
no sidecar) — its contested-claim outcomes cannot be gated until a `02-discourse-report.json`
shape exists. Verification's gate blocks the whole-run lie F-R6CNT.3-1 measured; the
discourse-side contract is recorded follow-up work (finding resolution + ADR-123).

## Tests (deterministic)

- `completion-oracle.test.ts` +5 — closed ledger passes; placeholder rows refuse `done` naming
  ordinals; absent closure fact fails; partial closure fails even with coverage+schema green;
  absent `inventoryCount` fails coverage with the honest detail.
- `work-reader.test.ts` +5 — `buildPhaseOutputs` on real ledger JSONs: the R6CNT.3 placeholder
  shape → all 14 ordinals unclosed + `inventoryCount` unset; closed ledger → `[]`;
  mixed ledger → `[4, 9]`; numeric-string `inventoryCount` coerces; absent ledger → fact unset.
- `harness-loop.test.ts` +3 — the defect replay: placeholder `done` → guided retry naming
  `claim_ledger_closed` → `artifact_missing` fail, never committed; retry-closes → commits;
  placeholders + exhausted bound → `research_budget_exhausted`, no re-drain. Existing
  verification facts updated for the third predicate.
- **Verify:** `pnpm turbo build lint typecheck` green; `pnpm test` (whole suite) green;
  `check-build-memory.sh` 0 violations; `check-append-only.mjs --base c1f20f5` OK;
  `check-upstream-diff` clean.

## Records

`docs/build/runs/R6FIX.4.md` · ADR-123 · `F-R6CNT.3-1` → **RESOLVED-IN-CODE** (LEDGER open
finding) · GATE-LAUNCH threshold-9 dated note · BUILD_INDEX row 230 · `nextTicket` stays
`196a_HUMAN-H12` · `docs/build/logs/ci-R6FIX.4.json`.

## Operator asks

- Merge remains OPERATOR (stack order: this PR rides `stevevitali/r6fix-3-meter-race`).
- **Deployed re-proof rides the next DEP ticket** — prod `dc3a8f6` serves pre-fix code; the
  honest verification is a live run whose verification phase either closes or fails loudly
  (the RES.3 dead-boundary path is the natural exerciser).
- `D-R6CNT.2-1` stays OPEN — the owed showcase-grade regeneration is unblocked only after
  this fix deploys; a rerun then needs a fresh ruling (likely >$40 at a stronger tier).

## Carries / deferrals

- `D-R6CNT.2-1` OPEN (unchanged — blocked on deploy + ruling, not on this ticket).
- `D-R6SECR.1-1` OPEN (unchanged — §12.8 hostile legs).
- Discourse-outcome contract: recorded residual (not opened as a DEFERRALS row — it is new
  contract work, not an unsatisfied AC of this ticket; named in the finding + ADR-123).

**Spend:** $0 — code + records only; no paid rerun.
**Harness:** devin-desktop/swe-2-high/subagent · mergePolicy=OPERATOR (never merge).
