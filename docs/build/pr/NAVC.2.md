# NAVC.2 — Settle + nav-mechanism contract (data-nav-count, pending mounted, settle helpers)

Manifest row 155 · stacks on `stevevitali/navc-5-ssrhandoff-replace-seam` · merge policy
**OPERATOR** — do not merge from the build environment · contract
`docs/tickets/155_NAVC.2__settle-contract.md` · run ledger
`docs/build/runs/NAVC.2.md`.

## What lands

The observability gap that let zero-client-routing ship is closed: a per-document committed-
transition counter, honest `data-mounted` pending semantics, and mechanism-aware settle
helpers (spec §3 REQ-NAVT-1/2/3/6/7; O2-F18 + O2-F20; r5_a4 F1/F5).

- **`render.tsx` + `spa-shell.ts`** — `data-nav-count="0"` stamped on EVERY served document,
  SSR and shell alike (O2-F18). A document load landing a fresh `"0"` *is* the detector — an
  in-page counter alone can't see a reload-to-same-count.
- **`spa/head.tsx`** — `HeadManager` ticks `data-nav-count` once per committed in-document
  location transition. `location.state.key` is the commit signal (the same navKey definition
  NAVC.1's interceptor pins): push and replace mint new keys, a pop restores the target
  entry's key — always ≠ the current one. The first effect run only seeds, so hydration and
  StrictMode double-mount can't count. While `isLoading`, `data-mounted` is REMOVED —
  `data-route` has already flipped to the pending route, so the stale pair could no longer
  mean "resolved leaf"; on resolution it's re-stamped (REQ-NAVT-2).
- **`journeys/settle.ts`** — `SettleScope.documentLoads?`, `navCountOf`, and the two
  mechanism-pinned settles. `settleClientNav(page, scope, act, wait)` requires a
  `data-nav-count` increase AND zero observed document loads; `settleDocumentNav` is the
  inverse pin — a same-origin document response must land and the fresh document must carry
  the stamp. The `act()` callback shape makes the baseline structurally pre-commit (a
  post-action snapshot can't exist). Both fail closed on a counter-less scope and no-op on
  foreign origins. `settleNav`/`gotoOk`/`reloadSettled`/`awaitMounted` are untouched and stay
  mechanism-agnostic — REQ-NAVT-6's pin test passes them a `documentLoads` getter that
  throws on read.
- **`journeys/runner.ts`** — the document-response watcher now counts unconditionally: the
  `expectRenderer == null` early-return moved below the increment, so only the renderer
  ASSERT stays pin-gated (O2-F20). `StepCtx.documentLoads` is a live getter — the response
  listener keeps writing while the step impl runs.
- **`dom-contract.ts`** — `data-nav-count` row on the `shell` (all-documents) surface,
  `required`, landed with both emitters + assertions in this PR (REQ-NAVT-7). The
  `data-mounted` note is trued to the pending-removal semantics.

## Tests

`spa.dom.test.tsx` gains the nav-mechanism describe: mount-at-`"0"` under StrictMode
(hydration is the seed), +1 each on push/replace/search-delta/pop, and a gated-loader leg
that catches `data-route="/b"` + `data-mounted` ABSENT + count `"1"` mid-pending — the
mid-transition false-pass itself. `render.test.tsx`/`spa-shell.test.ts` pin the `"0"` stamp
on both emitters. `settle.test.ts` covers both pins in both directions (doc-nav masquerade,
ticked-count-with-landed-doc, missing stamp, fail-closed scope, foreign no-op) plus the
agnostic trap. `runner.test.ts` covers the unconditional count and the xhr/foreign/404/
non-HTML exclusions. `data-page-session` is deliberately absent — NAVC.3's, and spec §3
forbids a manifest row ahead of its emitter.

## Out of scope (contract)

`data-page-session` (row + emitter + assertion) → 156_NAVC.3 · live R10 legs → 157_NAVC.4.
No journey steps migrated to the pinned settles here — the helpers land for those legs to
use.

## Verify

`pnpm turbo build lint typecheck` 135/135 · `pnpm test` **491 files / 5,648 pass / 4 skip /
0 fail** — the known `live-clients` `waitMs:1` flake did not recur ·
`check:licenses`/`protocol-markers`/`no-cookies`/`spa-budget`/`spa-env` green ·
`check:dom-contract` green — shell surface 18/18 emitted+asserted ·
`check-build-memory.sh` 0 violations · `check-append-only` vs `4857287` OK · DEFERRALS: none
opened, none closed · $0 spend, no deploys, no prod writes.

Requirement ids: REQ-NAVT-1 REQ-NAVT-2 REQ-NAVT-3 REQ-NAVT-6 REQ-NAVT-7
