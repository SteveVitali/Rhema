# SPAF.4 — prod flip: `voices` (`STAGES.prod.spaSurfaces += "voices"`)

**PR #136** · Manifest row 114 · stacks on `stevevitali/spa-13-surface-voices` @
`1388a48` · merge policy **OPERATOR** — do not merge from the build environment · **$0** spend,
no deploys, no production writes.

Implements `docs/tickets/114_SPAF.4__prod-flip-voices.md` per
`docs/design/29_spa-migration-sequencing.md` (§per-flip procedure, F8/F11 rollback semantics)
and `docs/frontend-spa-spec.md` §11 (REQ-SEQ-10/11/12). **The fourth prod surface flip** of the
strangler migration — the point where `/voices` + `/voices/new` + `/v/:persona` +
`/p/:p/voice/reseed` start serving the React SPA on prod once the operator merges the chain and
`pulumi up`s the deploy.

## Requirement IDs

**REQ-SEQ-10 · REQ-SEQ-11 · REQ-SEQ-12 · REQ-VFY-8 (prod legs)**

## What lands (the whole diff)

- `infra/config/stages.ts`: `STAGES.prod.spaSurfaces` — `["usage","inbox","settings"]` →
  `["usage","inbox","settings","voices"]` (flip order preserved; comment updated to name the four
  flips, the rollback, and the REQ-SEQ-10 nightly-green gate on the NEXT flip).
- `infra/config/stages.test.ts`: the stage-fact pin updated — `prod` now asserts
  `["usage","inbox","settings","voices"]`; `dev` unchanged `["usage","inbox","settings","voices"]`;
  `preview` stays `[]` (stack-config path unchanged).

That's it — **2 files, ~16 lines**, inside the ~20-line budget. Review scope check: the diff
touches only the prod stage fact + its test, exactly the AC1 envelope. No generated config
artifacts exist for this fact (`rhema:spaSurfaces` stack config is never committed).

## Deploy mechanics (what this does once merged + `pulumi up`)

- Prod web env `SPA_SURFACES` becomes `"usage,inbox,settings,voices"` (`compute.ts`:
  `args.spaSurfaces ?? cfg.spaSurfaces.join(",")` — no prod stack config overrides it).
- `deps.spa(c,"voices")` flips true for `/voices`, `/voices/new`, `/v/:persona`, and
  `/p/:project/voice/reseed` → the SPA shell serves (`/voices/new` is registered ahead of the
  `:persona` route).
- `?ssr=1` / `x-rhema-renderer: ssr` keep forcing SSR on **every** stage — the escape hatch is
  unaffected. `SPA_OVERRIDES` is emitted on non-prod kinds only, so prod can never be
  force-SPA'd per-request (REQ-SEQ-4).
- **Rollback = revert this line + redeploy** — SSR serving was never deleted (REQ-SEQ-11/12,
  design/29 F8/F11). Recorded arm: `D-SPAF.4-3`.

## Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` — **38/38 pass**.
- `pnpm --filter @rhema/infra typecheck` / `lint` — clean.
- The pin is real: removing `"voices"` fails the test.

## Deferred live legs (operator-merge + deploy gated — DEFERRALS.md `## SPAF.4`)

| Row | Leg |
|---|---|
| D-SPAF.4-1 | `data-renderer="spa"` on `/voices` + `/voices/new` + `/v/:persona` + `/p/:p/voice/reseed` + `?ssr=1` SSR escape (curl recipes in the row) |
| D-SPAF.4-2 | `rhema-journeys --stage prod --surface voices --expect-renderer spa` green (`SURFACE_GATES.voices` = T5, X1.voices) |
| D-SPAF.4-3 | Rollback arm: revert + `pulumi up` → SSR in one deploy (recorded, not exercised destructively) |
| D-SPAF.4-4 | REQ-SEQ-10 — ≥1 nightly journey green on prod post-deploy before SPAF.5 opens; D-SPAF.1-4/D-SPAF.2-4/D-SPAF.3-4 nightly-green preconditions restated as this flip's activation gate |

**Entry gate (orchestrator ruling, ledgered 2026-10-08T19:12Z):** REQ-SEQ-10's "≥1 nightly
green before the NEXT flip row" binds *activation order at merge/deploy time*, not PR
authoring — this PR is authored-dormant and must not be **deployed** until `settings`'s flip
(D-SPAF.3-4) has baked ≥1 nightly green (which itself waits on `inbox`'s and `usage`'s,
D-SPAF.2-4 → D-SPAF.1-4). Pacing is encoded in SPAREC.3's integration plan.

## Notes

- Deployable dark / additive-only: the flag-∅ serving path is byte-identical; SSR tests
  untouched (REQ-SEQ-11/12).
- `mergePolicy: OPERATOR` — this PR stacks on the unmerged round-4 chain; the operator merges
  bottom-up. Prod deploy is operator-run per the contract.
