# b1_spend-audit — Paid-leg spend measured on prod (30d, is_test tenants)

**Stream:** B
**Researched:** 2026-10-14
**Author:** session driver (live `funded-query.mjs` over IAP tunnel, system-role DSN, read-only BEGIN…ROLLBACK)
**Ledger rows covered:** B1
**Confidence overall:** high (measured, not inferred)

### F1 — Test-tenant model spend is ~$153.60 over the trailing 30 days

**Claim:** `usage_records` on `is_test` workspaces total ≈$153.60/30d — right at the ledgered ~$150
funded-window cumulative bound. The spend is real and the guard bound is binding.
**Status:** VERIFIED
**Evidence:** `funded-query.mjs` group-by `w.is_test` over `usage_records.ts > now()-30d` —
`claude-sonnet-5` (tier `base`) $74.40/2215 recs; `model='base'` proxy rows $48.36/212 recs;
`claude-sonnet-4-6` (tier `balanced`) $24.66/**10 recs**; `claude-haiku-4-5` $6.46/215 recs.
(Non-test top workspace: operator's `01M2V3PM11XSF05VJ9G01PM5ZB` — $154.87/47 runs, real usage.)
**Implication for the spec:** cost-reduction directly unlocks legs — the window is the constraint.

### F2 — Cache-read tokens dominate volume; fixture-size caps do not bound cost

**Claim:** cache-read tokens dwarf everything (72.9M sonnet-5 + 87.1M 'base' cache-read vs ~3.3M
input). The ≤300-word fixture bound trims document size, but the *context overhead* (system prompt +
protocol payloads + seat tree) is what repeats per call.
**Status:** VERIFIED
**Evidence:** same query — `tin` 3.3M/0.44M vs `tcache` 72.9M/87.1M by tier.
**Implication for the spec:** lever ranking must target **per-call tier** (sonnet→haiku where the
leg's object isn't model quality) and **phase count/role tier**, not fixture words.

### F3 — `verifier` role at balanced is the single most expensive unit (~$6.60/call)

**Claim:** 2 `step:verification` records with `role=verifier` = $13.20 ($6.60 each); balanced-tier
calls average $2.47/record vs haiku at ~$0.03.
**Status:** VERIFIED
**Evidence:** step/role group-by — `step:verification` editor $34.25/506 recs; `(none)` editor
$32.65/873; `step:discourse` $16.43; `step:craft` $14.35; `step:verification` verifier $13.20/2 recs;
`step:letter` $12.40; `step:argument` $6.85; `step:intake`(ed) $6.01; `step:second_read` $5.76;
`step:answer` $3.32; rest <$2.
**Implication for the spec:** the verification+verifier phases are the burn; a test-tenant tier
floor (or per-phase tier map for `is_test`) cuts the headline cost ~3–5× without touching what the
legs assert (presence/shape of phases, not model quality).

### F4 — Editor-family phases are ~85% of spend

**Claim:** `role=editor` rows (verification+none+discourse+craft+letter+argument+intake+second_read)
≈ $131 of the ~$154 — the deep-review editor pipeline, not assistant/chat or author rows.
**Status:** VERIFIED
**Evidence:** same group-by; `role=assistant` $3.32, `role=author` $3.36 combined.
**Implication for the spec:** legs that only need *a delivered review artifact* (dossier legs
T11–T13, BL-21) could reuse a seeded review rather than re-running the editor pipeline per leg.

## Open questions

- Does the rate table already price `model='base'` proxy rows correctly, or are they estimates
  (`source` mix) that the leg-cap math must treat differently? → B3.
- Which paid legs actually need a *fresh* model run vs a seeded/durable artifact? → F1 census × B3.

## Spec requirements emitted

- REQ-ECON-1: the test-economics regime MUST target per-call tier and phase/role tier, not fixture
  size (the fixture bound already exists and does not bound spend).
- REQ-ECON-2: test-tenant runs MUST debit at the tier actually run (REQ-SPEC-32 preserved).
- REQ-ECON-3: artifact-reuse (seeded delivered review) SHOULD replace re-running the editor
  pipeline for legs whose object is the surface, not the model.
