# PRB.12 — Beta analytics, event catalogue, weekly dashboard

- **Sequence:** 28 of 50
- **Phase:** RB — Review beta (last beta ticket; feeds milestone gate G3)
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** every PRB ticket (instruments their surfaces), P0.08 (events), P0.11 (margin data)
- **Run:** `implement-spec spec=docs/tickets/28_PRB.12__beta-analytics-and-dashboard.md`

## Goal
The point of the beta: instrumentation. The §3.5 analytics event catalogue for the beta's surfaces
plus the REQ-BETA additions (reason codes, move tracing, lineage, dwell, imports, WTP), the
account balance chip / usage glance, and the weekly beta dashboard that reads out the REQ-BETA-18
gate metrics.

## Load
- Spec §3.5 (event catalogue adopted by reference from **design/9 §7.2** — open it; envelope
  `{user_id, workspace_id, project_id?, run_id?, protocol_id?, tier, surface}`; the §3.5 named
  additions; REQ-PROD-15: every run event carries `cost_actual, cost_estimate, rigor`; analytics
  honor the opt-out; REQ-PROD-16 weekly report), REQ-BETA-2 (beta north star), REQ-BETA-5…13
  (additions + dashboard: repeat-cycle rate, round-2 rate, accept+adapt, second-read yield,
  rubric-delta, reason codes, per-run margin, gate metrics), §14.5 level-0 balance chip (beta
  usage glance), §16.3 #2 (approval-latency instrumentation).

## In scope — deliverables
1. **Event pipeline:** intake/storage/query for the typed events whose **schemas P0.02 owns**
   (design/9 §7.2 catalogue + §3.5 additions + REQ-BETA-6…12 shapes) — this ticket builds the
   pipeline and dashboard, audits that every beta surface emits its catalogued events (emission
   lives with the emitting tickets: PRB.02/03/05/06/08), and documents the exclusions that don't
   exist at beta (`triage.mode_entered`, `finding.applied`).
2. **Opt-out honored** end-to-end (REQ-PROD-15; the Settings toggle may be minimal at beta but must
   exist and bind).
3. **Balance chip + usage glance** (level 0–1 minimal): spendable credits, held on hover; per-run
   cost on run rows (data from P0.11).
4. **Weekly beta dashboard** (REQ-BETA-13, REQ-PROD-16): generated from the stream — repeat-cycle
   rate (the north-star counter, REQ-BETA-2/9), round-2 rate, accept+adapt share, second-read
   yield, rubric-delta distribution, reason-code distribution, per-run gross margin (proxy-metered
   cost vs credits), gate metrics (approval latency, auto-proceed share, cancel rate,
   boundary-attestation failures); rendered against the pre-registered REQ-BETA-18 thresholds so
   the G3 readout is mechanical.

## Out of scope
- The full four-level usage dashboard, CSV exports, flags (P1.16). Marketing analytics (P1.17).
- The REQ-BETA-18 gate *decision* (milestone G3, operator) and partner interviews (human rows).

## Acceptance criteria
- [ ] Event-schema tests: every beta surface emits its catalogued events with the envelope; run
      events carry `cost_actual/cost_estimate/rigor` (REQ-PROD-15). *(deterministic)*
- [ ] Each REQ-BETA-6…12 event has a fixture proving payload shape (their listed ACs).
      *(deterministic)*
- [ ] Opt-out: a flagged account's events are excluded from the stream (REQ-PROD-15).
      *(deterministic)*
- [ ] Dashboard renders every REQ-BETA-18 gate metric from seeded event data, side-by-side with the
      registered thresholds (REQ-BETA-13). *(deterministic)*
- [ ] The dwell heartbeat documents (in the ticket PR) the accepted chat-half blindness and the
      interview/paste-back recovery plan (REQ-BETA-10). *(deterministic — documentation check)*

## Requirement IDs to satisfy and stamp in the PR
REQ-BETA-2 (definition), REQ-BETA-5, REQ-BETA-6…13 (schemas + dashboard; emission points live in
the tickets named above), REQ-PROD-15, REQ-PROD-16 (beta form), §3.5 catalogue (beta subset; five
contracts rule — design/9 §7.2 opened and applied).

## Cross-cutting invariants — re-check before opening the PR
- Telemetry never carries prompt or tool content (REQ-VIS-11); events carry IDs and template text.
- The failure mode to refuse: "beta as marketing preview" — this dashboard exists so the gates are
  read, not vibes (§17).
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
After this ticket the beta can open (milestone: partners onboarded — human row; gates
pre-registered — REQ-BETA-18). The full-IDE epics tagged `post-beta` wait for G3; see the manifest.
