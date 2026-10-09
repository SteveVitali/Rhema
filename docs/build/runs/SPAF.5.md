# SPAF.5 — prod flip: `onboarding` (run ledger)

- **Status:** DONE for the in-repo legs (PR diff + unit-level verification); the four
  post-deploy/live legs are **OPEN deferrals** (`D-SPAF.5-1`…`-4`) — they materialize only when
  the operator merges the chain + `pulumi up`s prod.
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/116_SPAF.5__prod-flip-onboarding.md` (manifest row 116)
- **Branch:** `stevevitali/spaf-5-prod-flip-onboarding`, stacked on
  `stevevitali/spa-14-surface-onboarding` @ `5e9361e` (`OPERATOR` merge policy, **not merged**).
- **PR:** #138 — opened at closeout; `gh pr checks --watch=false` read once at closeout
  (result recorded in § PR checks read below; inherited `integration`/privsep red, if it
  reports, is waived per GD-MAINT.4-1 — classified, not repaired).
- **Goal:** flip `onboarding` to the SPA on prod — `STAGES.prod.spaSurfaces += 'onboarding'`
  as the one-line stage-fact PR; the operator merges + `pulumi up` deploys; rollback = revert +
  redeploy.
- **Spend:** $0. No deploys, no production writes, no live legs. Preview legs not needed — this
  row's contract is the prod flip itself (the surface's two-leg/rollback evidence is
  D-SPA.14-1/-2's preview track, still OPEN behind the absent
  `rhema-nonprod-resend-api-key` operator secret — D-MAINT.6-1).

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): no `OPEN` row is unblocked by this run — `D-SPA.6-1`,
  `D-OPS.1-1`, `D-MAINT.6-1`, `D-SPA.14-1/-2` all still need their named operator
  prerequisites; the `D-SPAF.1-*` / `D-SPAF.2-*` / `D-SPAF.3-*` / `D-SPAF.4-*` rows stay OPEN
  (operator merge + deploy gated). None closed, four opened.
- LEDGER CURRENT STATE read: `nextTicket: SPAF.5`, `chainTip:
  stevevitali/spa-14-surface-onboarding`, `mergePolicy: OPERATOR`, `round: 4`,
  `dispatchTarget: subagent`, `pinnedBaseSha: fab08ed`.
- **Entry gate (REQ-SEQ-10 + the 2026-10-08T19:12Z sequencing ruling):** the ticket's operating
  clause is "a nightly green since the PREVIOUS flip is this row's entry gate — pause if
  unmet" — `D-SPAF.4-4` names it (≥1 nightly green on prod after the `voices` deploy). The
  orchestrator's ledgered ruling (PHASE LOG 2026-10-08T19:12Z) interprets that gate as binding
  **activation order at merge/deploy time, not PR authoring**: with `mergePolicy: OPERATOR` and
  the whole stack unmerged, literal row-level gating would stall ~36 rows behind operator
  merges. This run therefore executes now as an **authored-dormant minimal PR** exactly as
  SPAF.1–SPAF.4 did — the stage-fact diff + unit pins land, every live leg is deferred with a
  verbatim verify recipe, and `D-SPAF.1-4`'s + `D-SPAF.2-4`'s + `D-SPAF.3-4`'s +
  `D-SPAF.4-4`'s nightly-green bakes are restated (in `D-SPAF.5-4`) as live preconditions for
  the operator's merge/deploy cadence of THIS flip. REQ-SEQ-10 pacing is encoded in SPAREC.3's
  integration plan (merge bottom-up, deploy, bake ≥1 nightly, next batch).
- **Sequencing reality:** the ticket's hard dependency is "the `onboarding` surface ticket's PR
  merged + deployed (its code must be live)". PR #137 (SPA.14) is unmerged like the rest of
  the stack — but `mergePolicy: OPERATOR` stacks bottom-up, so SPA.1→…→SPA.14 land before
  this PR's deploy leg; the flip line is inert until the chain's code serves.
- **The AND-gate wrinkle:** `onboarding` is the first surface whose route set splits — `/app/new`
  + `/app/new/preview` consult `onboarding` alone; `/p/:p/import` + `/p/:p/import/preview`
  consult `["onboarding","ide-chrome"]` (per-route AND, REQ-SEQ-2 — `SPA_DOCUMENT_ROUTES` in
  `packages/contracts/src/spa.ts`). This flip adds ONLY `onboarding` to prod; `ide-chrome`
  stays dark until SPAF.8 (the `export`+`ide-chrome` flip). So after this deploy the import
  legs keep serving SSR — D-SPAF.5-1's verify asserts exactly that (`data-renderer="ssr"` on
  both), and their `spa` legs are NOT owed by this row — they activate with SPAF.8.
- Sources applied: `docs/design/29_spa-migration-sequencing.md` §per-flip procedure + §rollback
  semantics (design F8/F11); `docs/frontend-spa-spec.md` §11 REQ-SEQ-10/11/12 + REQ-VFY-8;
  `infra/config/stages.ts` + `stages.test.ts` (the stage-fact convention); `infra/pulumi/
  compute.ts` (the `SPA_SURFACES` env wiring — `args.spaSurfaces ?? cfg.spaSurfaces.join(",")`);
  `packages/contracts/src/spa.ts` `SPA_DOCUMENT_ROUTES` (the per-route AND).

## 1 — What landed (the whole diff)

### `infra/config/stages.ts` — the one-line stage fact (REQ-SEQ-10)

```diff
-    // `settings` joins them; SPAF.4 — `voices` joins them (REQ-SEQ-10): each prod flip is a
-    // one-line stage-fact commit, operator-merged + `pulumi up`-deployed; rollback = revert
-    // this line + redeploy. ≥ one nightly green on prod precedes the NEXT surface's prod
-    // flip. Order is flip order — never re-sort.
-    spaSurfaces: ["usage", "inbox", "settings", "voices"],
+    // `settings` joins them; SPAF.4 — `voices` joins them; SPAF.5 — `onboarding` joins them
+    // (REQ-SEQ-10): each prod flip is a one-line stage-fact commit, operator-merged +
+    // `pulumi up`-deployed; rollback = revert this line + redeploy. ≥ one nightly green on
+    // prod precedes the NEXT surface's prod flip. Order is flip order — never re-sort.
+    // `ide-chrome` stays dark on prod until SPAF.8 — the /p/:p/import* legs AND-gate on it,
+    // so they keep serving SSR even with `onboarding` flagged.
+    spaSurfaces: ["usage", "inbox", "settings", "voices", "onboarding"],
```

Effect at deploy time: the Pulumi program renders the prod web env
`SPA_SURFACES=usage,inbox,settings,voices,onboarding` (`compute.ts` — no `rhema:spaSurfaces`
stack config on prod, so the stage fact wins). The web's `deps.spa(c,"onboarding")` consult
then serves the SPA shell for the two onboarding-only GETs — `/app/new` +
`/app/new/preview` (each carrying `spaShellResponse(c, deps, "onboarding", session)`;
`/app/new/preview` consults after the server-owned missing-`qk` redirect, so a bare hit still
302s rather than booting the shell). The two `/p/:p/import*` GETs AND on `ide-chrome` — absent
on prod until SPAF.8 — so they keep serving SSR. `?ssr=1` / `x-rhema-renderer: ssr` still force
SSR on every stage, and `SPA_OVERRIDES` is emitted **only** on non-prod kinds — prod keeps
force-SSR-but-never-force-SPA (REQ-SEQ-4). Flip order is preserved (`usage`, `inbox`,
`settings`, `voices`, then `onboarding` appended). No generated config artifacts exist for
this fact (the stack config path is explicitly never committed).

### `infra/config/stages.test.ts` — the stage-fact pin, updated honestly

The `spa.surfaces` block now asserts `STAGES.prod.spaSurfaces ===
["usage","inbox","settings","voices","onboarding"]` (the SPAF.1…SPAF.5 flips), `dev` stays
`["usage","inbox","settings","voices","onboarding","ide-chrome"]` — prod stays behind dev on
`ide-chrome` until SPAF.8, which the comment now names — and `preview` remains `[]`
(stack-config override path unchanged). The vocabulary pin (every listed key ∈
`SPA_SURFACES`) still holds.

**Nothing else** — no other source file touched. Diff stat: 2 files, ~19 changed lines (within
the ~20-line budget). Review scope check: the PR diff touches only `stages.ts` + its test —
exactly the ticket's AC1 envelope.

## 2 — Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` → **38/38 pass**
  (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` → clean (`tsc -b`).
- `pnpm --filter @rhema/infra lint` → clean (eslint).
- Stage-fact test is a real pin: reverting the stage line fails
  `expect(STAGES.prod.spaSurfaces).toEqual(["usage","inbox","settings","voices","onboarding"])`.
- Full-suite + public-safe checks ride CI (`typecheck/lint/unit` job); no SPA/bundle surface is
  touched by this row.

## 3 — Deferred live legs (all gated on operator merge + `pulumi up` prod)

| Row | Leg | Verify recipe |
|---|---|---|
| D-SPAF.5-1 | `data-renderer="spa"` on `/app/new` + `/app/new/preview`; `/p/:p/import*` still `ssr` (the `ide-chrome` AND-gate holds until SPAF.8); `?ssr=1` still SSR | `curl -s https://rhema.tools/app/new` (session) `\| grep data-renderer` → `spa`; same for `/app/new/preview?qk=<key>`; `curl -s https://rhema.tools/p/<slug>/import` → `ssr` (AND-gate probe); `…?ssr=1` → `ssr` |
| D-SPAF.5-2 | `--expect-renderer spa` leg on prod | `rhema-journeys --stage prod --surface onboarding --expect-renderer spa --expect-sha <deployed>` → exit 0 (`SURFACE_GATES.onboarding` = N1, N3, N4, P1.app-new) |
| D-SPAF.5-3 | Rollback arm | `git revert <flip>` + `pulumi up` → `data-renderer="ssr"` in one deploy (recorded, not exercised destructively) |
| D-SPAF.5-4 | REQ-SEQ-10 nightly-green bake | next nightly `journeys.yml` green on prod before SPAF.6 opens; D-SPAF.1-4's + D-SPAF.2-4's + D-SPAF.3-4's + D-SPAF.4-4's nightly greens restated as this flip's merge/deploy preconditions |

All four appended to `docs/tickets/DEFERRALS.md` under `## SPAF.5` this run.

## 4 — Requirement IDs / AC status

- **REQ-SEQ-10** — separate minimal PR touching only `STAGES.prod.spaSurfaces`: SATISFIED in
  the diff. Operator-merge + `pulumi up` + nightly-green clauses: operator-gated / ledgered
  (D-SPAF.5-4, with D-SPAF.1-4's, D-SPAF.2-4's, D-SPAF.3-4's and D-SPAF.4-4's bakes restated
  as this flip's activation preconditions).
- **REQ-SEQ-11** — deployable dark: SATISFIED by construction (one config datum; SSR
  untouched; flag-∅ serving path identical on every other stage).
- **REQ-SEQ-12** — mixed-mode coexistence: unchanged — the boot payload carries the effective
  flag set; unflipped routes document-nav via `SsrHandoff`; the AND-gated `/p/:p/import*` legs
  stay on the SSR path this deploy by design.
- **REQ-VFY-8 (prod legs)** — DEFERRED to the deploy (D-SPAF.5-1/-2).
- AC layers: AC1 (diff touches only `stages.ts` + test) — **deterministic/engineered, DONE**;
  AC2–AC4 (post-deploy markers, `?ssr=1`, journey leg, rollback) — **live-executed, DEFERRED**
  per above; universal gate AC — docs/index/ledger advanced, checks read at closeout.

## 5 — Deviations / owned decisions

- None beyond the operator-sanctioned sequencing: the ticket's "PR merged + deployed" phrasing
  is executed as "PR opened; live legs ledgered" per `mergePolicy: OPERATOR` + the
  $0/no-prod-mutation constraint — and the "≥1 nightly green … entry gate" clause is applied
  to activation order per the 2026-10-08T19:12Z orchestrator ruling (ledgered; no ADR needed —
  no design change).
- The onboarding surface's `/p/:p/import*` legs ride the `ide-chrome` AND-gate: this flip does
  NOT activate them on prod (deliberate — `ide-chrome` arrives with `export` at SPAF.8, manifest
  row 122). The deferral recipes assert the AND-gate holds (`data-renderer="ssr"` on both
  import GETs post-deploy), and the import legs' `spa` verification rides SPAF.8's rows, not
  this one's.
- Pre-existing `integration`/privsep CI reds, if present on this branch, are inherited per
  GD-MAINT.4-1 — classified, not repaired.

## PR checks read (closeout)

Single `gh pr checks 138 --watch=false` read after the closeout-docs push: **"no checks
reported on the 'stevevitali/spaf-5-prod-flip-onboarding' branch"** (exit 1 — the pipeline had
not registered checks at stamp time). Recorded verbatim rather than re-polled; any
`integration`/privsep red that reports later is inherited, waived per GD-MAINT.4-1 —
classified, not repaired.
