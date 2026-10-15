# NAVC.5 — SsrHandoff replace-mode seam + spy migration (run ledger)

- **Spec:** `docs/tickets/154a_NAVC.5__ssrhandoff-replace-seam.md` (manifest row 154a, round 5)
- **Normative loads:** `docs/post-spa-disposition-spec.md` §2.4 (REQ-NAVM-5 + the O2-F10
  blast radius); `docs/research/r5_a3_nav-mechanism.md` (the Back-loop defect write-up);
  `docs/research/r5_o2_review-dispositions.md` O2-F10 (spy-migration blast radius → shared seam)
- **Base:** `stevevitali/navc-5-ssrhandoff-replace-seam` forked at `7e4493c` (navc-1 tip incl.
  its closeout — the chain's true head)
- **Branch:** `stevevitali/navc-5-ssrhandoff-replace-seam` (mergePolicy=OPERATOR — never merge;
  PR base `stevevitali/navc-1-delegated-interceptor`)
- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** implement-spec + build-memory @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-NAVM-5
- **Started:** 2026-10-15T08:50Z · **Closed:** —
- **Config:** full rigor (ledger + self-review + gap analysis + tests + evidence report);
  **Live stage: none**; **Production mutations: none**; metered spend **$0**;
  zero prod writes, zero deploys, zero merges

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Every `OPEN` row is live-deploy- or
HUMAN/operator-gated (corpus, preview legs behind the `rhema-nonprod-resend-api-key` seed,
prod flips); none is scoped to the SPA document-navigation seam and none is unblocked by this
ticket. New rows opened: none expected (verification is fully offline).

## Deploy boundary (recorded constraint — inherited from the chain)

NAVC.1's contract carried the M5 note: interceptor/nav-chain code must not deploy ahead of
156_NAVC.3 (the registry destroy-identity fix). This ticket's seam is the server-side arm of
the same stack — nothing here deploys (operator merges + deploys); the constraint is recorded
and nothing is restructured to route around it.

## Requirements (from the contract + spec §2.4)

1. **`spaRuntime.replace` + `replaceDocument(href)`** in `apps/web/src/spa/dom.ts`; `SsrHandoff`
   (`spa/states.tsx`) routes through `replaceDocument` — the Back-loop fix (post-interception
   the client commit already occupies the history slot; `assign(sameUrl)` would duplicate it →
   Back lands on the transient entry → leaf re-renders → re-assigns → forward bounce).
2. **ONE observable seam** — `navigateDocument`/`replaceDocument` share the one `spaRuntime`
   seam object; the suites' single spy covers both members so an assertion reads "document nav
   happened", never which arm carried it.
3. **Spy migration** — every `spaRuntime.assign`-stubbing `*.dom.test.tsx` suite (16 files:
   billing, dossier, editor, export, figures, inbox, intercept, onboarding, outline,
   project-home, run-report, run-sheet, settings, spa, usage, voices — the contract's "~12"
   is the spec's approximation; the real census is 16) migrates to the shared seam — one spy
   over `assign` + `replace`, installed/restored through a shared `testkit.ts` helper so no
   suite can cover only one arm.
4. **Pin test** — the SsrHandoff leg commits replace-mode: the `replace` arm fires with the
   leaf's own href and `assign` never does (no forward-bounce history entry).

## Acceptance criteria (from the contract)

- [x] `replaceDocument` seam lands; SsrHandoff uses it; all migrated suites green
  *(deterministic · engineered)*
- [x] universal phase-gate AC — verification green; BUILD_INDEX row + LEDGER advanced;
  operating clauses met *(agentic)*

## Plan

1. `spa/dom.ts` — `spaRuntime` gains `replace` (→ `window.location.replace`); add
   `replaceDocument(href)`; header comment updated to name the two-arm seam + the
   one-spy convention.
2. `spa/states.tsx` — `SsrHandoff` calls `replaceDocument`; doc comment names the
   replace-mode semantics (REQ-NAVM-5 Back-loop fix).
3. `spa/testkit.ts` — `stubDocumentNav()` (installs ONE `vi.fn()` on both `spaRuntime`
   members; returns it) + `restoreDocumentNav()` (restores both production arms). The helper
   makes the shared seam structural — a suite cannot stub `assign` alone and miss a
   `replace`-arm nav (the O2-F10 failure class).
4. Migrate the 16 suites — `assignSpy` → `docNavSpy`, install/restore through the helpers;
   drop the now-unused `spaRuntime` import where nothing else needs it. Assertions keep the
   one-arg `toHaveBeenCalledWith(href)` shape — unchanged, per "not which".
5. `spa.dom.test.tsx` SsrHandoff describe — the pin test: distinct-arm spies assert
   `spaRuntime.replace` fired with the leaf href and `assign` never did; a second leg pins
   the real dispatch reaching `window.location.replace` (not `assign`) — the
   eats-the-entry semantics.
6. `intercept.dom.test.tsx` header comment — seam wording updated (it cites
   `spaRuntime.assign` verbatim).

## Test matrix (Phase 1.4)

| row | input | expected |
|---|---|---|
| seam shape | `dom.ts` exports | `spaRuntime.assign` + `spaRuntime.replace` + `navigateDocument` + `replaceDocument` |
| SsrHandoff arm | mount `/usage` under `surfaces: {"/usage":"ssr"}` | `spaRuntime.replace` called `("/usage")`; `assign` never called |
| leaf dispatch | same mount, real seam, `location` spied | `window.location.replace("/usage")` fires; `window.location.assign` does not |
| shared seam | every migrated suite's nav assertions | one `docNavSpy` catches both arms; `toHaveBeenCalledWith(href)` unchanged |
| regression | navigateDocument callers (401→/login, stubs, external `url` hand-offs) | still observed by the same spy (assign arm) |
| universal | `pnpm turbo build lint typecheck` · `pnpm test` · all `check:*` | green |

## Progress

- 2026-10-15T08:50Z — Phase 0 complete: DEFERRALS read (no NAVC-scoped OPEN rows — the
  `D-SPA.*-1` preview rows are gated on the operator's `rhema-nonprod-resend-api-key` seed,
  unrelated); LEDGER read (`nextTicket: NAVC.5`, `chainTip: navc-1` @ `b7a05f1`); anchors
  verified — `dom.ts:11-20` (the one-member seam), `states.tsx:32-38` (SsrHandoff →
  `navigateDocument`), NAVC.1's OQ1 evidence (`location.replace` spyable in happy-dom);
  the spy census is **16 suites** (the contract's "~12" is approximate — export/inbox/
  intercept/spa also stub the seam). `pnpm install` clean (lockfile unchanged).
- Design decision (recorded): the shared seam is the `spaRuntime` object itself — both arms
  (`assign`/`replace`) live on it and `navigateDocument`/`replaceDocument` route through it;
  the suites install ONE spy over both members via `stubDocumentNav()`/`restoreDocumentNav()`
  in `testkit.ts`, so "document nav happened" is a single-spy assertion that cannot observe
  only one arm. The contract's named API is exactly `spaRuntime.replace` + `replaceDocument`
  (no third member named); `spaRuntime` is already documented in `dom.ts` as "the one seam
  every document navigation goes through" — the two arms sharing it is the literal read, and
  the happy-dom location vocabulary (assign|replace) is closed, so two-member coverage is
  complete coverage.

- 2026-10-15T08:52Z — Phase 2 implemented: `dom.ts` gained `spaRuntime.replace` +
  `replaceDocument`; `SsrHandoff` routes through it; `testkit.ts` gained
  `stubDocumentNav`/`restoreDocumentNav`; all 16 suites migrated (`assignSpy` → `docNavSpy`
  installed over both members); the replace-mode pin tests landed in `spa.dom.test.tsx`.
  Focused runs: the 16 migrated suites green (354 tests — 12-file leg 247 + 4-file leg 107,
  incl. spa.dom.test.tsx's new 21 with the two pin rows). `turbo build lint typecheck`
  135/135; `check:licenses`/`check:protocol-markers`/`check:no-cookies`/`check:spa-env`/
  `check:dom-contract`/`check:spa-budget` all green.
- 2026-10-15T09:10Z — Phase 3–4: full `pnpm test` run #1 hit ONE unrelated flake —
  `packages/live-clients/src/ingest.test.ts` "retried preview JOINS the marker's execution"
  expected a `waitMs: 1` preview to stay pending but it completed under full-suite load
  (timing-starvation class, pre-existing, zero NAVC.5 interaction). The file passes
  standalone (`vitest run packages/live-clients/src/ingest.test.ts` — 26/26) and the full
  re-run is green: **491 files / 5,629 pass / 4 skip / 0 fail**. Recorded as a finding, not
  fixed — out of scope. Self-review (mechanical + design): all `navigateDocument` callers
  (`bff.ts` 401→`/login`, `main.tsx`, `nav-intercept.ts` stubs) correctly keep push
  semantics — they navigate to a DIFFERENT URL; only `SsrHandoff` re-navigates to the same
  URL where the client commit already sits. The `intercept.dom.test.tsx` OQ1 pin is
  unaffected — router-core dispatches `reloadDocument` through `window.location` directly,
  never through `spaRuntime`. One blast-radius doc line trued: `AGENTS.md` §Frontend named
  `SsrHandoff → navigateDocument` — now `→ replaceDocument` (this diff is what made it
  stale; the line describes the seam this ticket changes). `check-build-memory` 0
  violations (8 pre-existing-class warnings); append-only vs `7e4493c` OK.

## Gap table

Spec re-read fresh at Phase 4 (contract + spec §2.4); the Phase-0.3 extraction held — no drift.

| item (spec §) | required layer | achieved layer | status | evidence |
|---|---|---|---|---|
| `spaRuntime.replace` + `replaceDocument(href)` land in `dom.ts` | engineered | engineered | met | `spa/dom.ts` — `spaRuntime` gains `replace` (→ `window.location.replace`); `replaceDocument(href)` routes through it |
| `SsrHandoff` calls `replaceDocument` | engineered | engineered | met | `spa/states.tsx:38` (`SsrHandoff` useEffect); doc comment names the Back-loop semantics |
| Both doc-nav arms share ONE observable seam (assert "nav happened", not which) | engineered | engineered | met | `spa/dom.ts` — `spaRuntime` is the single seam object for both `navigateDocument`/`replaceDocument`; `spa/testkit.ts` `stubDocumentNav()` installs ONE spy over BOTH members — a suite cannot observe only one arm (the O2-F10 failure class is structurally closed); every migrated assertion keeps one-arg `toHaveBeenCalledWith(href)` |
| ~12 `assign`-spying suites migrate to the shared seam | engineered | engineered | met | all **16** stubbing suites migrated (billing, dossier, editor, export, figures, inbox, intercept, onboarding, outline, project-home, run-report, run-sheet, settings, spa, usage, voices) — the contract's "~12" was the spec's approximation; census-verified by grep (`stub=1 rest≥1 decl=1` per file, zero `spaRuntime.assign =` leftovers outside the pin test) |
| Pin test: handoff commits replace-mode (no forward-bounce entry) | engineered | engineered | met | `spa.dom.test.tsx` SsrHandoff describe — distinct-arm pin (`spaRuntime.replace` fires `("/usage")`, `assign` never does) + leaf-dispatch pin (`window.location.replace` fires, `assign` does not) |
| AC — `replaceDocument` seam lands; SsrHandoff uses it; migrated suites green | deterministic | engineered | met | focused `vitest run` over all 16 files — 354/354 pass |
| AC — universal phase-gate | agentic | engineered | met | `turbo build lint typecheck` 135/135 · `pnpm test` 491 files / 5,629 pass / 4 skip / 0 fail (run #2; run #1's single `live-clients` timing flake passes standalone + didn't recur) · all six `check:*` green · build-memory 0 violations · append-only vs `7e4493c` OK · BUILD_INDEX + LEDGER advanced at closeout |

**Out-of-scope confirmed untouched:** `spa/nav-intercept.ts` unchanged (the interceptor arm is
NAVC.1's); zero component ports; no `data-*` hooks added (`check:dom-contract` green — no
manifest row needed, no new DOM vocabulary); `navigateDocument` semantics unchanged (push);
`spaRuntime`'s `assign` arm untouched.

## Evidence log

- `pnpm install` — clean; lockfile unchanged.
- `pnpm turbo build lint typecheck` — **135/135 tasks** (remote-cached where valid).
- Focused: `pnpm exec vitest run` over all 16 migrated suites — **354/354 pass**
  (12-file leg 247 + 4-file leg 107; `spa.dom.test.tsx` now 21 incl. the two pin rows).
- `pnpm test` — run #1: 490 pass / 1 fail (`packages/live-clients/src/ingest.test.ts`
  timing flake — `waitMs: 1` preview completed under load; unrelated, no NAVC.5 file
  touched); standalone re-run of the file: **26/26 pass**; full run #2: **491 files /
  5,629 pass / 4 skip / 0 fail**.
- `pnpm check:licenses` · `check:protocol-markers` · `check:no-cookies` · `check:spa-env` ·
  `check:dom-contract` · `check:spa-budget` — **all green** (no manifest row needed —
  zero new DOM hooks).
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` —
  **0 violations** (8 pre-existing-class warnings — legacy status vocabulary, older
  run-ledger harness headers, PHASE-LOG size; none introduced by this run).
- `node docs/build/tools/check-append-only.mjs --base 7e4493c` — **OK** (protected
  regions only grew).
- Self-review: mechanical diff pass + design pass over all 21 files; the only
  arm-specific assertions are the two intentional pin rows in `spa.dom.test.tsx`;
  zero `spaRuntime.assign =` stubs remain in migrated suites.

## Evidence report

_(populated at close)_
