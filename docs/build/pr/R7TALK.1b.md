# R7TALK.1b — Findings/Claims tabs show the latest delivered review + chat-turn burn-vs-cap investigation

**Spec:** `docs/tickets/233_R7TALK.1b__chat-tabs-burn-investigation.md` (chain row 233)
**Base:** `stevevitali/r7talk-1a-chat-panel` @ `1e614f30` · **Stage A only** ($0 — no preview, GD-PREVIEW.R7)
**Requirement ids:** REQ-TALK-4 · REQ-SYNC-6 · REQ-KIT-5 (allowance) · REQ-SPEC-32 (conformance target, unamended)

## Summary

Two "one truth" fixes on the right panel's chat side.

- **TALK-4 [B17].** The Findings and Claims tabs no longer say "No findings yet." on a project whose
  record holds a delivered review. A new slim API read, `GET /projects/:id/review/latest`, returns the
  project's **latest delivered review** (correspondence row + findings/dispositions + claims/sources +
  the run's `fetch_log` retrieval join, counts by 213's `deliveredRecordCounts`). The `ide` bag carries
  it (`latestReview`); the ONE `reviewPanelBodies` composition (SSR `IdeFrame` + SPA `useShellChrome`)
  renders a "From Review of vN" source line linked to that dossier, the finding rows (status =
  disposition; a row filed on another version tags "on vM"), and the claim ledger via `ClaimsTable`.
  `IdeShell` gains `deskClaimsBody` (the claims tab previously rendered "No claims yet."
  unconditionally). Empty states now render only when the project never delivered a review.
- **SYNC-6 [RV-21; R5 B6 "16 / 5 cr", "43/40 cr"].** The burn-vs-cap investigation, closed as
  **(a) a REQ-SPEC-32 conformance finding** with a deterministic pinning suite — see below.

## SYNC-6 verdict (the investigation arm)

- **Enforcer:** `handler.ts:255-272` — `SqlCapAccountant.spentCredits` sums Σ `list_cost_usd` over
  **committed** proxy rows (sinks.ts:149-160). The cap-crossing request is **served and metered**;
  the NEXT request 402s — the residual overrun bound is one in-flight request (§12.4). Burn over cap
  is therefore lawful and bounded by the admitted request's cost: a ~16-cr call admitted at spent 0
  yields "16 / 5"; a ~43-cr turn at cap 40 yields "43/40". Concurrency caveat recorded in the run
  ledger: the accountant reads committed rows only, so N concurrent in-flight requests each admit —
  chat turns drive serial model calls, so the single-request bound describes the turn shape.
- **Charge:** `writeDebit` clamps every debit to `min(requested, cap − netDebited)` under the run
  row lock (`sql-ledger.ts:149-219`); overrun → `adjustment(absorbed)` COGS (REQ-SPEC-24.8); the
  REQ-BILL-3 DB trigger is the assertion of last resort. `debitedCredits` (chat-routes.ts:241,
  ADR-135) = `Σ debit − Σ refund` ≤ cap by construction — it reconciles with the ledger.
