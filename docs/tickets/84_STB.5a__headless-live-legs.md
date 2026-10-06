# STB.5a — Headless live legs ($0) on the journey harness: dossier surfaces, export, notifications, ingest, purge

- **Sequence:** 84 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** ops
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** ECON.2, JOURNEY.1, SEC.1, OPS.1
- **Scope (one line):** execute the $0 live legs of BL-21 (dossier surfaces on an own-tenant delivered Review, plus the authed `getDossier` render) and BL-22 (the export, notification, ingest and purge legs) as JOURNEY.1 journey steps on test tenants, and close or sharpen the six source DEFERRALS rows with live evidence. No product code unless a leg exposes a defect (a defect becomes a new row, not a fix here).
- **Spec §§:** 5.7 (findings surface; Apply, bulk preview), 4.2 (deep links), 5.11 (Inbox, badge, quiet hours, Decisions rows), 9.3 (staleness from facts), 9.5 (re-sync, AC-I-A), 13.4 (export, citeproc, account zip), 13.5 (journeys), 8.4 (REQ-ARCH-33)
- **REQ coverage:** per row — REQ-IDE-23, REQ-IDE-24, REQ-IDE-29, REQ-SPEC-6, REQ-IDE-25, REQ-PROD-2, REQ-OBJ-6, REQ-IDE-2, REQ-IDE-47, REQ-ACCT-1, REQ-ACCT-3, REQ-INGEST-6, REQ-PERSONA-13, REQ-ARCH-33, REQ-SPEC-29 (stamp in the PR)
- **Absorbs (backlog):** BL-21 (D-P1.07-1, D-PRB.04-1), BL-22 (D-P1.18-1, D-P1.19-1, D-P1.15-1, D-P1.04-2)
- **Run:** `implement-spec spec=docs/tickets/84_STB.5a__headless-live-legs.md`
- **Gate status:** $0 inference. Requires HUMAN-H7's test mailbox (JOURNEY.1's prerequisite). A hand-dated row on **prod** (the 7-day-expiry and tombstone+30d legs) is a one-off prod data write and is operator-paused; the ticket prefers the honest clock or `dev`. Otherwise within the round-3 standing authorization (ADR-013).
- **Live stage:** Stage A adds the journey steps and helpers, with their own tests ($0). Stage B runs them against prod on test tenants (and `dev` for any hand-dated leg, if OPS.1 left it up). $0 inference: no new run is launched by this ticket.

## Goal
STB.2 and STB.3 left these six rows PARTIAL. There were three reasons:
- **STB.2:** the only delivered dossier lived in a foreign workspace, and reading it exposed the cross-tenant hole.
- **STB.3:** the own-tenant memo Review died at `second_read` (§4-F2, since fixed by DEF.1), so no own-tenant dossier
  existed.
- **The batteries themselves:** they asserted HTTP 200s with a session lifted from the prod DB, which ADR-016 now
  retires.

This ticket re-executes every owed leg the way a user meets it: in a browser, on JOURNEY.1 test tenants, asserting
visible text and actionable controls with committed screenshots. Every leg becomes a **permanent journey step owned by
STB.5a**, so it keeps running on the right cadence after the ticket closes. It spends nothing:
- The delivered Review it reads is one that ECON.2's ON arm or the weekly paid journey already produced.
- Every other leg is a $0 action: an export Job, an email, a sync from a committed zip, a disposition.

## Load (read these — do not re-read others)
- `docs/tickets/DEFERRALS.md` rows **D-P1.07-1**, **D-PRB.04-1**, **D-P1.18-1**, **D-P1.19-1**, **D-P1.15-1**,
  **D-P1.04-2** (each full line — the "Still owed" residual is the contract), and BACKLOG.csv BL-21/BL-22.
- JOURNEY.1's ADR + `packages/journeys` (step registry format, expected-red flag, test-tenant flagging/purge policy,
  magic-link mailbox reader, screenshot convention, nightly vs weekly cadence).
- `docs/build/runs/STB.2.md` (§9.2 export/presign evidence) and `docs/build/runs/STB.3.md` (§4 F2/F9, the notification
  and ingest evidence) — what is already proven, so it is not re-run.
- **Surfaces:**
  - `apps/web/src/server.ts`: ~3519 `/p/:project/review/:runId`; ~3798 disposition; ~3853 apply; the
    `/p/:slug/f/:fid` deep link; the palette's "New obligation…"
  - `apps/api/src/dossier-routes.ts`, `finding-routes.ts`, `triage-routes.ts`, `notification-routes.ts`,
    `export-routes.ts`, `account-export-routes.ts`, `ingest-routes.ts`
  - `apps/worker/src/deletion.ts` (the `project.purge` grace consumer)
  - `scripts/check-protocol-markers.mjs` (the REQ-ARCH-33 marker set to reuse)
- ECON.2's run ledger (the held ON-arm Review: tenant, project slug, run id).

