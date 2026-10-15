# NAVC.2 — Settle + nav-mechanism contract (run ledger)

- **Spec:** `docs/tickets/155_NAVC.2__settle-contract.md` (manifest row 155, round 5)
- **Normative loads:** `docs/post-spa-disposition-spec.md` §3 (REQ-NAVT-1/2/3/6/7 — incl.
  O2-F18 all-documents rule + O2-F20 un-gating); `docs/research/r5_a4_nav-verification.md`
  (the contract design + the `documentLoads` gating find)
- **Base:** `stevevitali/navc-5-ssrhandoff-replace-seam` @ `00b75d1` + orchestrator boundary
  commit `4857287` (the chain's true head; PR base = navc-5 branch)
- **Branch:** `stevevitali/navc-2-settle-contract` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** implement-spec + build-memory @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-NAVT-1 REQ-NAVT-2 REQ-NAVT-3 REQ-NAVT-6 REQ-NAVT-7
- **Started:** 2026-10-15T11:13Z · **Closed:** 2026-10-15T11:45Z
- **Config:** full rigor (ledger + self-review + gap analysis + tests + evidence report);
  **Live stage: none**; **Production mutations: none**; metered spend **$0**;
  zero prod writes, zero deploys, zero merges

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). No OPEN row is scoped to the settle
contract / nav observability; NAVC.2 lands no live legs and no operator prerequisites —
nothing closes this run. New rows opened: none expected (verification is fully offline).
Known flake already recorded by NAVC.5/orchestrator: `live-clients/src/ingest.test.ts`
`waitMs:1` under parallel load — do not re-record.

## Deploy boundary (recorded constraint — inherited from the chain)

NAVC.1's contract carried the M5 note: nav-chain code must not deploy ahead of 156_NAVC.3
(the registry destroy-identity fix). This ticket's client-side arm (HeadManager counter +
pending semantics) rides the same stack — nothing here deploys (operator merges + deploys);
the constraint is recorded and nothing is restructured to route around it.

## Requirements (from the contract + spec §3)

