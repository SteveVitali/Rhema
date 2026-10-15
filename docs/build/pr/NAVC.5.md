# NAVC.5 — SsrHandoff replace-mode seam + spy migration

Manifest row 154a · stacks on `stevevitali/navc-1-delegated-interceptor` · merge policy
**OPERATOR** — do not merge from the build environment · contract
`docs/tickets/154a_NAVC.5__ssrhandoff-replace-seam.md` · run ledger
`docs/build/runs/NAVC.5.md`.

## What lands

REQ-NAVM-5's Back-loop fix as its own seam change, per spec §2.4.

- **`spa/dom.ts`** — `spaRuntime` gains `replace` (→ `window.location.replace`); a new
  `replaceDocument(href)` routes through it. Both document-nav arms stay on the **one
  `spaRuntime` seam object** — the observable seam is shared, so a test asserts "document
  nav happened" without caring which history mode carried it. `assign`/`replace` are the
  whole `window.location` doc-nav vocabulary, so coverage is complete by construction.
- **`spa/states.tsx`** — `SsrHandoff` now calls `replaceDocument`. Post-interception the
  client commit for the leaf's URL already occupies the history slot; an `assign` of the
  same URL would push a duplicate transient entry and Back would bounce forward into the
  handoff again (the r5_a3 Back-loop defect — unreachable pre-interceptor, live the day
  NAVC.1 ships). Replace eats the committed entry so the server's document verdict lands
  over it. Correct for the initial-mount leg too.
- **`spa/testkit.ts`** — `stubDocumentNav()` installs a **single** spy on *both*
  `spaRuntime` members and returns it; `restoreDocumentNav()` puts back the production
  arms. The shared helper makes the one-seam convention structural: a suite can never
  stub `assign` alone while a `replace`-arm handoff escapes unobserved (the O2-F10
  blast-radius class).
- **Spy migration — 16 suites** (the contract's "~12" was approximate; the real census is
  16): `billing`, `dossier`, `editor`, `export`, `figures`, `inbox`, `intercept`,
  `onboarding`, `outline`, `project-home`, `run-report`, `run-sheet`, `settings`, `spa`,
  `usage`, `voices`. Every suite's `assignSpy` became `docNavSpy`, installed/restored via
  the helpers; every assertion keeps the one-arg `toHaveBeenCalledWith(href)` shape —
  "nav happened, not which."

## Tests

`spa.dom.test.tsx` gains the replace-mode pin in the `SsrHandoff` describe: a
distinct-arm leg proves `spaRuntime.replace` fires with the leaf's own href while
`assign` never does, and a leaf-dispatch leg proves the real seam reaches
`window.location.replace` — never `assign` — so the committed entry is eaten (no
forward-bounce history entry). All 16 migrated suites green (354 tests in the focused
run).

## Out of scope (contract)

The interceptor itself is NAVC.1's (unchanged); `data-nav-count`/settle semantics NAVC.2;
registry/freshness NAVC.3; live R10 legs NAVC.4. `navigateDocument` (push) semantics are
unchanged — the 401→`/login` leg, the `RELOAD_STUB_IDS` short-circuit, and the external
`url` hand-offs still commit through `assign`.

## Verify

`pnpm turbo build lint typecheck` 135/135 · 16 migrated `*.dom.test.tsx` suites green
(354 focused tests) · `pnpm test` **491 files / 5,629 pass / 4 skip / 0 fail** — one
unrelated `packages/live-clients` `waitMs: 1` timing flake on run #1 passed standalone
(26/26) and did not recur ·
`check:licenses`/`protocol-markers`/`no-cookies`/`spa-budget`/`spa-env`/`dom-contract`
all green (no new DOM hooks — no manifest row needed) · `check-build-memory.sh` 0
violations · `check-append-only` vs `7e4493c` OK · DEFERRALS: none opened, none closed
(no NAVC-scoped OPEN row) · $0 spend, no deploys, no prod writes.

Requirement ids: REQ-NAVM-5
