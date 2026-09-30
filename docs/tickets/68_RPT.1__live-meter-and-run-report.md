# RPT.1 — A live meter that moves, and a run report that adds up

- **Sequence:** 68 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** money
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** EST.1, ECON.1
- **Scope (one line):** the run card's meter moves during a phase from provisional proxy-metered usage; the run report reconciles (spent = Σ debits, seat split = metered usage with any difference attributed, real phase durations, a populated per-request drill-down, server-computed flags); the seeded Showcase run leaves a new user's `/usage` history and its report is labelled a worked example.
- **Spec §§:** principle 6 ("live meter during"), 5.5 (run card — REQ-IDE-11), 12.7 (the proxy is the meter of record), 14.4 (accounting table), 14.5 (levels 1–4, flags), 15.3 (Showcase rules), Appendix A.9 note (REQ-SPEC-32(a))
- **REQ coverage:** REQ-BILL-9 (primary), REQ-BILL-6, REQ-BILL-8, REQ-IDE-11 (meter half), REQ-GROWTH-11 (usage half), REQ-SPEC-32(a) (display half) (stamp in the PR)
- **Absorbs (backlog):** BL-57 (PR-E4, PR-R3 — the during/after half)
- **Run:** `implement-spec spec=docs/tickets/68_RPT.1__live-meter-and-run-report.md`
- **Gate status:** none beyond the round-3 standing authorization (ADR-013); no backfill of historical `steps` rows (a one-off prod data write — operator-paused; historical rows render "—" instead); the Stage B run uses JOURNEY.1's funded test tenant + test mailbox (HUMAN-H7) — if unticked, the H7 DEFERRALS rule applies
- **Live stage:** Stage A: code + tests ($0). Stage B: deploy (pre-authorized if the preview is clean and migrations are additive) + one Quick/Base run on JOURNEY.1's ≤300-word fixture to watch the meter and read the report ≤$5 metered

## Goal
During the 2026-09-30 review the card's spend sat at 112 cr for 6+ minutes of verification (PR-E4), then the report
said "632 cr spent" beside "SEATS Editor — 1,625 cr (100%)", every phase "0 min", an empty "Advanced — per-request
detail", and the Showcase's fixture numbers as if real; a new user's `/usage` listed the seeded Showcase run as
"review · completed · 3,860 cr" (PR-R3). Principle 6 promises estimate before, **live meter during**, report after. This
ticket makes the "during" and "after" halves true: the meter moves with metered usage inside a phase, and the report's
figures reconcile with each other and with the ledger — in either ECON.1 debit mode.

## Load (read these — do not re-read others)
- `docs/build/planning/2026-09-30_planning-ledger.md` — row 68, § Shared decisions (ECON.1 owns debit mode / cost cards),
  § Journey step registry (R6).
