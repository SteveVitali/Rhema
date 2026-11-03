# R7COPY.1a — One label table, the jargon pass, and the copy guard

- **Sequence:** 244 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 243a_R7KIT.3e (and through it 243_R7KIT.3d), the last surface migration before
  copy is swept. Labels and jargon land on final markup, and the DOM guard runs over migrated
  surfaces. Spec §10 row 244 (†, split from RV-24's row 225); re-pointed from 243 to 243a by
  Phase-4 Split decision 7. Merges to `main` wait for 224_R7DEP.1 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/244_R7COPY.1a__labels-jargon-guard.md`
- **Gate status:** none. Code + tests; `mergePolicy: OPERATOR`.
- **Live stage:** offline-only, Stage A ($0). The REQ evidence is A. **No owned preview**
  (`GD-PREVIEW.R7`). The public-copy deltas are accepted DACC-6 deltas (`GD-PUBDELTA.R7`); this
  ticket re-captures `public-ssr-baseline` locally against its own build, and 250 re-checks it at
  the phase preview.
- **Production mutations:** none
- **Size budget:** ~500 changed lines excl. generated/fixtures (M).

## Goal
Every internal key that reaches the UI renders through **one** label table with consistent case:
workflows, phases, artifact kinds and enums. The banned internal terms are replaced with plain
language. A copy lint plus a DOM test keep both from coming back (REQ-GUARD-2).

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`:
  - §4.13 REQ-COPY-1 and REQ-COPY-6 (the banned list, verbatim);
  - §4.16 REQ-GUARD-2;
  - §4.17 REQ-DACC-6 (public deltas, as extended by `GD-PUBDELTA.R7`);
  - §3.3 S-10 (role vocabulary);
  - §5.5 (COPY.1 is a tour-target ticket);
  - §8.3;
  - §8.
- `R5-ux-browser-audit.md` B6, C12, D2 ("Waiting on your call"), D3 ("the shared session
  contract"), E1 (jargon), G2 ("the coherence read", obligations), G6 (export AI-use statement
  keys), H3 and A1/A10 ("QUIET").
- `R6-ux-code-audit.md` §5 (the "QUIET" filing) and §9 UXC-30.
- `apps/web/AGENTS.md`.
- LEDGER § GATE DECISIONS `### Round 7` rows `GD-PUBDELTA.R7`, `GD-TOURSIGN.R7` and
  `GD-PREVIEW.R7`.
- DEFERRALS round-7 sections.
- Manifest § Cross-cutting invariants and § Operating rules.
- Anchors (re-confirm at build time):
  - `apps/web/src/copy.ts` (about 2.6k lines):
    - `phaseLabel` around `:332`, `workflowLabel` around `:1879`;
    - jargon leaves at about `:52, :752, :855, :1304, :2215, :2241, :2298`;
  - `apps/web/src/feed-labels.ts`, `files-labels.ts`, `run-sheet-labels.ts` and `state-map.ts`;
  - `apps/web/src/copy.test.ts` (`lintCopy(collectCopyStrings())`);
  - `packages/contracts/src/vocab-lint.ts` (`lintCopy`) and `reserved-strings.ts`
    (`BANNED_STRINGS`, `RESERVED_CLASSES`);
  - `tools/eslint-plugin-rhema` (`no-banned-strings`);
  - `apps/web/src/spa/testkit.ts`;
  - the `apps/web/src/spa/*.dom.test.tsx` files;
  - the export AI-use statement composer (re-confirm: `export.tsx` / api export route);
  - 240's enum label maps;
  - `scripts/live/public-ssr-baseline.mjs` (run locally; re-confirm its target flag).

## In scope — deliverables
1. **One label table** (REQ-COPY-1; B6, C12, G6, UXC-30).
   - It is keyed by the `@rhema/contracts` enums for workflow, phase, artifact kind, provider /
     source kind and run state.
   - It is **exhaustive by type**, so a new key fails typecheck.
   - It uses one case rule. C12 is the example: "Second read (independent)" next to lowercase
     keys.
   - Existing scattered maps fold into it: COPY `phaseLabel` / `workflowLabel`, feed / files /
     run-sheet labels, `state-map.ts`, and 240's enum maps. Their consumers are re-pointed.
   - The export AI-use statement renders labels, not keys (G6).
2. **Jargon pass** (REQ-COPY-6). Each term in spec §4.13's list gets a plain-language replacement
   in every COPY leaf:
   - "QUIET";
   - "obligations" → "open items";
   - body-copy "gate";
   - "the coherence read";
   - "public funnel";
   - "sidecar";
   - "partial (0/1 phases)";
   - "Waiting on your call";
   - "Have an invitation?";
   - "the shared session contract…".

   The replacements stay inside the reserved-string rules: approvals, plans, tiers, rigor and seats
   are distinct (manifest invariant 1), and "author" means the human only (S-10).
   - **H15-signed demo copy is not edited here** (Phase-4 P4-24). If the lint finds a banned term
     in a `demo.*` / `demo.tour.*` leaf, this ticket neither edits nor exempts it silently. It
     records the leaf, the term and a proposed replacement in the run record and in a
     `D-R7COPY.1a-1` row routed to 248_R7TOUR.2's changed-leaf list (`GD-TOURSIGN.R7`: the operator
     approves it at 248's merge). The lint carries a temporary, named, dated allow entry for
     exactly those leaves, keyed to `D-R7COPY.1a-1`, which 248 removes.
3. **REQ-GUARD-2.**
   - **(a)** A copy lint: no COPY leaf contains a banned internal term. The list lives with
     `@rhema/contracts`' reserved strings and is consumed by `lintCopy` and the ESLint
     `no-banned-strings` rule.
   - **(b)** A DOM test helper in `testkit.ts`, applied to every SPA surface render test: no
     `snake_case` workflow / phase / kind key appears in rendered text outside `data-*`. Essay
     content is data and is excluded.
4. **Public-copy delta, accepted** (REQ-DACC-6 as extended by `GD-PUBDELTA.R7`; Phase-4 P4-9).
   Leaves rendered on public pages change, for example "Have an invitation? Sign in" and the
   changelog's "public funnel" (H3). The operator accepted these as enumerated DACC-6 deltas
   ("Accept both (Recommended)"). They are enumerated in the PR and the run record, and this
   ticket re-captures `public-ssr-baseline` locally against its own build. Only the enumerated
   leaves may differ.

## Out of scope
- `errorCopy` and the markdown renderer (245_R7COPY.1b).
- Retiring the "QUIET" bucket UI and attention grouping (234_R7HOME.1; this ticket only bans the
  term).
- The landing refresh and marketing layout (249a_R7PUB.1). Demo / tour copy (signed at H15;
  changes go through 248's changed-leaf list, `GD-TOURSIGN.R7`).
- The global REQ-GUARD-1 (249).

## Acceptance criteria
- [ ] The label table is exhaustive over each contracts enum: a test adds a fake key and expects a
  type error via `@ts-expect-error`. Every former map consumer resolves through it, and a grep test
  shows no surviving parallel label map. *(deterministic · layer: engineered)*
- [ ] Every REQ-COPY-6 term is absent from all COPY leaves, per the lint, except H15-signed demo
  leaves routed to 248 under `D-R7COPY.1a-1` (each named in a dated allow entry; zero such entries
  is the expected case). A seeded leaf with a banned term fails both `lintCopy` and
  `no-banned-strings`, and a seeded allow entry without a D-row key fails too. *(deterministic ·
  layer: engineered)*
- [ ] The DOM guard runs in every SPA surface render test and is green. A seeded `chat_turn` in a
  fixture's rendered text fails it. *(deterministic · layer: engineered)*
- [ ] The export AI-use statement test shows labels only, with no workflow or phase key (G6).
  *(deterministic · layer: engineered)*
- [ ] `copy.test.ts` (`lintCopy` = []), the vocab lints, `check:protocol-markers` and
  `check:dom-contract` are green. The public-delta list is committed in the run record.
  *(deterministic · layer: engineered)*
- [ ] `public-ssr-baseline`, re-captured locally against this head's build, differs from the
  pre-change capture only in the enumerated public-copy leaves (the `GD-PUBDELTA.R7` delta). The
  diff is committed in the run record. *(deterministic · layer: engineered)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-COPY-1, REQ-COPY-6, REQ-GUARD-2, REQ-DACC-6 (the public-copy delta under `GD-PUBDELTA.R7`;
local re-capture). Findings: B6, C12, D2 (the jargon part), D3 (the copy
part), G2 (the jargon part), G6 (the keys part), H3 (in COPY; rendered by PUB), A1/A10 (the term),
UXC-30.

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 1 (canonical vocabularies; replacements never merge approvals / plans / tiers / rigor / seats);
  - 3 (no protocol / eval text enters COPY);
  - 9 (REQ-POS / REQ-EVAL-19 copy rules);
  - 17 (context budget; no preview is created here, per `GD-PREVIEW.R7`).
- Spec §8:
  - .3 ("author" = the human; S-10 demo roles; the harness is never named with a third-party
    product name);
  - .4, .6, .7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules` (1–10). The gap table has one row per
  clause.

## Notes
- **Owns:**
  - the label-table module and its exhaustiveness mechanism;
  - the banned internal-term list and where it lives;
  - the DOM guard helper;
  - the public-copy delta list.
- **Consumes:** 240's enum label maps (folded); 234's retirement of the QUIET UI.
- **Handed to 245:** `errorCopy` sentences must pass this ticket's lint.
- **Tour:** COPY.1 is an R7TOUR.2 target ticket (§5.5). Any tour-visible label change is listed
  for 248. The demo / tour script itself is H15-signed and is not edited here; a banned term found
  in it is routed to 248's changed-leaf list (P4-24), never silently exempted.
- **Public delta.** Phase-4 P4-9 found the non-landing public-copy fixes outside DACC-6's
  enumerated list. The operator ruled `GD-PUBDELTA.R7`, so they are now enumerated deltas (spec
  post-ratification note). This ticket re-captures the baseline locally; 249a re-captures for the
  landing; 250 re-checks at the phase preview.
- **DEFERRALS:** `D-R7COPY.1a-1` is opened only if a banned term sits in H15-signed demo copy
  (owner 248_R7TOUR.2; dated from `date -u`).
