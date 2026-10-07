<!--
  Template: docs/research-ledger.md (BM-SYNTH-01). Living until ratified, then frozen.
  One writer touches CURRENT STATE + change log; every stamp is `date -u` at writing (BM-CLOCK-01).
-->
# frontend-spa — research & design ledger

- **Status vocabulary:** `open` → `in-progress` → `done` | `blocked-on-operator` | `dropped(reason)`.
  Every row ends `done` with **evidence** — a path into the spec, a source actually fetched, or
  an explicit decision + rationale.
- **Owner vocabulary:** `R` research · `D` design · `A` architecture · `P` product · `S` synthesis.
- **⚑** marks an operator-fixed constraint (do not relitigate) — see `docs/frontend-spa-brief.md`.
- **Nothing cited that was not read.**

## CURRENT STATE

```
projectStatus:   IN_PROGRESS
nextUnit:        B1
lastCompleted:   A4 (A-stream complete: A1–A4 done, notes in docs/research/)
blockedOn:       (nothing)
pauseRequested:  false
brief:           docs/frontend-spa-brief.md
specOut:         docs/frontend-spa-spec.md
memoryRoot:      docs
autonomy:        interactive (operator answers §Q rows live)
round:           1
updatedAt:       2026-10-07T21:25:32Z
```

## 0. Working theses (to be tested, not assumed)

- **T1 — The BFF seam can serve typed JSON without new public surface.** `data.ts`/`page-data.ts`/
  `api-client` already shape most data; the extraction is large but mechanical. (A1, A3, B3)
- **T2 — Islands→React is mostly mechanical, except the editor/collab island.** PM+Y.Doc+decorations
  are framework-agnostic; the binding question is real, the feature-parity bar is high. (A2, B4)
- **T3 — Journeys survive; SSR-string tests largely don't.** Playwright asserts DOM, not SSR —
  the registry is reusable; the ~6k-line HTML-string test files are the real casualty and the
  verification strategy must consciously replace their coverage. (A4, D1)
