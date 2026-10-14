# SPA.6 — Journey harness: --expect-renderer/--surface, SURFACE_GATES, settle helpers, probe re-spec (run ledger)

- **Status:** DONE (Stage A; code + tests landed — the two staging-verified live legs are deferred
  to the first flagged deployment → **D-SPA.6-1 OPEN**)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/103_SPA.6__journey-harness.md` (manifest row 103)
- **Branch:** `stevevitali/spa-6-journey-harness`, stacked on
  `stevevitali/spa-5-bff-conventions` @ `1e84a99` (`OPERATOR` merge policy, **not merged**).
  PR **#124**. Tip `d653f10` (code) + closeout docs commit.
- **Goal:** the acceptance machinery — `rhema-journeys` gains `--expect-renderer ssr|spa`,
  `--pin-renderer ssr|spa`, and `--surface <key[,key…]>`; the `SURFACE_GATES` table maps every
  `SpaSurface` to its flip-gate step subset (+ `legNotes`/`owed`/`weeklyHolds`); `settle.ts`
  carries the renderer-agnostic `data-mounted`/`data-route`/`data-renderer` wait contract;
  `runner.ts` checks every same-origin HTML document's `data-renderer` and stamps
  `x-rhema-renderer` on every context; the SSR-mechanics probes are re-spec'd onto hooks +
  settle markers; P1 and X1 split into per-surface legs.
- **Spend:** $0. No deploys, no production writes, no live legs (none reachable — see §3).

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): no `OPEN` row is unblocked by SPA.6 — the open rows are
  funded-window legs, operator deploy legs, HUMAN prerequisites, or product decisions; none is
  harness-scoped. **One new row owed:** `D-SPA.6-1` (the two staging-verified legs need a deploy
  carrying the SPA.3 marker vocabulary and/or a `pr-<n>` preview — neither exists).
- LEDGER CURRENT STATE read: `nextTicket: SPA.6`, `chainTip: stevevitali/spa-5-bff-conventions`
  (`1e84a99`), `mergePolicy: OPERATOR`, `round: 4`, `dispatchTarget: subagent`.
- Design sources applied, not re-derived: `docs/design/27_spa-acceptance-mechanics.md` (the
  settle contract, the step-split table F9, the probe re-spec rules — hooks + settle markers,
  never SSR internals); `docs/design/29_spa-migration-sequencing.md` §two-leg procedure (leg A
  pinned-ssr, leg B unpinned expect-spa, leg C the free suite, rollback = flag revert + leg A
  re-run); `docs/frontend-spa-spec.md` §10 (verification and acceptance); `SPA_SURFACES` /
  `SpaSurface` / `SPA_RENDERER_HEADER` from `@rhema/contracts` (SPA.2's vocabulary — consumed,
  not redeclared); `deps.spa`'s consult order (SPA.3) for what the pin flips.

## 1 — What landed

### `packages/journeys/src/settle.ts` (new) — the settle contract (REQ-VFY-3/4/7)

- `awaitMounted(page, scope, wait)` — waits for `<html data-mounted>` plus optional
  `data-route`/`data-renderer` equality; **no-ops on foreign origins** (the Stripe-hosted
  hand-offs carry no markers); bounded (default 30 s) and on lapse throws with the *observed*
  route/renderer/mounted state.
- `gotoOk(page, url, scope, wait)` — status check first (≥400 throws), then the settle contract.
- `settleNav(page, scope, wait)` — post-action settle: lets a document navigation commit if one
  is in flight, then asserts the markers (the same call holds on SSR's reload and the SPA's
  client-nav — design/29 F6).
- `reloadSettled(page, scope, wait)` — the remount assert (REQ-VFY-4's reload leg).
- `onOurOrigin` / `rendererOfDocument` / `RENDERER_HEADER` (`x-rhema-renderer`) / `RendererName`
  — the shared vocabulary the runner imports (one definition, no forked regexes).

### `packages/journeys/src/surface-gates.ts` (new) — the flip-gate table (REQ-VFY-8/10, REQ-SEQ-7)

- `SURFACE_GATES: Record<SpaSurface, SurfaceGate>` — **total over all 15 surface keys** (the type
  enforces it; a new `SpaSurface` key without a gate row is a compile error). Each row: `flag`
  (echoed for report serialization), `steps` (the `paid:false` gate subset), `legNotes` (which
  leg of a multi-surface step carries this surface's contract), `owed` (free coverage debt with
  the owning ticket named), `weeklyHolds` (paid steps whose weekly green must hold — never in
  the gate).
- `stepsForSurfaces(keys)` — unions the selected subsets in registry order; **throws on an empty
  gate** (an `owed`-only surface — `outline`, `figures`, `run-report` today — refuses loudly with
  the owed text, so a vacuous selection can never look like a gate).
- `TWO_LEG_PROCEDURE` — the leg A/B/C + rollback contract as a serializable const (the per-flip
  runbook in one place).
- Gate contents (selected step ids): `usage`→X1.usage; `inbox`→T2,R8,X1.inbox; `settings`→
  T2,T3,R8; `voices`→T5,X1.voices; `onboarding`→N1,N3,N4,P1.app-new; `project-home`→R1,R7,T2,T6,
  T7,P1.project,X1.home; `billing`→N9; `export`→R5,T4,T8(red — owed-reporting leg, not a gate
  assert); `run-sheet`→N4,R7,N9,P1.runsheet; `dossier`→N7,T1 (+T10–T13 weekly holds + the SPA.21
  owed row); `editor`→N8,P1.pill,P1.project,R7,T2,T6,T7; `ide-chrome`→P1.project (+T12 weekly
  hold); `outline`/`figures`/`run-report`→∅+owed.

### `packages/journeys/src/runner.ts` — the renderer leg contract (REQ-VFY-7, REQ-SEQ-4)

- `RunnerDeps.expectRenderer` / `.pinRenderer`; `StepCtx.expectRenderer` / `.extraHTTPHeaders`;
  `JourneyReport.renderer:{expect,pin}` (additive — older report readers ignore it).
- The pin stamps `x-rhema-renderer` on **every** context the run creates: `ctx.anon()`, cached
  session opens, fresh magic-link mints (all three `newContext` sites), and step-rolled contexts
  via `ctx.extraHTTPHeaders` (R4's real-phone context spreads it — audited; it was the one
  hand-rolled `newContext` in steps/stb5a).
- The expectation rides the **document response stream**: `resourceType==="document"` + 2xx +
  same-origin + `content-type: text/html` ⇒ the body must carry `data-renderer=<expected>`;
  reads are `allSettled` after the impl so a pending body can't race classification; a
  wrong/absent marker fails a green step exactly like a throw (on a red step it reports `owed`).
  Client-side route transitions serve no document — the settle helpers own those.
- **Session-wiring fix:** `JourneySessions` gains `onPage` — the runner wires the running step's
  listeners from *inside* `open()`/`mint()` **before the first navigation** (`wireCurrent` swaps
  per step). Previously a session page was wired only after `signIn` returned, so the mint's own
  `/signup` + magic-link docs escaped the response check — closed.

### `packages/journeys/src/cli.ts` + `cli-flags.ts` (new)

- `--expect-renderer <ssr|spa>` (env `JOURNEY_EXPECT_RENDERER`), `--pin-renderer <ssr|spa>`
  (env `JOURNEY_PIN_RENDERER`), `--surface <key[,key…]>` (env `JOURNEY_SURFACE`).
- All validation is in `cli-flags.ts` returning error **strings** (the CLI prints + exits 2) —
  the full refusal table is unit-testable: bad renderer value, unknown/empty surface key, empty
  gate, paid-step gate hit (REQ-VFY-10's runtime belt under the schema test), and the prod
  refusal of `--pin-renderer spa` (`isProdTarget`: `--stage prod` or any `*.rhema.tools` host —
  SPA_OVERRIDES never sets on prod, so a spa pin there could only produce vacuous green).
- `--surface` intersects with `--steps`/`--journey`; `--steps P1` selects the split family by
  prefix (backward-compatible with the pre-split idiom); each selected surface echoes its gate
  subset + owed/holds on stderr.

### `packages/journeys/src/registry.ts` — the P1/X1 splits (design/27 F9)

- `P1` → `P1.public` (anon surfaces @390/320 + pricing-matrix region + 200% zoom + axe),
  `P1.project` (the project page at phone width), `P1.pill` (the sync pill + phone reader-Page
  contract), `P1.runsheet` (the run-sheet §10.1 capability note), `P1.app-new` (/app/new chrome
  at 1440×900). Asserts/owner/`expected:"green"` carry over verbatim; the composite's prod proof
  is recorded in the registry comment (UX.2 Stage B, run `4ff89a27d950`).
- `X1` → `X1.voices` / `X1.usage` / `X1.home` / `X1.inbox` / `X1.detail` — per-surface two-tenant
  probes sharing the planted fixture inside one run.
- `--steps P1`/`X1` still select the family by prefix; the coverage-matrix checker resolves an
  umbrella `journey:P1`/`journey:X1` ref to any `P1.*`/`X1.*` member (family-aware, matching the
  registry test's planning-ledger resolution — the nine matrix rows citing the umbrellas stay
  verbatim).

### Probe re-specs (`steps.ts`, `stb5a.ts`)

- Every same-origin document navigation goes through the settle helpers: `gotoOk(page,url,ctx)`,
  `settleNav` after click/form navs, `reloadSettled` for remount asserts. The magic-link landing,
  form-action POSTs, follow-link paths, and reloads all settle on `data-mounted` — never on
  SSR-timed `waitForNavigation`/`domcontentloaded` assumptions (the three surviving raw waits are
  the session probe/mint pre-navigation plumbing — now wired via `onPage` — and the Stripe-hosted
  checkout hop, a foreign origin where the markers do not apply, commented as such).
- The SSR-mechanics probes became renderer-agnostic: N3's conversion preview waits on
  `[data-conversion-action="create"]` instead of the meta-refresh/pending page shape; the estimate
  matrix is read from the typed `<script type="application/json" data-estimate-matrix>` embed
  (the `var R=` boot script stays for no-JS progressive enhancement); form-post targets pin to
  `data-*-form` hooks (`data-new-project-form`, `data-export-form`, `data-duplicate-form`,
  `data-apply-form`, `data-notifications-form`, `data-export-request-form`, `data-restore-form`,
  `data-obligation-form`, `data-source-settings-form`, `data-samples-form`, `data-menu-form=<key>`)
  — the hooks both renderers must emit, so leg A and leg B assert the same contract.

### DOM hooks (additive — `apps/web/src/pages.tsx`, `packages/ui`)

- `pages.tsx`: `data-restore-form` (deleted-row restore), `data-new-project-form` (the held/new
  submit), `data-apply-form=<findingId>` (the finding apply post), `data-duplicate-form` (the
  showcase banner's Duplicate), `data-obligation-form`, `data-source-settings-form`,
  `data-samples-form`, `data-notifications-form`, `data-export-request-form`.
- `packages/ui/src/conversion.tsx`: `data-conversion-form` + `data-conversion-action="create"|
  "fix_now"`.
- `packages/ui/src/project-list.tsx`: `data-menu-form=<key>`/`data-menu-action=<key>` on
  formAction menu items (link items never claim the form hook).
- `packages/ui/src/run-sheet.tsx`: the `data-estimate-matrix` typed-JSON embed alongside `var R=`.
- No HTML shape, copy, or attribute removed; all hooks additive (deployable-dark invariant).

## 2 — Tests (every behavior fails if the code is removed)

- `settle.test.ts` (11) — mounted/route/renderer waits resolve on SSR-static markers and on a
  simulated SPA repaint; wrong route/renderer fail with the observed state in the message;
  foreign-origin pages no-op; `gotoOk` status floor; `settleNav`/`reloadSettled` behavior.
- `surface-gates.test.ts` (11) — totality ⇄ `SPA_SURFACES` bijection; every gated step exists,
  is `paid:false`, and every `weeklyHolds` id is `paid:true` (REQ-VFY-10 both directions);
  empty-gate refusal with owed diagnostics; union order = registry order; the `export` row's
  red-step note.
- `cli-flags.test.ts` (9) — the full refusal table as asserted strings: renderer enum, prod
  `spa`-pin refusal (`isProdTarget` over stage + host), unknown/case-sensitive/empty surface
  keys, empty-gate propagation, the injected-paid-step belt, `gateEcho` contents.
- `runner.test.ts` SPA.6 block (5) — wrong-renderer doc ⇒ green `fail` + message; right renderer
  ⇒ `pass`; foreign-origin/non-HTML never trip; the pin reaches `newContext` + `ctx` + the
  report's `{expect,pin}`; no pin ⇒ no headers.
- `session.test.ts` (+1) — the cached-mint context carries `extraHTTPHeaders` AND `onPage` fires
  before the page's first `goto` (ordering asserted, not just presence).
- `registry.test.ts` — the split ids, family-aware planning-ledger resolution (`P1`/`X1` base
  ids map to their split members), owner/green baselines preserved.
- `packages/ui/src/spa-journey-hooks.test.tsx` (3, new) — removal-catching renders:
  `data-conversion-form`/`data-conversion-action` on ConversionPreview; the parseable
  `data-estimate-matrix` JSON embed on RunSheet (alongside `var R=`); `data-menu-form`/
  `data-menu-action` keyed on a formAction row-menu item.
- Web route assertions extended (removal-catching): `server.test.ts` (`data-new-project-form` on
  GET /app/new), `export.test.ts` (`data-export-form`), `settings-pages.test.ts`
  (`data-notifications-form`), `analytics-surfaces.test.ts` (`data-export-request-form`),
  `dossier-evidence.test.ts` (`data-duplicate-form` under a `showcase:true` dossier — and absent
  on an ordinary one).
- `scripts/check-coverage-matrix.test.mjs` — umbrella `journey:P1`/`journey:X1` refs resolve to
  the split families (the fix is asserted by the suite itself re-running green).

## 3 — Verify

- `pnpm --filter @rhema/journeys typecheck` / `lint`: **clean** (0 errors).
- `pnpm --filter @rhema/ui typecheck` / `lint`: **clean**.
- `pnpm --filter @rhema/web typecheck` / `lint`: **clean** (one pre-existing *warning* — unused
  eslint-disable in `spa.dom.test.tsx`, inherited from SPA.4's committed code; 0 errors).
- `pnpm turbo build lint typecheck`: **135/135 tasks** green.
- `pnpm exec vitest run packages/journeys`: **11 files / 110 tests pass** (journey suite from the
  repo root — the package-local invocation finds no files under the repo-relative include
  patterns; recorded, not a failure).
- `pnpm exec vitest run apps/web packages/ui`: **52 files / 710 tests pass**.
- `pnpm test` (full suite): **462 files / 4,779 pass / 4 skip / 0 fail** (~624 s — includes the
  `privsep.docker` leg). The first run caught `check-coverage-matrix` red on the nine umbrella
  `journey:P1`/`journey:X1` refs → fixed by making the checker family-aware; the rerun is green.
- `pnpm check:licenses` / `check:protocol-markers` / `check:no-cookies` / `check:spa-budget`:
  **all clean** (licenses "OK", markers clean, no-cookies 28 surfaces, budget all ceilings).
- `pnpm install --frozen-lockfile`: **N/A — no manifest changes**.

### Live legs — attempted, blocked (→ D-SPA.6-1)

- **Prod SSR leg (AC: `--expect-renderer ssr` green vs current prod):** prod is reachable
  (`GET https://rhema.tools/healthz` → 200, `gitSha 6ebb1cb`), but `6ebb1cb` is an ancestor of the
  whole SPA stack — `curl https://rhema.tools/` and `/login` serve **zero**
  `data-renderer`/`data-mounted`/`data-route` attributes (verified byte-level). Every settle-using
  step — i.e., every re-spec'd leg — would red on `(absent)` before asserting anything; the leg
  cannot pass until the SPA.3+ code deploys. Not run (a guaranteed-fail leg is noise, not
  evidence); the blocker is recorded with the byte-level proof.
