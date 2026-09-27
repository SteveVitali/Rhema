# PRB.12 — Beta analytics, event catalogue, weekly dashboard

- **Spec:** `docs/tickets/28_PRB.12__beta-analytics-and-dashboard.md`
- **Base:** `stevevitali/prb-11-export-and-ai-use` @ `8400507`
- **Branch:** `stevevitali/prb-12-beta-analytics-and-dashboard`
- **Config:** implement-spec full preset (deterministic only — no live/dev execution)

## Deferrals read

`docs/tickets/DEFERRALS.md` read at start (PRB.11 pass opened `D-PRB.11-1` live export leg,
`D-PRB.11-2` Substack md profile; `D-PRB.08-*` Stripe live legs; `D-PRB.10-1` voice sample
approval UI). Findings:

- No `OPEN` row is unblocked by this ticket. PRB.12 consumes the analytics sink PRB.08 landed
  (`analytics_events`, `recordAnalyticsEvent`, `analytics_opt_out`) but exercises none of the
  outstanding live legs.
- Expected new deferral: **D-PRB.12-1** — live beta-report run on `dev` (the weekly readout is an
  operator CLI; the live leg can't run until a deployed beta environment has real telemetry).

## Requirements

1. Event pipeline: typed intake + validation + storage + query. `analytics_events` (0020) +
   `parseAnalyticsEvent` already exist; PRB.12 adds the session-authed client intake
   (`POST /analytics/events`, whitelisted client-mintable events), an idempotent dedupe key, a
   read seam (`listAnalyticsEvents`), and the domain→stream projector
   (`materializeRunAnalytics`) for run-domain events whose emitting surface is 1.x.
2. Emission audit: every catalogued event is classified `emitted` | `materialized` |
   `beta_absent` with a source or a reason; the two named exclusions (`triage.mode_entered`,
   `finding.applied`) carry documented beta-absent reasons; a repo-scanning test holds the map
   honest.
3. Opt-out end-to-end: `analytics_opt_out` write-boundary drop (exists) + a Settings toggle that
   exists and binds (web `/settings` → `POST /settings/privacy`; api `GET|POST
   /settings/privacy`) + read-side exclusion in the dashboard query.
4. Balance chip + usage glance (level 0–1 only): spendable credits always visible on authed
   pages, held credits on hover, per-run cost on run rows from P0.11 data
   (`runs.spent_credits`/`estimate_credits`); web `/usage` minimal page over api
   `GET /billing/usage`.
5. Weekly beta dashboard generated from the stream: north-star repeat-cycle rate, round-2 rate,
   accept+adapt share, second-read yield, rubric-delta distribution, reason-code distribution,
   per-run gross margin, gate metrics (approval latency, auto-proceed share, cancel rate,
   boundary-attestation failures), second-manuscript import rate, paid conversion, median stated
   WTP — every metric rendered beside its registered REQ-BETA-18 threshold with a mechanical
   proceed/stop readout. Operator surface: `rhema admin beta-report`.
6. REQ-PROD-15: every `run.*` analytics event carries `cost_actual`/`cost_estimate`/`rigor`
   (schema-level, all optional economics fields extended onto the run events that lacked them).
7. Out of scope honored: no four-level usage dashboard, no CSV export, no usage flags, no P1.16
   billing surfaces, no P1.17 marketing analytics, no gate decision itself, no interviews, no
   public signup, no efficacy/marketing claims.
8. PR body documents: (a) dwell-heartbeat chat-half blindness (no chat surface at beta →
   `surface.dwell` reports web surfaces only); (b) recovery plan = HUMAN-H3 partner interviews +
   paste-back instrumentation.

## Acceptance criteria

- AC1 — schema tests: every beta surface emits its catalogued events with the envelope; run
  events carry `cost_actual`/`cost_estimate`/`rigor`. *(deterministic — emission-audit fs scan +
  catalogue schema assertions)*
- AC2 — every REQ-BETA-6…12 event has a fixture proving payload shape through the write
  boundary. *(deterministic — PGlite round-trip per event)*
- AC3 — flagged account's events absent from the analytics stream (write-side drop + read-side
  exclusion). *(deterministic)*
- AC4 — the dashboard renders every REQ-BETA-18 gate metric from seeded event data, each beside
  its registered threshold. *(deterministic — seeded PGlite fixture → materialize → compute →
  render)*
