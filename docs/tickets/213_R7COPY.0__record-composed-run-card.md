# R7COPY.0 — Retire the generated walkthrough; record-composed run card; one run state, one count

- **Sequence:** 213 of 254 · **Phase:** round 7 (R7a) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 209_R7OPEN.1, which records the `GD-UX-WALKTHROUGH.R7` ruling and the ADR-130 shell this ticket fills.
- **Run:** `implement-spec spec=docs/tickets/213_R7COPY.0__record-composed-run-card.md`
- **Gate status:** none. This ticket changes no money mode; if it finds that it must, it pauses.
- **Live stage:** Stage A only ($0): unit, DOM, orchestrator/ledger and FakeEngine integration tests plus local builds. This ticket stands up no preview (`GD-PREVIEW.R7`). Its Stage-B screenshots are `staging-verified at the R7a phase preview (224_R7DEP.1)` through `D-R7COPY.0-1`.
- **Production mutations:** none. The `runs.walkthrough` column and stored values stay in place, unread.
- **Size budget:** ~550 changed lines, excluding the deleted generator modules and their tests. This is M-upper. If the "every run-state display" sweep (deliverable 4) finds more than the timeline card, the dossier card and the status bar, stop and request a split; do not stretch.

## Goal
A run card's "What it delivered" is composed deterministically from the delivered record: the letter's verdict line, quoted; the finding and claim counts; and links. The `run.walkthrough` model call is gone, so COGS falls by one call per delivered run and no money mode changes. Previously stored walkthrough text is no longer rendered. Every run-state display reads one run summary from one query key, and every finding/claim count comes from one function with one rule. The Timeline and the dossier then can no longer disagree (R5 C3, C4, C5).

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`:
  - §3.1 `GD-UX-WALKTHROUGH.R7`;
  - §3.2 ADR-130;
  - §4.13 REQ-COPY-4;
  - §4.14 REQ-SYNC-1 and REQ-SYNC-2;
  - §4.3 REQ-DWEB-15, the consumer of the composer;
  - §8.2 (money) and §8.3 (copy).
- `docs/build/planning/2026-11-03_r7-demo/REVIEW-round-7-draft-spec.md` RV-17. The walkthrough is a specified feature, and it is retired by ADR, not relabelled.
- `R5-ux-browser-audit.md` findings C3, C4 and C5: the Showcase reproductions for Stage B.
- `packages/orchestrator/AGENTS.md`. Read it in full before touching `packages/orchestrator`, especially Critical Gotchas 1–2 on money and delivery boundaries.
- Anchors (re-confirm at build time):
  - Orchestrator and worker:
    - `packages/orchestrator/src/walkthrough.ts` (`WalkthroughRecord`, `WALKTHROUGH_MAX_WORDS`), its `index.ts` export ~L65–67, and `queue.ts` `RUN_JOBS.walkthrough` ~L13–14;
    - `apps/worker/src/walkthrough-generator.ts`;
    - `apps/worker/src/main.ts`: `loadWalkthroughGenerator` ~L332–336, deps ~L346/407, and the `boss.work(RUN_JOBS.walkthrough…)` handler ~L526–532;
    - `apps/worker/src/run-jobs.ts` ~L305–310;
    - `apps/worker/src/env.ts` `walkthroughModelKeySecret` ~L88–92/199. **The ingest key falls back to `WALKTHROUGH_MODEL_KEY_SECRET` at ~L204–205.**
  - API:
    - `apps/api/src/timeline-routes.ts`: `walkthroughState` ~L142, the lazy enqueue ~L612–621, `POST /runs/:id/walkthrough/retry` ~L977–997, and the deliverable counts ~L434–435;
    - `apps/api/src/dossier-routes.ts`: `parseLetterSections` ~L76 with `SLOT_PATTERNS.one_thing` ~L68, and `deriveRunCardInput` ~L347.
  - Run card:
    - `packages/findings-core/src/run-card.ts`: `WalkthroughState`, `RunCardInput`, `RunCardView` and `buildRunCardView`;
    - `packages/ui/src/run-card.tsx`: the walkthrough block ~L273–285 and the `retry_walkthrough` action;
    - `packages/ui/src/timeline.tsx`.
  - Web:
    - `apps/web/src/dossier-view.tsx`: the run card ~L797 and labels ~L211–213;
    - `apps/web/src/copy.ts` `COPY.steer.walkthrough*` ~L1909;
    - `apps/web/src/server.ts`: the retry route ~L4958;
    - `apps/web/src/data.ts` ~L770;
    - `packages/api-client/src/index.ts` ~L3214/4648;
    - `apps/web/src/spa/queries.ts`: the IDE context bag's `timelineView` ~L434 and the run/timeline keys;
    - `apps/web/src/dom-contract.ts`.
  - Infra (read only): `infra/pulumi/compute.ts` `WALKTHROUGH_MODEL_KEY_SECRET` ~L875–880 and `INGEST_MODEL_KEY_SECRET` ~L869–872.
  - ADR-052 (the walkthrough model key on the worker).
  - `docs/ops/golden-rerun-rule.md` § "What counts as protocol-affecting" (for deliverable 5's classification argument) and the `GD-GOLDEN.R7` row in LEDGER § GATE DECISIONS `### Round 7`.

