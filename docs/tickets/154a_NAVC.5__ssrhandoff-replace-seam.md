# NAVC.5 — SsrHandoff replace-mode seam + spy migration

- **Sequence:** 154a · **Phase:** round 5 · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 154_NAVC.1
- **Run:** `implement-spec spec=docs/tickets/154a_NAVC.5__ssrhandoff-replace-seam.md`
- **Gate status:** none
- **Live stage:** none
- **Production mutations:** none
- **Size budget:** ~250 changed lines (seam + mechanical spy migration)

## Goal
Land REQ-NAVM-5's Back-loop fix as its own seam change: `replaceDocument` beside
`navigateDocument`, `SsrHandoff` routed through it, and the ~12 dom suites' `spaRuntime.assign`
spies migrated — independent of the interceptor so the seam lands testably on its own.

## Load
- `docs/post-spa-disposition-spec.md` §2.4 (REQ-NAVM-5 + the O2-F10 blast radius)
- `apps/web/src/spa/dom.ts:11-20`, `spa/states.tsx:32-38` (SsrHandoff → navigateDocument)
- The ~12 `assign`-spying suites: editor/dossier/figures/run-sheet/billing/onboarding/voices/outline/settings/project-home/run-report/usage `*.dom.test.tsx`

## In scope — deliverables
1. `spaRuntime.replace` + `replaceDocument(href)` in `dom.ts`; SsrHandoff calls it; both doc-nav
   arms share ONE observable seam (tests assert "document nav happened", not which).
2. The ~12 suites migrate `assign` spies to the shared seam — mechanical, same PR.
3. A pin test: handoff commits replace-mode (no forward-bounce history entry).

## Acceptance criteria
- [ ] `replaceDocument` seam lands; SsrHandoff uses it; all migrated suites green *(deterministic)*
- [ ] universal phase-gate AC.

## Requirement IDs to satisfy and stamp in the PR
REQ-NAVM-5
