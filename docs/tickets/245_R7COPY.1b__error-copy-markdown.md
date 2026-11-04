# R7COPY.1b — One sanitized markdown renderer (+ the chat render-seam closure)

- **Sequence:** 245 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:**
  - 244_R7COPY.1a: the label table and copy lint the rendered surfaces already pass (declared per
    Phase-4 P4-15 and Split decision 8; formerly "when 244 has landed earlier in row order").
  - Through 244: 243a_R7KIT.3e / 243_R7KIT.3d. The finding cards, response letters and
    what-changed passages it re-renders are on their final primitives and layout.
  - 232_R7TALK.1a: the chat assistant-bubble **render seam** this ticket plugs into, and its
    "chat bubbles render markdown" DEFERRALS row this ticket closes (P4-7).
  - Spec §10 row 245 (†). Split at Phase 4 (Split decision 8): `errorCopy` and the code inventory
    (REQ-COPY-2) moved to 245a_R7COPY.1c. Merges to `main` wait for 224_R7DEP.1 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/245_R7COPY.1b__error-copy-markdown.md`
- **Gate status:** none. Code + tests; `mergePolicy: OPERATOR`.
- **Live stage:** Stage A only ($0: unit / component / layout tests against a local build). **No
  owned preview** (`GD-PREVIEW.R7`). The Stage-B AC is owed to the R7b phase preview in
  250_R7DEP.2 through a DEFERRALS row. A live need outside 250's preview window PAUSES for the
  operator.
- **Production mutations:** none
- **Size budget:** ~350 changed lines excl. generated/fixtures (M). Entry delta ≤ 15 kB gz. The
  renderer must not enter the shell entry graph.

## Goal
Prose renders as prose:
- one sanitized markdown renderer serves finding bodies, inbox notices, response letters,
  what-changed passages and chat assistant bubbles;
- there is no monospace prose outside Source mode;
- long URLs wrap or truncate.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md` §4.13 REQ-COPY-3, §4.11 REQ-TALK-2 (the rendered-markdown bubble
  clause), §4.6 REQ-KIT-5, §8.3 and §8.
- `docs/build/planning/2026-11-03_r7-demo/PHASE4-REVIEW-decomposition.md` P4-7 and Split
  decision 8.
- `R6-ux-code-audit.md` §9 UXC-28.
- `R5-ux-browser-audit.md` C8, D2, G2 (the monospace and asterisks part) and the I3 preview
  (monospace).
- `apps/web/AGENTS.md`.
- `docs/build/runs/R7TALK.1a.md` (232's run record: the render seam's location and its DEFERRALS
  row id).
- DEFERRALS round-7 sections (incl. 232's "chat bubbles render markdown" row). LEDGER § GATE
  DECISIONS `### Round 7` row `GD-PREVIEW.R7`.
- Manifest § Cross-cutting invariants and § Operating rules.
- Anchors (re-confirm at build time):
  - `packages/markdown` (`parseCanonical`) and `packages/editor/src/md-to-pm.ts` (the existing
    canonical processor);
  - monospace prose sites:
    - `packages/ui/src/page-editor.tsx:151` and `:412` (proposal `<pre>`);
    - `packages/ui/src/conversion.tsx:49`;
    - `apps/web/src/spa/surfaces/onboarding.tsx:87`;
    - `apps/web/src/spa/surfaces/voices.tsx:115`;
  - `packages/ui/src/findings.tsx`, `what-changed.tsx` and `letter.tsx`;
  - the inbox notice render in `apps/web/src/spa/surfaces/inbox.tsx`;
  - 232's assistant-bubble render seam in `packages/ui/src/chat-panel.tsx` (re-confirm from 232's
    run record) and its sanitizer test.

## In scope — deliverables
1. **One sanitized markdown renderer** (REQ-COPY-3; C8, D2, G2).
   - It is a `@rhema/ui` component over the canonical profile.
   - It never passes raw HTML, uses safe link protocols only, and externals open safely.
   - It renders finding bodies, inbox notices (lists become lists, paragraphs become paragraphs),
     response letters and what-changed passages.
   - It is loaded so that it adds ≤ 15 kB gz to the entry graph (leaf chunk or twin-side AST;
     this ticket's call, measured and recorded).
2. **Chat render-seam closure** (REQ-TALK-2, the rendered-markdown clause; REQ-COPY-3; Phase-4
   P4-7).
   - Plug the renderer into 232's assistant-bubble render seam, replacing the sanitized
     plain-paragraph stub. No second parser is introduced.
   - Close 232's "chat bubbles render markdown" DEFERRALS row (`D-R7TALK.1a-<n>`, id from 232's
     run record) with a dated note citing the DOM test below. The row's Stage-B half (a rendered
     bubble on a deployed build) rides 250's preview walk via `D-R7COPY.1b-1`.
   - 232's sanitizer test stays green against the new renderer.
