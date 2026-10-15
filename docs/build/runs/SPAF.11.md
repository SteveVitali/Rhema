# SPAF.11 — prod flip: `run-sheet` (run ledger)

- **Status:** DONE for the in-repo legs (PR diff + unit-level verification); the four
  post-deploy/live legs are **OPEN deferrals** (`D-SPAF.11-1`…`-4`) — they materialize only
  when the operator merges the chain + `pulumi up`s prod.
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/128_SPAF.11__prod-flip-run-sheet.md` (manifest row 128)
- **Branch:** `stevevitali/spaf-11-prod-flip-run-sheet`, stacked on
  `stevevitali/spa-20-surface-run-sheet` @ `aede4d5` (`OPERATOR` merge policy,
  **not merged**).
- **PR:** #150 — opened at closeout; `gh pr checks --watch=false` read once at closeout
  (result recorded in § PR checks read below; inherited `integration`/privsep red, if it
  reports, is waived per GD-MAINT.4-1 — classified, not repaired).
- **Goal:** flip `run-sheet` to the SPA on prod — `STAGES.prod.spaSurfaces += 'run-sheet'`
  as the one-line stage-fact PR; the operator merges + `pulumi up` deploys; rollback =
  revert + redeploy.
- **Spend:** $0. No deploys, no production writes, no live legs. Preview legs not needed —
  this row's contract is the prod flip itself (the surface's two-leg/rollback evidence is
  D-SPA.20-1/-2's preview track, still OPEN behind the absent
  `rhema-nonprod-resend-api-key` operator secret — D-MAINT.6-1).

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): no `OPEN` row is unblocked by this run —
  `D-SPA.20-1`, `D-SPA.20-2`, `D-OPS.1-1`, `D-MAINT.6-1` all still need their named
  operator prerequisites; the `D-SPAF.1-*` … `D-SPAF.10-*` rows stay OPEN (operator merge +
  deploy gated). None closed, four opened.
- LEDGER CURRENT STATE read: `nextTicket: SPAF.11`, `chainTip:
  stevevitali/spa-20-surface-run-sheet`, `mergePolicy: OPERATOR`, `round: 4`,
  `dispatchTarget: subagent`, `pinnedBaseSha: fab08ed`.
- **Entry gate (REQ-SEQ-10 + the 2026-10-08T19:12Z sequencing ruling):** the ticket's
  operating clause is "a nightly green since the PREVIOUS flip is this row's entry gate —
  pause if unmet" — `D-SPAF.10-4` names it (≥1 nightly green on prod after the `figures`
  deploy). The orchestrator's ledgered ruling (PHASE LOG 2026-10-08T19:12Z) interprets that
  gate as binding **activation order at merge/deploy time, not PR authoring**: with
  `mergePolicy: OPERATOR` and the whole stack unmerged, literal row-level gating would
  stall ~20 rows behind operator merges. This run therefore executes now as an
  **authored-dormant minimal PR** exactly as SPAF.1–SPAF.10 did — the stage-fact diff +
  unit pins land, every live leg is deferred with a verbatim verify recipe, and
  `D-SPAF.1-4`'s through `D-SPAF.10-4`'s nightly-green bakes are restated (in
  `D-SPAF.11-4`) as live preconditions for the operator's merge/deploy cadence of THIS
  flip. REQ-SEQ-10 pacing is encoded in SPAREC.3's integration plan (merge bottom-up,
  deploy, bake ≥1 nightly, next batch).
- **Sequencing reality:** the ticket's hard dependency is "the `run-sheet` surface
  ticket's PR merged + deployed (its code must be live)". PR #149 (SPA.20) is unmerged
  like the rest of the stack — but `mergePolicy: OPERATOR` stacks bottom-up, so
  SPA.1→…→SPA.20 land before this PR's deploy leg; the flip line is inert until the
  chain's code serves.
- **The consult shape (verified in source this run):**
  - `GET /p/:project/run` (`apps/web/src/server.ts` ~4864): session gate first
    (unauthed → 302 `/login` at ~4866), then
    `spaShellResponse(c, deps, "run-sheet", session)` at ~4868 — spec §4's fixed position,
    before the slug→row read and the `runSheetComposition` call (a missed slug still lands
    the document's own 404 arm on SSR).
  - `run-sheet` ∈ `SPA_IDE_FRAMED_SURFACES` (`packages/contracts/src/spa.ts` ~50 — the set
    is export/dossier/run-sheet/run-report/editor), so `deps.spa`'s key-level AND resolves
    `run-sheet ∧ ide-chrome` (`apps/web/src/spa-flag.ts` ~67) — `ide-chrome` has been in
    prod's list since SPAF.8 — and `/p/$project/run` ∈ `SPA_IDE_FRAMED_ROUTES`
    (`spa.ts` ~67): the leaf mounts `<IdeChrome>`. This is the **second IDE-framed prod
    activation** (the first since SPAF.8's `export`).
  - A flagged hit serves the shell; the SPA's `/bff/p/:slug/run` twin performs the ONE
    shared `runSheetComposition` (server.ts ~1383) — context read → `blockedBy`→`activeRun`
    precedence → billing (BILL.3 purchase switch + allowlisted Payment Link) →
    voice+staleness → Revise pretriage → the server-built `RunSheetView` — carrying the
    `rhema_fp` mint + `voice.staleness_shown` + the exhausted-prompt impression verbatim,
    so the two renderers price + log identically (the estimator stays server IP — the leaf
    repaints off `recompute.cells` and never calls it client-side).
  - The two run-sheet POSTs (`POST /p/:project/run` ~4896, `POST /p/:project/exhausted`
    ~5163) are never documents: JSON callers get `mutationOutcome` envelopes
    (`{ok,data:{runId,state}}`, `{ok,url}` allowlisted Stripe Payment Link,
    `{ok,redirect:"?notice=purchase_paused"}`, preserved refusal statuses —
    `run_in_progress` 409 / `insufficient_balance` 402 / `trial_*`/422s), forms keep their
    302s/re-renders — identical on either renderer. `POST /bff/p/:slug/estimate`
    (REQ-BFF-23) is a BFF route — renderer-blind, unaffected.
- Sources applied: `docs/design/29_spa-migration-sequencing.md` §per-flip procedure +
  §rollback semantics (design F8/F11); `docs/frontend-spa-spec.md` §11 REQ-SEQ-10/11/12 +
  REQ-VFY-8; `infra/config/stages.ts` + `stages.test.ts` (the stage-fact convention);
  `infra/pulumi/compute.ts` (the `SPA_SURFACES` env wiring —
  `args.spaSurfaces ?? cfg.spaSurfaces.join(",")`); `apps/web/src/server.ts` (the
  run-sheet consult + `runSheetComposition`); `apps/web/src/spa-flag.ts` (the framed-key
  AND); `packages/contracts/src/spa.ts` (the framed/routed vocabulary);
  `packages/journeys/src/surface-gates.ts` + `registry.ts`
  (`SURFACE_GATES["run-sheet"]` = `N4`, `R7`, `N9`, `P1.runsheet` — all
  `expected:"green"`, `paid:false`).

## 1 — What landed (the whole diff)

### `infra/config/stages.ts` — the one-line stage fact (REQ-SEQ-10)

```diff
-    // … SPAF.10 — `figures` joins them (REQ-SEQ-10): each prod flip is a one-line
-    // stage-fact commit, operator-merged + `pulumi up`-deployed; rollback = revert this
-    // line + redeploy — reverting removes BOTH SPAF.8 keys, so the /p/:p/import* legs
-    // re-dormant together. ≥ one nightly green on prod precedes the NEXT surface's prod
-    // flip. Order is flip order — never re-sort.
+    // … SPAF.10 — `figures` joins them; SPAF.11 — `run-sheet` joins them (REQ-SEQ-10):
+    // each prod flip is a one-line stage-fact commit, operator-merged +
+    // `pulumi up`-deployed; rollback = revert this line + redeploy — reverting removes
+    // BOTH SPAF.8 keys, so the /p/:p/import* legs re-dormant together. ≥ one nightly
+    // green on prod precedes the NEXT surface's prod flip. Order is flip order — never
+    // re-sort.
     // SPAF.8 is the first IDE-framed prod activation: … (unchanged prose) …
