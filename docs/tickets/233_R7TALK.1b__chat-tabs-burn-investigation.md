# R7TALK.1b — Findings/Claims tabs show the latest delivered review + chat-turn burn-vs-cap investigation

- **Sequence:** 233 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 232_R7TALK.1a, for the right-panel tabs as restyled there and the
  `debitedCredits` field this investigation reads against. It also consumes 213_R7COPY.0's single
  counting rule (REQ-SYNC-2), which is in the R7b base because the stack forks after 213 (P4-16).
  225a's primitives are reached through 232. This row merges after 224 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/233_R7TALK.1b__chat-tabs-burn-investigation.md`
- **Gate status:**
  - [ ] **(optional, unticked)** A read-only prod query of the R5 B6 turns' `usage_records`,
    `credit_ledger` and run `capCredits` rows. It is **not** pre-authorized: no GD covers prod
    reads for this ticket. The ticket completes without it, using code, deterministic
    reproduction and committed evidence. If the worker judges it necessary, the orchestrator
    pauses for the operator.
  - There is no money-mode change of any kind (root gotcha 5).
- **Live stage:** Stage A only ($0: unit, DOM and PGlite/integration tests plus a local build).
  $0 inference.
  - No owned preview (`GD-PREVIEW.R7`). The TALK-4 Stage-B walk is staging-verified at the R7b
    phase preview (250_R7DEP.2) through a DEFERRALS row, and prod Stage B rides 250.
  - Any need for a live preview outside 224's and 250's windows → PAUSE for the operator.
- **Production mutations:** none
- **Size budget:** ~400 changed lines excl. generated/fixtures (S–M). Entry-delta allowance
  ≤ 15 kB gz (REQ-KIT-5), with the actual figure stated in the PR.

## Goal
Two "one truth" fixes on the chat side of the right panel.
- **TALK-4.** The Findings and Claims tabs stop saying "No findings yet" on a project whose record
  holds a delivered review [B17]. They show the latest delivered review, labelled
  "From Review of vN". The empty state appears only when no review was ever delivered.
