# ADR-019: Evidence normalization at read seams, and the public-claims visibility config

- **Status:** Accepted
- **Date:** 2026-10-01
- **Ticket:** HOT.1
- **Requirement ids:** REQ-POS-3, REQ-GROWTH-11, REQ-SPEC-32(b), REQ-SPEC-29, REQ-SPEC-30
- **Spec:** §11.3 (evidence), §14.3/§15.1/§15.2 (the gated claims); pairs with ADR-013 (the deploy
  authorization), ADR-018 §8 (the role-change vocabulary the migration lint encodes)

## Context

The 2026-09-30 prod design review found the Showcase and STB.3 Memo dossiers returning HTTP 500.
`findings.evidence` is an unconstrained `jsonb` column and shipped shapes drifted: the canonical
`{ claimId?, verdict?, urls: [{url, accessed}] }`, the older `{verdict}`-only sidecar carry, and the
pre-canonical Showcase seed's `[{claim, source}]` array. Render code read `evidence.urls` bare and
threw on every non-canonical row.

The same review flagged marketing copy asserting a free first review and "≈N essay loops" coverage —
statements the launch build cannot yet honour (the flag runs under ADR-014 §3's interim).

## Decision

1. **Normalize at every read seam; never backfill.** `normalizeEvidence(raw)` in
   `@rhema/findings-core` lifts any stored blob — canonical object, `{verdict}`-only, legacy
   `{claim, source}[]` array, malformed — to the canonical shape with `urls` always present (`[]`
   when absent). It is called at each read boundary: `toFinding` (api row → domain),
   `buildFindingView` (view construction), `evidenceUrlViews` (cited⇒fetched stamping),
   `filterFindings` (the hasUrl filter), and the web dossier's `evidenceFor` render seam. Existing
   rows are repaired *in flight*; a one-off prod data write is out of scope (it would pause under
   ADR-013's pause list). New Showcase seeds write the canonical shape.
2. **The row type stays permissive on purpose.** `findingEvidenceSchema.urls` is **optional** so an
   unguarded `finding.evidence.urls` read fails typecheck — the compiler, not convention, forces
   every consumer through the normalizer. The normalized return type (`NormalizedEvidence`)
   guarantees `urls`; `FindingView.evidence` keeps it required.
3. **Hidden claims live behind a typed config, and their ON-copy never enters the copy table.**
   `PUBLIC_CLAIM_IDS` / `PUBLIC_CLAIMS` / `publicClaimEnabled` in `@rhema/contracts` key the two
   claims — `trial.firstReviewIncluded` (hero `trialNote`, the FAQ answer, `trial.includedNote`) and
   `plans.whatItCovers` (the Writer/Studio/Studio Max ≈-loop lines, marked by
   `whatItCoversClaimId` on the plan spec). Both ship disabled. The claim-ON text for
   copy-table surfaces lives in `PUBLIC_CLAIM_COPY` *in contracts* — not `COPY` — so
   `collectCopyStrings` cannot surface a disabled claim. The `/billing/plans` DTO nulls gated
   fields server-side (`visiblePlansPublication`), so no client can render hidden claim text.
   Honest OFF copy stays in the copy table. ACT.1/EST.1 flip ids in config — never parallel copy.

## Consequences

- A legacy or partial evidence blob can no longer 500 a dossier; a *new* evidence shape is a lint of
  one function, not a hunt across five readers.
- The prod 500 fix carries prod-shape coverage: `seedShowcaseProject`'s real output, the Memo
  `{verdict}` shape, the array shape, and a malformed blob all render.
- Flipping a claim is a one-line config change exercised by tests; rewording a hidden claim inside
  `COPY` fails the launch-surface sweep (the table asserts no gated string or retired phrase).
- The `/billing/plans` DTO's `whatItCovers`/`includedNote` became `string | null` — a wire-format
  change every billing consumer must tolerate (all in-repo consumers updated).

## Alternatives considered

- **Backfill prod rows to canonical.** Rejected: a one-off prod data write pauses under ADR-013; the
  read-seam normalizer carries the same correctness at zero write risk.
- **Leave `urls` required and trust reviews.** Rejected — that is what shipped the 500; the optional
  row type makes the typechecker enforce the seam.
- **Delete the claim strings outright.** Rejected for the marketing claims: ACT.1/EST.1 own the
  truthful re-render and need the gated ids + copy in one place; deleting would invite parallel
  copy. (Genuinely dead claim strings — `freeTrialNote`, `trialActiveFmt` — *were* deleted.)
- **Gate claims client-side only.** Rejected: the DTO redaction keeps hidden claim text off the wire
  entirely — a cached page or a different client cannot render it.

## Revisit trigger

ACT.1 enables `trial.firstReviewIncluded` from the entitlement config and EST.1 re-derives
`plans.whatItCovers` from the estimator; when both are on and stable, the claims config may be
retired and the ON copy folded back into the copy table. `normalizeEvidence` stays — it is the
jsonb boundary contract — unless a schema migration makes `evidence` a typed column.