- `docs/build/reports/2026-09-30_prod-design-review.md` — PR-E4, PR-R3, PR-E5 (the 632 vs 1,625 figures) and the
  2026-09-30 correction (the `/usage` row is the workspace's own Showcase run, not a leak).
- `docs/adr/ADR-014-…` §1 (what burn may be absorbed: the above-cap overrun, platform-fault refunds, the trial);
  ADR-015 (platform-fault refunds appear on reports); ADR-016.
- DEFERRALS row `D-P0.08-2` (the provisional `usage.tick` history — rendered today only at harvest).
- ECON.1's run ledger + ADR (its root cause of committed-vs-metered and the `debitMode` flag) — consume its finding.
- Spec §14.4 table, §14.5 (the four levels, the flags list, REQ-BILL-8/9), §5.5 run card, §15.3 Showcase rules.
- Code (anchors — re-confirm at build time):
  - `packages/orchestrator/src/internal-api.ts` ~815–817: the commit upsert writes `started_at` and `ended_at` from the same
    `now` (`$7,$7`) → every phase reports "0 min" (and `etaBandForPhases` never sees a real duration).
  - `packages/orchestrator/src/internal-api.ts` ~582–718 and `phase-loop.ts` ~121/150–200: `usage.tick` +
    `sdk_stream` row emitted **at harvest (phase end) only** — the meter is phase-granular.
  - `apps/egress-proxy/src/sinks.ts` ~58 `SqlUsageWriter`: a `usage_records{source:'proxy'}` row per metered response —
    the intra-phase signal of record.
  - `packages/findings-core/src/run-card.ts` ~252/375 (card consumes `usage.tick`), ~458 ETA.
  - `apps/api/src/timeline-routes.ts` ~528–680 (the report route): `spentCredits` from `runs.spent_credits`; the usage
    aggregate ~558–575 sums `usage_records` **across every `source`** (`proxy`, `sdk_stream`, `sdk_estimate` — migration
    0002 ~222) — a hypothesis for the inflated seat total; refunds from `run_events cost.refunded`; `?advanced=1` ~533/672.
  - `packages/findings-core/src/run-report.ts` `buildRunReport` ~197–283 (seat split from usage; `spentCredits` passed
    through), `reportFlags` ~134–190, `buildRunReportAdvanced` ~286.
  - `apps/web/src/server.ts` ~3637–3680 + `apps/web/src/pages.tsx` ~2554 (report page; the Advanced disclosure);
    `apps/web/src/copy.ts` ~1920/1936.
  - `apps/api/src/billing-routes.ts` ~147–172: the `/billing` usage runs list `from runs where workspace_id = $1` — no
    `projects.showcase` exclusion (migration `0037_showcase.sql`); the project-level usage read (§14.5 level 2).

## In scope — deliverables
1. **Intra-phase meter** (REQ-IDE-11, principle 6): while a phase runs, the card's "spent N / cap M" advances from
   provisional usage at a bounded cadence (owned decision → ADR: e.g. a sweep over `usage_records{source:'proxy'}` per
   running run, or a proxy-side publish), rendered through the same rate table as the proxy; the committed figure
   replaces it at harvest; the provisional figure never exceeds the cap line and is labelled provisional. Test tenants and
   real tenants alike; events carry counts and credits only (manifest #10).
2. **Real phase durations:** `steps.started_at` records the phase's actual start (the pod's phase start / first harvest),
   `ended_at` its commit; the report, the run card's committed-step ETA and the §14.5 level-4 table read them. Historical
   rows whose `started_at = ended_at` render "—", not "0 min" (no backfill).
3. **Reconciled report** (REQ-SPEC-32(a) display; REQ-BILL-8): "spent" = Σ the run's ledger debits − refunds (the charged
   figure); the seat split sums the **meter of record** (`source='proxy'` only — confirm or refute the all-sources
   hypothesis with a fixture) and is labelled as metered usage; when metered ≠ charged the report states the difference
   by reason (§14.4 cap overrun absorbed · platform-fault refund · trial entitlement · the pre-flip modelled debit if
   ECON.1's flag is still off) — owned decision on wording → ADR; the two figures never contradict silently.
4. **Flags server-computed** from the reconciled figures with templated sentences (REQ-BILL-9): `over_estimate` /
   `under_estimate` against the frozen estimate (REQ-BILL-6), `fact_check_dominated`, `discourse_map`, `retries`, … —
   no flag computed from provisional or double-counted usage.
5. **Advanced — per-request detail** populated: root-cause the empty disclosure (route param, web fetch, or rows with no
   `step_id`/phase) and render phase × seat × model tier × credits × duration × searches × fetches, tokens only here
   (REQ-BILL-8/10).
6. **Showcase out of usage history** (REQ-GROWTH-11 usage half): the seeded Showcase run is excluded from account usage
   (level 1 `/usage`, the billing runs list, totals and CSV) and from spend aggregates; opened from the Showcase project,
   its report carries a "Worked example — illustrative figures" label, never presented as the user's spend.

## Out of scope
- Every pre-run figure (sheet, Timeline, protocol cards, pricing), the tier control, the initial ETA prior — **EST.1**.
- The committed-vs-metered root cause, `debitMode`, the flip — **ECON.1**; the platform-fault refund class and the
  *Unverified* label — **RES.2**; the user refund window — **DEF.4**.
- Event-delivery latency SLO — **SLO.1**; the walkthrough job failure — **RUN.1**; dossier rendering — **HOT.1**.

## Acceptance criteria
- [ ] A phase-loop/integration test with three metered proxy responses inside one phase observes ≥ 3 ascending
      provisional `usage.tick` payloads before the phase commits; removing the intra-phase source fails it. *(deterministic)*
- [ ] A committed step's `ended_at − started_at` equals the fixture phase's real duration; the report renders it in
      minutes; a legacy row with equal timestamps renders "—". *(deterministic)*
- [ ] For fixtures covering under-cap, capped (absorbed overrun), refunded, trial-entitlement and pre-flip runs, the report's
      spent equals Σ debits − refunds from the ledger, the seat split sums the proxy-sourced metered usage, and every
      difference carries its reason line; a fixture with `sdk_stream`/`sdk_estimate` rows does not change the seat total. *(deterministic)*
- [ ] Flags are computed server-side with templated sentences only from reconciled figures (fixture per flag). *(deterministic)*
- [ ] `?advanced=1` returns non-empty level-4 rows for a run with metered usage, and the web disclosure renders them. *(deterministic)*
- [ ] A new workspace's `/usage`, billing runs list, totals and CSV contain no Showcase run; the Showcase report shows the
      worked-example label. *(deterministic + live on the test tenant)*
- [ ] **Journey step R6 green** on the deployed stage via the JOURNEY.1 harness: on the ≤300-word fixture run the card's
      meter shows ≥ 2 distinct spent values within a single phase, and the run report's spent equals Σ debits (cross-checked
      read-only against the ledger in the run ledger); expected-red flag flipped; screenshots committed. *(agentic — live, ≤$5)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-BILL-9, REQ-BILL-6, REQ-BILL-8, REQ-IDE-11 (meter half), REQ-GROWTH-11 (usage half), REQ-SPEC-32(a) (display half).

## Cross-cutting invariants
- Manifest #7 (the proxy is the meter of record; Σ debits ≤ cap; never silent billing — the report never implies a
  charge that did not happen), #10 (ticks and report rows carry ids, counts and credits — never prompt text), #12
  (REQ-SPEC-29 — R6 by walking it; deployed provenance = chain-tip SHA), #13 (REQ-SPEC-30 — the meter sweep, if it runs on
  the system pool, reads with an explicit run/workspace predicate and never serves a user request; the report stays on
  the user-serving pool), #14 (REQ-SPEC-32 — the report is truthful about metered vs charged).

## Notes
- **Owned decisions → write ADRs:** (a) the intra-phase meter source and cadence; (b) how the report words a
  metered ≠ charged difference per reason (the §14.4 "you were not charged for the overrun" line is the precedent).
- **Shared decisions consumed:** ECON.1 (debit mode, what counts as absorbed); RES.2 (the platform-fault refund's
  ledger reason code — the report attributes it); EST.1 (the frozen estimate the flags compare against).
- The steps-timing fix also makes the run card's committed-step ETA real (EST.1 fixed only its initial prior) — say so
  in the PR so the two halves are traceable.
- `D-P0.08-2` is resolved by RCN.1 for the harvest path; this ticket adds the intra-phase half — annotate that row with a
  dated note rather than reopening it.
- **DEFERRALS rule:** anything not verifiable at build time or blocked on HUMAN-H7 becomes a `D-RPT.1-<n>` row.
