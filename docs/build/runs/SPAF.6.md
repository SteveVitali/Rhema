# SPAF.6 — prod flip: `project-home` (run ledger)

- **Status:** DONE for the in-repo legs (PR diff + unit-level verification); the four
  post-deploy/live legs are **OPEN deferrals** (`D-SPAF.6-1`…`-4`) — they materialize only when
  the operator merges the chain + `pulumi up`s prod.
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/118_SPAF.6__prod-flip-project-home.md` (manifest row 118)
- **Branch:** `stevevitali/spaf-6-prod-flip-project-home`, stacked on
  `stevevitali/spa-15-surface-project-home` @ `dad1f79` (`OPERATOR` merge policy, **not merged**).
- **PR:** #140 — opened at closeout; `gh pr checks --watch=false` read once at closeout
  (result recorded in § PR checks read below; inherited `integration`/privsep red, if it
  reports, is waived per GD-MAINT.4-1 — classified, not repaired).
- **Goal:** flip `project-home` to the SPA on prod — `STAGES.prod.spaSurfaces += 'project-home'`
  as the one-line stage-fact PR; the operator merges + `pulumi up` deploys; rollback = revert +
  redeploy.
- **Spend:** $0. No deploys, no production writes, no live legs. Preview legs not needed — this
  row's contract is the prod flip itself (the surface's two-leg/rollback evidence is
  D-SPA.15-1/-2's preview track, still OPEN behind the absent
  `rhema-nonprod-resend-api-key` operator secret — D-MAINT.6-1).

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): no `OPEN` row is unblocked by this run — `D-SPA.6-1`,
  `D-OPS.1-1`, `D-MAINT.6-1`, `D-SPA.15-1/-2` all still need their named operator
  prerequisites; the `D-SPAF.1-*` … `D-SPAF.5-*` rows stay OPEN (operator merge + deploy
  gated). None closed, four opened.
- LEDGER CURRENT STATE read: `nextTicket: SPAF.6`, `chainTip:
  stevevitali/spa-15-surface-project-home`, `mergePolicy: OPERATOR`, `round: 4`,
  `dispatchTarget: subagent`, `pinnedBaseSha: fab08ed`.
- **Entry gate (REQ-SEQ-10 + the 2026-10-08T19:12Z sequencing ruling):** the ticket's operating
  clause is "a nightly green since the PREVIOUS flip is this row's entry gate — pause if
  unmet" — `D-SPAF.5-4` names it (≥1 nightly green on prod after the `onboarding` deploy). The
  orchestrator's ledgered ruling (PHASE LOG 2026-10-08T19:12Z) interprets that gate as binding
  **activation order at merge/deploy time, not PR authoring**: with `mergePolicy: OPERATOR` and
  the whole stack unmerged, literal row-level gating would stall ~30 rows behind operator
  merges. This run therefore executes now as an **authored-dormant minimal PR** exactly as
  SPAF.1–SPAF.5 did — the stage-fact diff + unit pins land, every live leg is deferred with a
  verbatim verify recipe, and `D-SPAF.1-4`'s + `D-SPAF.2-4`'s + `D-SPAF.3-4`'s +
  `D-SPAF.4-4`'s + `D-SPAF.5-4`'s nightly-green bakes are restated (in `D-SPAF.6-4`) as live
  preconditions for the operator's merge/deploy cadence of THIS flip. REQ-SEQ-10 pacing is
  encoded in SPAREC.3's integration plan (merge bottom-up, deploy, bake ≥1 nightly, next
  batch).
- **Sequencing reality:** the ticket's hard dependency is "the `project-home` surface ticket's
  PR merged + deployed (its code must be live)". PR #139 (SPA.15) is unmerged like the rest of
  the stack — but `mergePolicy: OPERATOR` stacks bottom-up, so SPA.1→…→SPA.15 land before
  this PR's deploy leg; the flip line is inert until the chain's code serves.
- **The `/app` precedence wrinkle:** `project-home` flips the app root, and `/app`'s GET
  carries server-owned precedents that must keep preceding the consult —
  `apps/web/src/server.ts` ~2411–2491: session gate first (unauthed → 302 `/login`), then the
  `?verified=1` landing's `email.verified` emission, then the aggregate reads, then the
  first-five-minutes precedence — a showcase-only workspace whose Showcase is unopened 302s to
  `/p/<slug>/review/<runId>[#finding-…]`, and a carried `?entry=draft|outline` intent 302s to
  `/app/new?entry=…[&held=1]` — and ONLY then `spaShellResponse(c, deps, "project-home",
  session)`. Verified this run against the source: the consult sits at spec §4's fixed
  position after all redirects; a 302 answers renderer-free, so no unauthed or onboarding
  case can ever boot the shell. D-SPAF.6-1's verify asserts exactly that ordering.
- Sources applied: `docs/design/29_spa-migration-sequencing.md` §per-flip procedure + §rollback
  semantics (design F8/F11); `docs/frontend-spa-spec.md` §11 REQ-SEQ-10/11/12 + REQ-VFY-8;
  `infra/config/stages.ts` + `stages.test.ts` (the stage-fact convention); `infra/pulumi/
  compute.ts` (the `SPA_SURFACES` env wiring — `args.spaSurfaces ?? cfg.spaSurfaces.join(",")`);
  `apps/web/src/server.ts` (the `/app` consult position); `packages/journeys/src/
  surface-gates.ts` (`SURFACE_GATES["project-home"]` = R1, R7, T2.badge, T6, T7, P1.project,
  X1.home).

## 1 — What landed (the whole diff)

### `infra/config/stages.ts` — the one-line stage fact (REQ-SEQ-10)

```diff
-    // SPAF.1 — `usage` is the first prod surface flip; SPAF.2 — `inbox` joins it; SPAF.3 —
-    // `settings` joins them; SPAF.4 — `voices` joins them; SPAF.5 — `onboarding` joins them
-    // (REQ-SEQ-10): each prod flip is a one-line stage-fact commit, operator-merged +
-    // `pulumi up`-deployed; rollback = revert this line + redeploy. ≥ one nightly green on
-    // prod precedes the NEXT surface's prod flip. Order is flip order — never re-sort.
-    // `ide-chrome` stays dark on prod until SPAF.8 — the /p/:p/import* legs AND-gate on it,
-    // so they keep serving SSR even with `onboarding` flagged.
-    spaSurfaces: ["usage", "inbox", "settings", "voices", "onboarding"],
+    // SPAF.1 — `usage` is the first prod surface flip; SPAF.2 — `inbox` joins it; SPAF.3 —
+    // `settings` joins them; SPAF.4 — `voices` joins them; SPAF.5 — `onboarding` joins them;
+    // SPAF.6 — `project-home` joins them (REQ-SEQ-10): each prod flip is a one-line
+    // stage-fact commit, operator-merged + `pulumi up`-deployed; rollback = revert this
+    // line + redeploy. ≥ one nightly green on prod precedes the NEXT surface's prod flip.
+    // Order is flip order — never re-sort.
+    // `ide-chrome` stays dark on prod until SPAF.8 — the /p/:p/import* legs AND-gate on it,
+    // so they keep serving SSR even with `onboarding` flagged. `/app`'s session gate +
+    // first-five-minutes precedence (the carried `?entry` file / unopened-Showcase
+    // redirects) still run ahead of the `project-home` consult — they answer 302s, never
+    // the shell.
+    spaSurfaces: ["usage", "inbox", "settings", "voices", "onboarding", "project-home"],
```

Effect at deploy time: the Pulumi program renders the prod web env
`SPA_SURFACES=usage,inbox,settings,voices,onboarding,project-home` (`compute.ts` — no
`rhema:spaSurfaces` stack config on prod, so the stage fact wins). The web's
`deps.spa(c,"project-home")` consult then serves the SPA shell for `GET /app` — but only after
the session gate and the first-five-minutes precedence redirects have had their say (an
unauthed hit still 302s to `/login`; a showcase-only workspace with an unopened Showcase still
302s to the dossier; a carried `?entry` intent still 302s to `/app/new`). `?ssr=1` /
`x-rhema-renderer: ssr` still force SSR on every stage, and `SPA_OVERRIDES` is emitted
**only** on non-prod kinds — prod keeps force-SSR-but-never-force-SPA (REQ-SEQ-4). Flip order
is preserved (`usage`, `inbox`, `settings`, `voices`, `onboarding`, then `project-home`
appended). No generated config artifacts exist for this fact (the stack config path is
explicitly never committed).

### `infra/config/stages.test.ts` — the stage-fact pin, updated honestly

The `spa.surfaces` block now asserts `STAGES.prod.spaSurfaces ===
["usage","inbox","settings","voices","onboarding","project-home"]` (the SPAF.1…SPAF.6 flips),
`dev` stays `["usage","inbox","settings","voices","onboarding","ide-chrome","project-home"]` —
prod stays behind dev on `ide-chrome` until SPAF.8 — and `preview` remains `[]` (stack-config
override path unchanged). The vocabulary pin (every listed key ∈ `SPA_SURFACES`) still holds.

**Nothing else** — no other source file touched. Diff stat: 2 files, ~14 changed lines (within
the ~20-line budget). Review scope check: the PR diff touches only `stages.ts` + its test —
exactly the ticket's AC1 envelope.

## 2 — Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` → **38/38 pass**
  (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` → clean (`tsc -b`).
- `pnpm --filter @rhema/infra lint` → clean (eslint).
- Stage-fact test is a real pin: reverting the stage line fails
  `expect(STAGES.prod.spaSurfaces).toEqual(["usage","inbox","settings","voices","onboarding","project-home"])`.
- Consult-position check: `apps/web/src/server.ts` `/app` handler read line-by-line this run —
  `spaShellResponse(c, deps, "project-home", session)` sits at line ~2491, after the session
  gate (~2413) and the showcase/entry precedence redirects (~2464–2486); SPA.15's
  `project-home.dom.test.tsx` pins the precedence legs.
- Full-suite + public-safe checks ride CI (`typecheck/lint/unit` job); no SPA/bundle surface is
  touched by this row.

## 3 — Deferred live legs (all gated on operator merge + `pulumi up` prod)

| Row | Leg | Verify recipe |
|---|---|---|
| D-SPAF.6-1 | `data-renderer="spa"` on `/app`; `?ssr=1` still SSR; **precedence still precedes** — unauthed `/app` → 302 `/login`, unopened-Showcase workspace → 302 `/p/<slug>/review/<runId>`, `?entry=draft|outline` → 302 `/app/new?entry=…` (each redirect renderer-free) | `curl -s https://rhema.tools/app` (session, ≥1 own project) `\| grep data-renderer` → `spa`; `…?ssr=1` → `ssr`; `curl -sI https://rhema.tools/app` (no cookie) → `302 /login`; showcase-only session `curl -sI` → `302` dossier; `…?entry=draft` → `302 /app/new?entry=draft…` |
| D-SPAF.6-2 | `--expect-renderer spa` leg on prod | `rhema-journeys --stage prod --surface project-home --expect-renderer spa --expect-sha <deployed>` → exit 0 (`SURFACE_GATES["project-home"]` = R1, R7, T2.badge, T6, T7, P1.project, X1.home) |
| D-SPAF.6-3 | Rollback arm | `git revert <flip>` + `pulumi up` → `data-renderer="ssr"` in one deploy (recorded, not exercised destructively) |
| D-SPAF.6-4 | REQ-SEQ-10 nightly-green bake | next nightly `journeys.yml` green on prod before SPAF.7 opens; D-SPAF.1-4's + D-SPAF.2-4's + D-SPAF.3-4's + D-SPAF.4-4's + D-SPAF.5-4's nightly greens restated as this flip's merge/deploy preconditions |

All four appended to `docs/tickets/DEFERRALS.md` under `## SPAF.6` this run.

## 4 — Requirement IDs / AC status

- **REQ-SEQ-10** — separate minimal PR touching only `STAGES.prod.spaSurfaces`: SATISFIED in
  the diff. Operator-merge + `pulumi up` + nightly-green clauses: operator-gated / ledgered
  (D-SPAF.6-4, with D-SPAF.1-4's through D-SPAF.5-4's bakes restated as this flip's activation
  preconditions).
- **REQ-SEQ-11** — deployable dark: SATISFIED by construction (one config datum; SSR
  untouched; flag-∅ serving path identical on every other stage).
- **REQ-SEQ-12** — mixed-mode coexistence: unchanged — the boot payload carries the effective
  flag set; unflipped routes document-nav via `SsrHandoff`; `/app`'s server-owned precedence
  redirects keep answering 302 ahead of any renderer.
- **REQ-VFY-8 (prod legs)** — DEFERRED to the deploy (D-SPAF.6-1/-2).
- AC layers: AC1 (diff touches only `stages.ts` + test) — **deterministic/engineered, DONE**;
  AC2–AC4 (post-deploy markers, `?ssr=1`, journey leg, rollback) — **live-executed, DEFERRED**
  per above; universal gate AC — docs/index/ledger advanced, checks read at closeout.

## 5 — Deviations / owned decisions

- None beyond the operator-sanctioned sequencing: the ticket's "PR merged + deployed" phrasing
  is executed as "PR opened; live legs ledgered" per `mergePolicy: OPERATOR` + the
  $0/no-prod-mutation constraint — and the "≥1 nightly green … entry gate" clause is applied
  to activation order per the 2026-10-08T19:12Z orchestrator ruling (ledgered; no ADR needed —
  no design change).
- `project-home` flips the app root, whose GET carries the server's own precedence redirects —
  verified ahead of the consult in source (session gate, then `?verified=1` telemetry, then
  the showcase/carried-entry 302s, then the shell consult). The deferral recipe asserts the
  redirect-before-render ordering live; no unauthed or onboarding case can boot the SPA shell.
- Pre-existing `integration`/privsep CI reds, if present on this branch, are inherited per
  GD-MAINT.4-1 — classified, not repaired.

## PR checks read (closeout)

Single `gh pr checks --watch=false` read after the closeout-docs push: _(recorded verbatim
below at closeout)_. Any `integration`/privsep red that reports is inherited, waived per
GD-MAINT.4-1 — classified, not repaired.
