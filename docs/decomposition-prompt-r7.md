# Decomposition prompt: round 7 (public demo + UX overhaul), v0.2

*Invocation record for `decompose-spec mode=extend`. It ran on 2026-11-03, after the operator ratified
`docs/round-7-draft-spec.md` v0.2 ("looks good, proceed", `GD-RATIFY.R7`). It was executed the same
day on `stevevitali/r7-demo-spec`, producing manifest rows 209–254. This file is now the frozen
invocation record.*

## Invocation

```
decompose-spec spec=docs/round-7-draft-spec.md mode=extend \
  ledger=true dispatch_target=subagent granularity=balanced \
  tickets_dir=docs/tickets tail=full
```

`tail=full` is narrowed by the ratified spec §4.18 (R4 Q5) to R7CAP.1, GATE-ACCEPT.R7, R7REC.1 and
R7DOC.1. There is no CAP.2, CAP.3, REC.2 or REC.3 row: `main` is protected and merges are per-PR by
the operator. This is recorded in the manifest's § Decomposition decisions.

**Worker ceiling.** SWE-2 High: a **256k context window on a non-compacting subagent**
(LEDGER `harness: devin-desktop/swe-2-high/subagent`). Every ticket's working set must stay well
under half of that, counting the spec slice, the code read, the tests, and implement-spec's
self-review, gap and verify passes. Tickets are sized **≤ M**. The spec §10 rows marked † are
already split (REVIEW RV-24).

## Binding constraints

- **Extending the build (mode=extend).**
  - Open `### Round 7` in `docs/tickets/00_MANIFEST.md`. Numbering resumes at **row 209**; two
    existing rows are numbered 204.
  - Round 7 forks from **`main` HEAD**. This planning branch, `stevevitali/r7-demo-spec`, sits on
    `main` @ `a34eb51` and is the first round-7 PR base (spec §2).
  - Never rename an existing ticket file. Append `## Plan extensions` and `## Spec amendments
    applied` lines.
- **Ordering (`GD-ORDER.R7`).**
  - Round 7 dispatches **out of order**. `200_R6WATCH.1` is clock-bound (≥ 2026-11-11) and stays
    in the chain as a RETURN PASS row that resumes on its own clock. The R6 tail (201–208) follows
    it.
  - LEDGER `nextTicket` → `209_R7OPEN.1`. `round` → 7.
- **Contract sources.**
  - `docs/round-7-draft-spec.md` v0.2 REQ ids (§4), the §10 table (rows, deps, scope), §3
    (rulings, ADRs, S-1…S-14), §5 ordering, §6 gates and §8 invariants.
  - The research notes `docs/build/planning/2026-11-03_r7-demo/R1…R6` are normative by reference
    for the requirements they emitted.
  - Tickets **cite** §§, REQ ids and note §§. They never restate the design.
- **Authority.**
  - **Pre-authorizations.** The operator rulings in brief §7a/§7b are recorded as LEDGER GATE
    DECISIONS rows by R7OPEN.1. This decomposition records only the planning-time
    pre-authorizations `GD-DEPLOY.R7` and `GD-UX-PAIDLEG.R7`.
  - **Deploy rows.** R7DEP.1 and R7DEP.2 carry a `Gate status` item **pre-ticked by
    `GD-DEPLOY.R7`** with its conditions:
    - preview first;
    - an all-service image build;
    - classified `pulumi preview` (zero stateful replace/delete; additive migrations; cost Δ ≤ $15);
    - provenance all-PASS;
    - a `deployments` row;
    - a rollback recipe;
    - the image-content assertion;
    - the CDN invalidation act.
  - **Paid run.** R7DEP.2's U6 paid run carries the `GD-UX-PAIDLEG.R7` item (hard cap < $10).
  - **Anything else.** Every other prod write carries an **unticked** item, and the orchestrator
    pauses.
- **Never pre-answer a gate.**
  - HUMAN-H14 (corpus sign-off), HUMAN-H15 (demo copy sign-off), HUMAN-H16 (optional UX review)
    and GATE-ACCEPT.R7 are marker files.
  - Dependent tickets list the claims they withhold until the marker is dispositioned (e.g. R7DATA.1
    commits no real corpus byte before H14).
