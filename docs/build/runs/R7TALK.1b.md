# R7TALK.1b — Findings/Claims tabs show the latest delivered review + chat-turn burn-vs-cap investigation

- **Spec:** `docs/tickets/233_R7TALK.1b__chat-tabs-burn-investigation.md`
- **Base:** `stevevitali/r7talk-1a-chat-panel` @ `1e614f30` (chain tip; PRs #240–#270 unmerged per OPERATOR)
- **Branch:** `stevevitali/r7talk-1b-tabs`
- **Config:** implement-spec full rigor; Stage A only ($0 — unit/DOM/PGlite + local build; no preview, GD-PREVIEW.R7)
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** e981ec5
- **Started:** 2026-11-06T02:52Z

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (root gotcha 1). No OPEN row is unblocked by this
ticket: the R7b-leg rows (D-R7SHELL.1a/1b/1c-1, D-R7PANE.1-1, D-R7SHELL.2-1, D-R7RELOAD.1-1,
D-R7TALK.1a-1/-2, D-R7OPEN.1-1 remainder) all ride **250_R7DEP.2**'s phase preview — unchanged.
This run opens `D-R7TALK.1b-1` (Stage-B tab evidence at 250).

## Requirements

- **TALK-4** [B17]: Findings/Claims tabs render the **latest delivered review** for the project on
  any version/surface; header "From Review of vN" links to that dossier; findings on an older
  version follow follow-text rules or label "on vN"; counts = 213's `deliveredRecordCounts`
  (REQ-SYNC-2); empty states only when no review was ever delivered.
- **SYNC-6** [RV-21; B6 "16 / 5 cr", "43/40 cr"]: trace chat-turn cap → proxy enforcer → metering
  → ledger debit in `committed` + `metered` paths; deterministic reproduction (burn > cap);
  record overshoot + debited per mode; close as (a) REQ-SPEC-32 conformance test or (b) DEFERRALS row.
- `finding-map.csv` row (B6 → REQ-SYNC-6 → 233 → evidence) + BL-13/BL-101 economics evidence.
- Check that `infra/config/stages.ts` `debitMode` + ledger write paths are unchanged.
- Stage-B DEFERRALS row (owner 250): seeded project, review delivered on earlier version, tabs
  show "From Review of vN" at preview SHA + screenshots.
- Size: ≤ ~400 changed lines; entry delta ≤ 15 kB gz (REQ-KIT-5) — state actual in PR.

## Acceptance criteria (from the ticket)

1. DOM tests: review on v1 viewed at v3 → "From Review of v1" + v1 findings/claims; never-delivered
   project → empty states; counts = 213's rule. *(engineered)*
2. Tab data source pinned by twin/data test — fails if tabs revert to current-version-only. *(engineered)*
3. SYNC-6 reproduction fixture committed + green in CI; run ledger records traced path, overshoot,
   debited per mode, file:line. *(engineered)*
4. SYNC-6 closed as (a) conformance test failing if the clamp is removed, or (b) dated DEFERRALS row.
   finding-map.csv row written. *(engineered)*
5. Check: `debitMode` + ledger write paths unchanged. *(engineered)*
6. Stage-B row `D-R7TALK.1b-1` (owner 250): tabs at preview SHA + screenshots + seed named. *(met-engineered → staging at 250)*
7. Universal phase-gate AC (verification green, tests per behavior, REQ ids stamped, append-only
   records, clock dates, AC layers, harness in header). *(agentic)*

## Plan

1. **API** — `GET /projects/:id/review/latest` in `apps/api/src/dossier-routes.ts`: latest
   `correspondence_items kind='review'` (tenant predicate `p.workspace_id`), findings + latest
   dispositions, claims + claim_sources + the run's `fetch_log` retrieval join (same shape the
   dossier read emits), `drafts.n` for "vN", `deliveredRecordCounts` for counts.
2. **Client/seams** — `LatestReviewDto` + `getLatestReview` in `packages/api-client`; optional
   `DataSource.getLatestReview` in `apps/web/src/data.ts`; `ideContext` reads it (best-effort) →
   `ide.latestReview`; `BffIdeBag.latestReview` in `apps/web/src/spa/queries.ts`.
3. **UI** — `IdeShell` gains `deskClaimsBody` (claims tab was unconditionally "No claims yet.");
   `reviewPanelBodies(latestReview, slug)` in `dossier-view.tsx` builds the Findings body
   ("From Review of vN" header + dossier link + flat finding rows + "on vM" when a finding's
   draft differs) and the Claims body (`ClaimsTable` via `claimUrlViews`). IdeFrame (SSR) +
   `useShellChrome` (SPA) map `ide.latestReview` through the one builder. COPY: `panel.reviewFromFmt`,
   `panel.openDossier`, `panel.onVersionFmt`.
