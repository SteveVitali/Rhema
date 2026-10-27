<!--
  docs/build/readouts/HUMAN-H11.md (BM-INDEX-03) — append-only readout for the round-6
  marker 190a_HUMAN-H11__operator-session-2.md. Operator session 2: post-deploy browser/money
  legs + content/legal approvals. Approvals recorded as the operator's verbatim words;
  secrets and real identifiers are never recorded.
-->
# HUMAN-H11 — Operator session 2 — readout

- **Criterion (verbatim, `190a_HUMAN-H11__operator-session-2.md`):** "Each item ticked in the
  readout with its date and evidence pointer. Approvals are recorded as the operator's verbatim
  words." Blocks 194_R6CNT.2 (essay pick + content approvals) and 197a_GATE-LAUNCH (legal
  approval, the money legs, the exposure notice if any). "Withheld until done: each blocked
  ticket defers the named leg with 'H11 pending'."

> An operator or authorized human record supplies the decision; an agent must not sign or
> assume silence is approval.

## Disposition — **OPEN — approvals complete** (session presented 2026-10-23)

The session was presented at the R6POST.2 → GATE-R6B boundary. Items tick as the operator
reports them; verbatim approval words are appended verbatim below. Nothing here is inferred.
**2026-10-23:** all four approval items (A1–A4) discharged by the operator's verbatim words
(quoted per row below) — R6CNT.2's content gate is unblocked. Browser/money legs (B1–B12)
and the X-items remain pending — they withhold the legs the marker names, nothing else.

**2026-10-27 (R6H11 — the automatable browser legs ran on prod `e04a8c8`):** B6, B7,
B8, B9, B11, B12 discharged with real evidence under `docs/build/reports/2026-10-27_R6H11/`
(run ledger `docs/build/runs/R6H11.md`). Total metered spend **$0.259587** (single
Quick/Base R6 run on the is_test `jrn-a` tenant, funded by one audited `house-grant`
of 4000 cr; declared cap $4.50, run cap $5). Still operator-owed:
B1 (Google OAuth + 409 merge), B2–B4 (real-money Stripe), B5 (Safari caret),
B10 (real phone viewport). Two live defects surfaced: **F-R6H11-1** (restore apply
leaves the live collab doc unconverged — stored head correct, canvas resurrects
removed text) and **F-R6H11-2** (the deployed `run-task` image at `e04a8c8` lacks the
vendored agent SDK — **no run can execute on prod**; the R6 run parked at
`resume_partial` per design and was stopped via the UI gate card → `cancelled`, hold
fully released). F-R6H11-2 leaves the in-phase *meter-advance* half of B11's
acceptance owed (the feed/cursor/zero-reload mechanics are proven).

## Checklist — browser / money legs (flagged `is_test` accounts)

