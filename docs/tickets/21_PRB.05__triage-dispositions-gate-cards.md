# PRB.05 — Triage, dispositions, reason codes, gate cards

- **Sequence:** 21 of 50
- **Phase:** RB — Review beta
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** PRB.04 (findings-core + dossier surfaces), P0.10 (gate mechanics), P0.12 (obligations)
- **Run:** `implement-spec spec=docs/tickets/21_PRB.05__triage-dispositions-gate-cards.md`

## Goal
Deciding the review: the five-verb triage flow writing the response ledger, the beta's one-tap
reason codes, and the Approval cards (all beta-relevant gate kinds) with the presence-timer and
policy behaviors — on desktop and phone widths from the same contracts.

## Load
- Spec §5.7 (dispositions write the response ledger; rationale rules — rebut/escalate only; defer
  pre-fills "Not this round"; adapt opens the editable suggestion; pre-triage as
  highest-precedence guidance; freeze-at-delivery with forward links; keyboard scope rules;
  REQ-IDE-27/28), §6.4 (card anatomy items 1–8: pre-filled Approve, Approve-and-run-autonomously,
  Keep planning, Wait for me, Stop; presence timer REQ-SPEC-18; per-project approval policy;
  standing-guidance capture REQ-GATE-10), REQ-BETA-6 (`reason_code` one-tap, never required),
  §10.1/§10.3 (phone-width: gate actions + five dispositions with a note — REQ-SPEC-20's input
  set; Accept copy "applied at revision time"), REQ-WF-9/10 (user dispositions never overridden;
  Approve triage waits).
- Beta note: dossiers >30 findings get "Let the Drafter propose a triage" as the advertised path
  (§5.7 Drafter-proposes-first; the *triage-mode queue UI* with J/K etc. is P1.7 — the beta uses a
  plain sequential list with next-undecided).

## In scope — deliverables
1. **Disposition UI:** five verbs on each finalized finding; inline rationale field for
   rebut/escalate; adapt's editable pre-filled suggestion; defer pre-fill; reversible until
   freeze; pre-triage before a Revise run passes as guidance ("you pre-triaged N of M");
   `reason_code` chips (wrong · stylistic_disagreement · already_knew · too_costly ·
   not_this_round · other) on every disposition, optional (REQ-BETA-6).
2. **Approve-triage card:** the ledger as the disposition UI; escalations pinned first; primary
   button **Approve proposals**; per-row overrides written with `actor: user` and serialized back
   via P0.10's overlay flow; waits by default with the per-project 24-h opt-in (§6.4 R3 row).
3. **Gate cards, one component, all beta kinds** (`approve_triage`, `approve_scope` informational +
   blocking cases, `approve_sample` (Quick Voice has none, but Full-Profile-gated later — render
   generically), `confirm_cost`, `spend_overrun`, `resume_partial`, `refusal`): artifact, deadline
   or "waiting for you", do-nothing sentence, cost so far + remaining, the five actions, countdown
   with pause-while-reading, presence timer display (REQ-SPEC-18), standing-guidance checkbox.
4. **Phone-width layer:** the §10.1 input set (gate actions, dispositions with a note, no bulk) on
   the same components/contracts (REQ-SPEC-20).
5. **Escalations → a minimal Decisions list** (beta Inbox stand-in) for `escalate` dispositions,
   obligation-horizon arrivals and stall escalations (P0.12 feeds; §5.11's full Inbox is P1.19).

## Out of scope
- Triage-mode queue chrome, Margin, clustering, bulk-with-one-preview, Apply (P1.7 — Apply needs
  the editor's working head; the beta's CodeMirror path treats suggestions as Accept-at-revision).
- Email delivery of gate actions (PRB.09). Plan/scope structured field *editing* (P1.9 —
  Approve plan is a Draft-workflow gate, deferred with Draft).

## Acceptance criteria
- [ ] Disposition rows write ledger entries with actor/rationale per the §5.7 rules; frozen at
      delivery; each row links forward to its move once PRB.06 lands (interface asserted now)
      (REQ-IDE-27). *(deterministic)*
- [ ] Pre-triage dispositions reach the Revise run as highest-precedence guidance and are never
      overridden by the run (REQ-IDE-28; REQ-WF-9 fixture through the overlay path).
      *(deterministic)*
- [ ] Approve-triage card: overrides serialize into the response-ledger file the Revise phase reads
      (live fixture via P0.10). *(deterministic)*
- [ ] Presence timer shows 10-min countdown only for auto-proceed gates with the project focused
      and the artifact unread; wait-default gates never show it (REQ-SPEC-18). *(deterministic)*
- [ ] Reason codes optional everywhere; no disposition path requires text except rebut/escalate
      (REQ-BETA-6; REQ-MOBILE-11 rule). *(deterministic)*
- [ ] Phone-width: approve/wait/stop and all five verbs with a note work at 375 px from the same
      components (REQ-SPEC-20). *(deterministic)*

## Requirement IDs to satisfy and stamp in the PR
REQ-IDE-16 (amended, card anatomy), REQ-IDE-27, REQ-IDE-28, REQ-GATE-2 (UI half), REQ-GATE-5 (triage
half), REQ-GATE-7, REQ-GATE-10 (capture UI), REQ-SPEC-18 (UI half), REQ-SPEC-20 (gate/disposition
half), REQ-WF-9, REQ-WF-10, REQ-BETA-6, REQ-PROD-4.

## Cross-cutting invariants — re-check before opening the PR
- Approvals are cards with deadlines, never blocking modals (principle 3).
- The user edits decisions; edits reach the files the next phase reads (REQ-SPEC-9 path).
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
This ticket owns the disposition UX contract the full IDE's triage mode (P1.7) extends. Keyboard
chords land there; here plain buttons + next-undecided suffice for 20–50-finding Essay dossiers
(the Quick cap keeps beta volume bounded — REQ-SPEC-7's cap is protocol data already).