## In scope — deliverables
1. **Retire the generator** (REQ-COPY-4; ADR-130) [C3].
   - Remove the `run.walkthrough` call path end to end:
     - the orchestrator module and export, and the queue name;
     - the worker generator, deps, handler and env read;
     - the API lazy enqueue and retry route;
     - the web retry route, data and api-client call, the COPY leaves and the run-card walkthrough block, and its action and hook (with matching `dom-contract.ts` updates).
   - Existing `runs.walkthrough` values are never read or rendered.
   - **Keep:**
     - the `runs.walkthrough` column, since a drop is non-additive;
     - the `walkthrough` artifact/document kind in `packages/contracts/src/enums.ts` and `artifact-policy.ts`;
     - the REQ-IDE-48 landing on the walkthrough **card** for an unread finished run (`server.ts` ~L3924).
   - **Ingest key.** The ingest key path must still resolve. Decouple `ingestModelKeySecret` from `WALKTHROUGH_MODEL_KEY_SECRET`, so the reconstructor's key is unchanged on every stage. Prove it with a unit test.
   - **Queued jobs.** Choose the handling for any already-queued `run.walkthrough` jobs (drain as no-op, or rely on pg-boss expiry), and record the choice in ADR-130.
2. **Record-composed "What it delivered"** (REQ-COPY-4).
   - Add a pure composer over the delivered record. It produces:
     - the letter's verdict line, quoted verbatim. The selection rule is this ticket's decision, reusing `parseLetterSections` and the `one_thing`/Verdict slot. If no verdict section exists, show none: never paraphrase or generate.
     - the counts from deliverable 3;
     - links to the dossier, letter and ledger.
   - It takes no I/O, so 218a R7DEM.3b can call it on snapshot data for replayed runs (REQ-DWEB-15).
   - Render it on the Timeline card and the dossier card.
3. **One count rule** (REQ-SYNC-2) [C5]. One exported function derives the finding/claim counts from the delivered record by one rule (e.g. "5 findings + 1 strength"). The Timeline chips, the dossier rail and the run card call it, and the old parallel counts are removed.
4. **One run summary** (REQ-SYNC-1) [C4].
   - Every run-state display reads one `RunSummaryView` from one query key: at least the Timeline card, the dossier's embedded card and the status-bar run state.
   - The dossier's event-derived `deriveRunCardInput` view can no longer diverge from the Timeline's state.
   - Put the view type beside `RunCardView`, or in contracts; that is this ticket's choice.
