# R6SECR.1 — Pre-launch adversarial security review (ADR-112; launch-blocking)

- **Sequence:** 195 of 208 · **Phase:** round 6 · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 194_R6CNT.2 (reviews the launch candidate — every surface that will ship)
- **Run:** `implement-spec spec=docs/tickets/195_R6SECR.1__adversarial-security-review.md`
- **Gate status:** none. Fixes deploy under `GD-DEPLOY.R6`; a fix too large for this ticket becomes
  a run-time insert (`mode=extend`, suffix-letter file).
- **Live stage:** prod probes with `is_test` tenants only, $0 (no paid run); code review offline
- **Production mutations:** a redeploy under `GD-DEPLOY.R6` only if a fix lands here
- **Size budget:** ~400 changed lines (review report + probe extensions + small fixes). Size the
  review set **before** starting: if it exceeds one context, split by surface family as inserts.

## Goal
Replace the deferred external pen test as the launch gate (ADR-112) with an adversarial review of
the launch candidate. The focus is the defect class that already shipped once: cross-tenant reads.
Exit: **zero open criticals/highs**. The report states plainly that the review is not independent.

## Load
- `docs/round-6-draft-spec.md` §4.8 REQ-SEC-3; ADR-112; `docs/security/pen-test-scope.md` (the
  controls list = the review checklist), `docs/security/pen-test-findings-triage.md` (severity
  scale), `docs/security/rls-exposure-since-0026.md`, `docs/security/usercontent-csp-audit.md`,
  `docs/security/tenancy-audit.md`; the R6FOR.2 verdict.
- Anchors (re-confirm): `integration/src/two-tenant-probe.ts`,
  `packages/security-checks/src/*` (`rls-catalog`, `injection-controls`, `usercontent-csp`,
  `secrets-manifests`, `launch-surface`), `apps/web/src/spa/bff.ts` + the `/bff/*` twins,
  `apps/api/src/*-routes.ts`, the R6UCD.1 mint helper, billing/refund/trial/metered-settle paths.

## In scope — deliverables
1. **Code-against-controls read:** each item of `pen-test-scope.md`'s controls list, with a
   finding or a "holds — evidence" line.
2. **Live tenancy/authz probes:** two-tenant probe extensions + planted foreign ids on every
   user-serving route — BFF twins, signed-URL mint, export/import, billing, voices, chat/outline.
3. **§12.8 injection controls** on the live surface (planted fixtures, the R5OPS.1 canary
   precedent).
4. **Usercontent/cookie posture** on real objects.
5. **Money paths:** no double-spend, no free credit, refund bounded by §14.4, trial bound, metered
   settle ≤ cap.
6. A report under `docs/build/reports/<date>_R6SECR.1/` with each finding classified. Fix
   criticals/highs (or insert tickets); mediums/lows become owned obligations (DEFERRALS rows with
   owner + trigger).

## Out of scope
- The external engagement (post-launch, ADR-112); hardening beyond criticals/highs.

## Acceptance criteria
- [ ] Every controls-list item has a finding or an evidence line *(deterministic)*
- [ ] The probe extensions are committed and run green on prod after fixes *(live-executed)*
- [ ] Zero open criticals/highs at close; each fix has a regression test *(live-executed)*
- [ ] The report's first paragraph states the review is not independent *(deterministic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SEC-3

## Cross-cutting invariants
- Manifest invariants 5, 7, 13, 14 + round-6 spec §8.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`.

## Notes
- Any fix touching a protocol or run path is protocol-affecting, so R6GLD.1 must run after it (it
  already sits after this ticket).
