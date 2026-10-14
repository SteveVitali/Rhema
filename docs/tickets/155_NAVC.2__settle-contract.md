# NAVC.2 — Settle + nav-mechanism contract (data-nav-count, pending mounted, settle helpers)

- **Sequence:** 155 · **Phase:** round 5 · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 154a_NAVC.5
- **Run:** `implement-spec spec=docs/tickets/155_NAVC.2__settle-contract.md`
- **Gate status:** none
- **Live stage:** none
- **Production mutations:** none
- **Size budget:** ~400 changed lines

## Goal
Close the observability gap that let zero-client-routing ship: a per-document nav counter, honest
`data-mounted` pending semantics, and the mechanism-aware settle helpers journeys will use.

## Load
- `docs/post-spa-disposition-spec.md` §3 (REQ-NAVT-1/2/3/6/7 — incl. the O2-F18 all-documents rule + O2-F20 un-gating)
- `docs/research/r5_a4_nav-verification.md` (the contract design + the `documentLoads` gating find)
- `apps/web/src/render.tsx` (SSR stamp site), `apps/web/src/spa-shell.ts` (shell stamp site), `apps/web/src/spa/head.tsx` (`data-route`/`data-mounted` stamping ~:41-52)
- `packages/journeys/src/settle.ts` (`settleNav` ~:169-183), `runner.ts:189-240` (the document-response watcher — gated on `deps.expectRenderer` today)
- `apps/web/src/dom-contract.ts`

**Shared signal (with 154_NAVC.1):** `data-nav-count` increments on the router's
navigation-commit event — the same "committed in-document location transition" signal 154's
navKey pin tests; this ticket names and owns the definition.

## In scope — deliverables
1. **`data-nav-count`** (REQ-NAVT-1): `"0"` stamped on EVERY served document — `render.tsx` SSR
   AND `spa-shell.ts` (the reset IS the document-load detector); HeadManager increments once per
   committed in-document location transition (push/replace/pop; never hydration).
2. **Pending `data-mounted`** (REQ-NAVT-2): removed while `isLoading`, re-stamped on resolution —
   dom suites' `removeAttribute` mounts stay green; no suite may depend on persistence.
3. **Settle helpers** (REQ-NAVT-3): `settleClientNav` (requires a nav-count increase AND zero
   document loads) + `settleDocumentNav` (inverse); `SettleScope.documentLoads` counting
   unconditional — the `runner.ts` response watcher is NOT gated on `expectRenderer` anymore.
4. **Mechanism pinning** (REQ-NAVT-6): `settleNav`/`gotoOk`/`reloadSettled` stay
   mechanism-agnostic; no existing leg flips mechanism silently — the pin test asserts both
   helpers' distinct semantics.
5. **Dom-contract row** (REQ-NAVT-7): `data-nav-count` as **all-documents required** — lands
   with both renderers' emitters + assertions this PR. (`data-page-session` lands row+emitter+
   assertion together in 156_NAVC.3 — spec §3 REQ-NAVT-7 forbids a manifest row ahead of its
   emitter; `check:dom-contract` would fail it.)

## Out of scope
- `data-page-session` (row + emitter + assertion) → 156_NAVC.3 · R10 legs → 157_NAVC.4

## Acceptance criteria
- [ ] SSR + shell documents both stamp `data-nav-count="0"`; the counter increments per committed transition; a doc load resets it — unit/dom-tested *(deterministic)*
- [ ] `data-mounted` absent during pending; the mid-transition false-pass is tested closed *(deterministic)*
- [ ] `settleClientNav`/`settleDocumentNav` + unconditional `documentLoads` — journey-helper unit tests *(deterministic)*
- [ ] `check:dom-contract` green *(deterministic)*
- [ ] verification green; BUILD_INDEX row + LEDGER advanced; operating clauses met. *(agentic — universal AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-NAVT-1 REQ-NAVT-2 REQ-NAVT-3 REQ-NAVT-6 REQ-NAVT-7