- **Preview leg (AC: `--expect-renderer spa` + `x-rhema-renderer: spa` on `pr-<n>`):**
  `pulumi stack ls` shows only `dev` + `prod` — no `pr-<n>` stack exists for this branch;
  `preview-stack.mjs up` is an operator deploy act (ops-preview-owned, needs images built+pushed
  for the chain SHA). Blocked on the operator's preview deploy.
- **Compensating control:** the full contract is pinned deterministically in-repo (the §2 matrix
  above — settle/wiring/pin/expect/gates/refusals/hook emission), and both legs are scripted
  verbatim in D-SPA.6-1's unblock + verify columns.

## 4 — Findings / deviations / CI

- **Size budget exceeded (owned decision, recorded):** ~1,250 changed lines vs the ticket's ~600
  guide (`git diff` ~1,000 + ~480 lines of new test files). The overage is the test-first clause
  applied to a harness whose whole product is assertions — `settle.ts`+`surface-gates.ts`+
  `cli-flags.ts` (~470 lines impl) carry ~480 lines of unit tests, and the P1/X1 split +
  probe re-spec necessarily touch every navigation site in `steps.ts`/`stb5a.ts`. Alternative —
  thinner pinning of the refusal table — rejected: the refusal table IS the leg contract.
  Recorded per the SPA.4/SPA.5 precedent.
