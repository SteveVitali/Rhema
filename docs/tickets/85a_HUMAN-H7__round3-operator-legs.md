<!--
  HUMAN marker (BM-TICKET-05) — round 3 (launch readiness), inserted 2026-09-30 (ADR-013). Checkboxes are living
  state: tick with a date + evidence pointer. Not an implement-spec input; no run line.
-->
# HUMAN-H7 — Round-3 operator legs

- **Kind:** human · **Phase:** round 3 — launch readiness
- **Blocks:** none silently. It gates the named remainders of:
  - JOURNEY.1 (the test mailbox)
  - SEC.1 (the exposure review)
  - ECON.1 (the admin-key reconcile leg; the notice timing)
  - BILL.3 (a real purchase)
  - the tail's GATE-ACCEPT (pen-test disposition)

  A ticket that reaches its gated remainder first follows the DEFERRALS rule below. **Start now** — the row sits
  before the tail so GATE-ACCEPT reads it, not because it waits for the chain.

> **Operator work — NOT an `implement-spec` input.** These are actions only the operator can take: money,
> third-party credentials, procurement, and disclosure. They can start now and run alongside the chain. Each item
> names its backlog row (`docs/build/BACKLOG.csv`). Round 3's standing authorization (ADR-013) does **not** cover
> any item here.

## Checklist

- [ ] **Test mailbox for JOURNEY.1.** Provision a dedicated mailbox, record `provided: yes` only, and store the
  credential in Secret Manager or the CI secret store. The journeys sign test users in through the real magic-link
  flow; no session is ever minted.
- [ ] **Paid-account notice for the metered-debit flip (ADR-014).** Decide the notice period: REQ-BILL-2's 30-day
  spirit, or shorter given how few accounts pay. Then approve ECON.1's flip when it's due.
- [ ] **Exposure-window access review + disclosure decision (BL-37).**
  - Review access logs for the two cross-tenant windows:
    - the dossier route: from its deploy until 2026-09-25 ~22:14Z (STB.2)
    - `/voices`: from its deploy until SEC.1's deploy (2026-09-30 review, PR-S1)
  - Decide whether any disclosure is owed. SEC.1 supplies the query and the list of affected rows; the decision
    is yours.
- [ ] **Prod test-data cleanup (BL-38).** Decide the fate of:
  - the test draft v7 on `my-first-project` and the stray `deployments` provenance row
  - the 2026-09-30 review account `14stevevitali+rhema-review@gmail.com` with its two "The Library After Dark"
    projects
  - the review-test project in your own workspace

  MAINT.2 lists them; you authorize the deletes.
- [ ] **Live-mode Stripe re-verify (BL-33).** A real `api.stripe.com` purchase on the live key, the hosted UX,
  3DS, Tax, and test clocks. Real money: at your discretion, after BILL.3 lands.
- [ ] **Anthropic admin/org key for the Usage & Cost reconcile (BL-34).** Seed a real admin-scoped key into
  `rhema-prod-anthropic-admin-key` (provided: no today); ECON.1's reconcile leg then runs.
- [ ] **External penetration test (BL-35).** Procure a vendor using `docs/security/pen-test-vendor-package.md`, and
  triage its findings into DEFERRALS. GATE-ACCEPT records the disposition.
- [ ] **Nightly golden-run budget (BL-36).** Decide whether the ~$150–300/night live golden run on all four
  protocols is funded, or superseded by JOURNEY.1's weekly paid journey plus ECON.1's instrumented runs.
- [ ] **H3 / ADR-008 revisit (BL-39).** Decide whether the deferred partner program resumes once the funnel works
  (after ACT.1 and BILL.3).
- [ ] **Research-burst product ruling (BL-20).** A thread question that decomposes into zero external fetches dies
  at `plan` (D-DEF.1-1). Rule on it: a cheap non-research answer, a clarifying question, or a refusal. The chat_turn
  assertions follow the ruling.
- [ ] **Launch-verification remainder (BL-24).** The canary-injection pause smoke, a page on the alert channel,
  and the usercontent headers behind a CDN. Each needs an operator key or channel.
- [ ] **Real-device checks (BL-32 residual).** A pass on a real phone and a real desktop browser after UX.2. The
  automatable half of the operator browser session is JOURNEY.1's.
- [ ] **Standing items, not in round 3 (D5).** H2 corpus → G2 (`16b_HUMAN-H2`, `16c_GATE-G2`), H4 venue verification
  (`48a_HUMAN-H4`) and H5 Showcase essay + sample-dossier sign-off (`44a_HUMAN-H5`). They remain open, unchanged.

## Exit criterion

Every item above is ticked with a date and an evidence pointer, or explicitly re-deferred in LEDGER GATE DECISIONS.
GATE-ACCEPT at the end of round 3 lists whatever remains open.

## DEFERRALS rule for tickets that run before this completes

A ticket whose gated remainder depends on an unticked item here opens a `D-<TICKET>-<n>` row in `DEFERRALS.md`:
- **why deferred:** "H7 pending: <item>"
- **unblocked by:** "HUMAN-H7"
- **how to verify:** the check to run once the item is done

It then reports "gate pending" — never a failure, never a fabricated pass.