## In scope — deliverables
1. **BL-21 / D-P1.07-1 — dossier surfaces** (REQ-IDE-23/24/29, REQ-SPEC-6, REQ-OBJ-6). All legs run on an own-tenant
   delivered Review:
   - The Margin renders cards and chips with the severity-weight × kind-hue marks.
   - The Desk findings table filters, and links the selection to the Margin.
   - A disposition with a note round-trips across a reload.
   - **Apply** on a suggestion-bearing finding lands `suggestion_applied` provenance plus an `accept·applied` row,
     visible as a new head.
   - The bulk preview shows its per-item checklist.
   - `/p/:slug/f/:fid` lands on the dossier anchor.
   - The palette's "New obligation…" files a `source:'user'` row that appears in the obligation summary.
2. **BL-21 / D-PRB.04-1 — the authed dossier render** (REQ-IDE-25, REQ-PROD-2). `/p/:project/review/:runId`, signed in
   as the owning test user, renders every one of these from the delivered rows:
   - the letter
   - the claim ledger, with fetched ✓ chips joined to the real `fetch_log` (post-CITE.1 parity)
   - the second read
   - the rubric
   - the findings
   - the trust chip from the real `access_report`
   - the version obligation summary

   The foreign-tenant 404 half is SEC.1's two-tenant probe (step X1). Cite its evidence; do not duplicate it.