- **SYNC-6.** R5 B6's "16 / 5 cr" and "43/40 cr" turns are investigated, not just restyled
  (RV-21). The investigation determines whether metered burn exceeded the turn's `capCredits`, and
  what the ledger actually debited. It closes either as a REQ-SPEC-32 conformance finding with a
  pinning test, or as a dated DEFERRALS row with an owner.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md` §4.11 REQ-TALK-4; §4.14 REQ-SYNC-6 (and REQ-SYNC-1/2 as landed by
  213); §7 (economics evidence → BL-13); §8.2; root `AGENTS.md` gotcha 5.
- REVIEW RV-21. R5 `…/R5-ux-browser-audit.md` B6, B16 and B17.
- AGENTS: `packages/orchestrator/AGENTS.md`, `apps/egress-proxy/AGENTS.md` (the meter of record
  and the cap enforcer), `apps/api/AGENTS.md`.
- Money facts (read before claiming any mode is active):
  - `infra/config/stages.ts` ≈:287-292 (the `DEBIT_MODE` semantics) and ≈:474
    (`debitMode: "committed"`);
  - `docs/ops/playbooks/metered-debit-flip.md`;
  - the LEDGER activation records.

  In `committed` mode the debit is max(pod claim, metered catch-up). It is **not**
  min(metered, cap). That is the disclosed activation discrepancy (gotcha 5).
- Anchors (re-confirm at build time):
  - **Chat usage:** `apps/api/src/chat-routes.ts` ≈:237 `turnUsage` (a proxy `usage_records`
    sum) and the turn GET ≈:596.
  - **Cap enforcement and metering:** `apps/egress-proxy/src/{cap.ts,metering.ts}`.
  - **Debits:** `packages/ledger/src` (the cap-clamped debit; `credit_ledger`).
  - **What feeds the tabs:** the editor/dossier twins that feed the panel's Findings and Claims
    tabs. In `apps/web/src/server.ts` they are version-scoped; re-confirm the scoping.
  - **Tab bodies:** `packages/ui/src/{findings-desk.tsx,claims.tsx}`.
- 229/232 panel; `docs/tickets/00_MANIFEST.md` § Cross-cutting invariants and § Operating rules;
  `docs/tickets/DEFERRALS.md`; `docs/build/planning/2026-11-03_r7-demo/finding-map.csv`.

## In scope — deliverables
1. **TALK-4** [B17].
   - The Findings and Claims tab data is the **latest delivered review** for the project, whatever
     version is open.
   - The header label reads "From Review of vN" (from COPY) and links to that dossier.
   - Findings filed on an older version follow the existing follow-text rules, or are labelled
     "on vN".
   - Counts come from 213's single rule (REQ-SYNC-2).
   - The "No findings yet" / "No claims yet" empty states render only when the project never had
     a delivered review.
2. **SYNC-6 investigation** (A; RV-21).
   - Trace a chat turn's cap from run creation, through the proxy cap enforcer, to metering
     (`usage_records`) and the ledger debit, in both `committed` and `metered` code paths.
   - Reproduce the R5 B6 shape deterministically: a PGlite or integration fixture in which proxy
     burn exceeds `capCredits`.
   - Record whether the cap enforcer can let burn exceed the cap, and by how much and why, plus
     what the ledger debits in each mode.
3. **Close SYNC-6** with exactly one of these outcomes:
   - **(a) Conformance finding.** A test pins the debit rule for chat turns in the active mode
     (the clamp at the cap). The run ledger records how REQ-SPEC-32 holds or is disclosed under
     `committed`.
   - **(b) DEFERRALS row.** A dated row with an owner and an unblock condition. Its evidence is the
     reproduction.

   Either way: a `finding-map.csv` row (B6 → REQ-SYNC-6 → 233 → evidence), plus any economics
   evidence appended for BL-13 (§7). If the cause is a cap-enforcer bug, it is recorded and routed;
   no enforcement change is made here unless it is a one-line conformance fix covered by the
   existing tests and named in the PR.

## Out of scope
- Any money-mode change, any `debitMode` edit, any ledger write path change, and any pricing or
  plan change (spec §9; BL-13; gotcha 5).
- The chat thread and footnote rendering: 232. Dossier layout (REQ-PANE-5): 243.
- Timeline coherence on sub-routes (REQ-SYNC-3): 246.

## Acceptance criteria
- [ ] DOM tests pass for both states:
      - a project with a review delivered on v1, viewed at v3, shows "From Review of v1" with the
        v1 findings and claims;
      - a project with no delivered review shows the empty states.

      The counts equal 213's rule. *(deterministic · layer: engineered)*
- [ ] The tab data source is pinned by a twin/data test. It fails if the tabs revert to
      current-version-only. *(deterministic · layer: engineered)*
- [ ] The SYNC-6 reproduction fixture is committed and runs green in CI. The run ledger records
      the traced path, the observed overshoot, and the debited amount per mode, with file:line
      citations. *(deterministic · layer: engineered)*
- [ ] SYNC-6 is closed as (a) a conformance test that fails if the clamp is removed, or (b) a
      dated `DEFERRALS.md` row with an owner and evidence. The `finding-map.csv` row is written.
      *(deterministic · layer: engineered)*
- [ ] A check confirms that `infra/config/stages.ts` `debitMode` and the ledger write paths are
      unchanged in this PR. *(deterministic · layer: engineered)*
- [ ] **Stage B is staging-verified at the R7b phase preview (250_R7DEP.2)** (`GD-PREVIEW.R7`: no
      per-ticket preview). This ticket opens a dated `DEFERRALS.md` row (`D-R7TALK.1b-n`, owner
      250). The row names what 250 captures:
      - on a seeded project with a review delivered on an earlier version, the Findings and Claims
        tabs show "From Review of vN" at the preview SHA (`--expect-sha`);
      - screenshots of both tabs.

      The row also names the seed this needs: a delivered review on v1, with v3 open. Unblock:
      250's preview walk. Compensating control: the DOM and twin/data tests above.
      *(agentic · layer: engineered here; staging-verified and live-executed at 250)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-TALK-4, REQ-SYNC-6, REQ-KIT-5 (allowance). REQ-SPEC-32 is cited as the conformance target;
it is not amended.

## Cross-cutting invariants
- Manifest § Cross-cutting invariants 7 (the proxy is the meter of record; Σ debits ≤ cap), 14
  (money is truthful), 15 (scoped authority: no prod read without the operator), 12, 17.
- Spec §8: 2 (no money-mode change), 4, 5, 6 (DEFERRALS cells append-only), 7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.
  Operating rule 6 applies to any evidence: aggregates only, no PII.

## Notes
- **Decisions this ticket owns:**
  - the tab data source (latest delivered review) and its label;
  - the SYNC-6 disposition: finding or DEFERRALS row.
- **Shared decisions consumed:** the panel tabs (229/232); `debitedCredits` (232); the counting rule
  (213).
- **Recording, not acting.** If the investigation shows that REQ-SPEC-32's clamp is violated, that
  is a finding to disclose (gotcha 5). Do not "fix" it by changing a mode or a cap.