- **Corpus discipline (REQ-CORPUS-14, S-12).**
  - Tickets 214–218 develop and merge against the committed **synthetic** fixture only.
  - The real corpus, goldens and snapshots land in **219 R7DATA.1** alone, after H14.
- **Honest accounting.** Every R5/R6 P0/P1 finding maps to a REQ, and the REQ maps to exactly one
  owning ticket. Residue goes to BACKLOG per spec §7. R7OPEN.1 seeds
  `docs/build/planning/2026-11-03_r7-demo/finding-map.csv`.
- **Out of scope (hard):** spec §9.

## Ticket filenames (fixed; authors use exactly these)

| # | file |
|---|---|
| 209 | `209_R7OPEN.1__open-round-7.md` |
| 210 | `210_R7KIT.1__control-base-layer.md` |
| 211 | `211_R7RO.1__read-only-project-mode.md` |
| 212 | `212_R7FIX.1__pane-stopgap-focus-exit.md` |
| 213 | `213_R7COPY.0__record-composed-run-card.md` |
| 214 | `214_R7DEM.1__corpus-export-sanitize.md` |
| 214b | `214b_R7DEM.1b__published-fetch-real-export.md` *(Phase-4 split)* |
| 214c | `214c_HUMAN-H14__corpus-sign-off.md` *(renamed from 214a before first commit)* |
| 215 | `215_R7DEM.2a__convert-claim-ledgers.md` |
| 216 | `216_R7DEM.2b__convert-letters-findings.md` |
| 217 | `217_R7DEM.2c__convert-ledgers-diffs.md` |
| 218 | `218_R7DEM.3__snapshot-projector.md` |
| 218a | `218a_R7DEM.3b__projector-runs-figures-counts.md` *(Phase-4 split)* |
| 219 | `219_R7DATA.1__real-corpus-data-commit.md` |
| 220 | `220_R7DEM.4__demo-serving.md` |
| 220a | `220a_R7DEM.4b__demo-spa-boot-url.md` *(Phase-4 split)* |
| 221 | `221_R7DEM.5__demo-mode-hub.md` |
| 221a | `221a_R7DEM.5b__demo-hub-cards.md` *(Phase-4 split)* |
| 222 | `222_R7DEM.6a__guided-tour.md` |
| 223 | `223_R7DEM.6b__demo-metrics-carve-out.md` |
| 223a | `223a_HUMAN-H15__demo-copy-sign-off.md` |
| 224 | `224_R7DEP.1__r7a-deploy.md` |
| 225 | `225_R7KIT.2__ui-primitives.md` |
| 225a | `225a_R7KIT.2b__primitives-forms-guard-rule.md` *(Phase-4 split)* |
| 226 | `226_R7SHELL.1a__app-shell-sidebar.md` |
| 227 | `227_R7SHELL.1b__header-removal-framing.md` |
| 228 | `228_R7SHELL.1c__global-palette-search.md` |
| 229 | `229_R7PANE.1__split-pane-engine.md` |
| 230 | `230_R7SHELL.2__project-scope-sidebar.md` |
| 231 | `231_R7RELOAD.1__no-reload-forms.md` |
| 232 | `232_R7TALK.1a__chat-panel-thread.md` |
| 233 | `233_R7TALK.1b__chat-tabs-burn-investigation.md` |
| 234 | `234_R7HOME.1__projects-list.md` |
| 235 | `235_R7HOME.2a__editable-imports.md` |
| 236 | `236_R7HOME.2b__project-opens-to-page.md` |
| 237 | `237_R7WRITE.1a__format-bubble-header-strip.md` |
| 238 | `238_R7WRITE.1b__comments-fork-undo.md` |
| 239 | `239_R7WRITE.2__source-theme-keymap.md` |
| 240 | `240_R7KIT.3a__migrate-settings-billing.md` |
| 240a | `240a_R7KIT.3a2__migrate-voices.md` *(Phase-4 split)* |
| 241 | `241_R7KIT.3b__migrate-run-sheet-export.md` |
| 242 | `242_R7KIT.3c2__migrate-outline-figures.md` |
| 243 | `243_R7KIT.3d__migrate-ide-dossier-layout.md` |
| 243a | `243a_R7KIT.3e__dossier-layout-claims.md` *(Phase-4 split)* |
| 244 | `244_R7COPY.1a__labels-jargon-guard.md` |
| 245 | `245_R7COPY.1b__error-copy-markdown.md` |
| 245a | `245a_R7COPY.1c__error-copy.md` *(Phase-4 split)* |
| 246 | `246_R7SYNC.1__state-coherence-speed.md` |
| 247 | `247_R7RO.2__phone-reader-island.md` |
| 247a | `247a_HUMAN-H16__ux-review-session.md` |
| 248 | `248_R7TOUR.2__tour-re-pin.md` |
| 249 | `249_R7GUARD.1__recurrence-guards.md` |
| 249a | `249a_R7PUB.1__landing-pricing-refresh.md` *(Phase-4 split)* |
| 250 | `250_R7DEP.2__r7b-deploy.md` |
| 251 | `251_R7CAP.1__capstone-gap-analysis.md` |
| 252 | `252_GATE-ACCEPT.R7__accepted-deviations.md` |
| 253 | `253_R7REC.1__backlog-and-reconciliation.md` |
| 254 | `254_R7DOC.1__docs-refresh.md` |

