# PR — R7DEM.6a: the guided tour on SPD + demo entry points + honesty copy

- **Branch:** `stevevitali/r7dem-6a-tour` → base `stevevitali/r7dem-5b-hub`
- **Ticket:** `docs/tickets/222_R7DEM.6a__guided-tour.md` · run `docs/build/runs/R7DEM.6a.md`
- **Stage:** A only ($0) — no preview (GD-PREVIEW.R7); Stage-B carried by `D-R7DEM.6a-1` → 224.

## What lands

1. **The 11-step guided tour** (`apps/web/src/spa/demo-tour.ts` — 221's lazy seam, `otherAsync`).
   State rides `?tour=<stepId>` on the public demo URL (declared urlparam; never a cookie). The
   overlay renders only while the param names the step whose route matches — never auto-starts.
   Non-modal: no focus trap/scrim; Next/Back/Exit are `<a>` hops through the click interceptor
   (client navs in-demo; `data-spa-native` exits); Esc exits to free roam; ←/→ page while active
   (never in fields or with modifiers); reduced-motion honored; the coach mark centers under/
   above its declared DOM-contract target without covering it. `onStart`/`onCompleteOrCta`
   lifecycle hooks for 223's anonymous metrics.
2. **Step schema + pins** — `{id, route, target, targetValue?, placement, copyKey, advance,
   aside?, search?}` (recorded extensions). Every “…” span in tour copy is a pinned COPY
   literal asserted verbatim against the committed corpus file:line; counts are
   snapshot-derived (`demo-tour-steps.test.ts`).
3. **Entry points** — landing hero CTA "See it on four real essays →", `/showcase` link,
   shared footer link — all `data-spa-native` document navigations to `/demo`.
4. **Honesty copy** — `FUNNEL_SCOPE`/`PROMISE_SCOPE` now cover `demo.*`; replayed-record
   framing; "approvals not recorded" preserved; no efficacy language anywhere.
5. **DOM contract** — `data-demo-tour{,-step,-next,-prev,-close,-cta,-aside}`,
   `data-demo-entry`, `u(tour)`, `data-letter-section`.
6. **F-R7DEM.6a-1 (found+fixed):** the demo dossier surface crashed on the real corpus
   (`accessReport` absent on the replayed twin → `buildTrustChip` dereferenced `undefined`).
   `accessReport` is optional now; `LetterView` omits the chip honestly rather than fabricating.
7. **`D2.tour` real body** in `r7legs.ts` — walks all 11 steps; registry stays
   `expected:"red"` (248 re-flips at the R7a preview).
8. **Journey test** `demo-tour-legs.local.test.ts` — the real body vs a local
   `demoDataSource` server, 33 committed screenshots `reports/2026-11-04_r7dem-6a-tour/`.
9. **`public-ssr-baseline` before/after** — `reports/2026-11-04_r7dem-6a-public-ssr-baseline-*`
   + `COMPARE.md`: only the enumerated demo-entry deltas; all `data-renderer="ssr"` held.

## Verification (at this head)

turbo build green · vitest web+contracts+ui 1900/1900 · launch-surface 123/123 ·
check:dom-contract/spa-budget/spa-env/protocol-markers OK · lint/typecheck clean ·
D2.tour local leg green at 3 widths · baseline compare enumerated-only.

## Deferrals

Opened `D-R7DEM.6a-1` (Stage-B → 224_R7DEP.1). Closed none. `D-P1.17-2` stays OPEN by ticket note.
