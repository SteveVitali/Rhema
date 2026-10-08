# SPAF.1 — prod flip: `usage` (`STAGES.prod.spaSurfaces += "usage"`)

**Manifest row 108** · stacks on `stevevitali/spa-10-surface-usage` @ `f7d2946` · merge policy
**OPERATOR** — do not merge from the build environment · **$0** spend, no deploys, no
production writes.

Implements `docs/tickets/108_SPAF.1__prod-flip-usage.md` per
`docs/design/29_spa-migration-sequencing.md` (§per-flip procedure, F8/F11 rollback semantics) and
`docs/frontend-spa-spec.md` §11 (REQ-SEQ-10/11/12). **The first prod surface flip** of the
strangler migration — the point where `/usage` + `/p/:slug/usage` start serving the React SPA on
prod once the operator merges the chain and `pulumi up`s the deploy.

## Requirement IDs

**REQ-SEQ-10 · REQ-SEQ-11 · REQ-SEQ-12 · REQ-VFY-8 (prod legs)**

## What lands (the whole diff)

- `infra/config/stages.ts`: `STAGES.prod.spaSurfaces` — `[]` → `["usage"]` (+ comment block
  naming the flip, the rollback, and the REQ-SEQ-10 nightly-green gate on the NEXT flip).
- `infra/config/stages.test.ts`: the stage-fact pin updated — `dev` AND `prod` now assert
  `["usage"]`; `preview` stays `[]` (stack-config path unchanged).

That's it — **2 files, ~13 lines**, inside the ~20-line budget. Review scope check: the diff
touches only the prod stage fact + its test, exactly the AC1 envelope. No generated config
artifacts exist for this fact (`rhema:spaSurfaces` stack config is never committed).

## Deploy mechanics (what this does once merged + `pulumi up`)

- Prod web env `SPA_SURFACES` becomes `"usage"` (`compute.ts`: `args.spaSurfaces ??
  cfg.spaSurfaces.join(",")` — no prod stack config overrides it).
- `deps.spa(c,"usage")` flips true for `/usage` + `/p/:slug/usage` → the SPA shell serves.
- `?ssr=1` / `x-rhema-renderer: ssr` keep forcing SSR on **every** stage — the escape hatch is
  unaffected. `SPA_OVERRIDES` is emitted on non-prod kinds only, so prod can never be force-SPA'd
  per-request (REQ-SEQ-4).
- **Rollback = revert this line + redeploy** — SSR serving was never deleted (REQ-SEQ-11/12,
  design/29 F8/F11). Recorded arm: `D-SPAF.1-3`.

## Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` — **38/38 pass**.
- `pnpm --filter @rhema/infra typecheck` / `lint` — clean.
- The pin is real: removing `"usage"` fails the test.

## Deferred live legs (operator-merge + deploy gated — DEFERRALS.md `## SPAF.1`)

| Row | Leg |
|---|---|
| D-SPAF.1-1 | `data-renderer="spa"` on `/usage`,`/p/:slug/usage` + `?ssr=1` SSR escape (curl recipes in the row) |
| D-SPAF.1-2 | `rhema-journeys --stage prod --surface usage --expect-renderer spa` green |
| D-SPAF.1-3 | Rollback arm: revert + `pulumi up` → SSR in one deploy (recorded, not exercised destructively) |
| D-SPAF.1-4 | REQ-SEQ-10 — ≥1 nightly journey green on prod post-deploy before SPAF.2 opens |

First prod flip ⇒ no prior-flip nightly-green precondition for this row; the gate binds SPAF.2.

## Notes

- Deployable dark / additive-only: the flag-∅ serving path is byte-identical; SSR tests
  untouched (REQ-SEQ-11/12).
- `mergePolicy: OPERATOR` — this PR stacks on the unmerged round-4 chain; the operator merges
  bottom-up. Prod deploy is operator-run per the contract.
