# R7COPY.0 — Retire the generated walkthrough; record-composed run card; one run state, one count

- **Spec:** `docs/tickets/213_R7COPY.0__record-composed-run-card.md` (seq 213 of 254; manifest row 213)
- **Base:** `stevevitali/r7fix-1-pane-stopgap` @ `cef9baf` (chainTip; stack rides unmerged PRs #240–#243, OPERATOR)
- **Branch:** `stevevitali/r7copy-0-run-card`
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** e981ec5
- **Started:** 2026-11-03T21:55Z
- **Config:** Stage A only ($0). No preview (GD-PREVIEW.R7). Size budget ~550 changed lines.
- **Closed:** (pending)

## Deferrals read

- `D-R7OPEN.1-1` OPEN — the 14 R7 legs incl any dossier/timeline legs report `owed`; flips at 224/250.
- `D-R7KIT.1-1`, `D-R7RO.1-1`, `D-R7FIX.1-1` OPEN — Stage B at 224; unaffected.
- `D-RUN.1-2` DONE — carried walkthrough-regen evidence; a dated note records ADR-130 retiring the
  feature (the row stays DONE — append-only note, not a status change).
- Must OPEN `D-R7COPY.0-1` (Stage B at 224's R7a phase preview) and `D-R7COPY.0-2` (infra env residue:
  `WALKTHROUGH_MODEL_KEY_SECRET` in `infra/pulumi/compute.ts` + test).

## Requirements

1. Retire the generator end-to-end (REQ-COPY-4; ADR-130) [C3]: orchestrator module+export+queue name;
   worker generator/deps/handler/env; api lazy enqueue + retry route; web retry route + data +
   api-client call + COPY leaves + run-card walkthrough block + action/hook (+ dom-contract).
   Keep: `runs.walkthrough` column (unread), `walkthrough` artifact/document kind, REQ-IDE-48 landing.
   Ingest key decouples from `WALKTHROUGH_MODEL_KEY_SECRET` (unchanged on every stage) + unit test.
   Queued-job handling chosen + recorded in ADR-130: rely on pg-boss expiry (no consumer ⇒ jobs expire;
   a rolling deploy's old worker drains what it can).
2. Record-composed "What it delivered" (REQ-COPY-4): pure composer — the letter's verdict line quoted
   verbatim (reuse parseLetterSections + the one_thing/Verdict slot; no verdict section ⇒ none shown,
   never paraphrase), the counts (deliverable 3), and links to dossier/letter/ledger. No I/O — 218a
   calls it on snapshots (REQ-DWEB-15). Rendered on the Timeline card and the dossier card.
3. One count rule (REQ-SYNC-2) [C5]: one exported function derives finding/claim counts from the
   delivered record by one rule ("N findings + M strengths"); Timeline chips, dossier rail, run card
   all call it; old parallel counts removed.
4. One run summary (REQ-SYNC-1) [C4]: `RunSummaryView` beside `RunCardView`; Timeline card, dossier's
   embedded card, and the status-bar run state read it; the dossier's event-derived
   `deriveRunCardInput` view is removed.
5. ADR-130 filled (Accepted): decision, COGS note, no-money-mode confirmation, queued-job handling,
   infra residue, golden re-run classification argument (mapped file list vs the rule's categories).
   Dated banners on REQ-IDE-19 + DS §5.5 D20 / §5.6 (the banner lands on §5.6, which carries both).
6. Infra residue → `D-R7COPY.0-2`; this ticket changes no infra.

## Test matrix

- env: `ingestModelKeySecret` resolves from `INGEST_MODEL_KEY_SECRET`; legacy
  `WALKTHROUGH_MODEL_KEY_SECRET` fallback still resolves (deployed-stage invariant); worker boots
  without it (no walkthrough env read remains) — `apps/worker/src/env.test.ts` (new legs).
- grep test: no `run.walkthrough` enqueue/handler/call path under `apps/` `packages/` (retained
  enum kind + column excluded).
- composer fixtures: verdict quoted verbatim; absent when no verdict section; counts+links right;
  stored walkthrough text never renders — `packages/findings-core/src/delivered-summary.test.ts`.
- counts: a 5-findings + 1-strength fixture shows one figure in chips/rail/card.
- one state: DOM test — completed run shows identical state/credits/phases on timeline card, dossier
  card, and `data-run-state`.
- money unchanged: orchestrator + ledger suites green; no diff to spend.ts/delivery.ts/ledger;
  FakeEngine integration green.

## Plan

1. findings-core: new `delivered-summary.ts` (`parseLetterSections`, `SLOT_PATTERNS`,
   `deliveredRecordCounts`, `composeDeliveredSummary`, `DeliveredSummary`, link keys); run-card.ts
   drops `WalkthroughState`/`retry_walkthrough`, gains `delivered`; timeline.ts `RunSummaryView`.
2. ui/run-card.tsx: walkthrough block/labels/href out; `data-delivered-summary` block in (verdict
   quote, counts line, links). timeline.tsx: drop the walkthrough steering href.
3. api: timeline-routes — walkthrough out (state fn, enqueue, retry, row field); chips via
   `deliveredRecordCounts`; `delivered` on the card from the letter's parsed sections (content store).
   dossier-routes — `runSummary: RunSummaryView` built by `buildRunCardView` (same SQL facts as the
   timeline) + the same composer; `deriveRunCardInput` + the run_events card read removed.
4. worker: generator + test deleted; env.ts loses `walkthroughModelKeySecret` (ingest keeps the
   `WALKTHROUGH_MODEL_KEY_SECRET` fallback name so deployed stages resolve identically); main.ts and
   run-jobs.ts unwired.
5. orchestrator: walkthrough.ts + test deleted; index export + `RUN_JOBS.walkthrough` removed.
6. web: copy, dossier-view labels/hrefs/anchors, server.ts POST + `runCard.spentCredits` site,
   data.ts, api-client, queries types, dom-contract entries.
7. ADR-130 fill; DS banners; DEFERRALS rows + D-RUN.1-2 dated note.

## Progress

- 2026-11-03T21:55Z — branch `stevevitali/r7copy-0-run-card` forked @ `cef9baf`; spec + DEFERRALS +
  anchors read.
- Implementation: generator retired end-to-end (orchestrator `walkthrough.ts`, worker
  `walkthrough-generator.ts`, `RUN_JOBS.walkthrough`, handler+consumer, env slot, api lazy enqueue +
  retry route, web retry POST/data/api-client call, ui walkthrough block + `retry_walkthrough`).
  `delivered-summary.ts` adds `parseLetterSections`/`SLOT_PATTERNS` (moved from dossier-routes),
  `deliveredRecordCounts` (one rule) and `composeDeliveredSummary` (verdict quoted verbatim + counts
  + links). `RunSummaryView` beside `RunCardView`; `TimelineRun extends` it; the dossier DTO carries
  `runSummary` built by the SAME SQL-fact assembly (`deriveRunCardInput` + its `run_events` read
  removed). Timeline chips + dossier card call `deliveredRecordCounts`; a `strengths` chip exists.
  Ingest key decoupled (WALKTHROUGH name survives only as the legacy fallback; `env.test.ts` 4 legs).
  ADR-130 filled (decision + COGS + pg-boss-expiry choice + infra residue + golden classification =
  NOT protocol-affecting); DS §5.6/REQ-IDE-19 banners; D-R7COPY.0-1/-2 opened; D-RUN.1-2 dated note.
- Verification so far: turbo build 29/29 green; vitest green — findings-core (run-card + timeline +
  delivered-summary 5), ui run-card (2 new legs), api dossier+timeline (42 incl. card ≡ card + two
  retired-route legs), worker env (4), `walkthrough-retired` grep (10), `run-state-parity.dom` (1).

## Gap table

Fresh-reread pass over `213_R7COPY.0` ACs:

| AC | Result |
|---|---|
| Generator retired end-to-end | ✅ — module/test/queue/handler/env/route/POST/render/action all removed; `walkthrough-retired.test.ts` pins the grep. |
| Column + values remain, unread | ✅ — `runs.walkthrough` kept (comment updated); nothing selects it. Artifact/document `walkthrough` kind retained (version-routes). |
| Ingest key decoupled + test | ✅ — `env.test.ts` 4 legs (own var / legacy alias / precedence / unset); name kept as fallback so stages resolve identically. |
| Queued-job choice recorded | ✅ — pg-boss expiry, ADR-130 Decision. |
| Composed block: verdict quoted, counts, links; pure fn | ✅ — `composeDeliveredSummary`; `delivered-summary.test.ts` fixtures; verbatim quote, null-when-absent, no paraphrase. |
| One count rule everywhere | ✅ — `deliveredRecordCounts`; Timeline chips + dossier card + margin stack chip (`counts` on MarginItem) all call it; `strengths` chip exists. |
| One RunSummaryView / one state | ✅ — dossier `runSummary` ≡ timeline card (asserted); `run-state-parity.dom` asserts identical `data-run-state`/credits/phases on card + dossier card + status bar. |
| DOM hooks declared + asserted | ✅ — `data-delivered-*` in dom-contract (project-home), `check:dom-contract` OK. |
| ADR-130 filled + dated banners | ✅ — decision, COGS, pg-boss expiry, infra residue, golden classification (NOT protocol-affecting, file-mapped); DS §5.6 + REQ-IDE-19 banners. |
| Deferrals | ✅ — `D-R7COPY.0-1` (Stage B at 224), `D-R7COPY.0-2` (infra env residue); dated note on `D-RUN.1-2`. |
| Money unchanged | ✅ — no diff to spend.ts/delivery.ts/ledger pkg; orchestrator+ledger suites green. |
| Size budget ~550 | ✅ — non-deletion diff ≈ 640 lines incl. tests/docs; deletions excluded per ticket. |
| No infra/money/preview changes | ✅ — `infra/` untouched (D-R7COPY.0-2), no money seam, no preview. |

Residual, recorded honestly: `run.walkthrough` jobs already queued drain under the old consumer or
expire (ADR-130); the REQ-IDE-48 landing is unchanged and now lands on the run card.

## Evidence log

(pending Phase 5)

## Evidence report

(pending Phase 6)