1. **REQ-NAVT-1** — `data-nav-count` on `<html>`: `"0"` stamped on EVERY served document
   (`render.tsx` SSR + `spa-shell.ts` shell — the reset IS the detector, O2-F18);
   HeadManager increments once per committed in-document location transition
   (push/replace/pop count; hydration doesn't). `navKey` semantics = the same
   committed-transition definition NAVC.1's navKey pin tests.
2. **REQ-NAVT-2** — `data-mounted` REMOVED while `isLoading`, re-stamped on resolution;
   dom suites' `removeAttribute` mounts stay green; no suite may depend on persistence.
3. **REQ-NAVT-3** — `settleClientNav` (nav-count increase AND zero document loads) +
   `settleDocumentNav` (inverse) + `SettleScope.documentLoads`; the `runner.ts`
   document-response watcher is NOT gated on `expectRenderer` anymore (O2-F20).
4. **REQ-NAVT-6** — `settleNav`/`gotoOk`/`reloadSettled` stay mechanism-agnostic; no
   existing leg flips mechanism silently; the pin test asserts both helpers' distinct
   semantics.
5. **REQ-NAVT-7** — dom-contract row `data-nav-count` as **all-documents required**,
   landing with both renderers' emitters + assertions this PR. `data-page-session` is
   explicitly 156_NAVC.3's (no manifest row ahead of its emitter).

## Acceptance criteria (from the contract)

- [ ] SSR + shell documents both stamp `data-nav-count="0"`; the counter increments per
  committed transition; a doc load resets it — unit/dom-tested *(deterministic)*
- [ ] `data-mounted` absent during pending; the mid-transition false-pass is tested
  closed *(deterministic)*
- [ ] `settleClientNav`/`settleDocumentNav` + unconditional `documentLoads` —
  journey-helper unit tests *(deterministic)*
- [ ] `check:dom-contract` green *(deterministic)*
- [ ] verification green; BUILD_INDEX row + LEDGER advanced; operating clauses met
  *(agentic — universal AC)*

## Plan

1. `apps/web/src/render.tsx` — `data-nav-count="0"` into the SSR `htmlAttrs` (O2-F18:
   SSR docs carry it too — the reset is the detector).
2. `apps/web/src/spa-shell.ts` — `data-nav-count="0"` into the shell `htmlAttrs`.
3. `apps/web/src/spa/head.tsx` — HeadManager: `lastNavKey`+`navCount` refs; the first
   effect run seeds (hydration = not a transition); each later committed `navKey`
   (push/replace/pop — empirically `state.key` rotates on push AND replace at
   router-core 1.171.33, and a pop restores the target entry's distinct key)
   increments once; `data-mounted` removed while `isLoading`, re-stamped on
   resolution (the `[data-route][data-mounted]` pair means "resolved leaf" again).
4. `packages/journeys/src/settle.ts` — `SettleScope.documentLoads?`; `navCountOf`;
   `settleClientNav(page, scope, act, wait)` + `settleDocumentNav(page, scope, act,
   wait)` — the action-callback shape makes the baseline structurally pre-commit;
   a scope without `documentLoads` fails closed. `settleNav`/`gotoOk`/
   `reloadSettled` untouched (mechanism-agnostic — REQ-NAVT-6).
5. `packages/journeys/src/runner.ts` — un-gate the document-response counting
   (count every same-origin 2xx HTML document response regardless of
   `expectRenderer`; only the renderer ASSERT stays gated); `StepCtx.documentLoads`.
6. `apps/web/src/dom-contract.ts` — `data-nav-count` row, `shell` surface, required;
   `data-mounted` note trued to the pending-removal semantics.
7. Tests — `spa-shell.test.ts`/`render.test.tsx` (SSR+shell stamp), `spa.dom.test.tsx`
   (count 0 at mount; +1 push; +1 replace; pop; pending mounted removal + re-stamp;
   the mid-transition false-pass closed), `settle.test.ts` (mechanism pin both
   directions + scope-config error + foreign no-op), `runner.test.ts`
   (`documentLoads` unconditional — pinned AND unpinned runs; non-doc/foreign/4xx
   excluded).

## Test matrix (Phase 1.4)

| row | input | expected |
|---|---|---|
| SSR stamp | `renderDocument` any route | `data-nav-count="0"` in `<html>` attrs |
| shell stamp | `renderSpaShell` | `data-nav-count="0"`; still no `data-mounted` |
| hydration | mount real router | count stays `"0"` (first effect run seeds) |
| push | `navigate({to})` | count `+1` per commit |
| replace | `navigate({replace:true})` | count `+1` (state.key rotates — probed 1.171.33) |
| pop | `history.back()` | count `+1` (restored key ≠ current) |
| pending | gated twin fetch during nav | `data-mounted` absent while `isLoading`, `data-route` already new, count already incremented; re-stamped on resolve |
| settleClientNav | in-doc count bump, 0 loads | resolves; doc-load bump or loads>0 ⇒ fail |
| settleDocumentNav | `documentLoads` +1, fresh doc `data-nav-count` present | resolves; loads flat ⇒ lapse error |
| watcher un-gate | doc response, `expectRenderer` unset | `ctx.documentLoads === 1` |
| watcher precision | script/foreign/4xx/non-html responses | not counted |
| mechanism agnostic | settleNav/gotoOk/reloadSettled | unchanged signatures + semantics (pin) |
| dom-contract | `check:dom-contract` | row emitted (render.tsx + spa-shell.ts + head.tsx) + asserted |

## Progress

- 2026-10-15T11:13Z — Phase 0 complete: DEFERRALS read (no NAVC-scoped OPEN rows);
  LEDGER read (`nextTicket: NAVC.2`, `chainTip: navc-5` @ `00b75d1`); anchors read
  (render.tsx:79-87 SSR htmlAttrs; spa-shell.ts:211-216 shell htmlAttrs;
  head.tsx:25-70 HeadManager; settle.ts whole; runner.ts:181-241 watcher;
  dom-contract.ts manifest + check-dom-contract.mjs gate; sibling ledgers
  NAVC.1/NAVC.5). Empirical probe at `@tanstack/react-router@1.170.40`
  (router-core 1.171.33): push AND replace both rotate `location.state.key`; a
  pop restores the target entry's key (always ≠ current) — Q-A4-1 answered in the
  affirmative, so "increment per new committed navKey, first run is the hydration
  seed" implements the contract exactly. (Probe file deleted.)
- 2026-10-15T11:30Z — Phase 2 complete: all six deliverables landed + tests.
  Focused green: `settle.test.ts`+`runner.test.ts` 45/45; `spa.dom.test.tsx`+
  `render.test.tsx`+`spa-shell.test.ts` 64/64; full apps/web+packages/journeys
  sweep 1390/1390. `check:dom-contract` green (shell 18/18 emitted+asserted).
  `tsc`+`eslint` clean on both touched packages (fixed `state.key`'s
  `string|undefined` via `?? null` in the selector).
- 2026-10-15T11:30Z — Phase 3 self-review: preload confirmed NOT to flip
  `status`/`isLoading` (router-core `stores.status.set("pending")` rides the
  commit path only — `preloadClientRoute` never commits), so hover-preloads
  can't strip `data-mounted`. Reordered the mechanism helpers' foreign-origin
  no-op BEFORE the `documentLoads` requirement — a hosted-checkout leg on a
  hand-made scope must run `act()` rather than fail closed on a counter the
  markers never consulted.

## Gap table

| AC (from contract §Acceptance) | verdict | evidence |
|---|---|---|
| SSR + shell stamp `data-nav-count="0"` | ✅ | `render.tsx:86`, `spa-shell.ts:217` (only two `<html>` emitters — grep-verified); `render.test.tsx` "the all-documents nav counter"; `spa-shell.test.ts` both stamp tests |
| increments per committed transition (push/replace/pop); never hydration | ✅ | `head.tsx:53-59` navKey-seed; `spa.dom.test.tsx` "mounts at …0" (StrictMode double-mount can't double-count), "increments once per committed transition — push and replace" (+raw-history search-delta), "a Back pop counts" |
| a doc load resets it | ✅ | emergent: fresh documents stamp `"0"` at both emitters (the reset IS the detector — O2-F18); `settleDocumentNav` asserts the landed doc's stamp |
| `data-mounted` absent during pending; mid-transition false-pass tested closed | ✅ | `head.tsx:71-77`; gated-loader dom test asserts `data-route="/b"` + mounted ABSENT + count `"1"` mid-pending, re-stamp on resolve |
| `settleClientNav` = count increase AND zero document loads | ✅ | `settle.ts:251-297`; tests: resolves on bump+flat; fails on doc-nav masquerade, on ticked-count+landed-doc (reloadDocument arm), on missing stamp, on counter-less scope (fail-closed, act never runs), foreign-origin no-op |
| `settleDocumentNav` = document load + landed stamp | ✅ | `settle.ts:310-341`; tests: resolves on loads+1 & fresh "0"; fails on client-nav-only lapse, on landed doc missing stamp, on counter-less scope |
| `documentLoads` unconditional (O2-F20) | ✅ | `runner.ts:195-216` — `documentLoads += 1` ahead of the `expectRenderer` gate; live getter on `StepCtx`; `runner.test.ts` G20 (unpinned run counts) + G21 (xhr/foreign/404/non-HTML excluded) |
| `settleNav`/`gotoOk`/`reloadSettled` mechanism-agnostic (REQ-NAVT-6) | ✅ | diff-verified untouched; trap-scope test — a `documentLoads` getter that throws proves no agnostic helper reads it |
| `check:dom-contract` green | ✅ | shell surface 18/18 emitted+asserted (was 17); row landed with emitters+assertions same PR |
| out-of-scope kept: no `data-page-session`, no R10 legs, no merge/deploy | ✅ | grep-verified absent; OPERATOR policy |

Deviations: none. Partial/missed items: none found in the Phase-4 re-read.

## Evidence log

| command | result |
|---|---|
| `pnpm install` | OK at baseline — 48 workspace projects, lockfile unchanged |
| `pnpm turbo build lint typecheck` | **135/135 tasks** green |
| `pnpm test` | **491 files / 5,648 pass / 4 skip / 0 fail** — the recorded `live-clients` `waitMs:1` flake did NOT recur this run |
| `pnpm check:licenses` | OK |
| `pnpm check:protocol-markers` | OK |
| `pnpm check:no-cookies` | OK — 255 ingestion-surface files |
| `pnpm check:spa-budget` | OK — all ceilings held |
| `pnpm check:spa-env` | OK — 113 client sources, 146 artifacts |
| `pnpm check:dom-contract` | OK — shell surface 18/18 emitted+asserted (was 17; `data-nav-count` row landed) |
| focused vitest — `settle.test.ts`+`runner.test.ts` | 45/45 |
| focused vitest — `spa.dom.test.tsx`+`render.test.tsx`+`spa-shell.test.ts` | 64/64 |
| `apps/web`+`packages/journeys` vitest sweep | 1390/1390 |
| `check-build-memory.sh` | 0 violations (run at closeout, unstaged + staged) |
| `check-append-only.mjs --base 4857287` | OK — history only grew |

## Evidence report

- **Commits:** impl `c20d5dbc4e3915be982d573ef16ccbd2c310d36e` (+ closeout commit on top;
  true pushed head recorded in LEDGER `chainTip`/PHASE LOG).
- **PR:** #177 — base `stevevitali/navc-5-ssrhandoff-replace-seam`, head
  `stevevitali/navc-2-settle-contract`; mergeable; **unmerged** (mergePolicy OPERATOR).
- **CI at closeout:** `typecheck / lint / unit` IN_PROGRESS on `c20d5db` — recorded
  honestly as pending (first-read class; the boundary check belongs to the orchestrator's
  close-read).
- **Gap analysis:** every contract AC lands with test evidence — see the gap table above;
  no deviations, no partial items.
- **DEFERRALS:** read at start; none opened, none closed. The known unrelated
  `live-clients` `waitMs:1` flake is already recorded by NAVC.5 — not re-recorded.
- **Out of scope kept:** no `data-page-session` (NAVC.3), no R10/R10.keepalive legs
  (NAVC.4), no deploys/prod writes/merges, no secrets in artifacts.
- **Spend:** $0 metered.
