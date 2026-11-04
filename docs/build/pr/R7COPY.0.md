# R7COPY.0 — Retire the generated walkthrough; record-composed run card; one run state, one count

**Ticket:** `docs/tickets/213_R7COPY.0__record-composed-run-card.md` (seq 213/254) · **Base:**
`stevevitali/r7fix-1-pane-stopgap` @ `cef9baf` · **Branch:** `stevevitali/r7copy-0-run-card` @ `abc91db`
· **Requirements:** REQ-COPY-4, REQ-SYNC-1, REQ-SYNC-2 · **Ruling:** GD-UX-WALKTHROUGH.R7 "Retire it" →
ADR-130 (filled, Accepted) · **Stage A only ($0; no preview, GD-PREVIEW.R7)** · mergePolicy OPERATOR.

## What ships

- **Generated walkthrough retired end-to-end.** `packages/orchestrator/src/walkthrough.ts`,
  `apps/worker/src/walkthrough-generator.ts`, `RUN_JOBS.walkthrough`, the consumer + handler +
  `walkthroughModelKeySecret` env slot, the api's lazy post-delivery enqueue and
  `POST /runs/:id/walkthrough/retry`, the web/BFF retry form, `data.ts`/`api-client` `retryWalkthrough`,
  and RunCard's walkthrough block + `retry_walkthrough` action — all removed (a repo-grep test pins it).
  `runs.walkthrough` column and stored text stay, unread and unrendered (append-only); the `walkthrough`
  artifact/document kind stays. Queued-job handling: pg-boss expiry (recorded in ADR-130).
- **"What it delivered" is composed, not generated** (`composeDeliveredSummary`, pure —
  REQ-DWEB-15's replay can call it on snapshots): the letter's `one_thing`/Verdict slot's first
  paragraph quoted **verbatim** (no verdict section ⇒ no line, never a paraphrase), the counts, and
  dossier/letter/ledger links. Rendered on the Timeline card and the dossier card
  (`data-delivered-{summary,verdict,counts,links,link}` declared).
- **One count rule** (`deliveredRecordCounts`): a `strength`-slot row is a strength, never a finding —
  the Timeline chips, the dossier card, and the Margin stack chip all call it (R5 C5's "6 vs 5" is
  structurally impossible; a `strengths` chip exists).
- **One `RunSummaryView`** beside `RunCardView`: `TimelineRun extends` it; the dossier DTO carries
  `runSummary` built by the SAME SQL-fact assembly (`phasesForRun` + `buildRunCardView`) — the
  event-derived `deriveRunCardInput` card (C4's "Created · 0 cr" desync) and its `run_events` read are
  gone; the cards are asserted identical.
- **Ingest key decoupled**: `WALKTHROUGH_MODEL_KEY_SECRET` survives only as the legacy fallback name in
  `ingestModelKeySecret` resolution so every deployed stage resolves the same key (`env.test.ts` 4 legs).
- **ADR-130 filled**: decision + COGS −1 model call per delivered run (no money-mode change), pg-boss
  expiry, infra residue (`D-R7COPY.0-2`), golden classification — NOT protocol-affecting, files mapped.
  Dated banners on REQ-IDE-19 + DS §5.6 D20. `D-R7COPY.0-1` opened (Stage-B screenshots at 224); dated
  note on `D-RUN.1-2`.

## Verification

- `pnpm turbo build lint typecheck` — 135/135 green.
- `pnpm test` — 6,262 pass / 1 fail on first run: `check-coverage-matrix` cited the deleted generator
  files; `COVERAGE_MATRIX.csv` repointed to `delivered-summary.ts` (re-run green).
- Touched tests: findings-core (delivered-summary 5, run-card, timeline, surface) · ui run-card
  (composed block + absent-verdict) · api dossier+timeline (42 — incl. dossier card ≡ timeline card
  and two retired-route legs) · worker env (4) · `walkthrough-retired` repo grep (10) ·
  `run-state-parity.dom` (identical `data-run-state`/credits/phases on all three displays).
- Gates: `check:dom-contract` OK · `check:spa-env` OK · `check:spa-budget` OK · `check:no-cookies` OK ·
  `check:protocol-markers` OK · `check-append-only` + `check-build-memory` run at close.
- Money: no diff to `spend.ts`/`delivery.ts`/the ledger package; orchestrator + ledger suites green.

## Out of scope / carries

- Infra env residue (`WALKTHROUGH_MODEL_KEY_SECRET` binding + pin in `infra/pulumi`) → `D-R7COPY.0-2`
  (rides 224's deploy plan). Stage-B screenshots → `D-R7COPY.0-1`. No infra/money/preview changes here.
