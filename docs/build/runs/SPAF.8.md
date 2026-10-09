# SPAF.8 — prod flip: `export` + `ide-chrome` (run ledger)

- **Status:** DONE for the in-repo legs (PR diff + unit-level verification); the four
  post-deploy/live legs are **OPEN deferrals** (`D-SPAF.8-1`…`-4`) — they materialize only when
  the operator merges the chain + `pulumi up`s prod.
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/122_SPAF.8__prod-flip-export.md` (manifest row 122)
- **Branch:** `stevevitali/spaf-8-prod-flip-export-ide-chrome`, stacked on
  `stevevitali/spa-17-surface-export-ide-chrome` @ `6099a71` (`OPERATOR` merge policy,
  **not merged**).
- **PR:** #144 — opened at closeout; `gh pr checks --watch=false` read once at closeout
  (result recorded in § PR checks read below; inherited `integration`/privsep red, if it
  reports, is waived per GD-MAINT.4-1 — classified, not repaired).
- **Goal:** flip `export` AND `ide-chrome` to the SPA on prod — the FIRST IDE-framed prod
  activation — `STAGES.prod.spaSurfaces += 'export','ide-chrome'` as the one-line stage-fact
  PR; the operator merges + `pulumi up` deploys; rollback = revert + redeploy (removes BOTH
  keys — the `/p/:p/import*` legs re-dormant together).
- **Spend:** $0. No deploys, no production writes, no live legs. Preview legs not needed — this
  row's contract is the prod flip itself (the surface's two-leg/rollback evidence is
  D-SPA.17-1/-2's preview track, still OPEN behind the absent
  `rhema-nonprod-resend-api-key` operator secret — D-MAINT.6-1).

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): no `OPEN` row is unblocked by this run — `D-SPA.17-1`,
  `D-SPA.17-2`, `D-OPS.1-1`, `D-MAINT.6-1` all still need their named operator
  prerequisites; the `D-SPAF.1-*` … `D-SPAF.7-*` rows stay OPEN (operator merge + deploy
  gated). None closed, four opened.
- LEDGER CURRENT STATE read: `nextTicket: SPAF.8`, `chainTip:
  stevevitali/spa-17-surface-export-ide-chrome`, `mergePolicy: OPERATOR`, `round: 4`,
  `dispatchTarget: subagent`, `pinnedBaseSha: fab08ed`.
- **Entry gate (REQ-SEQ-10 + the 2026-10-08T19:12Z sequencing ruling):** the ticket's operating
  clause is "a nightly green since the PREVIOUS flip is this row's entry gate — pause if
  unmet" — `D-SPAF.7-4` names it (≥1 nightly green on prod after the `billing` deploy). The
  orchestrator's ledgered ruling (PHASE LOG 2026-10-08T19:12Z) interprets that gate as binding
  **activation order at merge/deploy time, not PR authoring**: with `mergePolicy: OPERATOR` and
  the whole stack unmerged, literal row-level gating would stall ~20 rows behind operator
  merges. This run therefore executes now as an **authored-dormant minimal PR** exactly as
  SPAF.1–SPAF.7 did — the stage-fact diff + unit pins land, every live leg is deferred with a
  verbatim verify recipe, and `D-SPAF.1-4`'s through `D-SPAF.7-4`'s nightly-green bakes are
  restated (in `D-SPAF.8-4`) as live preconditions for the operator's merge/deploy cadence of
  THIS flip. REQ-SEQ-10 pacing is encoded in SPAREC.3's integration plan (merge bottom-up,
  deploy, bake ≥1 nightly, next batch).
- **Sequencing reality:** the ticket's hard dependency is "the `export` surface ticket's
  PR merged + deployed (its code must be live)". PR #143 (SPA.17) is unmerged like the rest of
  the stack — but `mergePolicy: OPERATOR` stacks bottom-up, so SPA.1→…→SPA.17 land before
  this PR's deploy leg; the flip line is inert until the chain's code serves.
- **The paired-flip consult shape (verified in source this run):**
  - `GET /p/:project/export` (`apps/web/src/server.ts` ~5880–5904): session gate first
    (unauthed → 302 `/login`), then `spaShellResponse(c, deps, "export", session)` at ~5884.
    `export` ∈ `SPA_IDE_FRAMED_SURFACES` (`packages/contracts/src/spa.ts` ~47), so
    `deps.spa`'s key-level AND (`surfaces.has("export") ∧ surfaces.has("ide-chrome")` —
    `spa-flag.ts` ~67) is what lights it. Under the "spa" verdict the `p.$project` layout
    mounts `<IdeChrome>` (panes/palette/SSE feed) because `/p/$project/export` ∈
    `SPA_IDE_FRAMED_ROUTES` — the first chrome mount prod has ever served.
  - `GET /p/:project/import` (~4366) + `GET /p/:project/import/preview` (~4449): the
    per-route AND `["onboarding","ide-chrome"]` at ~4372/~4457 — `onboarding` has been
    prod-flagged since SPAF.5, so adding `ide-chrome` is the AND's missing half: these are
    the import legs' FIRST spa verdicts. `/import/preview`'s consult sits AFTER the
    server-owned missing-`qk` → `/p/:p/import` 302 (~4454) — a `qk`-less hit still answers a
    renderer-free redirect.
  - `ide-chrome` alone still gates nothing else — `dossier`/`run-sheet`/`run-report`/`editor`
    stay unflipped on prod, so no other framed leaf lights.
  - The export POST + `/p/:p/export/addition` + `/export/ai-use/:fmt` are never documents:
    the binary POST keeps its native form-nav download on either renderer (`wantsJson`
    callers get `{error:"binary_download"}` 400 before the upstream export runs —
    REQ-BFF-17).
- Sources applied: `docs/design/29_spa-migration-sequencing.md` §per-flip procedure + §rollback
  semantics (design F8/F11); `docs/frontend-spa-spec.md` §11 REQ-SEQ-10/11/12 + REQ-VFY-8;
  `infra/config/stages.ts` + `stages.test.ts` (the stage-fact convention); `infra/pulumi/
  compute.ts` (the `SPA_SURFACES` env wiring — `args.spaSurfaces ?? cfg.spaSurfaces.join(",")`);
  `apps/web/src/server.ts` (the export + import consults); `apps/web/src/spa-flag.ts` +
  `packages/contracts/src/spa.ts` (the key-level vs route-level AND-gates);
  `packages/journeys/src/surface-gates.ts` (`SURFACE_GATES.export` = `R5`/`T4`/`T8`;
  `SURFACE_GATES["ide-chrome"]` = `P1.project`).

## 1 — What landed (the whole diff)

### `infra/config/stages.ts` — the one-line stage fact (REQ-SEQ-10)

```diff
-    // SPAF.6 — `project-home` joins them; SPAF.7 — `billing` joins them (REQ-SEQ-10): each
-    // prod flip is a one-line stage-fact commit, operator-merged + `pulumi up`-deployed;
-    // rollback = revert this line + redeploy. ≥ one nightly green on prod precedes the NEXT
-    // surface's prod flip. Order is flip order — never re-sort.
-    // `ide-chrome` stays dark on prod until SPAF.8 — the /p/:p/import* legs AND-gate on it,
-    // so they keep serving SSR even with `onboarding` flagged. `/app`'s session gate +
-    // first-five-minutes precedence (…) still run ahead of the `project-home` consult — they
-    // answer 302s, never the shell. The billing session gates likewise precede the `billing`
-    // consult (unauthed → 302 /login on all three GETs); the seven billing POSTs are
-    // unaffected — they were never documents, and their Stripe hand-offs stay
-    // server-validated {url} envelopes on either renderer.
-    spaSurfaces: ["usage", "inbox", "settings", "voices", "onboarding", "project-home", "billing"],
+    // SPAF.6 — `project-home` joins them; SPAF.7 — `billing` joins them; SPAF.8 — `export`
+    // AND `ide-chrome` join them together (REQ-SEQ-10): each prod flip is a one-line
+    // stage-fact commit, operator-merged + `pulumi up`-deployed; rollback = revert this
+    // line + redeploy — reverting removes BOTH keys, so the /p/:p/import* legs re-dormant
+    // together. ≥ one nightly green on prod precedes the NEXT surface's prod flip. Order is
+    // flip order — never re-sort.
+    // SPAF.8 is the first IDE-framed prod activation: `export` ∈ SPA_IDE_FRAMED_SURFACES,
+    // so deps.spa's key-level AND lights `/p/:p/export` — the only flipped framed key — and
+    // mounts IdeChrome (panes/palette/feed) on it; the same `ide-chrome` key resolves the
+    // route-level `["onboarding","ide-chrome"]` AND on the /p/:p/import* legs — their first
+    // spa verdicts (dormant since SPAF.5). `ide-chrome` alone still gates nothing else —
+    // dossier/run-sheet/run-report/editor stay unflipped. `/app`'s session gate +
+    // first-five-minutes precedence still run ahead of the `project-home` consult; the
+    // billing session gates likewise precede `billing` (unauthed → 302 /login on all three
+    // GETs); the seven billing POSTs stay server-validated {url} envelopes on either
+    // renderer.
+    spaSurfaces: ["usage", "inbox", "settings", "voices", "onboarding", "project-home", "billing", "export", "ide-chrome"],
```

Effect at deploy time: the Pulumi program renders the prod web env
`SPA_SURFACES=usage,inbox,settings,voices,onboarding,project-home,billing,export,ide-chrome`
(`compute.ts` — no `rhema:spaSurfaces` stack config on prod, so the stage fact wins). The
web's consult then serves the SPA shell for `GET /p/:project/export` — `export`'s
`deps.spa` key-level AND resolves now that `ide-chrome` is listed — and the `p.$project`
layout mounts `<IdeChrome>` on it (the first IDE-framed mount prod has served). The same
`ide-chrome` key completes the `["onboarding","ide-chrome"]` route-level AND on
`GET /p/:project/import` + `GET /p/:project/import/preview` — dormant since SPAF.5 —
which now serve the shell too. Every consult still sits behind its session gate (unauthed →
302 `/login`); `/import/preview`'s sits after the server-owned missing-`qk` redirect.
`?ssr=1` / `x-rhema-renderer: ssr` still force SSR on every stage, and `SPA_OVERRIDES` is
emitted **only** on non-prod kinds — prod keeps force-SSR-but-never-force-SPA (REQ-SEQ-4).
Flip order is preserved (`usage` … `billing`, then `export`,`ide-chrome` appended as the
paired flip — the ticket's `+= 'export' + 'ide-chrome'` order). No generated config
artifacts exist for this fact (the stack config path is explicitly never committed).

### `infra/config/stages.test.ts` — the stage-fact pin, updated honestly

The `spa.surfaces` block now asserts `STAGES.prod.spaSurfaces ===
["usage","inbox","settings","voices","onboarding","project-home","billing","export","ide-chrome"]`
(the SPAF.1…SPAF.8 flips — `export`+`ide-chrome` appended in flip order), `dev` stays
`["usage","inbox","settings","voices","onboarding","ide-chrome","project-home","billing","export"]`
(dev's own insertion order — `ide-chrome` rode SPA.14, `export` rode SPA.17 — unchanged), and
`preview` remains `[]` (stack-config override path unchanged). The vocabulary pin (every
listed key ∈ `SPA_SURFACES`) still holds.

**Nothing else** — no other source file touched. Diff stat: 2 files, 25 insertions / 17
deletions (comment lines dominate — the fact itself is one line, inside the ~20-line
budget's intent). Review scope check: the PR diff touches only `stages.ts` + its test —
exactly the ticket's AC1 envelope.

## 2 — Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` → **38/38 pass**
  (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` → clean (`tsc -b`).
- `pnpm --filter @rhema/infra lint` → clean (eslint).
- Stage-fact test is a real pin: reverting the stage line fails
  `expect(STAGES.prod.spaSurfaces).toEqual([…,"billing","export","ide-chrome"])` (exact-equality
  assertion — order + membership both bound).
- Consult-position check: `apps/web/src/server.ts` read this run —
  `/p/:project/export` session-gates at ~5882 then consults `"export"` at ~5884 (the
  key-level `export ∧ ide-chrome` resolves inside `deps.spa` — `spa-flag.ts` ~67,
  `SPA_IDE_FRAMED_SURFACES` in `contracts/src/spa.ts` ~47); `/p/:project/import` gates at
  ~4367 then consults `["onboarding","ide-chrome"]` at ~4372; `/p/:project/import/preview`
  answers the missing-`qk` 302 at ~4454, then consults at ~4457. SPA.17's
  `export.dom.test.tsx` (11 tests) pins the surface mount + the IDE-chrome framed/unframed
  legs; `ide-chrome.dom.test.tsx` pins the React chrome's manifest-hook parity with the SSR
  `IdeShell`.
- **Known chain debt recorded (pre-existing, NOT this run's — do not fix):**
  `pnpm check:dom-contract` fails on the base with 4 unasserted billing hooks
  (`data-plan-ladder`, `data-topups`, `data-auto-reload`, `packId`) — SPA.16 debt;
  **SPA.18 owns the repair**. Re-verified on this branch at closeout: identical 4
  violations, unchanged by the flip diff.
- Full-suite + public-safe checks ride CI (`typecheck/lint/unit` job); no SPA/bundle surface
  is touched by this row.

## 3 — Deferred live legs (all gated on operator merge + `pulumi up` prod)

| Row | Leg | Verify recipe |
|---|---|---|
| D-SPAF.8-1 | `data-renderer="spa"` on `/p/:p/export` AND `/p/:p/import` + `/p/:p/import/preview?qk=…` (the import legs' first spa verdicts); the IdeChrome mount on the export leaf; `?ssr=1` still SSR on each; session gates still 302 `/login`; missing-`qk` still 302s to `/p/:p/import` before the consult | `curl -s https://rhema.tools/p/<slug>/export` (session) `\| grep data-renderer` → `spa`; same for `/p/<slug>/import` + `/p/<slug>/import/preview?qk=<key>`; `…?ssr=1` → `ssr` on each; `curl -sI` (no cookie) on each → `302 /login`; `curl -sI /p/<slug>/import/preview` (no `qk`, session) → `302 /p/<slug>/import`; chrome-mount leg — browser or `P1.project` step: `[data-ide]`/`data-pane`/`data-ide-palette` present post-mount |
| D-SPAF.8-2 | `--expect-renderer spa` leg on prod | `rhema-journeys --stage prod --surface export,ide-chrome --expect-renderer spa --expect-sha <deployed>` → exit 0 (`SURFACE_GATES.export` = `R5`,`T4`,`T8`-owed-reporting; `SURFACE_GATES["ide-chrome"]` = `P1.project` — the phone-width IDE frame) |
| D-SPAF.8-3 | Rollback arm | `git revert <flip>` + `pulumi up` → `data-renderer="ssr"` on `/p/:p/export` AND both import legs in one deploy — the revert removes BOTH keys, the `onboarding ∧ ide-chrome` AND re-dormants together (recorded, not exercised destructively) |
| D-SPAF.8-4 | REQ-SEQ-10 nightly-green bake | next nightly `journeys.yml` green on prod before SPAF.9 opens; D-SPAF.1-4's through D-SPAF.7-4's nightly greens restated as this flip's merge/deploy preconditions |

All four appended to `docs/tickets/DEFERRALS.md` under `## SPAF.8` this run.

## 4 — Requirement IDs / AC status

- **REQ-SEQ-10** — separate minimal PR touching only `STAGES.prod.spaSurfaces`: SATISFIED in
  the diff. Operator-merge + `pulumi up` + nightly-green clauses: operator-gated / ledgered
  (D-SPAF.8-4, with D-SPAF.1-4's through D-SPAF.7-4's bakes restated as this flip's activation
  preconditions).
- **REQ-SEQ-11** — deployable dark: SATISFIED by construction (one config datum; SSR
  untouched; flag-∅ serving path identical on every other stage; rollback is the same line's
  revert — both keys out together).
- **REQ-SEQ-12** — mixed-mode coexistence: unchanged — the boot payload carries the effective
  flag set (the import routeIds' `["onboarding","ide-chrome"]` verdicts flip to `"spa"` with
  the deploy; unflipped routes document-nav via `SsrHandoff`); the session gates + the
  missing-`qk` redirect keep answering 302s ahead of any renderer.
- **REQ-VFY-8 (prod legs)** — DEFERRED to the deploy (D-SPAF.8-1/-2).
- AC layers: AC1 (diff touches only `stages.ts` + test) — **deterministic/engineered, DONE**;
  AC2–AC4 (post-deploy markers, `?ssr=1`, journey leg, rollback) — **live-executed, DEFERRED**
  per above; universal gate AC — docs/index/ledger advanced, checks read at closeout.

## 5 — Deviations / owned decisions

- None beyond the operator-sanctioned sequencing: the ticket's "PR merged + deployed" phrasing
  is executed as "PR opened; live legs ledgered" per `mergePolicy: OPERATOR` + the
  $0/no-prod-mutation constraint — and the "≥1 nightly green … entry gate" clause is applied
  to activation order per the 2026-10-08T19:12Z orchestrator ruling (ledgered; no ADR needed —
  no design change).
- This flip is the chain's first PAIRED flip (`export` + `ide-chrome` on one commit — the
  ticket's own `+=` shape): `export` cannot serve without `ide-chrome` (the key-level AND),
  and `ide-chrome` alone lights nothing user-facing beyond what `export` + the
  already-flagged `onboarding` import legs unlock. Revert semantics recorded honestly —
  removing the line takes BOTH keys out; the import legs re-dormant together (D-SPAF.8-3).
- `pnpm check:dom-contract`'s 4 billing-hook violations are **pre-existing base debt**
  (SPA.16; re-verified unchanged on this branch) — SPA.18 owns the repair per the chain
  notes; the minimal-diff contract forbids touching it here.
- Pre-existing `integration`/privsep CI reds, if present on this branch, are inherited per
  GD-MAINT.4-1 — classified, not repaired.

## PR checks read (closeout)

Single `gh pr checks 144 --watch=false` read after the closeout-docs push: **"no checks
reported on the 'stevevitali/spaf-8-prod-flip-export-ide-chrome' branch"** (the pipeline
had not registered checks at stamp time — the same result as #140/#141/#142 at their
closeouts). Recorded verbatim rather than re-polled; any `integration`/privsep red that
reports later is inherited, waived per GD-MAINT.4-1 — classified, not repaired.