4. **Tests** — `dossier-routes` API test (latest review DTO, tenant refusal); DOM test on the
   mapped chrome (review-on-v1 @ v3 → "From Review of v1"; never-delivered → empties);
   a twin-pin test that the tab source is the LATEST review, not the open version.
5. **SYNC-6** — deterministic PGlite fixture: `chat_turn` run, cap 5 (B6 shrunk) + cap 40
   (default), proxy `usage_records` Σ 16/43 → `resettleRun` both modes: debited == cap,
   residual `adjustment(absorbed)`, net-debit SQL (`turnDebited` shape) ≤ cap; failed turn →
   refund + whole burn absorbed. Proxy leg in `handler.test.ts`: crossing request served+metered,
   next refused (the one-in-flight bound §12.4).
6. **Records** — finding-map row; DEFERRALS row; BUILD_INDEX row 272; LEDGER advance; PR #272.

## Test matrix (1.4)

| AC | Test | Where |
|---|---|---|
| tabs show latest review | `/review/latest` route test (DTO + 404/401 + cross-tenant) | `apps/api/src/dossier-routes.test.ts` |
| "From Review of vN" + v1 data @ v3 | DOM test on `reviewPanelBodies` output + IdeShell claims slot | `apps/web/src/spa/review-tabs.dom.test.tsx` or ide-chrome dom test |
| empty only when never delivered | DOM test, no `latestReview` → empty states | same |
| twin pin (latest, not current-version) | ideContext/twin test: open v3, review on v1 → `latestReview.draftN===1` | `apps/web/src/server` test |
| SYNC-6 reproduction | PGlite chat_turn cap 5/40, usage 16/43, both modes + failed arm | `packages/ledger/src/chat-turn-burn.test.ts` |
| enforcer bound | crossing request served, next 402 | `apps/egress-proxy/src/handler.test.ts` leg |
| conformance pin | net `Σ debit−refund ≤ cap` fails if clamp removed | ledger test |
| debitMode unchanged | `stages.test.ts` already pins `committed` (infra/config/stages.test.ts:303); diff check in PR | — |

## Progress

- 2026-11-06 — Phase 0 done: spec + Load docs read; anchors re-confirmed
  (`chat-routes.ts` turnDebited :241 / turn GET :726; `cap.ts` isOverCap :45; `metering.ts`;
  `sql-ledger.ts` clamp :176-178; `spend.ts`; `server.ts` ideContext :1395 / dossier twin :5551;
  `ide-shell.tsx` claims tab :313). Anchor drift: playbook is `docs/ops/debit-mode-flip.md`
  (ticket named `docs/ops/playbooks/metered-debit-flip.md`). Facts: every stage
  `debitMode:"committed"` (stages.ts:474/496/541; pinned stages.test.ts:303); flip is
  operator-paused (debit-mode-flip.md Status header; GD-THRESH13.R6 flip 1 rides ≥2026-12-01).

## SYNC-6 trace (the investigation)