- **T4 — Hybrid (public SSR + auth'd SPA) beats SPA-everything on risk and cost.** ⚑-consistent;
  the boundary question is Q-1's. (A1, C3, B1)
- **T5 — Strangler-route migration behind a flag beats big-bang.** Each surface can ship as SPA while
  SSR stays the fallback per-route — matching this repo's flag discipline (ADR-flag convention).
  (D3, B1)
- **T6 — The SPA must not regress the auth/OAuth hand-offs.** MAINT.5 proved browsers enforce
  `form-action` on redirect targets; a SPA swaps form POSTs for `window.location` navigations — the
  CSP/seam implications are a design input, not an afterthought. (B3, D2)

## A. Surface inventory & ground truth

| id | item | owner | status | evidence |
|---|---|---|---|---|
| A1 | Route/surface census — enumerate all ~175 `server.ts` routes + `routes.tsx`/`pages.tsx` sections; classify public vs auth'd vs app-shell; per-route data needs + interactivity level + mutation POSTs; output a per-surface table the decomposition consumes | R | done | `docs/research/01_route-census.md` — ~181 registrations collapse to ~120 route rows; ~20 non-HTML BFF endpoints enumerated; REQ-INV-1..8 emitted |
| A2 | Island inventory + island↔server contract map — the 5 bundles (`page`/`ide`/`landing`/`outline`/`editor`), their `<script type=json>` reads, `data-*` attrs, polls, SSE, ws, form fallbacks; what each needs from a typed data layer | R | done | `docs/research/02_island-contract-map.md` — 5 entries + 2 non-island scripts; collab wire protocol mapped; REQ-ISL-1..16 emitted |
| A3 | Data-layer audit — `data.ts`/`page-data.ts`/`api-client` DTO coverage: which routes already have JSON (api-client methods), which are SSR-only extractions needed; mutation catalog (form POSTs → prospective API calls) incl. status/error-code surface | R | done | `docs/research/03_data-layer-audit.md` — DataSource seam (~120 methods) IS the BFF inventory; ~70 form-POST mutations catalogued; REQ-DAT-1..14 emitted |
| A4 | Test-surface audit — classify ~6k-line HTML-string test files (keep/rewrite/drop per suite); journeys registry step inventory + which selectors/`data-*` are load-bearing; what a component-test layer must replace | R | done | `docs/research/04_test-surface-audit.md` — 34 files/~481 its classified; ~90 load-bearing `data-*` hooks enumerated; protocol-marker gate found vacuous over `public/` (pre-existing gap); REQ-TST-1..10 emitted |

## B. Architecture

| id | item | owner | status | evidence |
|---|---|---|---|---|
| B1 | Framework decision matrix — TanStack Router+Query vs React Router 7 data routers vs TanStack Start; SSR-hybrid options per Q-1; type-sharing of contracts DTOs through the BFF; emits recommendation + ADR-007 amendment draft | A | in-progress | dispatched 2026-10-07 |
| B2 | Toolchain — Vite vs keep-esbuild (Q-3); dev server/HMR, code-splitting, sourcemaps, fonts/assets, module scripts vs iife under `script-src 'self'`+nonce CSP ⚑; bundle-size budget | A | in-progress | dispatched 2026-10-07 |
| B3 | BFF API shape — keep web-BFF JSON (session cookies same-origin ⚑) vs direct api calls; stable error codes; SSE + collab-ws subscriptions in SPA; OAuth hand-off as `location.assign` not form POST (T6); optimistic-mutation convention | A | in-progress | dispatched 2026-10-07 |
| B4 | Editor/collab binding — ProseMirror+Y.Doc+decorations into React (binding lib vs hand-rolled view); sync-machine/lock-poll/findings-rail into the component tree; parity checklist vs `page.js` | A | in-progress | dispatched 2026-10-07 |

## C. Product & UX

| id | item | owner | status | evidence |
|---|---|---|---|---|
| C1 | UX goals + design-system scope — target feel (transitions, skeletons, optimistic states, cmd-palette-class affordances?); `@rhema/tokens` reuse vs new system; a11y floor (WCAG 2.2 AA shipped — must not regress) ⚑; phone posture (P1.19's reader-only Page decision revisited in SPA world) | P | in-progress | dispatched 2026-10-07 |
| C2 | Navigation/IA — post-SPA route tree; deep-link/back/scroll-restoration semantics; cross-route state persistence (Desk chord, held-file, theme) | P | in-progress | dispatched 2026-10-07 |
| C3 | Public/auth'd boundary — which routes stay SSR (marketing/pricing/sample/login) under Q-1's hybrid; SEO/first-paint floor | P | in-progress | dispatched 2026-10-07 |

## D. Verification & gates

| id | item | owner | status | evidence |
|---|---|---|---|---|
| D1 | Acceptance mechanics — journeys adaptation plan (which steps need new probes vs survive); component-test strategy (vitest+RTL vs playwright-ct); visual/a11y regression story; the phone/rhythm legs | D | in-progress | dispatched 2026-10-07 |
| D2 | Safety gates — never-cookies/protocol-marker/public-safe scans over a bundled SPA; banned-vocab lint on client copy; CSP in bundled world; bundle-size budget + CI enforcement | D | in-progress | dispatched 2026-10-07 |
| D3 | Migration sequencing — strangler vs flag vs cutover (recommendation feeds Q-5); per-surface ordering; rollback posture; preview-stage dogfooding; interplay with the unmerged 45-PR stack | D | in-progress | dispatched 2026-10-07 |

## O. Spec synthesis & review process

| id | item | owner | status | evidence |
|---|---|---|---|---|
| O1 | draft `docs/frontend-spa-spec.md` from the ledger (front matter + §0 + decision register + appendices) | S | open | |
| O2 | fresh-context adversarial review (consistency, coverage of every row, realism, self-contradiction) | S | open | |
| O3 | operator ratification round — §Q rows answered, spec → `canonical`, ledger frozen | S | open | |
| O4 | write `docs/decomposition-prompt.md` — hand-off to decompose-spec | S | open | |

## Q. Operator decisions register

| id | question (abridged) | decision | unblocks / new rows |
|---|---|---|---|
| Q-1 | SSR scope: hybrid (public SSR + auth'd SPA) vs SPA-everything vs SSR+hydration framework | **Hybrid: public/marketing/login stay SSR; auth’d app shell becomes the SPA** (operator, 2026-10-07) | B1, C3 |
| Q-2 | Framework: TanStack Router+Query vs React Router 7 data routers vs TanStack Start | **TanStack Router + Query** (operator, 2026-10-07) | B1 |
| Q-3 | Bundler: Vite (amends ADR-007) vs esbuild-only | **Vite — ADR-007 to be amended in the spec (recorded reason: SPA toolchain; SSR posture unchanged for public surfaces)** (operator, 2026-10-07) | B2 |
| Q-4 | Design ambition: reskin-on-existing-copy vs real redesign pass (design-system ticket) | **Port + polish: existing visual language migrated; fix layout/interaction debt; no dedicated redesign ticket** (operator, 2026-10-07) | C1, ticket sizing |
| Q-5 | Migration strategy: strangler-behind-flag vs branch cutover vs big-bang | **Strangler behind per-surface flag — SSR stays the fallback; journeys verify before each flip; rollback is a config flip** (operator, 2026-10-07) | D3 |
| Q-6 | Budget/pacing: funded live-verification legs + round-4 spend envelope | **$50 envelope authorized; spend frugally — cheapest viable models, short/small projects, reuse existing fixtures where possible** (operator, 2026-10-07) | D1, sequencing |
| Q-7 | Chain interaction: SPA work stacks atop the 45-PR chain vs waits for merge | **SPA work stacks on the current chain tip (MAINT.x precedent); the 45-PR merge proceeds independently on the operator's schedule** (operator, 2026-10-07) | D3 |

## Change log
<!-- append-only; one line per edit, stamped from the clock at the moment of writing -->
- 2026-10-07T20:22:03Z — ledger created by synthesize-spec mode=plan (brief `docs/frontend-spa-brief.md`; 4 streams, 15 rows, 7 §Q registers).
- 2026-10-07T20:36:13Z — A2 done: `docs/research/02_island-contract-map.md` written (island contracts + collab protocol; REQ-ISL-1..16).
- 2026-10-07T20:41:26Z — A4 done: `docs/research/04_test-surface-audit.md` written (per-file dispositions; REQ-TST-1..10).
- 2026-10-07T21:00:00Z — A3 done: `docs/research/03_data-layer-audit.md` written (BFF seam + mutation catalog; REQ-DAT-1..14).
- 2026-10-07T21:25:32Z — A1 done: `docs/research/01_route-census.md` written (~181 registrations, ~120 route rows; REQ-INV-1..8). A-stream complete; B/C/D streams dispatch.
