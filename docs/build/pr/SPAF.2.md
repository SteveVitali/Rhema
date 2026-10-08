# SPAF.2 — prod flip: `inbox` (`STAGES.prod.spaSurfaces += "inbox"`)

**PR #132** · Manifest row 110 · stacks on `stevevitali/maint-6-nonprod-session-plumbing` @
`c41d64a` · merge policy **OPERATOR** — do not merge from the build environment · **$0** spend,
no deploys, no production writes.

Implements `docs/tickets/110_SPAF.2__prod-flip-inbox.md` per
`docs/design/29_spa-migration-sequencing.md` (§per-flip procedure, F8/F11 rollback semantics)
and `docs/frontend-spa-spec.md` §11 (REQ-SEQ-10/11/12). **The second prod surface flip** of the
strangler migration — the point where `/app/inbox` starts serving the React SPA on prod once
the operator merges the chain and `pulumi up`s the deploy.

## Requirement IDs

**REQ-SEQ-10 · REQ-SEQ-11 · REQ-SEQ-12 · REQ-VFY-8 (prod legs)**

## What lands (the whole diff)

- `infra/config/stages.ts`: `STAGES.prod.spaSurfaces` — `["usage"]` → `["usage","inbox"]`
  (flip order preserved; comment updated to name both flips, the rollback, and the REQ-SEQ-10
  nightly-green gate on the NEXT flip).
- `infra/config/stages.test.ts`: the stage-fact pin updated — `prod` now asserts
  `["usage","inbox"]`; `dev` stays `["usage","inbox"]`; `preview` stays `[]` (stack-config
  path unchanged).

That's it — **2 files, ~15 lines**, inside the ~20-line budget. Review scope check: the diff
touches only the prod stage fact + its test, exactly the AC1 envelope. No generated config
artifacts exist for this fact (`rhema:spaSurfaces` stack config is never committed).

## Deploy mechanics (what this does once merged + `pulumi up`)

- Prod web env `SPA_SURFACES` becomes `"usage,inbox"` (`compute.ts`: `args.spaSurfaces ??
  cfg.spaSurfaces.join(",")` — no prod stack config overrides it).
- `deps.spa(c,"inbox")` flips true for `/app/inbox` → the SPA shell serves.
- `?ssr=1` / `x-rhema-renderer: ssr` keep forcing SSR on **every** stage — the escape hatch is
  unaffected. `SPA_OVERRIDES` is emitted on non-prod kinds only, so prod can never be
  force-SPA'd per-request (REQ-SEQ-4).
- **Rollback = revert this line + redeploy** — SSR serving was never deleted (REQ-SEQ-11/12,
  design/29 F8/F11). Recorded arm: `D-SPAF.2-3`.

## Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` — **38/38 pass**.
- `pnpm --filter @rhema/infra typecheck` / `lint` — clean.
- The pin is real: removing `"inbox"` fails the test.

## Deferred live legs (operator-merge + deploy gated — DEFERRALS.md `## SPAF.2`)

| Row | Leg |
|---|---|
| D-SPAF.2-1 | `data-renderer="spa"` on `/app/inbox` + `?ssr=1` SSR escape (curl recipes in the row) |
| D-SPAF.2-2 | `rhema-journeys --stage prod --surface inbox --expect-renderer spa` green (`SURFACE_GATES.inbox` = T2.badge, R8.inbox, X1.inbox) |
| D-SPAF.2-3 | Rollback arm: revert + `pulumi up` → SSR in one deploy (recorded, not exercised destructively) |
| D-SPAF.2-4 | REQ-SEQ-10 — ≥1 nightly journey green on prod post-deploy before SPAF.3 opens; D-SPAF.1-4's bake restated as this flip's activation precondition |

**Entry gate (orchestrator ruling, ledgered 2026-10-08T19:12Z):** REQ-SEQ-10's "≥1 nightly
green before the NEXT flip row" binds *activation order at merge/deploy time*, not PR
authoring — this PR is authored-dormant and must not be **deployed** until `usage`'s flip
(D-SPAF.1-4) has baked ≥1 nightly green. Pacing is encoded in SPAREC.3's integration plan.

## Notes

- Deployable dark / additive-only: the flag-∅ serving path is byte-identical; SSR tests
  untouched (REQ-SEQ-11/12).
- `mergePolicy: OPERATOR` — this PR stacks on the unmerged round-4 chain; the operator merges
  bottom-up. Prod deploy is operator-run per the contract.
