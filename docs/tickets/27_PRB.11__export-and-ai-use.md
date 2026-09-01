# PRB.11 — Export (md/txt/docx) and the AI-use statement (slice S1)

- **Sequence:** 27 of 50
- **Phase:** RB — Review beta
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** P0.01 (export container scaffold), P0.09 (promoted versions), P0.12 (obligation counts)
- **Run:** `implement-spec spec=docs/tickets/27_PRB.11__export-and-ai-use.md`

## Goal
Getting work out, disclosed: the export container (pandoc) producing md/txt/docx at beta, the
export dialog with obligation counts, and authorship slice **S1 — the AI-use statement — riding the
beta's export path** (partners export real manuscripts for ≥90 days and should not do so
undisclosed; §17 beta row; §16.3 #28).

## Load
- Spec §13.4 (export rules; the beta subset md/txt/docx; footnotes become real docx footnotes;
  Substack-flavoured md is a *profile* of md — include if trivial, else defer with a note), §8.4
  REQ-VIS-10 (statement generated from run facts — workflows, model tiers, dates, phases,
  approvals, human-revision versions; user may append, never remove; obligation-count sentence when
  open at export), §6.7 REQ-GENRE-5 + REQ-POS-6 (per-protocol templates over the generator; Essay's
  general template at beta; a service, never a gate), §11.7 (export never blocks on obligations —
  the dialog shows "2 blocking obligations open" with links).

## In scope — deliverables
1. **`apps/export`:** pandoc container (Typst/PDF and LaTeX deferred to P1.18), Fargate job per
   export; md / txt / docx from canonical markdown; footnote fidelity in docx.
2. **Export dialog:** format choice; open-obligation line with links (never blocking); the AI-use
   statement attach toggle; deferred-horizon obligations with `until: 'pre_export'` surface here
   (REQ-OBJ-3's horizon rule).
3. **AI-use statement generator:** template + run facts per REQ-VIS-10; the Essay/general template
   (REQ-POS-6); append-only user additions; the generated obligation-count sentence; statement
   exportable standalone and as a docx/md attachment.
4. **Provenance appendix explicitly deferred** (REQ-POS-7 is an export-formats concern for P1.18;
   block-level capture already accrues — note in the dialog copy nothing about it at beta).

## Out of scope
- pdf/LaTeX/html/rtf/odt/epub/Google Docs, CSL styles, account export zip (P1.18).
- Academic disclosure (ICMJE) template (P1.21 with the Academic protocol).

## Acceptance criteria
- [ ] md/txt/docx exports of the seeded project round-trip content faithfully (docx footnotes are
      real footnotes) — golden fixtures. *(deterministic)*
- [ ] The statement is generated from run rows only; fixture with 2 reviews + 1 revise + a
      human-revision version lists exactly those facts; user append survives regeneration; removal
      of generated sentences is impossible via API (REQ-VIS-10). *(deterministic)*
- [ ] Export with open blocking obligations proceeds, shows the count line, and the statement gains
      the obligation sentence (§11.7). *(deterministic)*
- [ ] A `pre_export` deferred obligation surfaces in the dialog when its horizon arrives
      (REQ-OBJ-3). *(deterministic)*
- [ ] Export runs only in the isolated container (no pandoc in api/web images). *(deterministic)*

## Requirement IDs to satisfy and stamp in the PR
REQ-VIS-10, REQ-POS-6, REQ-GENRE-5 (generator core; Academic template P1.21), §13.4 beta formats,
REQ-OBJ-3 (pre_export horizon surface), REQ-OBJ-6 (export-dialog half).

## Cross-cutting invariants — re-check before opening the PR
- Export is the only way out and never blocks (Q-9; export-only is a founding constraint).
- Authorship-legibility framing, never detection-evasion (REQ-POS-13) — applies to dialog copy.
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
P1.18 extends this container with the full format set, CSL, the provenance appendix (REQ-POS-7)
and the whole-account zip (REQ-ACCT-3).
