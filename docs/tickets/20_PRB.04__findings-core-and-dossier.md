# PRB.04 — `findings-core` and the dossier reading surfaces

- **Sequence:** 20 of 50
- **Phase:** RB — Review beta
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** P0.09 (delivered dossiers), P0.12 (obligation chips), PRB.01 (shell), PRB.03 (runs exist)
- **Run:** `implement-spec spec=docs/tickets/20_PRB.04__findings-core-and-dossier.md`

## Goal
Reading the review: `packages/findings-core` (the shared disposition/anchor/deadline logic web and
mobile both consume) and the beta dossier surfaces — run card with live phase progress, Editor's
letter, findings list with anchored quotes, claim ledger table with fetched chips and stance edges,
second-read reconciliation view, rubric view, and the trust chip.

## Load
- Spec §5.7 (the `FindingView` object; anchoring ladder; evidence popover with `sources[]` stances
  and fetched-✓ chips + the once-per-surface explainer; second-read reconciliation states incl.
  promotable rejected group; rubric five-dot rendering with caps, never an aggregate; letter with
  mini-TOC and linked finding cards; REQ-IDE-23/25/26/30/31), §5.5 (run card states + live feed
  Summary/Details densities; REQ-IDE-11/12/14/15 — provisional cards carry no disposition
  controls), §12.5 (SSE consumption), §6.6 (seat badges; attestation chip copy from `access_report`
  — REQ-PROD-2), §10.2 REQ-MOBILE-4 (what belongs in `findings-core`: disposition state machine,
  anchor mapping, ledger summaries, deadline math — no React in the package).
- Beta rendering is list-first (no Margin pane): the §5.7 "three surfaces, one list" invariant is
  honored with the Desk-list-equivalent as the primary surface; the Margin arrives in P1.7.

## In scope — deliverables
1. **`packages/findings-core`:** `FindingView` read model from rows; anchor → passage resolution
   (exact → normalized → fuzzy with confidence; unanchored = "Whole piece", never dropped);
   disposition state machine (five verbs, rationale rules, freeze semantics); ledger summaries;
   gate deadline math. Framework-free.
2. **Run card + live feed (beta):** phase list ✓/◐/○ with orchestrator counters, credits vs cap,
   ETA band; Summary/Details densities (Verbose behind an Advanced disclosure); findings stream in
   as provisional (no controls) and finalize at delivery; reconciliation-conflict row for
   pre-triaged-then-rejected findings (REQ-IDE-15 amended).
3. **Letter view:** Read-mode rendering, sticky mini-TOC, passage links resolving to findings; the
   attestation section replaced by the runtime trust chip ("never had the Drafter's notes mounted —
   verified by the hydration manifest and the proxy log · N URLs fetched · second read: draft
   only") (REQ-IDE-31; REQ-PROD-2).
4. **Claims table:** tier, `ClaimVerdict` chip, URL + accessed date, per-URL fetched-✓ chip from the
   proxy fetch log, multi-source stance rows (REQ-OBJ-18 surface), figure grouping n/a at beta;
   `claim.kind` rendering ("interpretive — not a matter of verification", REQ-OBJ-19 surface).
5. **Second read + rubric:** corroborated ✓✓ / kept / rejected-collapsed-with-reason (promotable →
   user-origin row); rubric eight rows, five-dot scales, caps with reason inline, no total
   (REQ-IDE-26/30).
6. **Obligation chips** on finding cards and the version header (`⚑ 3 open · 2 addressed`) from
   P0.12's read APIs (REQ-OBJ-6).

## Out of scope
- Dispositions UI/verbs and gate cards (PRB.05). What-changed/diffs (PRB.06). Margin decorations,
  triage mode, Apply, clustering (P1.7). Walkthrough/run report (P1.5).

## Acceptance criteria
- [ ] `findings-core` unit suite: anchor ladder (exact/normalized/fuzzy/unanchored fixtures),
      disposition rules (rationale required for rebut/escalate only), freeze behavior — no React
      imports (lint). *(deterministic)*
- [ ] Run card renders only orchestrator-emitted state/counters (a fixture with agent-authored
      progress text renders none of it — REQ-IDE-11). *(deterministic)*
- [ ] Provisional cards expose no disposition controls; the conflict row renders on the
      pre-triage-then-rejected fixture (REQ-IDE-15). *(deterministic)*
- [ ] Every claim URL shows a fetched-✓ chip iff present in the proxy fetch log; the two-source
      stance fixture renders both edges (REQ-IDE-25; REQ-OBJ-18). *(deterministic)*
- [ ] Rubric renders as dot rows with cap reasons; no aggregate anywhere in DOM (REQ-IDE-30).
      *(deterministic)*
- [ ] Trust chip text derives from `access_report` fields only (REQ-PROD-2). *(deterministic)*
- [ ] Unanchored findings listed under "Whole piece", never dropped (REQ-IDE-23). *(deterministic)*

## Requirement IDs to satisfy and stamp in the PR
REQ-IDE-11, REQ-IDE-12, REQ-IDE-14 (beta densities), REQ-IDE-15 (amended), REQ-IDE-23 (list-first
beta form; decorations P1.7), REQ-IDE-25, REQ-IDE-26, REQ-IDE-30, REQ-IDE-31, REQ-PROD-2,
REQ-MOBILE-4 (package boundary), REQ-OBJ-6 (chips), REQ-OBJ-18/19 (surface halves), REQ-SPEC-4
(rendering the explicit severities).

## Cross-cutting invariants — re-check before opening the PR
- No progress element derives from agent-authored text; no event carries prompts/private memory.
- Show integrity as a feature: fetched chips, trust chip, second-read honesty (principle 9).
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
`findings-core` is the contract the full IDE and the 1.x mobile app keep verbatim (REQ-SPEC-20's
"same contracts" promise). The beta list-first rendering is not one of the two REQ-BETA-21
stopgaps — it is the §10.1 list-first shape reused at desktop width.
