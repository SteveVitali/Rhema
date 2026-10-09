# SPAF.5 — prod flip: `onboarding` (`STAGES.prod.spaSurfaces += "onboarding"`)

**PR #138** · Manifest row 116 · stacks on `stevevitali/spa-14-surface-onboarding` @
`5e9361e` · merge policy **OPERATOR** — do not merge from the build environment · **$0** spend,
no deploys, no production writes.

Implements `docs/tickets/116_SPAF.5__prod-flip-onboarding.md` per
`docs/design/29_spa-migration-sequencing.md` (§per-flip procedure, F8/F11 rollback semantics)
and `docs/frontend-spa-spec.md` §11 (REQ-SEQ-10/11/12). **The fifth prod surface flip** of the
strangler migration — the point where `/app/new` + `/app/new/preview` start serving the React
SPA on prod once the operator merges the chain and `pulumi up`s the deploy. The
`/p/:p/import*` legs are **not** part of this activation: they consult `onboarding` AND
`ide-chrome` (the per-route AND-gate, REQ-SEQ-2), and `ide-chrome` stays dark on prod until
SPAF.8 — so both import GETs keep serving SSR after this deploy, by construction.

## Requirement IDs

**REQ-SEQ-10 · REQ-SEQ-11 · REQ-SEQ-12 · REQ-VFY-8 (prod legs)**

## What lands (the whole diff)

- `infra/config/stages.ts`: `STAGES.prod.spaSurfaces` —
  `["usage","inbox","settings","voices"]` → `["usage","inbox","settings","voices","onboarding"]`
  (flip order preserved; comment updated to name the five flips, the rollback, the REQ-SEQ-10
  nightly-green gate on the NEXT flip, and the `ide-chrome` AND-gate note).
- `infra/config/stages.test.ts`: the stage-fact pin updated — `prod` now asserts
  `["usage","inbox","settings","voices","onboarding"]`; `dev` unchanged
  `["usage","inbox","settings","voices","onboarding","ide-chrome"]`; `preview` stays `[]`
  (stack-config path unchanged).

That's it — **2 files, ~19 changed lines**, inside the ~20-line budget. Review scope check:
the diff touches only the prod stage fact + its test, exactly the AC1 envelope. No generated
config artifacts exist for this fact (`rhema:spaSurfaces` stack config is never committed).

## Deploy mechanics (what this does once merged + `pulumi up`)

- Prod web env `SPA_SURFACES` becomes `"usage,inbox,settings,voices,onboarding"`
  (`compute.ts`: `args.spaSurfaces ?? cfg.spaSurfaces.join(",")` — no prod stack config
  overrides it).
- `deps.spa(c,"onboarding")` flips true for `/app/new` and `/app/new/preview` → the SPA shell
  serves (each GET carries `spaShellResponse(c, deps, "onboarding", session)`;
  `/app/new/preview` consults **after** the server-owned missing-`qk` redirect).
- `/p/:project/import` + `/p/:project/import/preview` consult `["onboarding","ide-chrome"]` —
  the AND stays false on prod (`ide-chrome` absent from the flag set until SPAF.8), so they
  keep serving SSR. Their `data-renderer="spa"` verification is deferred to SPAF.8's
  activation, not this row's.
- `?ssr=1` / `x-rhema-renderer: ssr` keep forcing SSR on **every** stage — the escape hatch is
  unaffected. `SPA_OVERRIDES` is emitted on non-prod kinds only, so prod can never be
  force-SPA'd per-request (REQ-SEQ-4).
- **Rollback = revert this line + redeploy** — SSR serving was never deleted (REQ-SEQ-11/12,
  design/29 F8/F11). Recorded arm: `D-SPAF.5-3`.

## Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` — **38/38 pass**.
- `pnpm --filter @rhema/infra typecheck` / `lint` — clean.
- The pin is real: removing `"onboarding"` fails the test.

## Deferred live legs (operator-merge + deploy gated — DEFERRALS.md `## SPAF.5`)

| Row | Leg |
|---|---|
| D-SPAF.5-1 | `data-renderer="spa"` on `/app/new` + `/app/new/preview` + `?ssr=1` SSR escape; **and** `/p/:p/import*` must still show `data-renderer="ssr"` — the `ide-chrome` AND-gate holding is part of the verify (curl recipes in the row) |
| D-SPAF.5-2 | `rhema-journeys --stage prod --surface onboarding --expect-renderer spa` green (`SURFACE_GATES.onboarding` = N1, N3, N4, P1.app-new) |
| D-SPAF.5-3 | Rollback arm: revert + `pulumi up` → SSR in one deploy (recorded, not exercised destructively) |
| D-SPAF.5-4 | REQ-SEQ-10 — ≥1 nightly journey green on prod post-deploy before SPAF.6 opens; D-SPAF.1-4/D-SPAF.2-4/D-SPAF.3-4/D-SPAF.4-4 nightly-green preconditions restated as this flip's activation gate |

**Entry gate (orchestrator ruling, ledgered 2026-10-08T19:12Z):** REQ-SEQ-10's "≥1 nightly
green before the NEXT flip row" binds *activation order at merge/deploy time*, not PR
authoring — this PR is authored-dormant and must not be **deployed** until `voices`'s flip
(D-SPAF.4-4) has baked ≥1 nightly green (which itself waits on `settings`'s, `inbox`'s, and
`usage`'s, D-SPAF.3-4 → D-SPAF.2-4 → D-SPAF.1-4). Pacing is encoded in SPAREC.3's integration
plan.

## Notes

- Deployable dark / additive-only: the flag-∅ serving path is byte-identical; SSR tests
  untouched (REQ-SEQ-11/12).
- `mergePolicy: OPERATOR` — this PR stacks on the unmerged round-4 chain; the operator merges
  bottom-up. Prod deploy is operator-run per the contract.
