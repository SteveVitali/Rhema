# PRB.12 — Beta analytics, event catalogue, weekly dashboard

**Spec:** `docs/tickets/28_PRB.12__beta-analytics-and-dashboard.md` (REQ-BETA-2, REQ-BETA-5,
REQ-BETA-6…13, REQ-PROD-15, REQ-PROD-16, §3.5 catalogue/design/9 §7.2, §14.5 level 0–1, §16.3 #2)
· **Base:** `stevevitali/prb-11-export-and-ai-use` · **Stacked PR — do not merge
(mergePolicy=OPERATOR).** · **PR #40**

## Summary

The point of the beta: instrumentation. This ticket builds the analytics *pipeline* end to end —
the typed catalogue + client intake + validated sink + opt-out + the domain→stream projector —
and the weekly REQ-BETA-18 readout an operator runs with `rhema admin beta-report`. The beta can
now open knowing every gate metric is measured, not vibes.

The catalogue (design/9 §7.2 + §3.5 additions + the REQ-BETA-6…12 shapes) lives in
`@rhema/contracts` behind `parseAnalyticsEvent`; `recordAnalyticsEvent` is the ONE validated write
boundary — schema check, opt-out drop, and (new, migration 0024) `dedupe_key` idempotent intake.
`materializeRunAnalytics` projects server-owned domain facts (runs, steps, gates, consents, voice,
revisions, deliveries, ledger) into the stream with `mat:*` dedupe keys, so the projection is
replayable and the owning surfaces keep their live emitters. `BETA_EMISSION_AUDIT` classifies
every catalogued event `emitted` | `materialized` | `beta_absent`; a repo-scanning test holds the
map honest (each emitted file must contain the event literal; each web-emitted event must be on
the client whitelist — that guard caught a real bug: `voice.staleness_shown` was emitted through
the intake without being whitelisted → would have 403'd and dropped silently).

The client mint (`POST /analytics/events`) accepts only `CLIENT_ANALYTICS_EVENTS` — view/dwell/
timer signals the server cannot observe itself. Server-owned facts (run lifecycle, billing,
imports/exports) are never client-forgeable — a 403. The session principal owns the envelope; the
client cannot speak for another user.

## REQ-BETA-10 — the dwell heartbeat and its documented blindness (AC5)

`surface.dwell` rides every authed page as a ~20-line beacon (`renderDocument` emits it when a
page names its `dwellSurface`): it posts `{surface, ms}` to `POST /a/dwell` every 30 s while the
tab is visible and once on hide; the web server wraps it into the whitelisted mint (surface
truncated to 40 chars, ms clamped to an hour — the beacon is lossy by design).

**The accepted blindness:** the beta has **no chat half** — the surfaces are dossier/editor/
settings/project, and `surface.dwell` therefore measures *web-surface* dwell only. Anything the
partner does in a conversation (an interview, a paste-back loop, off-platform reading) is
invisible to this stream. That blindness is accepted for beta, documented here per the ticket's
AC5, and carried into the dashboard render ("Dwell (surface.dwell — web surfaces only; no chat
half exists at beta)").

**The recovery plan:** (a) HUMAN-H3 partner interviews — the weekly readout pairs the mechanical
dwell numbers with the operator's interview notes, so the chat-side signal comes back as
qualitative data rather than pretending the beacon sees it; (b) paste-back instrumentation — when
the interview/paste-back loop exists, it emits its own catalogued events through the same
whitelist intake; the audit map is where those get registered (`beta_absent` rows carry their
reasons today, so the recovery is a row flip, not a redesign).

## What changed

- **`@rhema/contracts`** — `analytics.ts`: `runEconomicsSchema` extended onto every `run.*` event
  (`cost_actual`/`cost_estimate`/`rigor` — REQ-PROD-15); `REASON_CODES` (the REQ-BETA-6 one-tap
  enum); the REQ-BETA-7…12 shapes; `CLIENT_ANALYTICS_EVENTS` whitelist;
  `BETA_GATE_THRESHOLDS` — the pre-registered REQ-BETA-18 registry (verbatim values, floor/
  ceiling/exact + proceed/stop clause).
- **`@rhema/db`** — `0024_analytics_dedupe.sql`: `analytics_events.dedupe_key` + a partial unique
  index (`ON CONFLICT … DO NOTHING` — the projector's idempotent intake) + Drizzle parity.
- **`@rhema/ledger`** — `analytics.ts` gains `at` (the projector stamps the source fact's
  timestamp, so a backfilled event lands in its own week) + `dedupeKey`;
  `analytics-query.ts` (`listAnalyticsEvents`/`countAnalyticsEventsFor` — the read seam re-joins
  `"user"` so a flagged account's history exits every read, not just future writes);
  `beta-dashboard.ts` (`materializeRunAnalytics` domain→stream projector;
  `computeBetaDashboard` — every REQ-BETA-13 metric: repeat-cycle rate, round-2 rate,
  accept+adapt share, second-manuscript import, paid conversion, median stated WTP, approval
  latency, auto-proceed share, cancel rate, boundary-attestation failures, second-read yield,
  per-run gross margin, reason-code + rubric-delta distributions, dwell by surface;
  `renderBetaDashboard` — every gate metric beside its registered threshold + the mechanical
  proceed/stop readout); `emission-audit.ts` (`BETA_EMISSION_AUDIT`).
- **`apps/api`** — `analytics-routes.ts`: `POST /analytics/events` (whitelist mint; the server
  fills the envelope from the session; malformed payload → 422, opted-out → `{recorded:false}`,
  client `dedupeKey` → `cli:*` idempotent retry), `GET|POST /settings/privacy` (the toggle that
  binds `analytics_opt_out`); `billing-routes.ts` gains `heldCredits` + `GET /billing/usage`
  (the §14.5 level-1 glance: balance + the account's recent runs' spend); `admin-cli.ts` gains
  `beta-report` (materialize the window → render; a tripped stop clause exits nonzero);
  live emitters added where this ticket owns the surface: `voice.created` (voice-routes),
  `draft.imported` (import), `project.exported` (export-routes) — all post-commit, non-fatal.
- **`@rhema/api-client`** — `postAnalyticsEvent`, `getPrivacySettings`, `setAnalyticsOptOut`,
  `getUsage`, `heldCredits` on the balance DTO.
- **`@rhema/ui`** — `BalanceChip` (§14.5 level 0: spendable in the label, held on hover, links to
  `/usage`).
- **`apps/web`** — `/settings` (the REQ-PROD-15 toggle — checkbox posts "on" when sharing is on;
  the flag is the inverse) + `/usage` (the level-1 glance) routes and pages; the dwell beacon in
  `renderDocument`; `POST /a/dwell` the sink; server-side view emissions the whitelist exists
  for — `run.report_viewed`/`finding.viewed`/`secondread.opened` on the dossier,
  `gate.presence_timer_shown` on live-countdown gate cards, `voice.staleness_shown` on the
  banner; the balance chip rides the `/app` nav.

## Design decisions

- **The catalogue is the contract, the projector is the backfill.** Live emitters stay in their
  owning surfaces (the ticket's own rule); `materializeRunAnalytics` covers everything whose
  emitting surface is 1.x or whose fact is a DB row — with `mat:*` dedupe keys so a re-run is a
  no-op. `beta_absent` rows document why an event cannot fire at beta (incl. the ticket's named
  pair, `triage.mode_entered` + `finding.applied`).
- **Opt-out is two-sided.** Write-side: `recordAnalyticsEvent` checks the flag before inserting
  (the absence IS the honor). Read-side: `listAnalyticsEvents` re-joins `"user"` — flipping the
  flag hides history from every read, which is what "removes your events from every report"
  promises on the Settings page.
- **The gate decision is not ours.** `beta-report` renders observed vs registered threshold and a
  mechanical proceed/stop readout; REQ-BETA-18's actual call belongs to the human beta review
  (G3). A tripped stop clause exits the CLI nonzero so the week is impossible to miss.
- **Telemetry is never fatal.** Every live emission is post-commit fire-and-forget: a validation
  or DB failure is logged, never a failed request (fixtures with non-ULID ids exercise exactly
  this path).
- **No content in payloads.** Every event carries ids, enums, counts, template labels — never
  prompt/tool/draft text (REQ-VIS-11 / REQ-ARCH-33).

## Out of scope (as specced)

The four-level usage dashboard, CSV exports, usage flags (P1.16); marketing analytics (P1.17);
the REQ-BETA-18 gate *decision* (G3, operator) and the partner interviews themselves (HUMAN-H3).

## Test plan

- **AC1** `packages/contracts` — every `run.*` schema declares the three economics keys; the
  whitelist is a strict catalogue subset. `packages/ledger` emission-audit — every event
  classified exactly once; every `emitted` file contains the literal (fs scan); every web-emitted
  event is whitelisted; the named exclusions carry reasons.
- **AC2** `packages/contracts` — a payload-shape fixture per REQ-BETA-6…12 event
  (`finding.disposed` reason codes, `revision.move_traced`, `rereview.lineage`,
  `round.completed`, `surface.dwell`, `draft.imported`, `wtp.recorded`,
  `credits.exhausted_prompt`).
- **AC3** `packages/ledger` + `apps/api` — opted-out writes return `recorded:false` with no row;
  the read seam excludes flagged accounts' history; the Settings toggle round-trips the flag.
- **AC4** `packages/ledger` — seeded PGlite fixture → materialize → compute → render: all nine
  gate metrics beside their registered thresholds; materializer idempotent on replay.
- **AC5** — this section above (the dwell heartbeat's documented blindness + recovery plan).
- Gates: `turbo build lint typecheck` **111/111**; `pnpm test` **1920 pass / 2 skip / 265 files**;
  `check:protocol-markers` OK; `check:licenses` OK (502 pkgs, zero new deps);
  `check-build-memory.sh` 0 violations. **No live/dev execution — the live `beta-report` leg is
  D-PRB.12-1.**