- **Cap at run creation:** `chat-routes.ts:608-662` — `effectiveBudget` clamps the §7.1 plan
  (default `ASSISTANT_TURN_BUDGET.credits = 40`, `contracts/domain/agent-types.ts:64`); the run's
  `cap_credits` = the consented budget (an edited plan may only SHRINK — B6's cap-5 turn).
- **Enforcer:** `handler.ts:255-272` — `SqlCapAccountant.spentCredits` sums Σ `list_cost_usd`
  over **committed** proxy rows (sinks.ts:149-160); `isOverCap` refuses the NEXT request once
  Σ ≥ cap. The cap-crossing request is served and metered — bound = one in-flight request
  (§12.4; cap.ts:1-11). **Burn can exceed cap by exactly the admitted request's cost** —
  explains 16/5 (one ~16-cr request admitted at spent 0) and 43/40 (a ~43-cr turn at cap 40
  or +3 past). Concurrency note: the accountant reads committed rows only, so N concurrent
  in-flight requests each under cap would all admit — chat turns drive serial model calls, so
  the single-request bound describes the turn shape; the multi-in-flight bound is a documented
  enforcer property, not a chat defect.
- **Metering:** `metering.ts` writes `usage_records{source:'proxy'}` (the meter of record);
  `runs.spent_credits` reconciles to `max(Σ usage credits, Σ debit−refund)` (`spend.ts:47-78`) —
  "16 / 5 cr" is burn/cap, honest.
- **Debit (the charge):** `sql-ledger.ts:149-219` `writeDebit` clamps every debit to
  `min(requested, cap − netDebited)` under the run row lock; the overrun books
  `adjustment(absorbed)` (platform COGS, REQ-SPEC-24.8); the REQ-BILL-3 DB trigger is the
  assertion of last resort (`sql-ledger.test.ts:178`). `debitedCredits` (`chat-routes.ts:241`,
  ADR-135) reads the same `Σ debit−refund` — cap-clamped by construction, ≤ cap.
- **Per mode:** `committed` (ACTIVE everywhere — stages.ts:474/496/541): commit =
  `max(pod claim, metered − debited)` (`spend.ts:139-155`) — the disclosed activation
  discrepancy vs REQ-SPEC-32's `min(metered, cap)`; a completed settle tops up to attempt
  metered, still cap-clamped (`settleMeteredDebit` :169); `metered`: charge = exactly
  `min(metered, cap)`, over-debit refunded `metered_over_debit` (`refundMeteredExcess` :248).
  A **failed** turn refunds net debits and absorbs the whole burn → `debitedCredits` = 0
  (B6's failed 16/5 turn charged the user nothing; the residual is absorbed COGS).

## Gap table

| item (spec §) | required | achieved | status | evidence |
|---|---|---|---|---|
| TALK-4 tabs = latest delivered review | engineered | engineered | met | `GET /projects/:id/review/latest` (dossier-routes.ts:602+); `ide.latestReview` → `reviewPanelBodies` (dossier-view.tsx) |
| "From Review of vN" + dossier link | engineered | engineered | met | review-tabs.dom.test.tsx arm 1; copy.ts `reviewFromFmt` |
| counts = REQ-SYNC-2 rule | engineered | engineered | met | `deliveredRecordCounts` in the route; DOM test asserts "2 findings · 1 strengths · 1 claims" |
| empty states only when never delivered | engineered | engineered | met | route returns null; DOM test arm 2 |
| twin/data pin of the tab source | engineered | engineered | met | `/review/latest` route tests (latest-of-two, null, cross-tenant); DOM test arm 3 (no latestReview → no body) |
| SYNC-6 reproduction fixture | engineered | engineered | met | packages/ledger/src/chat-turn-burn.test.ts (7 legs PGlite); handler.test.ts B6 leg |
| SYNC-6 close (a) | engineered | engineered | met | conformance pin: clamp removal fails the suite; finding-map row B6→SYNC-6→233 closed |
| debitMode/write-paths unchanged | engineered | engineered | met | stages.test.ts:303 pins `committed`; `git diff` shows zero infra/ledger-write changes |
| Stage-B row D-R7TALK.1b-1 | staging (250) | engineered | met-engineered(D-R7TALK.1b-1) | DEFERRALS.md appended row, owner 250 |
| finding-map + BL-13 evidence | engineered | engineered | met | finding-map.csv appended row; BL-101 covered |
| entry delta ≤ 15 kB reported | engineered | engineered | met | `check:spa-budget`: +14.1 kB vs baseline 04a4e98b |

## Evidence log

- `pnpm turbo build` @rhema/api/web/ui/ledger/egress-proxy/api-client — green.
- vitest: chat-turn-burn.test.ts 7/7; dossier-routes.test.ts (incl. 4 new `/review/latest` legs) green; review-tabs.dom.test.tsx 4/4; handler.test.ts (incl. B6 leg) green; sql-ledger/chat-routes/ide-chrome/dossier-surfaces 111 green.
- `pnpm turbo typecheck lint` — green (1 pre-existing warning in chat-live.tsx, not this diff).
- `check:spa-budget` — entry delta **+14.1 kB** vs baseline 04a4e98b (≤ 15 kB REQ-KIT-5). `check:dom-contract` OK.

## Evidence report

- **SYNC-6 verdict:** burn CAN exceed the turn cap — lawfully, by design (§12.4 one-in-flight-request bound: the crossing request is served+metered; the next 402s). 16/5 and 43/40 are each consistent with one oversized admitted request. The charge (`debitedCredits` = Σ debit−refund) NEVER exceeds the cap: `writeDebit` clamps per-debit under the row lock (sql-ledger.ts:176-178), the REQ-BILL-3 DB trigger backstops, and the overrun books `adjustment(absorbed)` COGS. Committed mode (active everywhere; disclosed gotcha-5 discrepancy): charge = max(pod claim, metered catch-up) clamped at cap — NOT min(metered, cap). Metered mode: exactly min(metered, cap). A failed turn charges 0 (refund + whole-burn absorb). **No money defect found; no mode change.** Closed as (a) — conformance pinned; removing the clamp fails the suite.

## Evidence log

## Evidence report