5. **ADR-130 and banners.** Fill ADR-130 (Accepted): the decision, the COGS note (one fewer model call per delivered run), the confirmation that no money mode changes, the queued-job handling, and the infra residue. Add dated banners on REQ-IDE-19 and DS §5.5 D20 / §5.6.
   - **Golden re-run classification argument** (P4-1; input to 224's classification under `GD-GOLDEN.R7`). ADR-130 gets a section that argues, against each category in `docs/ops/golden-rerun-rule.md` § "What counts as protocol-affecting", whether this ticket's diff can change what a golden Review produces. The categories are: protocol seeds, manifests, rubrics, phase defaults or behaviour; the run/dispatch path (protocol resolution, phase-default layering, URL policy freezing, delivery); the harness/skill phase machinery; the egress research/fetch policy; and the run boundary.
     - The expected argument is that the walkthrough was a lazy, post-delivery call. The API enqueued it on a Timeline read after the run had delivered, and its output was never part of the Review's delivered record. Removing it therefore leaves the Review output untouched.
     - Back the argument with the PR's file list mapped to those categories, including the `apps/worker/src/run-jobs.ts` and `main.ts` edits and the proof that `delivery.ts`, `spend.ts` and `packages/protocols` are untouched.
     - If any touched file falls in a listed category, say so plainly. The rule's "when in doubt, treat as protocol-affecting" applies.
     - This is an argument, not the classification. 224 commits the deploy's classification, and the operator's `GD-GOLDEN.R7` conditions govern any re-run. This ticket dispatches nothing.
6. **Infra residue.** Open a `D-R7COPY.0-*` DEFERRALS row (or a BACKLOG row) to remove the now-unused `WALKTHROUGH_MODEL_KEY_SECRET` env from `infra/pulumi/compute.ts` and its test. This ticket does not change infra.

## Out of scope
- REQ-DWEB-15 replay labelling and the phase inference (218a R7DEM.3b). It consumes deliverable 2.
- The label table and jargon pass (244 R7COPY.1a); the markdown renderer (245 R7COPY.1b).
- The dossier layout and the run header collapse: 243a R7KIT.3e (REQ-PANE-5).
- Classifying the R7a deploy against the golden re-run rule, and any re-run: 224 R7DEP.1 under `GD-GOLDEN.R7`. This ticket supplies only the argument (deliverable 5).
- REQ-SYNC-3…6: 246 R7SYNC.1 and 233 R7TALK.1b.
- Any money-mode, debit, hold or pricing change (spec §9; gotcha 5).
- The Pulumi env removal (deliverable 6 records it).

## Acceptance criteria
- [ ] No code path enqueues, handles or calls `run.walkthrough`: a repo grep test over `apps/` and `packages/` source, excluding the retained enum kind and column. The worker boots without `WALKTHROUGH_MODEL_KEY_SECRET`. The ingest reconstructor's key still resolves on its own variable. Unit tests. *(deterministic · layer: engineered)*
- [ ] The composer is pure and tested on fixtures: a verdict line is quoted verbatim when present; it is absent (never paraphrased) when the letter has no verdict section; counts and links are correct. A run with stored walkthrough text renders the composed block, not the stored text. *(deterministic · layer: fixture-verified)*
- [ ] One count function feeds the Timeline chips, the dossier rail and the run card. A fixture that once showed "6 findings" vs "5 findings" now shows one figure everywhere. *(deterministic · layer: fixture-verified)*
- [ ] The Timeline card, dossier card and status bar render the same run state from one query key. A DOM test with a completed run shows identical state, credits and phase marks on all three. *(deterministic · layer: fixture-verified)*
- [ ] Money is unchanged: the orchestrator and ledger tests are green, there is no diff to `spend.ts`, `delivery.ts` or the ledger package, and the FakeEngine integration suite (`docs/testing.md`) is green. *(deterministic · layer: engineered)*
- [ ] ADR-130 carries the golden re-run classification argument from deliverable 5. It maps every touched file to the rule's categories and states a conclusion, or states "in doubt ⇒ affecting". *(agentic · layer: engineered)*
- [ ] **Stage B, deferred to the phase preview (`GD-PREVIEW.R7`):** `D-R7COPY.0-1` is opened. It names the evidence 224 must capture: at the deploy SHA, the Showcase dossier and Timeline show the record-composed card, the same run state on both, and one finding count, with no generated prose, in screenshots against the R5 C3/C4/C5 reproductions. Unblocked by 224_R7DEP.1's phase preview walk and prod Stage B. This ticket stands up no preview. *(agentic · layer: staging-verified at the R7a phase preview (224_R7DEP.1))*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-COPY-4, REQ-SYNC-1, REQ-SYNC-2

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 6 (immutability: composed from the delivered record, which is never rewritten);
  - 7 and 14 (money is truthful: no money-mode change, and every number comes from the delivered record);
  - 12 (verified by walking it);
  - 19 (truthful: nothing paraphrased, nothing generated).
- Spec §8.2 (money), §8.3 (copy: no efficacy phrasing; reserved strings), §8.4 (DOM-contract updates in the same change) and §8.6 (ADR-130 plus dated banners).

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`. The gap table has one row per clause.

## Notes
- **This ticket owns:**
  - the record-composed run card (decomposition prompt § Keep shared decisions with one owner): the composer, the verdict-line selection rule, the single count rule and `RunSummaryView`;
  - ADR-130.

  Consumers:
  - 218a R7DEM.3b calls the composer and count rule on snapshots. It is the sole owner of the hub-card facts and counts (P4-6), computed with this rule;
  - 221a R7DEM.5b renders 218a's numbers on the hub cards (REQ-TOUR-1) and never re-derives them;
  - 243 R7KIT.3d and 243a R7KIT.3e restyle the card;
  - 224 R7DEP.1 cites ADR-130's golden classification argument;
  - 246 R7SYNC.1 extends the single-source rule to the Timeline sub-routes.
- **The provider-key boundary** (root gotcha 3; ADR-052). Retiring the generator removes one direct worker → provider call. The ingest reconstructor still holds the key, so this ticket narrows the exception and does not close it.
- **DEFERRALS:**
  - D-RUN.1-1/-2 and D-P1.05-* are DONE; record a dated note on D-RUN.1-2, whose evidence included a walkthrough regen, that ADR-130 retires the feature.
  - Open `D-R7COPY.0-1` for the Stage-B AC (`GD-PREVIEW.R7`), and further `D-R7COPY.0-*` rows for the infra env residue and for any other arm not run.
