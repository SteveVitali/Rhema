# PRB.01 — Beta web shell, invite gating, sample dossier

- **Sequence:** 17 of 50
- **Phase:** RB — Review beta (opens only after milestone gates G1 + G2; see 00_MANIFEST.md)
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** P0.01 (web app, Better Auth), P0.02 (contracts)
- **Run:** `implement-spec spec=docs/tickets/17_PRB.01__beta-shell-and-invites.md`

## Goal
The beta's front door and frame: invite-gated signup, a deliberately flat web shell (a beta-only
stopgap — REQ-BETA-21; the §5 design system arrives with the full IDE), a minimal project list, and
the public invite page with a read-only sample dossier.

## Load
- Spec §17 Review-beta row (scope sentence: "private, invite-only, Essay protocol only … no
  Assistant/chat, no figures, no outline editor, no landing funnel (invite page + sample dossier)"),
  REQ-BETA-1/3/16/17/19/21; §6.3 (project state function — consumed read-only for the list), §4.2
  (URL scheme — use the canonical `/p/:project/...` shapes so nothing is thrown away), Appendix D.2
  (vocabulary lint applies to every UI string from the first screen).

## In scope — deliverables
1. **Invite gating:** invite codes/allowlist on signup (Google + magic link from P0.01); no public
   signup path; no pricing page (REQ-BETA-19).
2. **Beta shell:** flat layout (list → project → dossier), canonical URLs, dark shell with the token
   *values* from §5.9 but no pane system; phone-width readable (the §10.1 input scope arrives with
   the gate/disposition surfaces in PRB.05).
3. **Project list:** rows from the shared state function (REQ-PROD-9; pill + one primary action;
   attention grouping may be a simple sort at beta).
4. **Invite page + sample dossier:** one public page describing the beta plus a read-only,
   pre-computed Essay dossier (an early Showcase-content stand-in; §16.3 #21 content decision needs
   no ratification here — use one of the three real projects with operator sign-off, REQ-POS-3's
   contradicted-Tier-1-claim rule honored).
5. **Vocabulary lint wiring** for UI strings (extends P0.02's data; REQ-PROD-6/REQ-BILL-18).

## Out of scope
- Import (PRB.02), run sheet (PRB.03), dossier/triage surfaces (PRB.04/05), billing UI (PRB.08).
- Any §5 pane/design-system build (P1.1 — the beta shell is throwaway-by-design within REQ-BETA-21's
  two-stopgap budget).

## Acceptance criteria
- [ ] Signup without a valid invite is refused; with one, lands on the project list. *(deterministic)*
- [ ] Project rows derive pill/action from the state function — no stored status (REQ-SPEC-3).
      *(deterministic)*
- [ ] The sample dossier page renders read-only with its contradicted Tier-1 claim + fetched-URL
      chip visible (REQ-POS-3 rule). *(deterministic)*
- [ ] i18n/string lint green against Appendix D.2. *(deterministic)*
- [ ] No public route exposes pricing, plans, or signup-without-invite (REQ-BETA-19). *(deterministic)*

## Requirement IDs to satisfy and stamp in the PR
REQ-BETA-19, REQ-BETA-21 (stopgap #2 declared), REQ-PROD-9 (surface half), REQ-SPEC-3 (UI half),
REQ-PROD-6/REQ-BILL-18 (lint wiring), REQ-POS-3 (sample-dossier rule).

## Cross-cutting invariants — re-check before opening the PR
- Canonical vocabularies everywhere; banned strings lint-enforced from the first screen.
- The beta is private and capped; the launch moment is reserved for the full IDE (REQ-BETA-19).
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
Exactly two beta-only stopgaps exist chain-wide (REQ-BETA-21): this flat shell, and PRB.07's
CodeMirror edit mode. Anything else built here must be on the contracts the full IDE keeps.
