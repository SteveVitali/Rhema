# PRB.09 — Email notifications with signed one-click actions

- **Sequence:** 25 of 50
- **Phase:** RB — Review beta
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** P0.10 (gate events + reminders), P0.08 (run events), PRB.01 (accounts)
- **Run:** `implement-spec spec=docs/tickets/25_PRB.09__email-notifications.md`

## Goal
The beta's off-desk channel: SES email for the §5.11 event classes the beta has, with **signed
one-click *Wait for me* and *Open* links (never Approve)**, reminder cadence, collapse-per-run, and
server-side per-event-type preferences.

## Load
- Spec §5.11 (notification matrix rows that exist at beta: approval waiting — email if unresolved
  after 15 min with signed links; auto-proceed T−10 reminder; spend gate; run finished/failed;
  auto-proceeded decision + cost — email on by default; credits thresholds; one notification per
  event per channel; collapse key = run id; deep links; preferences per event type, server-side —
  REQ-IDE-47, REQ-ACCT-1), §10.4 N-class semantics where they bind email (quiet hours never delay
  gates/spend), REQ-SPEC-20 (approval emails carry signed one-click Wait-for-me / Open; never
  Approve — REQ-MOBILE-10's rule applied to email), §17 beta row ("email notifications with signed
  actions").

## In scope — deliverables
1. **Mailer worker** (`mail.send` jobs, SES): templated emails, IDs-and-template-text only (no
   finding/draft text beyond titles per the §10.4 payload rule's spirit — document the choice),
   deep links to the beta surfaces.
2. **Signed actions:** single-use, expiring signed URLs for *Wait for me* (`POST /gates/:id/hold`)
   and *Open*; **no Approve action in any email**.
3. **Cadence:** gate-opened email if unresolved after 15 min; reminders at 1 h and 10 min before
   expiry; auto-proceeded decisions emailed with the decision and its cost (on by default);
   run finished/failed; credit 50/80/100% alerts.
4. **Preferences:** per-event-type, server-side, with the two non-configurable rows (spend gate;
   trial/payment — the latter mostly dormant at beta) enforced (REQ-ACCT-1); one notification per
   event per channel; collapse per run.

## Out of scope
- In-app Inbox (P1.19), push/mobile (1.x), product-update emails, hourly digests (P1.19).

## Acceptance criteria
- [ ] Gate lifecycle fixture: open → 15-min unresolved email with working signed Wait-for-me link
      (single-use; reuse fails); reminder timing correct; resolution cancels pending sends.
      *(deterministic)*
- [ ] No email template contains an Approve action or renders one (template test). *(deterministic)*
- [ ] Auto-proceeded gate emails the decision and cost by default (review 12 #9 rule).
      *(deterministic)*
- [ ] Preference matrix honored; non-configurable rows cannot be disabled via API. *(deterministic)*
- [ ] Signed links expire and are bound to gate + account (tamper test). *(deterministic)*

## Requirement IDs to satisfy and stamp in the PR
REQ-IDE-47 (email half), REQ-ACCT-1, REQ-SPEC-20 (email half), REQ-GATE-8, REQ-MOBILE-10 (rule as
applied to email actions).

## Cross-cutting invariants — re-check before opening the PR
- Approve is never a remote one-click action; spend gates never auto-proceed and never lose their
  notification (REQ-SPEC-1).
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
P1.19 adds the in-app Inbox and toasts on the same event stream; the mobile app (1.x) adds push via
`NotificationTransport`. Templates live with `packages/contracts` note-template discipline.
