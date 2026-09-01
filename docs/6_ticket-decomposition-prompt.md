# Ticket-decomposition prompt (paste into a fresh session in `~/Rhēma`)

> Written 2026-09-01 after spec ratification (v1.0); revised same day for the `decompose-spec`
> `tickets_dir` feature (agent-skills PR `svitali/decompose-spec-tickets-dir`). This is the
> hand-off contract from the design sessions (ledger row O6). **Prerequisite:** `~/agent-skills`
> must contain the `tickets_dir` feature — merge that PR (or check out its branch) before
> starting. Paste everything below the line into a fresh Claude Code session started in `~/Rhēma`.

---

Invoke the `decompose-spec` skill (from `~/agent-skills`) with:

- `spec` = `docs/rhema-design-spec.md` — the canonical, ratified (v1.0) Rhema design spec
- `tickets_dir` = `docs/tickets` (committed, tracked; a *derived* build artifact regenerable from the
  spec — the skill's native per-ticket-file layout: one `P<phase>.<k>__<slug>.md` implement-spec
  contract per ticket plus a `00_MANIFEST.md` runbook; the spec has named phases, so use
  phase-numbered filenames). **Preserve any non-`NN_` maintained companions already in the dir —
  notably `DEFERRALS.md` — do not overwrite or delete them on regeneration.**
- `dispatch_target` = `manual` — tickets will be driven by hand-chained fresh sessions running
  `implement-spec spec=docs/tickets/<file>`, PRs stacking per the manifest's how-to-build
- `build_name` = `rhema`

The skill's own regimen governs partitioning, contracts, the manifest, cite-don't-copy, and
requirement-ID coverage. For reference, `~/Eleutheria/docs/tickets/` is a prior hand-built
instance of the same layout. Rhema-specific binding constraints, all from the spec itself:

1. **The spec is canonical and ratified.** Q-1…Q-26 and rulings R1–R26 (§16.3, Appendix B) are
   decisions, not options. Requirement IDs are the spec's `REQ-*` families (Appendix A) — use
   them for the skill's ID-stamping and coverage check; MVP-phase REQs left uncovered are a
   planning error.
2. **Chain order is the ratified validation-first sequence** (§17): Phase 0a → Phase 0 (with its
   §17 exit criteria) → §18 benchmark → Review beta (REQ-BETA-1…22, Essay-only scope) → full IDE
   → public launch. Map these onto the skill's native non-code rows: Phase 0a account
   registrations and §18 corpus commissioning are **human-prerequisite rows**; the Phase-0 exit
   criteria, the REQ-EVAL-15 LIFT criterion, and the REQ-BETA-18 beta gates are **milestone-gate
   rows** with their pre-registered thresholds quoted verbatim.
3. **Scope of this decomposition:** full ticket bodies for Phase 0a → Phase 0 → benchmark tooling
   → Review beta; for the full-IDE phase produce the ticket *skeleton only* (titles, dependencies,
   REQ coverage map) and have the manifest say the bodies are written after the REQ-BETA-18 gates
   are evaluated.
4. **Five contracts adopted by reference** (spec §0.1): tickets implementing them must open the
   named design-doc sections (design/3 §3.2–3.3, design/4 §6.3, design/7 §8, design/9 §7.2 —
   tracked under `docs/design/`) and apply the spec's renames from Appendix A.
5. **Stack and conventions:** TypeScript everywhere, no Python (Q-3; the sanctioned Docling
   sidecar exception is deferred per the spec); pnpm + Turborepo monorepo, SST stages, AWS-first
   per §13; closed-source but open-source-ready (Q-19). `docs/` (spec, design, research, tickets) is
   committed and tracked — do not gitignore it.
6. **Acceptance criteria:** draw from the spec's AC hooks (Appendix A); hooks marked
   "to write (O6)" must be written now, in the ticket, as testable criteria. Feature-matrix row
   numbers (§3.2) are the epic ids.

Before writing tickets, read: the spec front matter and §0, §3.2, §11–§14, §17–§18, and
Appendix A end-to-end; skim §5–§10 for the surfaces the beta needs. When done, open
`docs/tickets/00_MANIFEST.md` in Zed and report: ticket count per phase, the requirement-ID
coverage-check result, and any spec ambiguity you had to resolve (list each with the reading you
chose so the operator can veto).
