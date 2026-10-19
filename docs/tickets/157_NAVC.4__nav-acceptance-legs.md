# NAVC.4 — Nav acceptance: R10 + keepalive legs, scroll/keymap/head, boundary acceptance

- **Sequence:** 157 · **Phase:** round 5 · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 156_NAVC.3 (NAVC-17/18 must land first — O2-F5 ordering)
- **Run:** `implement-spec spec=docs/tickets/157_NAVC.4__nav-acceptance-legs.md`
- **Gate status:** none
- **Live stage:** operator-gated: prod journey legs ($0 — R10/R10.keepalive are `paid:false`)
- **Production mutations:** none
- **Size budget:** ~450 changed lines

## Goal
Prove the SPA navigates like an SPA: the R10 chain leg + keepalive leg run against prod, the
scroll/keymap/head acceptance holds under real client navs, and the server-owned boundaries are
tested (not just asserted).

## Load
- `docs/post-spa-disposition-spec.md` §3 (REQ-NAVT-4/5) + §4 (REQ-NAVC-16/19/21/23) + §2.5/§2.9 (REQ-NAVM-9/10)
- `docs/research/r5_a4_nav-verification.md` (R10 arm shape, undo-stack semantic proof, TTL=120s)
- `packages/journeys/src/{registry,settle,steps,runner}.ts` (leg wiring; `project-home`+`editor` SURFACE_GATES)
- `apps/web/src/spa/controller.ts:1151-1154` (`nav.hash` consumers → the `hashchange` compensation) + `spa/head.tsx`

## In scope — deliverables
1. **R10** (REQ-NAVT-4): `/app` → click `/p/:slug` → click `a[data-edit-source]` →
   `/p/:slug/v/working` → Back — asserting route/mounted markers, monotone `data-nav-count`,
   `documentLoads===1`, and the warm-return twin-GET policy NAVC-18 established.
   `paid:false`, `expected:"red"` until first live leg; gates `project-home`+`editor`.
2. **R10.keepalive** (REQ-NAVT-5): `data-page-session` unchanged across leave→`/app`→return
   within 120 s TTL + the semantic undo arm (a synced marker is Ctrl+Z-removable post-round-trip
   — impossible on a re-seeded EditorState).
3. **Scroll/head contract** (REQ-NAVC-16/21): back/forward restore, top-on-push, hash-target vs
   HeadManager focus precedence, announce policy, `.ide-page` inner-scroller; enumerate the
   `resetScroll:false` navs (`?triage`, `[`/`]` stepping).
4. **Keymap + hash gap** (REQ-NAVC-19 + NAVM-10): controller `hashchange` compensation so
   `selectFinding`/`controller` hash consumers fire on in-app fragment clicks.
5. **Server-boundary acceptance** (REQ-NAVC-23): tested (not asserted) — reloadDocument stubs,
   SsrHandoff, `/login`/external/binary doc-navs, `/app` precedence skip, mid-`beforeLoad`
   redirect history-slot semantics.
6. **Head duties stay put** (REQ-NAVM-9): no interceptor-side scroll/title/focus logic —
   verified by review checklist + a dom test.

## Out of scope
- Anything already landed in NAVC.1–.3 · preload (deferred — REQ-NAVM-7)

## Acceptance criteria
- [ ] R10 + R10.keepalive green on prod with `data-nav-count`/`data-page-session`/undo-stack evidence *(live-executed)*
- [ ] Scroll/keymap/head/boundary acceptance items each carry a test or a recorded verification *(deterministic/live-executed)*
- [ ] REQ-NAVC-23's tested acceptance incl. the reloadDocument-redirect history slot *(deterministic)*
- [ ] verification green; BUILD_INDEX row + LEDGER advanced; operating clauses met. *(agentic — universal AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-NAVT-4 REQ-NAVT-5(leg half) REQ-NAVC-16 REQ-NAVC-19 REQ-NAVC-21 REQ-NAVC-23 REQ-NAVM-9 REQ-NAVM-10