3. **No monospace prose outside Source mode** (REQ-COPY-3; G2, I3).
   - The proposal previews and the what-changed hunks render through the renderer in the reading
     face.
   - The conversion / import previews are typeset, if 235 has not already done so.
   - Voice-sample or code-like data that is genuinely code stays monospace, with a reason recorded.
4. **Long URLs wrap or truncate** inside cards (C8): `overflow-wrap` plus truncation with the full
   URL in the title or tooltip.

## Out of scope
- **245a_R7COPY.1c:** `errorCopy(code)`, the error-code inventory and its extraction (REQ-COPY-2).
- The label table, jargon and REQ-GUARD-2 (244).
- The chat thread, composer and JSON send (232). The seam itself is 232's; only its body changes.
- The finding cards' layout and primitives (243 / 243a). Word-level diff marks
  (`GD-UX-P1-BACKLOG.R7`).
- The import preview's H1 rule and dropzone (235).

## Acceptance criteria
- [ ] Renderer tests cover:
  - emphasis, lists and paragraphs render (the "*Paradoxides*" case renders italic, with no
    asterisks);
  - raw `<script>` / `<img onerror>` / `javascript:` links are neutralized;
  - a long URL does not overflow a 320 px card (a layout assertion).

  *(deterministic · layer: engineered)*
- [ ] Finding bodies, inbox notices, response letters and what-changed passages all render through
  the one renderer (a component test per site), and none uses a monospace family. *(deterministic ·
  layer: engineered)*
- [ ] A DOM test on an assistant bubble shows markdown rendered through the same renderer (italic,
  list, safe link), with no asterisks and no raw HTML; 232's sanitizer test still passes. 232's
  "chat bubbles render markdown" D-row is closed with a dated note citing this test (P4-7).
  *(deterministic · layer: engineered)*
- [ ] `check:spa-budget` passes (entry delta reported; the renderer is not in the shell entry
  graph unless within the allowance), with `protocol-markers`, `dom-contract` and the vocab lints.
  *(deterministic · layer: engineered)*
- [ ] **Stage B — staging-verified at the R7b phase preview (250).** No preview is stood up here
  (`GD-PREVIEW.R7`). This ticket opens `D-R7COPY.1b-1` (kind P; owner 250_R7DEP.2; dated from
  `date -u`; unblocked by: 250's preview walk; how to verify: screenshots at 250's preview SHA,
  `--expect-sha`, provenance PASS, committed under `docs/build/runs/R7COPY.1b/`):
  - a finding card with rendered emphasis and a wrapped URL (C8);
  - the inbox security notice as paragraphs and list (D2);
  - a what-changed passage in the reading face (G2);
  - a chat assistant bubble with rendered markdown (REQ-TALK-2, the stubbed U6 turn).

  250 closes the row. This PR reports the AC owed, never green. *(agentic · layer:
  staging-verified at the R7b phase preview (250))*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-COPY-3, REQ-TALK-2 (the rendered-markdown bubble clause only; closes 232's seam row),
REQ-KIT-5 (allowance). Findings: UXC-28, C8 (the markdown and URL part), D2 (the wall-of-text
part), G2 (the monospace and asterisks part), I3 (the monospace preview, if not already done by
235), P4-7.

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 1, 9;
  - 3 (no protocol / eval text enters COPY or rendered fixtures);
  - 12;
  - 17 (context budget; no preview is created here, per `GD-PREVIEW.R7`).
- Spec §8 .3, .4, .5 and .7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules` (1–10). The gap table has one row per
  clause.
- No preview is stood up here (`GD-PREVIEW.R7`). A live need outside 250's preview window PAUSES
  for the operator (gotcha 7).

## Notes
- **Slug kept.** The file slug stays `__error-copy-markdown` even though, after Phase-4 Split
  decision 8, this row keeps only the renderer and the chat-seam closure; `errorCopy` moved to
  245a_R7COPY.1c. Ticket files are never renamed.
- **Split (applied at Phase 4, Split decision 8; P4-13).** The pre-declared natural cut (renderer
  versus `errorCopy`) was taken. REQ-COPY-2 moved to 245a with its about 140-code inventory.
- **Owns:**
  - the sanitized renderer and its loading strategy;
  - the monospace-prose rule's exemption list;
  - the closure of 232's chat-markdown D-row (P4-7).
- **Consumes:** 244's lint and label table; 232's render seam; 225 / 225a's primitives.
- **Downstream.** 245a sits on this row (stack order); 248 depends on both (P4-10).
- **DEFERRALS:** `D-R7COPY.1b-1` (Stage B → 250, `GD-PREVIEW.R7`) is opened by design; 232's chat
  row is closed here.