- AC5 — PR body documents the dwell-heartbeat chat-half blindness and the
  interview/paste-back recovery plan. *(documentation)*

## Plan

- **`@rhema/contracts`** — `analytics.ts`: all `run.*` events extend `runEconomicsSchema`
  (REQ-PROD-15); `CLIENT_ANALYTICS_EVENTS` whitelist for the session intake;
  `BETA_GATE_THRESHOLDS` (the REQ-BETA-18 registry, verbatim values).
- **`@rhema/db`** — migration `0024_analytics_dedupe.sql` (`analytics_events.dedupe_key` +
  partial unique index — idempotent intake for the projector) + Drizzle parity.
- **`@rhema/ledger`** — `analytics.ts`: `dedupeKey` on the input, `on conflict do nothing`;
  `analytics-query.ts` (`listAnalyticsEvents`, opt-out read-side join);
  `beta-dashboard.ts` (`materializeRunAnalytics`, `computeBetaDashboard`,
  `renderBetaDashboard` markdown); `emission-audit.ts` (`BETA_EMISSION_AUDIT`).
- **`apps/api`** — `analytics-routes.ts` (`POST /analytics/events` whitelist intake;
  `GET|POST /settings/privacy`); `billing-routes.ts` (+`heldCredits`, `GET /billing/usage`);
  `voice-routes.ts` emits `voice.created`; `import.ts` emits `draft.imported`;
  `export-routes.ts` emits `project.exported`; `admin-cli.ts` gains `beta-report`.
- **`@rhema/api-client`** — `heldCredits`; `postAnalyticsEvent`; `getPrivacySettings` /
  `setAnalyticsOptOut`; `getUsage`.
- **`@rhema/ui`** — `BalanceChip` (spendable + held-on-hover, links to `/usage`).
- **`apps/web`** — `/usage` + `/settings` pages and routes; `surface.dwell` heartbeat beacon in
  `renderDocument` + `POST /a/dwell` sink; dossier render emits `run.report_viewed`/
  `finding.viewed`/`secondread.opened`; `gate.presence_timer_shown` on live-countdown gate
  cards; `voice.staleness_shown` on the banner; balance chip on the `/app` nav;
  `POST /settings/privacy` binds the toggle.

## Test matrix

- `packages/contracts/src/analytics.test.ts` — every `run.*` catalogue schema carries the three
  economics keys; client whitelist ⊆ catalogue; thresholds registry complete vs REQ-BETA-18.
- `packages/ledger/src/emission-audit.test.ts` — audit covers every catalogue event exactly
  once; `emitted` entries name a file containing the event literal (fs scan); `beta_absent`
  entries have a reason; the two ticket-named exclusions are absent-with-reason. **AC1.**
- `packages/ledger/src/analytics.test.ts` — REQ-BETA-6…12 fixtures round-trip with exact props
  (**AC2**); opt-out write-side drop + read-side exclusion (**AC3**); dedupe key no-ops a
  replayed insert.
- `packages/ledger/src/beta-dashboard.test.ts` — seeded fixture → every gate metric rendered
  beside its threshold (**AC4**); opted-out user's events absent from dashboard inputs (**AC3**);
  materializer idempotent.
- `apps/api/src/analytics-routes.test.ts` — intake accepts whitelist + rejects unknown/system
  events; privacy GET/POST flips `analytics_opt_out`; usage account returns per-run rows.
- `apps/web` — settings toggle POST binds; dwell snippet present; usage page renders.

## Status

**Done — PR #40** (stacked on `stevevitali/prb-11-export-and-ai-use`; not merged — operator
merges the chain bottom-up). All ACs green deterministically. Verification:
`turbo build lint typecheck` 111/111; `pnpm test` 1920 pass / 2 skip / 265 files;
`check:protocol-markers` OK; `check:licenses` OK (502 pkgs, zero new deps).
Self-review caught one real bug — `voice.staleness_shown`
was emitted via the web intake but missing from `CLIENT_ANALYTICS_EVENTS` (would have 403'd and
dropped silently); added to the whitelist + an audit-test guard now pins every web-emitted event
to the whitelist. PR body (`docs/build/pr/PRB.12.md`) carries the AC5 dwell-heartbeat
chat-half-blindness documentation + the interview/paste-back recovery plan. New deferral:
**D-PRB.12-1** (live `beta-report` run on a deployed beta environment).
