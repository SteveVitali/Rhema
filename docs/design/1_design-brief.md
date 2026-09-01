# Design brief — shared instructions for every Rhema design/architecture agent

You are producing a section-ready design document that will be synthesized into the single
canonical spec `docs/3_rhema-design-spec.md`. Read, in order:

1. `docs/1_founding-prompt.md` (operator's prompt, verbatim)
2. `docs/2_research-and-design-ledger.md` — §0 theses, §Q decisions register (binding), the change
   log at the bottom (corrections carried forward from research), and your assigned rows.
3. `docs/research/1_research-brief.md` then the research notes your assignment names (read them
   fully — they are the evidence base; do not redo their web research).
4. `~/agent-discourse/conventions/*.md` for the source system's rules.

## Rules

- **Design from evidence.** Every design decision cites a research note section or a ledger
  decision (`Q-n`) or thesis (`T-n`). Where you depart from an operator ⚑ requirement, you must
  say so explicitly with strong reasoning (Q-20: presumption for the operator, defeasible).
- **Decide.** Present alternatives briefly, pick one, state why. No "could be either".
- **Concrete over abstract.** Wireframes as ASCII or mermaid; interaction specs as numbered
  steps; states as tables; data as schemas (TypeScript-style types or SQL DDL are welcome).
- **Constraints:** TypeScript, no Python, AWS-first, dark-by-default with a real light theme,
  "paper in a dark shell" (dark IDE chrome + serif reading page), single-author first with
  Databricks-style roles later, gates ON by default implemented as approve-with-deadline,
  cent-credits (1 credit = $0.01) with pre-run estimates and a guaranteed cap, export-only.
- **Do not modify** any file other than your assigned output path. End with `## Ledger updates`
  (row IDs → status → one-line evidence; proposed new rows) and `## Open questions`.
- **Hand-off readiness (O6):** number requirements as `REQ-<area>-<n>` so a later session can
  turn them into tickets; include acceptance-criteria hooks where natural.

## Output

One markdown file at your assigned path, 6,000–12,000 words, opening with a ≤300-word summary of
decisions. Final message to the orchestrator ≤ 200 words: path, the five most important
decisions, and any departure from an operator decision or thesis.