## Authoring rules (every ticket author)

- **Template and precedent.** Template: `~/agent-skills/skills/build-memory/templates/ticket.md`.
  The round-6 precedents for this repo's dialect are `docs/tickets/186_R6DEP.1__tip-deploy.md`,
  `204_R6OSS.1__open-source-readiness.md`, `190a_HUMAN-H11__operator-session-2.md` and
  `203_GATE-ACCEPT.R6__accepted-deviations.md`.
- **Header.**
  - `Sequence: <n> of 254 · Phase: round 7 (R7a|R7b) · Kind: ticket|human|gate|capstone|reconcile|docs`;
  - `base_branch: current checkout`;
  - `Depends on:` the §10 deps (backward only), with a reason;
  - a literal `Run:` line (not for HUMAN or GATE files);
  - `Gate status`, `Live stage`, `Production mutations` (BM-PROD-01) and `Size budget`.
- **Body sections**, in this order:
  1. `## Goal`
  2. `## Load (read these — do not re-read others)`: spec §§, note §§, and re-confirmed anchors
     marked "re-confirm at build time".
  3. `## In scope — deliverables`, each tagged with its REQ ids.
  4. `## Out of scope`, naming the owning ticket.
  5. `## Acceptance criteria`: checkbox ACs, each marked deterministic or agentic and with its
     BM-STATUS-01 layer (engineered, fixture-verified, staging-verified, live-executed, public,
     human-completed). Add a Stage-B AC wherever the REQ evidence is B, plus the journey legs the
     ticket owns, which it flips red → green (spec §10 owner map). End with the **universal
     phase-gate AC**, verbatim from the template.
  6. `## Requirement IDs to satisfy and stamp in the PR`
  7. `## Cross-cutting invariants`: cite manifest § Cross-cutting invariants and spec §8 by
     number.
  8. `## Operating clauses`
  9. `## Notes`: decisions this ticket owns, shared decisions it consumes and who owns them, and
     DEFERRALS interactions.
- **Re-confirm anchors.** Read only what you need to name real file paths and symbols for each
  ticket's Load list. Never restate the spec's design.
- **Keep shared decisions with one owner.** For example:
  - ReadOnlyProject is owned by 211.
  - The pane geometry stopgap is owned by 212; the engine by 229.
  - `uiCss()` and the primitives are owned by 225.
  - The keymap rules for sidebar and panel chords are owned by 226; the full table by 239.
  - The record-composed run card is owned by 213.
  - The synthetic fixture is owned by 214.
  - The demo DOM-contract bucket is owned by 220/221.
  - The tour step schema is owned by 222.
- **Size.** If a ticket cannot fit ≤ M, say so in your report; do not silently enlarge it.
- **Files only.** Authors write ticket files only. The manifest, LEDGER, DEFERRALS, BACKLOG and ADRs
  are written single-threaded by the decomposer, or by R7OPEN.1.

## Phase-4 outcome (2026-11-03)

The fresh-context review `docs/build/planning/2026-11-03_r7-demo/PHASE4-REVIEW-decomposition.md` was applied in full (nine suffix splits plus the operator's Phase-4 rulings `GD-GOLDEN.R7`, `GD-PREVIEW.R7`, `GD-PUBDELTA.R7` and `GD-TOURSIGN.R7`). The manifest records it under § Decomposition decisions #11. The table above lists the final 58 filenames.