- **Owned decision — `onPage` session wiring:** session pages were wired only after `signIn`
  returned, so a mint's own `/signup` + magic-link documents escaped the renderer check; wiring
  moved inside `JourneySessions` (`onPage` fires pre-navigation, routed to the running step's
  listener set via `wireCurrent`). The post-`signIn` `wirePage` calls were removed — no
  double-wiring.
- **Owned decision — the coverage-matrix checker is family-aware:** an umbrella `journey:P1`/
  `journey:X1` ref resolves when any `<base>.*` member is registered (the matrix cites the
  umbrellas as coverage-of-the-family, which the split preserves; matching the registry test's
  planning-ledger resolution rule).
- **Owned decision — `export`'s gate includes `T8` (expected `red`):** it reports `owed` under
  both renderers rather than gating — its `legNotes` say so; a red step never fails the run.
- **Deferrals:** `D-SPA.6-1` **opened** (the two staging-verified legs — byte-level blocker
  evidence + scripted verify + the deterministic pinning matrix as compensating control). None
  closed — no OPEN row is unblocked by this ticket.
- **REQ ids stamped:** REQ-VFY-3, REQ-VFY-4, REQ-VFY-7, REQ-VFY-8, REQ-VFY-10, REQ-SEQ-4,
  REQ-SEQ-7, REQ-TST-7, REQ-TL-13 (the parity-regex leg — `rendererOfDocument` shared between the
  runner's stream check and the settle helpers' vocabulary).
