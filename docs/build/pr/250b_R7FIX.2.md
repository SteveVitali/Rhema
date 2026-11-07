# R7FIX.2 (250b) — owner fixes for the R7DEP.2 defect boundary, round 2

Ticket: `docs/tickets/250b_R7FIX.2__defect-round-2.md` (run-time insert — 250's defect path).
Base: `stevevitali/r7dep-2-t1-prod` (the composed tip `3d790572` lineage the preview serves).
Stage A only — **$0, no preview touch**; deployed proof is 250's T1b re-walk (`D-R7FIX.2-1`).

## Fixes

- **F-1 residual** — `?view=tree` stamps `project.latestReviewRunId` from `listProjects` OR the
  `getLatestReview` delivered-record seam (parallel, best-effort); the sidebar Reviews item then
  carries `/p/:slug/review/:runId` — a visible `/review/` anchor DOM-order before the closed
  `.ide-panel` whose hidden FindingsDesk "Clear" link kept winning `.first()`. `U2.noreload`
  prefers `[data-shell-recent="showcase"]` (guaranteed-reviewed substrate) over the bare first
  recent — the evolved symptom (`/p/untitled/review/` absent on a review-less scratch leftover).
- **F-3 residual** — the blank-Page title lost focus to the route-SETTLE claimer, not the mount
  cascade: `head.tsx`'s REQ-COPY-7 h1-focus now yields when `[data-inline-title]` mounts
  (REQ-HOME-3's leaf-declared entry focus), and `editor.tsx` re-asserts once more on the
  `data-mounted` stamp via MutationObserver (covers any post-frame claimer).
- **F-5 evolved** — `OutlineSurface`'s `!data` (no-outline) arm now emits the Project › Surface
  crumb off the route `slug`; same gap pre-closed on `FiguresSurface` + `ProjectSettingsBody`'s
  unavailable arm (`routeSlug`) so the U1 four-leaf walk can't trip the next null-arm.
- **F-6 new** — the empty-Page "Ask in chat" affordance was a raw `<button>` inline-styled as a
  quiet link (the second `data-ide-panel-tab="chat"` emitter): replaced with the `Button`
  primitive — U4's census reads `ui-btn`, never re-disabled.
- **F-7 new** — `hero-capture.ts`: the post-walk cookie read moved inside `try` (was after
  `context.close()` → deterministic `Target closed`, exit 2, zero artifacts); provenance fetches
  the real `/healthz/` route (bare `/healthz` is GFE-intercepted on `*.run.app`), bare as fallback.

## Verification (fresh build)

turbo build 15/15 · lint 0 err · web 1667/1667 · journeys 228/228 · check:dom-contract / spa-env /
protocol-markers / spa-budget OK (entry-delta WARN = standing cumulative deficit; ≈ +0.1 kB this
ticket). Run ledger: `docs/build/runs/250b_R7FIX.2.md`.
