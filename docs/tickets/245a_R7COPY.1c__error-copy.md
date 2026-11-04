# R7COPY.1c — `errorCopy(code)` + the committed error-code inventory

- **Sequence:** 245a of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:**
  - 245_R7COPY.1b (stack order, Phase-4 Split decision 8). Through it, 244_R7COPY.1a's copy lint,
    which every `errorCopy` sentence must pass.
  - It consumes 231_R7RELOAD.1's `mutationOutcome` stable codes and 238_R7WRITE.1b's
    `discard-fork` codes; both are ancestors in the stack.
  - Spec §10 row 245 (part). Merges to `main` wait for 224_R7DEP.1 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/245a_R7COPY.1c__error-copy.md`
- **Gate status:** none. Code + tests; `mergePolicy: OPERATOR`.
- **Live stage:** Stage A only ($0: unit / DOM tests against a local build). **No owned preview**
  (`GD-PREVIEW.R7`). The Stage-B AC is owed to the R7b phase preview in 250_R7DEP.2 through a
  DEFERRALS row. A live need outside 250's preview window PAUSES for the operator.
- **Production mutations:** none
- **Size budget:** ~350 changed lines excl. generated/fixtures and the committed code inventory
  (M). Entry delta ≤ 15 kB gz.

## Goal
Users never see `lock_held` or `upstream_unavailable`. Every API error code maps to a sentence plus
an action, with a fallback, and the `requestId` is logged. A committed inventory makes a new
un-mapped code fail a test.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md` §4.13 REQ-COPY-2, §4.8 REQ-RELOAD-4 (stable codes), §4.6 REQ-KIT-5,
  §8.3 and §8.
- `docs/build/planning/2026-11-03_r7-demo/PHASE4-REVIEW-decomposition.md` Split decision 8.
- `R6-ux-code-audit.md` §9 UXC-27 (the seven `err.detail ?? err.code` sites).
- `apps/web/AGENTS.md`, `apps/api/AGENTS.md` (route error shape only).
- `docs/build/runs/R7RELOAD.1.md` and `docs/build/runs/R7WRITE.1b.md` (the stable codes).
- DEFERRALS round-7 sections. LEDGER § GATE DECISIONS `### Round 7` row `GD-PREVIEW.R7`.
- Manifest § Cross-cutting invariants and § Operating rules.
- Anchors (re-confirm at build time):
  - `apps/web/src/spa/surfaces/editor.tsx:204`;
  - `dossier.tsx:233` and `:487`;
  - `run-report.tsx:191`;
  - `voices.tsx:254`;
  - `onboarding.tsx:229`;
  - `figures.tsx` (the same pattern);
  - `apps/web/src/spa/bff.ts` (`BffError` with `code` / `detail` / `requestId`);
  - the api routes' `c.json({ error: "<code>" })` sites under `apps/api/src/*.ts` (about 140
    distinct snake_case codes; no enumeration exists today);
  - `apps/web/src/copy.ts` and `lintCopy`.

## In scope — deliverables
1. **`errorCopy(code)`** (REQ-COPY-2; UXC-27).
   - It returns a sentence plus an action for every API error code, with a generic fallback.
   - It logs `requestId` (client console / observability seam; never PII or secrets).
   - It replaces every `err.detail ?? err.code` display site, including the `onRefusal` paths.
   - It consumes 231's `mutationOutcome` stable codes and 238's `discard-fork` codes.
   - Sentences live in COPY and pass 244's lint; actions may share templates.
2. **A committed error-code inventory** (REQ-COPY-2). It is extracted from the api (and web BFF)
   sources, and a test fails when an emitted code has no inventory row. A missing `errorCopy`
   entry falls back but is reported by the test. This ticket decides the extraction mechanism and
   records it.

## Out of scope
- The markdown renderer, monospace rule, URL wrap and chat seam (245_R7COPY.1b).
- The label table, jargon and REQ-GUARD-2 (244).
- `mutationOutcome` itself (231). The discard-fork codes (238). Any change to an API route's error
  codes: the inventory reads them, never renames them.

## Acceptance criteria
- [ ] The inventory test fails on a seeded api route that emits an un-inventoried code. Every
  inventory code has an `errorCopy` entry, or the report lists it. The fallback path is tested.
  `requestId` is logged on every mapped error (spy). *(deterministic · layer: engineered)*
- [ ] A grep test finds zero `err.detail ?? err.code` (or equivalent raw-code display) in
  `apps/web/src/spa/**`. A DOM test shows a 409 `lock_held` renders a sentence plus action and no
  code text. *(deterministic · layer: engineered)*
- [ ] Every `errorCopy` sentence passes `lintCopy` and `no-banned-strings` (244). *(deterministic ·
  layer: engineered)*
- [ ] `check:spa-budget` passes (entry delta reported), with `protocol-markers`, `dom-contract`
  and the vocab lints. *(deterministic · layer: engineered)*
- [ ] **Stage B — staging-verified at the R7b phase preview (250).** No preview is stood up here
  (`GD-PREVIEW.R7`). This ticket opens `D-R7COPY.1c-1` (kind P; owner 250_R7DEP.2; dated from
  `date -u`; unblocked by: 250's preview walk; how to verify: a screenshot at 250's preview SHA,
  `--expect-sha`, provenance PASS, committed under `docs/build/runs/R7COPY.1c/`, of a mapped error
  message on a real refusal path, e.g. a second tab's `lock_held`). 250 closes the row. This PR
  reports the AC owed, never green. *(agentic · layer: staging-verified at the R7b phase preview
  (250))*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-COPY-2, REQ-KIT-5 (allowance). Consumes REQ-RELOAD-4 (stable codes) and REQ-WRITE-7's refusal
codes. Findings: UXC-27.

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 1, 9;
  - 3 (no protocol / eval text enters COPY or the inventory);
  - 10 (logs carry `requestId` and the code only; never prompt or page text);
  - 12;
  - 17 (context budget; no preview is created here, per `GD-PREVIEW.R7`).
- Spec §8 .3, .4, .5 and .7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules` (1–10). The gap table has one row per
  clause.
- No secret or PII in logged error context (rule 6).
- No preview is stood up here (`GD-PREVIEW.R7`). A live need outside 250's preview window PAUSES
  for the operator (gotcha 7).

## Notes
- **Origin.** Inserted at Phase 4 (Split decision 8, P4-13). REQ-COPY-2 moved here from 245 with
  the about 140-code inventory, which was the bulk of 245's size risk.
- **Owns:**
  - `errorCopy`;
  - the error-code inventory and its extraction mechanism.
- **Consumes:** 231's `mutationOutcome` codes, 238's discard-fork codes, 244's lint, 225 / 225a's
  primitives.
- **Size.** Sentences share action templates. If the table still exceeds M, the worker stops and
  requests a split (invariant 17), e.g. extraction + test versus the copy table.
- **Downstream.** 248 depends on this row (P4-10).
- **DEFERRALS:** `D-R7COPY.1c-1` (Stage B → 250, `GD-PREVIEW.R7`) is opened by design.
