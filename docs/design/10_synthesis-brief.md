# Synthesis brief — writing `docs/3_rhema-design-spec.md`

Goal: one canonical, self-contained **product + UI/UX + technical systems & software design
spec** for Rhema, synthesized from the eight design docs (`docs/design/2..9`) and, where the
design docs defer, the eleven research notes (`docs/research/2..12`). The operator reviews this
document; a later session hardens it into implementation tickets (O6).

## Inputs (read in this order; read fully)
1. `docs/1_founding-prompt.md`; `docs/2_research-and-design-ledger.md` (§0 theses, §Q decisions,
   full change log — it records every correction and every flagged conflict).
2. `docs/design/9_product-scope-genres-and-workflows.md` (scope spine) → `2_ide-core-ux.md` →
   `6_chat-research-and-visualizations.md` → `8_personas-and-ingestion-ux.md` →
   `7_mobile-companion.md` → `3_visibility-policy-and-data-model.md` →
   `5_execution-and-platform-architecture.md` → `4_growth-and-billing-surfaces.md`.
3. Research notes only to resolve a conflict or fill a gap the design docs left.

## Conflicts to adjudicate explicitly (state the ruling and the reason in the spec)
- Persona lock after v1: hard lock (design/3) vs soft lock with Fork / Adopt hatches
  (research/12, design/8). Ruling expected: soft lock.
- Project list default grouping: attention-first (design/2) vs by persona (⚑ prompt);
  design/8 says Flat while ≤1 voice. Ruling expected: attention-first with persona as
  filter/alternate grouping — record as a Q-20 departure.
- Triage gate default: auto-proceed with deadline (design/2) vs wait (design/7). Rule per gate.
- Trial: reduced-depth only (research/6) vs Full board within 6k-word cap (design/4).
- Reader-tier daily chat allowance (design/4) vs "no daily grants" (research/10).
- Duplicate proposed ledger IDs (G14, M10) — assign fresh IDs in the spec's appendix.

## Structure (fixed)
0 Front matter: status, how to read, requirement-ID convention, decision register summary
1 Vision & positioning · 2 Users & JTBD · 3 Product scope & phasing (MVP / v1 / later matrix)
4 Information architecture & navigation · 5 IDE UI/UX (per surface; wireframes) · 6 Workflows,
gates, agent roles · 7 Chat/research session & visualizations · 8 Artifact visibility policy
9 Personas ("Voices") & ingestion · 10 Mobile companion · 11 Data model · 12 Execution
architecture & run model · 13 Platform, infra, security, ops · 14 Billing, usage, pricing
15 Landing, onboarding, growth · 16 Risks, departures from operator requirements, open
questions · 17 Roadmap · Appendices: A requirement index (every REQ-* with source doc);
B decision register; C research index (note → what it settled); D glossary.

## Rules
- Preserve every `REQ-*` ID from the design docs verbatim (renumber only true duplicates and
  record the mapping in Appendix A). Add `REQ-SPEC-n` for anything new the synthesis decides.
- Every section states decisions, not options; alternatives only in one "rejected" line each.
- Cite sources as `[design/2 §3.3]` / `[research/10 §4]`; the spec must be readable without them.
- Wireframes (ASCII) and mermaid diagrams are kept where the design docs have them; compress
  prose, never tables of requirements.
- Target 35,000–50,000 words. Write in sections to the output file progressively (append), so
  partial progress survives interruption; finish with a final consistency pass.
- Do not modify any other file. End your report with the ledger rows the spec closes.

## Additional conflicts surfaced by design/6 and design/9
- Tier names: design/4 Reader / Pro / Max / Max+ / Team vs design/9 Free / Writer / Studio /
  Studio Max / Team — pick one set (price points are identical) and use it everywhere.
- Gate deadlines: design/2 30-minute default vs design/6 structure 24h / review scope 2h /
  triage 24h (parked at zero compute) — rule per gate.
- Agent seat naming: "Drafter / Editor / Assistant" (design/9) supersedes "Author" wherever
  design/2, 3, 6 say Author; keep `agents/author/` as the *storage namespace* name for
  source-convention compatibility and say so once.
- Assistant reading the Drafter's notebook read-only (design/6) — record as a convention
  departure needing operator confirmation in §16.