3. **BL-22 / D-P1.18-1 — export and account** (REQ-ACCT-3, REQ-ARCH-33). Already proven by STB.2 (not re-run):
   md/pdf/html/docx/latex/rtf/txt and the presigned zip download. Owed here:
   - (b) one `--citeproc` export of a test project carrying a CSL-JSON bibliography, with the rendered citations
     asserted
   - (c) the account-zip round trip: `POST /account/export` → the emailed link (read through JOURNEY.1's mailbox) →
     download → `POST /account/import` into a **fresh** test account → a project and voice parity spot-check → a
     re-import reports `deduped`
   - (d) the 7-day expiry: `GET` past `expires_at` answers 410 (the clock rule is in the Notes)
   - (e) REQ-ARCH-33: no protocol, rubric or skill marker appears in any exported artifact or in the zip, checked by
     scanning with `check-protocol-markers`'s marker set
4. **BL-22 / D-P1.19-1 — notifications** (REQ-IDE-2/47, REQ-ACCT-1, REQ-OBJ-6, REQ-PERSONA-13). Already proven by
   STB.3 (not re-run): the terminal-transition rows, delivery rows and signed-action replay. Owed here:
   - (a) the Inbox badge counts only approvals and decisions, and a `?gate=` click-through lands on the focused gate
     card
   - (b) quiet hours defer a `run_finished` notice (the row lands with `visible_at` = the window's end, and is
     invisible until then), and **never** a gate or spend row
   - (d) a Decisions row resolves through its real obligation transition: re-defer re-parks it via
     `routeDisposition`, and drop moots it via `mootObligation`. The cheapest $0 trigger is an Escalate disposition
     with a note on the held Review's finding.
   - (e) a voice made stale by a fact change (a new sample added — REQ-PERSONA-13 computes staleness from facts)
     shows as an Inbox group-3 row, and the Monday digest claims it once
5. **BL-22 / D-P1.15-1 — AC-I-A re-sync** (REQ-INGEST-6). On a test voice:
   - sync a committed Substack-export fixture zip through `substack_export`
   - re-sync the same items with only `updated_at` touched
   - assert **zero** new `sample_versions`, and that the diff renders "no changes"

   Fetches and conversion are $0. No priced reconstruction runs.
6. **BL-22 / D-P1.04-2 — purge at tombstone + 30 days.**
   - Delete a test project and assert the `project.purge` job is scheduled at tombstone + 30 days.
   - Assert the rows are hard-deleted and the object prefix is removed once the grace window passes. The clock rule
     is in the Notes.
7. **Step registration.** Each leg is a journey step owned by STB.5a, with its cadence:
   - nightly ($0) where the fixture persists
   - weekly, after the paid journey delivers, where a delivered Review is needed
   - once, clock-scheduled, for the expiry, purge and digest legs

## Out of scope
- **STB.5b:** every paid leg (BL-16–19).
- **HUMAN-H7:** BL-20 (research-burst ruling) and BL-24 (launch-verification remainder).
- **SEC.1:** the foreign-tenant probe (X1).
- **UX.2 / HUMAN-H7:** the phone-width smoke (D-P1.19-2 sits under BL-32).
- **Fixing any defect a leg exposes:** it becomes a new `D-STB.5a-n` row, routed to a new ticket or a round-3 owner.
- **Launching any run:** if no suitable delivered Review exists, the leg waits for the next weekly paid journey.

## Acceptance criteria
- [ ] Each leg in items 1–6 is a registered journey step (owner STB.5a) that asserts visible text and an actionable
      (enabled, unobscured) control, never HTTP status alone, and commits a screenshot. The step helpers have unit
      tests. No step obtains a session except through JOURNEY.1's magic-link flow (ADR-016). *(deterministic)*
- [ ] **D-P1.07-1:** all seven dossier-surface legs pass on the held own-tenant Review. The row flips to **DONE** with
      the run id, the step names and the screenshots. If no suggestion-bearing finding exists, Apply stays PARTIAL
      with a dated note that it waits on the next weekly paid journey. *(agentic)*
- [ ] **D-PRB.04-1:** the authed render shows all seven dossier parts from the real rows, including fetched ✓ chips
      that match `fetch_log`. The row flips to DONE. *(agentic)*
- [ ] **D-P1.18-1:** citeproc, the account-zip round trip into a fresh test account (parity + `deduped`) and the
      REQ-ARCH-33 scan (zero markers) pass. The 7-day 410 passes, or is clock-scheduled with its fire date. The row
      flips to DONE, or stays PARTIAL with only the clock leg owed. *(agentic)*
- [ ] **D-P1.19-1:** badge + `?gate=`, quiet-hours deferral (and non-deferral of a gate), the Decisions-row re-defer
      and drop transitions, and the stale-voice group-3 row pass. The Monday digest is asserted, or clock-scheduled.
      *(agentic)*
- [ ] **D-P1.15-1:** the `updated_at`-only re-sync produces zero new `sample_versions`. The row flips to DONE.
      *(agentic)*
- [ ] **D-P1.04-2:** the purge job is scheduled at tombstone + 30 days, and live destruction is evidenced — on `dev`
      via a hand-dated tombstone, or on prod by the clock. The row flips to DONE, or records its fire date and the
      scheduled assertion. *(agentic)*
- [ ] Deployed provenance equals the chain-tip SHA. Metered spend attributable to this ticket is $0: `usage_records`
      shows no new run from its tenants. Every defect found is a new `D-STB.5a-n` row with its evidence. *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-IDE-23, REQ-IDE-24, REQ-IDE-29, REQ-SPEC-6, REQ-OBJ-6 (D-P1.07-1). REQ-IDE-25, REQ-PROD-2 (D-PRB.04-1).
REQ-ACCT-3, REQ-ARCH-33 (D-P1.18-1). REQ-IDE-2, REQ-IDE-47, REQ-ACCT-1, REQ-PERSONA-13 (D-P1.19-1). REQ-INGEST-6
(D-P1.15-1). REQ-SPEC-29 (the legs as journey steps). The live-verified status is stamped against the original
owners' ids; none of them is re-implemented here.

## Cross-cutting invariants
- **#12 / REQ-SPEC-29:** every leg is walked in a browser with visible-text and actionable-control assertions and
  screenshots. Headless HTTP batteries with lifted sessions are retired (ADR-016).
- **#13 / REQ-SPEC-30:** all legs run as test users on their own tenants. The fresh-account import proves no row
  crosses tenants. This ticket adds no tenant read; if a helper needs one, it extends SEC.1's probe.
- **#3 / #10:** the REQ-ARCH-33 scan over the exported artifacts, and notification payloads that carry ids and
  templated strings only.
- **#6:** Apply writes a new head; the delivered dossier stays write-once. **#11:** no leg creates a run.

## Notes
- **Owned decision — the clock rule for time-dependent legs (write an ADR).** This covers the 7-day expiry, the
  tombstone + 30-day purge and the Monday digest. In order of preference:
  - **(i)** Run it on `dev` with a hand-dated row, if OPS.1 left `dev` up. That is not a prod write.
  - **(ii)** Use the honest clock on prod. Create the object now, register a once-only clock-scheduled journey step
    for its fire date, and exempt that test tenant from JOURNEY.1's auto-purge until the step asserts.
  - **(iii)** A hand-dated prod row only with the operator's tick, because it is a one-off prod data write.

  A leg left on the clock is a `D-STB.5a-n` row naming its fire date and step. It is never reported as a pass.
- **Owned decision — step cadence** (item 7). It is recorded in the same ADR.
- **The delivered Review** is ECON.2's held ON-arm Review. If it is gone or lacks a suggestion-bearing finding, use
  the latest weekly paid journey's delivered Review. Re-confirm it survives the purge window. Never launch a run.
- **Consumed:** JOURNEY.1 (harness, sessions, test tenants, mailbox), SEC.1 (X1 probe evidence), OPS.1 (`dev`),
  CITE.1 (chip parity), ECON.2 (the held Review).
- **Anchors to re-confirm at build time:** the route lines above; how quiet hours are set per user (`quietHours` in
  the prefs schema, `packages/contracts/src/notifications.ts` ~63–97); where the Substack-export fixture zip lives
  (`packages/ingest` fixtures).
- **DEFERRALS:** each source row gets an appended dated note (never rewritten) — DONE with evidence, or PARTIAL with
  the exact residual. Update the stale "Owner: STB.2/STB.3" pointers by note.