| # | Item | Status |
|---|---|---|
| B1 | Google sign-in interactive round-trip + 409 merge + revoked-grant (D-MAINT.4-1) | pending |
| B2 | Stripe **live** round-trip on a flagged tenant: hosted Checkout/Portal, 3DS/Radar, Tax (D-P1.16-1) | pending |
| B3 | Real-money purchase → `grant(topup)` — operator elected the **$10 top-up** path (D-BILL.3-1) | pending |
| B4 | Portal change-plan + pending-email (D-BILL.3-2) | pending (follows B3) |
| B5 | Safari/WebKit caret walking (D-EDIT.1-2) | pending |
| B6 | Source-editor mode-switch + typed round-trip (D-PRB.07-1) | **done** (2026-10-27, prod `e04a8c8` — journey T17 green; `reports/2026-10-27_R6H11/t17-source-editor/`) |
| B7 | Versions rail (D-P1.08-1) | **done** (2026-10-27, seeded writable dossier `h11-q6vqlg`: rail chips + ⚑ chip + diff + restore preview/apply w/ undo point — `reports/2026-10-27_R6H11/r6h11-adhoc-all.json` + b7-*.png; live defect F-R6H11-1 filed: apply leaves the collab doc unconverged) |
| B8 | PUT override + standing note + dismiss + gate card (D-P1.09-1) | **done** (2026-10-27 — `?approvals=saved` persist + `?approvals=invalid` refusal + guidance add/retire `active:false` + explainer dismiss persists + `data-gate-card` in the Needs-you sheet — same report) |
| B9 | Settings walk on a throwaway account (D-P1.20-1) | **done** (2026-10-27 — nine surfaces 200 + `defaultModelTier` write round-trip persisted via `/bff/settings/preferences`; email-change/support/delete legs stay operator-owed per D-P1.20-1) |
| B10 | Real-phone ~375–390 px legs (D-P1.19-2) | pending |
| B11 | EventSource live-feed chip on a live run (D-PRB.04-2 browser half) | **done** (2026-10-27 — real `EventSource` `…/events?after=11` observed on the wire during live run `01M5XTD893J1F5SKMXCHSS32VH`; `[data-live-feed]` + 10 feed rows + zero document loads over a 210 s watch; cursor advanced `?after=2→22` across reconnects through the whole lifecycle incl. the `resume_partial` park + user `stop` → `cancelled`, terminal card + "stopped by you" decision line observed live; `reports/2026-10-27_R6H11/b11-feed/` — caveat: in-phase meter ticks unexercised under F-R6H11-2, still owed there) |
| B12 | Leg-cap reconciliation (BL-69) | **done** (2026-10-27 — declared $4.50 cap/headroom vs measured `usage_records.list_cost_usd` $0.259587 for run `01M5XTD893J1F5SKMXCHSS32VH` (12 proxy rows, 36 cr, preflight only); ISO-week flagged-tenant non-fixture total $0.259587 ≤ $5 run cap; `runs/R6H11.md` gap table) |

## Checklist — approvals (verbatim words recorded on tick)

| # | Item | Status |
|---|---|---|
| A1 | Legal pages (R6LGL.1): placeholders filled — values supplied by the operator 2026-10-23: entity **"Rhema Labs"** (operator caveat recorded verbatim: *"We don't have a legal entity yet. But we can perhaps just use 'Rhema Labs' or something"* — the pages name an unregistered trade name as the contracting entity; operator decision, on record), jurisdiction **NY, NY**, contact **contact@rhema.tools** — text approval verbatim: *"I pre-approve whatever text you generate now"* → `approved: true` set by R6CNT.2 on the generated pages | **done** (2026-10-23, values + pre-approval recorded) |
| A2 | H4 venue stamps (R6CNT.1 (a)) approved — evidence `docs/build/reports/2026-10-21_R6CNT.1/h4-venue-evidence.md`; operator verbatim: *"I also approve A2, A3, and A4"* | **done** (2026-10-23) |
| A3 | Sample-dossier content (R6CNT.1 (c)) approved — proposal `docs/build/reports/2026-10-21_R6CNT.1/sample-dossier-proposal.md`; same verbatim words as A2 | **done** (2026-10-23) |
| A4 | Showcase essay picked — the recommended pick **H.G. Wells, "The Extinction of Man"** (the shortlist's recommendation; operator approved A4 with the same verbatim words as A2 — recorded as the recommended pick absent a different named choice; a different pick can be ruled before R6CNT.2's run dispatches) | **done** (2026-10-23, recommended pick) |
| A5 | Exposure notice text — **DISCHARGED 2026-10-21** under `GD-EXPOSURE-NOTICE.R6` ("Approve as drafted"); verdict YES recorded; the send stays a named R6CNT.2 mutation | **done** (2026-10-21) |

## Items added by downstream verification (2026-10-22/23)

| # | Item | Status |
|---|---|---|
| X1 | `rhema-nonprod-stripe-secret` absent from nonprod Secret Manager — R6POST.2 verified NOT_FOUND against the H10 attestation ("provided: yes"). Seed an `sk_test` value there for the N9 leg / D-SPA.16-1 / D-SPA.20-1. | pending |
| X2 | Prod invite for D-SEC.2-1 — H10 attested the mint, but `RHEMA_INVITE_CODE` never reached the environment and prod `invites`=0 (R6POST.1 verified). Mint an `invites` row (code + email + expiry) and hand the code out of band. | pending |
| X3 | Standing operator items carried from this drive: `rhema:opsAlertWebhookUrl` + a Monitoring channel (F-R6OPS.1-1); the proxy MIG×2 ILB design ruling (D-R6INF.1-1). | open — decisions, not session-blocking |
