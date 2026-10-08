# SPAF.1 — prod flip: `usage` (run ledger)

- **Status:** DONE for the in-repo legs (PR diff + unit-level verification); the four
  post-deploy/live legs are **OPEN deferrals** (`D-SPAF.1-1`…`-4`) — they materialize only when
  the operator merges the chain + `pulumi up`s prod.
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/108_SPAF.1__prod-flip-usage.md` (manifest row 108)
- **Branch:** `stevevitali/spaf-1-prod-flip-usage`, stacked on
  `stevevitali/spa-10-surface-usage` @ `f7d2946` (`OPERATOR` merge policy, **not merged**).
- **Goal:** flip `usage` to the SPA on prod — `STAGES.prod.spaSurfaces += 'usage'` as the one-line
  stage-fact PR; the operator merges + `pulumi up` deploys; rollback = revert + redeploy.
- **Spend:** $0. No deploys, no production writes, no live legs. Preview legs not needed — this
  row's contract is the prod flip itself (the surface's two-leg/rollback evidence is D-SPA.6-1's
  preview track, still OPEN).

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): no `OPEN` row is unblocked by this run — `D-SPA.6-1`
  (the renderer-asserted legs) still needs the operator's chain merge+deploy (leg a) and pushed
  preview images + `rhema:spaSurfaces` stack config (leg b); unchanged, stays OPEN.
- LEDGER CURRENT STATE read: `nextTicket: SPAF.1`, `chainTip: stevevitali/spa-10-surface-usage`,
  `mergePolicy: OPERATOR`, `round: 4`, `dispatchTarget: subagent`, `pinnedBaseSha: fab08ed`.
- **Entry gate (REQ-SEQ-10):** "≥ one nightly green on prod SHALL precede the next surface's prod
  flip." SPAF.1 is the **first** prod flip — there is no previous flip, so no nightly-green
  precondition exists for THIS row (the ticket's own words: "first flip waits on nothing else").
  The nightly-green precondition now binds **SPAF.2** (prod flip: `inbox`) — recorded as
  `D-SPAF.1-4` and to be re-asserted as SPAF.2's entry gate.
- **Sequencing reality:** the ticket's hard dependency is "the `usage` surface ticket's PR merged
  + deployed (its code must be live)". PR #128 (SPA.10) is unmerged like the rest of the stack —
  but `mergePolicy: OPERATOR` stacks bottom-up, so SPA.1→SPA.10 land before this PR's deploy
  leg; the flip line is inert until the chain's code serves. Operator ruling per dispatch: land
  the PR diff + unit verification, ledger the live legs.
- Sources applied: `docs/design/29_spa-migration-sequencing.md` §per-flip procedure + §rollback
  semantics (design F8/F11); `docs/frontend-spa-spec.md` §11 REQ-SEQ-10/11/12 + REQ-VFY-8;
  `infra/config/stages.ts` + `stages.test.ts` (the stage-fact convention); `infra/pulumi/compute.ts`
  (the `SPA_SURFACES` env wiring — `args.spaSurfaces ?? cfg.spaSurfaces.join(",")`).

## 1 — What landed (the whole diff)

### `infra/config/stages.ts` — the one-line stage fact (REQ-SEQ-10)

```diff
-    spaSurfaces: [], // SPA.2 — prod flips are separate one-line operator-merged commits (REQ-SEQ-10)
+    // SPAF.1 — `usage` is the first prod surface flip (REQ-SEQ-10): a one-line stage-fact commit,
+    // operator-merged + `pulumi up`-deployed; rollback = revert this line + redeploy. ≥ one nightly
+    // green on prod precedes the NEXT surface's prod flip.
+    spaSurfaces: ["usage"],
```

Effect at deploy time: the Pulumi program renders the prod web env `SPA_SURFACES=usage`
(`compute.ts` — no `rhema:spaSurfaces` stack config on prod, so the stage fact wins). The web's
`deps.spa(c,"usage")` consult then serves the SPA shell for `/usage` + `/p/:slug/usage` for
flagged requests; `?ssr=1` / `x-rhema-renderer: ssr` still force SSR on every stage, and
`SPA_OVERRIDES` is emitted **only** on non-prod kinds — prod keeps force-SSR-but-never-force-SPA
(REQ-SEQ-4). No generated config artifacts exist for this fact (the stack config path is
explicitly never committed).

### `infra/config/stages.test.ts` — the stage-fact pin, updated honestly

The `spa.surfaces` block now asserts `STAGES.dev.spaSurfaces === ["usage"]` AND
`STAGES.prod.spaSurfaces === ["usage"]` (the SPAF.1 flip), with only `preview` remaining `[]`
(stack-config override path unchanged). The vocabulary pin (every listed key ∈ `SPA_SURFACES`)
still holds.

**Nothing else** — no other source file touched. Diff stat: 2 files, ~13 changed lines (within
the ~20-line budget). Review scope check: the PR diff touches only `stages.ts` + its test —
exactly the ticket's AC1 envelope.

## 2 — Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` → **38/38 pass**
  (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` → clean (`tsc -b`).
- `pnpm --filter @rhema/infra lint` → clean (eslint).
- Stage-fact test is a real pin: reverting the stage line fails
  `expect(STAGES.prod.spaSurfaces).toEqual(["usage"])`.
- Full-suite + public-safe checks ride CI (`typecheck/lint/unit` job); no SPA/bundle surface is
  touched by this row.

## 3 — Deferred live legs (all gated on operator merge + `pulumi up` prod)

| Row | Leg | Verify recipe |
|---|---|---|
| D-SPAF.1-1 | `data-renderer="spa"` on `/usage` + `/p/:slug/usage`; `?ssr=1` still SSR | `curl -s https://rhema.tools/usage` (session) `\| grep data-renderer` → `spa`; `…?ssr=1` → `ssr` |
| D-SPAF.1-2 | `--expect-renderer spa` leg on prod | `rhema-journeys --stage prod --surface usage --expect-renderer spa --expect-sha <deployed>` → exit 0 |
| D-SPAF.1-3 | Rollback arm | `git revert <flip>` + `pulumi up` → `data-renderer="ssr"` in one deploy (recorded, not exercised destructively) |
| D-SPAF.1-4 | REQ-SEQ-10 nightly-green bake | next nightly `journeys.yml` green on prod before SPAF.2 opens |

All four appended to `docs/tickets/DEFERRALS.md` under `## SPAF.1` this run.

## 4 — Requirement IDs / AC status

- **REQ-SEQ-10** — separate minimal PR touching only `STAGES.prod.spaSurfaces`: SATISFIED in the
  diff. Operator-merge + `pulumi up` + nightly-green clauses: operator-gated / ledgered
  (D-SPAF.1-4).
- **REQ-SEQ-11** — deployable dark: SATISFIED by construction (one config datum; SSR untouched;
  flag-∅ serving path identical on every other stage).
- **REQ-SEQ-12** — mixed-mode coexistence: unchanged — the boot payload carries the effective
  flag set; unflipped routes document-nav via `SsrHandoff`.
- **REQ-VFY-8 (prod legs)** — DEFERRED to the deploy (D-SPAF.1-1/-2).
- AC layers: AC1 (diff touches only `stages.ts` + test) — **deterministic/engineered, DONE**;
  AC2–AC4 (post-deploy markers, `?ssr=1`, journey leg, rollback) — **live-executed, DEFERRED**
  per above; universal gate AC — docs/index/ledger advanced, checks read at closeout.

## 5 — Deviations / owned decisions

- None beyond the operator-sanctioned sequencing: the ticket's "PR merged + deployed" phrasing is
  executed as "PR opened; live legs ledgered" per `mergePolicy: OPERATOR` + the $0/no-prod-mutation
  constraint — the same posture every prior chain row recorded. No ADR needed (no design change).
- Pre-existing `integration`/privsep CI reds, if present on this branch, are inherited per
  GD-MAINT.4-1 — classified, not repaired.