-    // `ide-chrome` alone still gates nothing else — dossier/run-sheet/run-report/editor
-    // stay unflipped. SPAF.9's `outline` and SPAF.10's `figures` are UNFRAMED — …
+    // SPAF.11 is the SECOND IDE-framed prod activation: `run-sheet` ∈
+    // SPA_IDE_FRAMED_SURFACES too, so its consult ANDs `ide-chrome` — already flipped
+    // since SPAF.8 — and `/p/:p/run` (∈ SPA_IDE_FRAMED_ROUTES) mounts the chrome. A
+    // flagged GET serves the shell and the `/bff/p/:slug/run` twin performs the ONE
+    // shared `runSheetComposition` — the `rhema_fp` mint + the staleness/exhausted-
+    // prompt side effects included. `ide-chrome` alone still gates nothing else —
+    // dossier/run-report/editor stay unflipped. SPAF.9's `outline` and SPAF.10's
+    // `figures` are UNFRAMED — …
-    // … the outline GETs' + the figures GETs' session gates precede their consults the
-    // same way (unauthed → 302 /login); the seven billing POSTs + the four outline POSTs
-    // + the seven figures POSTs stay server-validated envelopes/form redirects on either
-    // renderer — they were never documents.
+    // … the outline GETs' + the figures GETs' + the run-sheet GET's session gates
+    // precede their consults the same way (unauthed → 302 /login); the seven billing
+    // POSTs + the four outline POSTs + the seven figures POSTs + the run-sheet
+    // run/exhausted POSTs stay server-validated envelopes/form redirects on either
+    // renderer — they were never documents.
-    spaSurfaces: […, "export", "ide-chrome", "outline", "figures"],
+    spaSurfaces: […, "export", "ide-chrome", "outline", "figures", "run-sheet"],
```

Effect at deploy time: the Pulumi program renders the prod web env
`SPA_SURFACES=usage,inbox,settings,voices,onboarding,project-home,billing,export,ide-chrome,outline,figures,run-sheet`
(`compute.ts` — no `rhema:spaSurfaces` stack config on prod, so the stage fact wins). The
web's consult then serves the SPA shell for `GET /p/:project/run` via `deps.spa`'s
key-level `run-sheet ∧ ide-chrome` AND — `ide-chrome` already flipped, so `run-sheet`'s
append is sufficient — and the `p.$project` layout mounts `<IdeChrome>` on the leaf
(`/p/$project/run` ∈ `SPA_IDE_FRAMED_ROUTES`). The consult still sits behind its session
gate (unauthed → 302 `/login`). `?ssr=1` / `x-rhema-renderer: ssr` still force SSR on
every stage, and `SPA_OVERRIDES` is emitted **only** on non-prod kinds — prod keeps
force-SSR-but-never-force-SPA (REQ-SEQ-4). Flip order is preserved (`usage` … `figures`,
then `run-sheet` appended — the ticket's `+= 'run-sheet'`). No generated config artifacts
exist for this fact (the stack config path is explicitly never committed).

### `infra/config/stages.test.ts` — the stage-fact pin, updated honestly

The `spa.surfaces` block now asserts `STAGES.prod.spaSurfaces ===
["usage","inbox","settings","voices","onboarding","project-home","billing","export","ide-chrome","outline","figures","run-sheet"]`
(the SPAF.1…SPAF.11 flips — `run-sheet` appended in flip order), `dev` stays
`["usage","inbox","settings","voices","onboarding","ide-chrome","project-home","billing","export","outline","figures","run-sheet"]`
(dev's own insertion order — `run-sheet` rode SPA.20 — unchanged), and `preview` remains
`[]` (stack-config override path unchanged). The vocabulary pin (every listed key ∈
`SPA_SURFACES`) still holds.

**Nothing else** — no other source file touched. Diff stat: 2 files, 28 insertions / 17
deletions (comment lines dominate — the fact itself is one line, inside the ~20-line
budget's intent). Review scope check: the PR diff touches only `stages.ts` + its test —
exactly the ticket's AC1 envelope.

## 2 — Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` → **38/38
  pass** (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` → clean (`tsc -b`).
- `pnpm --filter @rhema/infra lint` → clean (eslint).
- Stage-fact test is a real pin: reverting the stage line fails
  `expect(STAGES.prod.spaSurfaces).toEqual([…,"figures","run-sheet"])` (exact-equality
  assertion — order + membership both bound).
- Consult-position check: `apps/web/src/server.ts` read this run —
  `/p/:project/run` session-gates at ~4866 then consults `"run-sheet"` at ~4868, before
  the slug→row read + `runSheetComposition`. `run-sheet` IS in
  `SPA_IDE_FRAMED_SURFACES` (`contracts/src/spa.ts` ~50) and `/p/$project/run` IS in
  `SPA_IDE_FRAMED_ROUTES` (~67): `deps.spa` resolves the key-level `run-sheet ∧
  ide-chrome` AND (`spa-flag.ts` ~67 — `surfaces.has(surface) && (!IDE_FRAMED.has(surface)
  || surfaces.has("ide-chrome"))`), so `ide-chrome`'s SPAF.8 presence makes this a
  single-key flip. SPA.20's `run-sheet.dom.test.tsx` (26 tests) pins the leaf's chrome
  mount, the SsrHandoff-no-BFF leg, and the composition parity.
- Full-suite + public-safe checks ride CI (`typecheck/lint/unit` job); no SPA/bundle
  surface is touched by this row.

## 3 — Deferred live legs (all gated on operator merge + `pulumi up` prod)

| Row | Leg | Verify recipe |
|---|---|---|
| D-SPAF.11-1 | `data-renderer="spa"` on `/p/:p/run`; `?ssr=1` still SSR; session gate still 302 `/login` ahead of the consult | `curl -s https://rhema.tools/p/<slug>/run` (session) `\| grep data-renderer` → `spa`; `…?ssr=1` → `ssr`; `curl -sI` (no cookie) → `302 /login` |
| D-SPAF.11-2 | `--expect-renderer spa` leg on prod | `rhema-journeys --stage prod --surface run-sheet --expect-renderer spa --expect-sha <deployed>` → exit 0 (`SURFACE_GATES["run-sheet"]` = `N4`, `R7`, `N9`, `P1.runsheet` — all expected:green carried legs: a green miss FAILS the run, stricter than the owed-reporting gates) |
| D-SPAF.11-3 | Rollback arm | `git revert <flip>` + `pulumi up` → `data-renderer="ssr"` on `/p/:p/run` in one deploy — `ide-chrome` stays flipped, only the AND's `run-sheet` leg goes false (recorded, not exercised destructively) |
| D-SPAF.11-4 | REQ-SEQ-10 nightly-green bake | next nightly `journeys.yml` green on prod before SPAF.12 opens; D-SPAF.1-4's through D-SPAF.10-4's nightly greens restated as this flip's merge/deploy preconditions |

All four appended to `docs/tickets/DEFERRALS.md` under `## SPAF.11` this run.

## 4 — Requirement IDs / AC status

- **REQ-SEQ-10** — separate minimal PR touching only `STAGES.prod.spaSurfaces`: SATISFIED
  in the diff. Operator-merge + `pulumi up` + nightly-green clauses: operator-gated /
  ledgered (D-SPAF.11-4, with D-SPAF.1-4's through D-SPAF.10-4's bakes restated as this
  flip's activation preconditions).
- **REQ-SEQ-11** — deployable dark: SATISFIED by construction (one config datum; SSR
  untouched; flag-∅ serving path identical on every other stage; rollback is the same
  line's revert).
- **REQ-SEQ-12** — mixed-mode coexistence: unchanged — the boot payload carries the
  effective flag set (the `/p/$project/run` routeId's `["run-sheet"]` verdict flips to
  `"spa"` with the deploy — server-ANDed with `ide-chrome` per REQ-SEQ-6; unflipped
  routes document-nav via `SsrHandoff`); the session gate keeps answering 302s ahead of
  any renderer.
- **REQ-VFY-8 (prod legs)** — DEFERRED to the deploy (D-SPAF.11-1/-2).
- AC layers: AC1 (diff touches only `stages.ts` + test) — **deterministic/engineered,
  DONE**; AC2–AC4 (post-deploy markers, `?ssr=1`, journey leg, rollback) —
  **live-executed, DEFERRED** per above; universal gate AC — docs/index/ledger advanced,
  checks read at closeout.

## 5 — Deviations / owned decisions

- None beyond the operator-sanctioned sequencing: the ticket's "PR merged + deployed"
  phrasing is executed as "PR opened; live legs ledgered" per `mergePolicy: OPERATOR` +
  the $0/no-prod-mutation constraint — and the "≥1 nightly green … entry gate" clause is
  applied to activation order per the 2026-10-08T19:12Z orchestrator ruling (ledgered; no
  ADR needed — no design change).
- This flip is a single-key append again (like SPAF.9/SPAF.10, unlike SPAF.8's pair) —
  but unlike those unframed keys, `run-sheet` is the **second IDE-framed activation**:
  the append alone lights the leaf because `ide-chrome` already satisfies the AND's other
  leg; a revert re-dormants `run-sheet` while leaving `ide-chrome` (and therefore
  `/p/:p/export` + the `/p/:p/import*` verdicts) untouched.
- Pre-existing `integration`/privsep CI reds, if present on this branch, are inherited per
  GD-MAINT.4-1 — classified, not repaired.

## PR checks read (closeout)

Single `gh pr checks 150 --watch=false` read after the closeout-docs push: **"no checks
reported on the 'stevevitali/spaf-11-prod-flip-run-sheet' branch"** (the pipeline had not
registered checks at stamp time — the same result as #140/#141/#142/#144/#146/#148 at
their closeouts). Recorded verbatim rather than re-polled; any `integration`/privsep red
that reports later is inherited, waived per GD-MAINT.4-1 — classified, not repaired.