- **Per mode** (every stage ships `debitMode:"committed"` — stages.ts:474/496/541, pinned
  stages.test.ts:303; the metered flip is operator-paused, GD-THRESH13.R6 ≥2026-12-01):
  `committed` charges `max(pod claim, metered − debited)` clamped at cap — the **disclosed
  activation discrepancy** vs `min(metered, cap)` (gotcha 5), not a defect; `metered` charges
  exactly `min(metered, cap)`; a **failed** turn charges **0** (refund + whole-burn absorb —
  B6's failed 16/5 turn cost the user nothing).
- **Closed as (a):** `packages/ledger/src/chat-turn-burn.test.ts` reproduces both B6 shapes on
  PGlite (cap 5/burn 16, cap 40/burn 43, both modes + failed + re-settle idempotency) — it **fails
  if the clamp is removed**. `handler.test.ts` adds the enforcer-bound leg. `finding-map.csv` B6
  row → REQ-SYNC-6 → 233 → evidence, `closed`. No money-mode change, no ledger write-path change,
  no `debitMode` edit (diff contains none — `stages.test.ts` pin stands).

## What changed

- `apps/api/src/dossier-routes.ts` — `GET /projects/:id/review/latest` (tenant `p.workspace_id`
  predicate; `deliveredRecordCounts`).
- `packages/api-client/src/index.ts` — `LatestReviewDto`/`LatestReviewEnvelopeDto` + `getLatestReview`.
- `apps/web/src/data.ts` — optional `getLatestReview` seam (session-forwarded).
- `apps/web/src/server.ts` — `ideContext` best-effort read → `ide.latestReview`.
- `apps/web/src/page-data.ts` + `apps/web/src/spa/queries.ts` — `latestReview` on the ide bags.
- `apps/web/src/dossier-view.tsx` — `reviewPanelBodies` (the ONE SSR/SPA composition).
- `apps/web/src/pages.tsx` (IdeFrame) + `apps/web/src/spa/ide/chrome-data.tsx` (`useShellChrome`) —
  the two renderers map the bag through it; a leaf's own body still wins (the dossier keeps its
  FindingsDesk — ticket-owned decision recorded).
- `packages/ui/src/ide-shell.tsx` — `deskClaimsBody` prop; claims tab renders it.
- `apps/web/src/copy.ts` — `panel.reviewFromFmt` / `openDossier` / `onVersionFmt`.
- Tests: `dossier-routes.test.ts` (+4 legs), `review-tabs.dom.test.tsx` (new, 4 legs),
  `chat-turn-burn.test.ts` (new, 7 legs), `handler.test.ts` (+1 B6 leg).
- Records: `finding-map.csv` row, `DEFERRALS.md` D-R7TALK.1b-1, `runs/R7TALK.1b.md`.

## Verification (all Stage A, $0)

- `pnpm turbo build` (api/web/ui/ledger/egress-proxy/api-client closures) — green.
- vitest: `chat-turn-burn.test.ts` 7/7 · `dossier-routes.test.ts` incl. 4 new `/review/latest` legs ·
  `review-tabs.dom.test.tsx` 4/4 · `handler.test.ts` incl. B6 leg · sql-ledger/chat-routes/
  ide-chrome/dossier-surfaces 111 — all green.
- `pnpm turbo typecheck lint` — green (one pre-existing chat-live.tsx warning).
- `check:spa-budget` — **entry delta +14.1 kB** vs baseline `04a4e98b` (≤ 15 kB allowance, REQ-KIT-5).
- `check:dom-contract` — OK.

## AC → evidence

| AC | layer | evidence |
|---|---|---|
| DOM tests both states ("From Review of v1" @ v3; never-delivered empties) | engineered | `review-tabs.dom.test.tsx` arms 1–2 |
| Tab data source pinned by twin/data test | engineered | `/review/latest` route legs (latest-of-two, null, cross-tenant) + DOM arm 3 |
| SYNC-6 reproduction committed + green; ledger records path/overshoot/debits per mode | engineered | `chat-turn-burn.test.ts`; `runs/R7TALK.1b.md` §SYNC-6 trace |
| SYNC-6 closed (a) conformance test | engineered | suite fails if `writeDebit` clamp removed |
| `debitMode` + ledger write paths unchanged | engineered | no infra/ledger diff; `stages.test.ts:303` pin |
| Stage-B at 250 (`D-R7TALK.1b-n`, owner 250, seed named) | engineered → staging-verified at 250 | `DEFERRALS.md` D-R7TALK.1b-1 |

## Deferrals / deviations

- **D-R7TALK.1b-1 (OPEN, owner 250):** deployed tab evidence + screenshots at the R7b phase
  preview (GD-PREVIEW.R7); compensating control = the committed DOM + route tests.
- **Decision (ticket-owned):** on a dossier leaf the FindingsDesk keeps showing the OPEN dossier
  (itself a delivered review — extras win over the base mapping); everywhere else the tabs show
  the latest delivered review verbatim.
