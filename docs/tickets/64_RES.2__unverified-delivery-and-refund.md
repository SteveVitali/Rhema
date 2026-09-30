# RES.2 — *Unverified* delivery and the platform-fault refund

- **Sequence:** 64 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** fix
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** RES.1
- **Scope (one line):** REQ-SPEC-31(3). A Review whose verification ends with zero coverage delivers *Unverified*, labelled above the verdict on card, dossier and email; its verification and discourse debits are refunded under a new platform-fault refund class; an ops alert fires; the run never counts as a success; a trial-restore hook is added; *Unverified* is enforced as reserved Appendix D.2 vocabulary.
- **Spec §§:** 12.8 (+ the 2026-09-30 banner), 8.4, 14.4 (event table; REQ-SPEC-24(6)), 5.7, 5.11 (delivery email row), 13.5 (SLOs), Appendix D.2, Appendix A.9 (REQ-SPEC-31, the REQ-VIS-9 reconciliation)
- **REQ coverage:** REQ-IDE-18 (primary), REQ-SPEC-31 (item (3), the delivery half), REQ-IDE-25, REQ-VIS-9 (the *Unverified* half), REQ-SPEC-24 (the (6) carve-out), REQ-SPEC-2 / REQ-PROD-6 (the D.2 entry) (stamp in the PR)
- **Absorbs (backlog):** BL-56 (PR-Q1) — the delivery / refund half
- **Run:** `implement-spec spec=docs/tickets/64_RES.2__unverified-delivery-and-refund.md`
- **Gate status:** "one-off prod data writes" — any retroactive refund or relabel of past zero-coverage Reviews, including `01M3SK62YZST272B35CG12K6TW` (632 cr on the operator's promo credits), is operator-paused; RES.2 only emits the list. Otherwise none beyond the round-3 standing authorization (ADR-013).
- **Live stage:** Stage A: code + tests ($0). Stage B: deploy, then one ≤ 300-word Review on a flagged test tenant forced to zero coverage, walked with the JOURNEY.1 harness, ≤ $5 metered

## Goal
ADR-006 (Path B) strips an unfetched citation and downgrades its claim. It has no rule for the case where
verification fetched nothing at all, and the 2026-09-30 prod Review showed what happens without one:
- 16/16 claims Unverifiable
- delivered as `completed`
- charged in full

REQ-SPEC-31(3) and ADR-015 decide the behaviour. RES.2 builds it.
- **Coverage-based trigger.** Zero coverage means no Tier-1/Tier-2 claim with a successfully fetched source, while
  the inventory holds ≥ 1 such claim. The run-wide fetch count is not the trigger.
- **Honest label.** A run-level *Unverified* label appears above the verdict on the run card, the dossier and the
  delivery email.
- **Platform-fault refund.** The verification and discourse debits are refunded under a new platform-fault class.
- **Ops alert and exclusions.** An ops alert fires. The run is excluded from SLO success, telemetry cohorts and
  claims.
- **Trial restore.** A consumed trial entitlement is restored.

RES.1 makes zero coverage rare. RES.2 makes it honest and free to the user when it still happens.

## Load (read these — do not re-read others)
- `docs/tickets/DEFERRALS.md` (start-of-run rule; D-P0.15d-2 is the adjacent `refundPhases` row); the planning ledger row 64 + shared-decision owners.
- `docs/adr/ADR-015…` (the decision), `ADR-006…` (Path B); spec Appendix A.9 REQ-SPEC-31 row + note, §14.4 table + REQ-SPEC-24 (6), Appendix D.2 last row.
- `docs/tickets/63_RES.1…` Notes and its run ledger (`research_preflight_failed`; the research floor).
- `packages/mirror/src/delivery.ts` ~227–360 (`runDeliveryTransaction`; the Path B strip; `strippedCitations`) and `validation.ts` ~93.
- `packages/contracts/src/sidecars.ts` ~56/~120: the claim `tier` field, 1|2|3.
- `packages/orchestrator/src/delivery.ts` ~95–135: the completed settle, `settleMeteredDebit` → release → `absorbMeteredGap`.
- `packages/ledger/src/resume.ts` ~39: `refundPhases`, idempotency keys. `packages/db/migrations/0002_*.sql` `credit_ledger`: `reason` is free text, `source` is not null.
- Trial state: `packages/ledger/src/sql-ledger.ts` ~68 (consume) and `trial.ts`.
- Surfaces:
  - `packages/ui/src/run-card.tsx`
  - `packages/ui/src/dossier.tsx`
  - `apps/web/src/pages.tsx` `DossierPage` ~2227
  - `packages/orchestrator/src/notifications.ts` (the `run_finished` email, ~870–940)
  - `apps/worker/src/notification-jobs.ts`
- Success accounting:
  - `packages/orchestrator/src/slo.ts` ~44 (`run_success_rate_24h_pct`)
  - `packages/ledger/src/estimator-refit.ts` ~45–55 (its `state='completed'` sample)
  - `apps/worker/src/main.ts` ~253 (`alertSink`)
- Vocabulary:
  - `packages/contracts/src/reserved-strings.ts` (`RESERVED_CLASSES`)
  - `packages/contracts/src/vocab-lint.ts` ~62 (`lintCopy`)
  - `tools/eslint-plugin-rhema/rules/no-banned-strings.js`
  - `eslint.config.js` ~59

## In scope — deliverables
1. **The coverage predicate** (REQ-SPEC-31(3); REQ-VIS-9 reconciled).
   - Computed in the delivery transaction **after** the Path B strip, so only fetch-verified sources remain.
   - `coverage` = the count of Tier-1/Tier-2 claims with ≥ 1 persisted fetched source.
   - *Unverified* ⇔ `coverage = 0` **and** ≥ 1 Tier-1/2 claim. A Review with no Tier-1/2 claim is never
     *Unverified*.
   - The label persists on the delivered run/correspondence (additive migration) and is write-once (invariant 6).
     Surfaces read it; they never recompute it.
   - REQ-SPEC-31(3) names the Review. Whether a zero-coverage Fact-check is in scope is recorded in the ADR — do not
     extend silently.
2. **The label on three surfaces** (REQ-SPEC-31(3); REQ-IDE-25).
   - *Unverified* renders above the verdict on the run card, the dossier and the `run_finished` delivery email.
   - The copy says the claims could not be checked this run and that the research phases were refunded.
   - The claim verdicts stay the frozen `unverifiable`. The per-URL fetched chip (REQ-IDE-25) stays honest (none).
3. **The platform-fault refund class** (REQ-IDE-18; REQ-SPEC-24(6) carve-out). **Owned decision → write an ADR.**
   - A ledger reason code refunds the run's `verification` + `discourse` net debits through `refundPhases`.
   - Idempotent per run. A refund failure never rolls back delivery (REQ-DATA-7).
   - Allowed on a **completed** run: the carve-out from REQ-SPEC-24(6)'s failed-only rule.
   - Never re-debited at resume. A re-verification is a new, normally debited run.
   - Export one predicate (e.g. `isPlatformFaultRefund`) so DEF.4's user refund window never counts it.
   - RES.1's `research_preflight_failed` failures route any default refund on a resumed attempt through this same
     class.
4. **The ops alert.**
   - One alert per *Unverified* delivery through the existing alert path (kind e.g. `research_unverified_delivery`),
     carrying ids and counts only.
   - A weekly *Unverified*-rate signal joins the SLO probe set (ADR-015's revisit trigger: > 1% of Reviews in a
     week).
5. **Never a success** (REQ-SPEC-31(3)).
   - Export one `isSuccessfulDelivery` predicate.
   - `run_success_rate_24h_pct` keeps the run in the denominator and out of the numerator.
   - Analytics / cohort events carry the label so cohorts exclude it.
   - The estimator refit sample excludes it; ECON.1 consumes this for calibration.
   - Every user-facing count or claim reads the predicate. The claim render model is ACT.1's.
6. **The trial-restore hook** (REQ-SPEC-31(3); consumed by ACT.1).
   - When an *Unverified* run carries `entitlement_id`, restore the entitlement (`consumed` → `unused`, clearing
     `consumed_by_run_id`) with an audit row.
   - Idempotent. Exported so ACT.1 can verify it live.
7. **The D.2 vocabulary** (REQ-SPEC-2 / REQ-PROD-6).
   - Add the "Run-level delivery label" class with *Unverified* to `RESERVED_CLASSES`, verbatim from D.2.
   - Teach `lintCopy` the rule: never as a claim verdict or verdict chip; only as the run label.
   - Extend the ESLint config if the copy tables need it.
   - The assignment's `packages/eslint-plugin-rhema` is actually `tools/eslint-plugin-rhema`, and the D.2 data lives
     in `packages/contracts`.
8. **The historical list** (read-only).
   - Emit to the run ledger the prior delivered Reviews that meet the predicate, with their would-be refund amounts,
     for the operator to act on.
   - The refunds themselves are a paused one-off write.
9. **Stage B** (≤ $5).
   - Deploy.
   - Run a ≤ 300-word Review on a JOURNEY.1-flagged test tenant, forced to zero coverage **downstream of RES.1's
     preflight** (e.g. a test-tenant-only URL policy that denies verification's fetch targets).
   - **Owned decision → ADR:** the forcing mechanism. It must be provably unreachable for non-test tenants.

## Out of scope
- Diagnosing and fixing research, the floor, the preflight → **RES.1**. Reducing strips / citation completeness → **CITE.1**.
- The §14.4 user refund window, cancel-with-partials, the stop-path `refundPhases` caller (D-P0.15d-2) → **DEF.4**, reusing this class.
- Trial go-live, the entitlement config, the landing/pricing claim render model → **ACT.1**. The run report's spent / seat numbers → **RPT.1**.
- Executing any historical refund or relabel → the operator (paused one-off write).

## Acceptance criteria
- [ ] **Zero coverage.** The spec's fixture — Tier-1/2 claims present, none with a fetched source — delivers *Unverified*, writes refund rows with the platform-fault reason for `verification` + `discourse`, and fires one ids-only alert. *(deterministic)*
- [ ] **Partial coverage.** One fetched Tier-1 claim of nine is **not** *Unverified*; the Path B strip counts are unchanged. *(deterministic)*
- [ ] **No Tier-1/2 claims.** Not *Unverified*. *(deterministic)*
- [ ] The label is write-once after delivery. *(deterministic)*
- [ ] **Refund class.** Allowed on a completed run; a replay is a no-op. `isPlatformFaultRefund` is true for it and false for failed-run refunds. A resume never re-debits it. An injected refund error still leaves the dossier delivered. *(deterministic)*
- [ ] **Surfaces.** Card, dossier and email render *Unverified* above the verdict from the persisted label; claim verdicts read `unverifiable`. Render tests fail if the label is removed or moved below the verdict. *(deterministic)*
- [ ] **Never a success.** The SLO numerator, the estimator-refit sample and the cohort predicate all exclude an *Unverified* run. The weekly-rate signal computes on fixtures. *(deterministic)*
- [ ] **Trial restore.** An *Unverified* entitlement run restores its entitlement exactly once, with an audit row. *(deterministic)*
- [ ] **Vocabulary.** `lintCopy` flags *Unverified* used as a claim verdict and accepts it as the run label; the D.2 data carries the row verbatim. *(deterministic)*
- [ ] **Forcing mechanism.** It cannot activate for a non-test tenant (negative test). *(deterministic)*
- [ ] **Stage B deploy.** `pulumi preview` shows no stateful replace/delete; migrations pass the additive lint; deployed provenance = the chain-tip SHA. *(agentic)*
- [ ] **Stage B walk** (JOURNEY.1 harness, screenshots committed).
  - The forced zero-coverage test Review shows *Unverified* above the verdict on the run card and the dossier.
  - The test mailbox receives the delivery email carrying the label.
  - The ledger shows the platform-fault refund rows, and the alert reached the channel.
  - The metered spend is ≤ $5.

  *(agentic)*
- [ ] **Stage B regression.** RES.1's N6 Review is **not** labelled *Unverified* (no new spend). *(agentic)*
- [ ] **Historical list.** The list of past zero-coverage Reviews is in `docs/build/runs/RES.2.md`, and a LEDGER GATE DECISIONS row asks the operator to rule on refunds. *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-IDE-18 (primary), REQ-SPEC-31 (item (3)), REQ-IDE-25, REQ-VIS-9 (the *Unverified* half; the primary owner is
CITE.1), REQ-SPEC-24 (the (6) carve-out; the primary owner is DEF.4), REQ-SPEC-2, REQ-PROD-6.

## Cross-cutting invariants
- `00_MANIFEST.md` #1: D.2 vocabulary. *Unverified* is reserved and distinct from the frozen claim verdict
  `unverifiable`.
- #6: delivered artifacts and the label are write-once.
- #7: money.
  - Σ debits − refunds ≥ 0.
  - A refund never exceeds what the phase netted.
  - The delivery transaction never rolls back on accounting.
- #10: alert and event payloads carry ids and counts, never claim or draft text.
- #12 / REQ-SPEC-29: the label is proven by walking it.
- #13 / REQ-SPEC-30:
  - The coverage and refund writes run in the run's tenant transaction.
  - The historical list is a read-only, allowlisted system-pool scan with explicit predicates.
- #14: a Review that could not research says so and refunds the research phases.

## Notes
- **Owned decisions → write an ADR each:**
  1. the refund reason code, its interaction with REQ-SPEC-24(6), and the limit-exemption predicate
  2. where the label is persisted, and the Fact-check in/out ruling
  3. the test-tenant forcing mechanism
- **Shared decisions:**
  - *Owned here:* the platform-fault refund class (reason code + carve-out). DEF.4 (refund window) and ACT.1
    (trial restore) consume it.
  - *Consumed:*
    - RES.1's research floor and preflight, plus its `research_preflight_failed` reason
    - JOURNEY.1's harness, test tenants and test mailbox
    - SEC.1's DB roles
- **D-P0.15d-2.** Append a dated note that `refundPhases` now has a live caller (the platform-fault path). The row's
  stop-path half stays DEF.4's. Do not close it.
- **Anchors to re-confirm at build time:** all line numbers; the email template's location; which process emits
  alerts; the analytics event carrying run outcome.
- **DEFERRALS rule:** e.g. an email leg blocked on the H7 test mailbox, or a Fact-check extension deferred by the
  ADR, becomes a `D-RES.2-n` row with a compensating control.
