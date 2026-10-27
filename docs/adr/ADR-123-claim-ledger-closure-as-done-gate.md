# ADR-123: Claim-ledger closure is a phase done-gate predicate — dispositions proven by evidence, coverage proven by `inventoryCount`

- **Status:** Accepted (agent decision within the ticket's hard-gate option — the worker brief
  offered hard gate vs honest terminal flag; the phase contract's own predicate machinery is the
  gate the contract reads, so a flag parallel to it was the weaker arm)
- **Date:** 2026-10-27
- **Ticket:** R6FIX.4 (F-R6CNT.3-1 — the $10.68 Showcase run's schema-valid but unclosed claim
  ledger rode `verification` to `done`)
- **Requirement ids:** REQ-SPEC-13, REQ-ARCH-6, REQ-SPEC-31(3), REQ-SPEC-32
- **Spec:** spec §12.2 (the three-leg completion oracle); `docs/build/runs/R6CNT.3.md` (the
  finding); `docs/build/runs/R6FIX.4.md` (root-cause + design record)

## Context

F-R6CNT.3-1: a `full_board`/`base` Review's `verification` phase completed `done` on a
schema-valid ledger whose 14 rows were all `unverifiable` placeholders — zero `claim_sources`,
research still in flight — and `discourse` likewise delivered unresolved. Two compounding defects:

1. `factsForPhase` read `ledger?.inventoryCount ?? 0` — but `inventoryCount` existed in neither
   `claimLedgerSidecarSchema` nor the SKILL's documented shape, so no agent ever emitted it.
   `required = min(0, cap) = 0` made `claim_rows_gte_inventory` pass **tautologically**.
2. No closure concept existed at all: row count stood in for disposition, so a row that asserts
   nothing was checked counted identically to a checked claim.

The downstream honesty machinery did its job (blocking findings, entailment-capped rubric,
`platform_fault:zero_coverage` refunds under the write-once `unverified` label) — the defect was
the *gate* letting the phase transition at all.

## Decision

1. **A new `claim_ledger_closed` completion predicate**, declared on every claim-ledger-producing
   phase (review + fact_check `verification`, draft `grounding`). A row is **unclosed** when it
   asserts no check outcome: verdict absent/`unverifiable` (canonicalized) AND no evidence trail
   (`note` | `url` | `normalizedUrl` | `accessedAt` | `sourceCheck` | non-empty `sources`). The
   fact `unclosedClaimOrdinals` must be supplied and empty; absent ⇒ fail (the oracle's standing
   proven-not-assumed rule).
2. **An evidence-bearing `unverifiable` IS a closed disposition.** verification-protocol §4's
   definition — "cannot be checked in principle or with available access; noted so the author can
   decide" — makes the *note/trail* the check's record. This preserves REQ-SPEC-31(3): a ledger of
   justified `unverifiable` rows closes honestly, commits, and the delivery layer's Unverified
   label + zero-coverage refund still fire downstream.
3. **`inventoryCount` absent or declared-zero ⇒ coverage fails** (never defaults to — or accepts —
   a vacuous 0; `min(0, cap) = 0` is the same bypass through a second channel, so coverage must
   prove ≥ 1 claim). The field is declared optional on `claimLedgerSidecarSchema` (older ledgers
   omit it) and documented as required-in-practice in both SKILL.md sidecar sections (edited
   through `upstream-port.manifest.mjs`; the pin-diff stays clean).
4. **Hard gate, not a terminal flag**: the phase contract IS `completionPredicates`; a flag
   parallel to it would be a second gate the contract never reads. The failure path rides the
   existing machinery — `incomplete(artifact_missing)` → research checkpoint → live-budget
   consult → guided retry naming `claim_ledger_closed` + the unclosed ordinals, or
   `research_budget_exhausted` terminal + net-debit refund on a dead bound.

## Consequences

- A phase can no longer go `done` while claims sit unchecked; the R6CNT.3 shape fails
  deterministically (ordinals named in the retry guidance and the failStep reason).
- Runs whose agents do not emit `inventoryCount` — or declare it `0` — burn at most one guided
  retry naming the field — SKILL.md now documents it; a non-emitting/empty-inventory agent fails
  honestly rather than riding a vacuous coverage check.
- Draft `grounding` inherits the same gate — the identical defect class existed there.
- **Honest residual (tracked as deferral D-R6FIX.4-1):** `discourse` has no machine-readable
  outcome contract (markdown artifact, no sidecar), so its contested-claim outcomes remain
  un-gated until a `02-discourse-report.json` shape exists. Verification's closure gate blocks
  the whole-run lie the finding measured, but a discourse-side contract is follow-up work.

## Alternatives considered

- **Terminal flag / dossier honesty (the ticket's other arm):** let the run end `completed` and
  render "claims unchecked" on the card. Rejected — it re-routes the same lie through a second
  channel; the phase contract already has a gate vocabulary the engine evaluates.
- **Verdict-alone closure (no evidence requirement):** any `unverifiable` row closes. Rejected —
  that IS the R6CNT.3 shape (schema-valid placeholders); the whole defect is rows that carry the
  enum but no check.
- **All-verdicts-need-evidence:** `verified`/`contradicted` without sources also unclosed.
  Rejected — over-tightens past the defect; a substantive verdict is a disposition, and coverage
  depth is the delivery layer's domain (claim_sources strip + verdict downgrade at commit).
- **Discourse sidecar now:** invent `02-discourse-report.json` in this ticket. Rejected — a new
  artifact contract (schema + registry + SKILL emission + delivery fold) is its own scope; the
  honest move is to record the residual, not to silently expand the ticket.

## Revisit trigger

Reopen when (a) a discourse outcome sidecar lands (then discourse gets its own closure predicate
and this ADR's residual discharges), or (b) a legitimate closure state appears that the
evidence rule misclassifies — e.g. a real check that records its disposition nowhere on the row —
at which point the row shape gains an explicit `checkedBy`/`checkOutcome` field rather than
loosening the evidence rule.