- **Out of scope held:** no new journey content (each surface ticket owns its gate rows' legs);
  the run-report render + dossier-mutation free steps stay owed to SPA.22/SPA.21 (recorded in
  the gate rows' `owed`); nightly/weekly workflows untouched beyond the new flags' support.
- **AC ledger:** `[--expect-renderer ssr green vs prod]` → **DEFERRED** (D-SPA.6-1a — prod
  predates the markers); `[--expect-renderer spa + pin on a preview]` → **DEFERRED** (D-SPA.6-1b —
  no pr-<n> stack); `[re-spec'd probes pass vs SSR today]` → engineered (suite green over the
  re-spec'd paths; live leg rides D-SPA.6-1); `[SURFACE_GATES bijection]` → deterministic
  (`surface-gates.test.ts` totality + bijection asserts); `[universal phase-gate AC]` → this
  ledger + the closeout row.
- **CI:** PR #124 · `gh pr checks --watch=false` at closeout — verbatim:
  `typecheck / lint / unit  pending  0  …/actions/runs/37753613446/job/113232637340` (exit 8 —
  the run registered but had not reported at read time; read exactly once per closeout
  discipline; when the matrix lands its result rides the PR, not a re-read here). The inherited
  `integration`/privsep red on this chain is classified under GD-MAINT.4-1, not repaired.
- **Validators:** `check-build-memory.sh` — **0 violations, 7 warnings** (all pre-existing
  classes: legacy run ledgers w/o Harness headers, PHASE-LOG 2 KiB budget — this entry joins the
  accepted pattern —, legacy index status values, pre-guard readouts, manifest banner/order
  notes, GATE-G2 nextTicket); `check-append-only.mjs --base 1e84a99` — **append-only OK**.
