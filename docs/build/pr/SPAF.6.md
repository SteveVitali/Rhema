# SPAF.6 — prod flip: `project-home` (`STAGES.prod.spaSurfaces += "project-home"`)

**PR #140** · Manifest row 118 · stacks on
`stevevitali/spa-15-surface-project-home` @ `dad1f79` · merge policy **OPERATOR** — do not
merge from the build environment · **$0** spend, no deploys, no production writes.

Implements `docs/tickets/118_SPAF.6__prod-flip-project-home.md` per
`docs/design/29_spa-migration-sequencing.md` (§per-flip procedure, F8/F11 rollback semantics)
and `docs/frontend-spa-spec.md` §11 (REQ-SEQ-10/11/12). **The sixth prod surface flip** of the
strangler migration — the point where `/app` (the app root, the workspace home) starts
serving the React SPA on prod once the operator merges the chain and `pulumi up`s the deploy.
`/app`'s server-owned precedence redirects are **not** part of the renderer decision: the
session gate (unauthed → 302 `/login`) and the first-five-minutes precedence (unopened-Showcase
→ 302 the dossier; carried `?entry=draft|outline` → 302 `/app/new?entry=…`) run ahead of the
`project-home` consult at spec §4's fixed position — they keep answering renderer-free 302s,
so no unauthed or onboarding case can boot the shell.

## Requirement IDs

**REQ-SEQ-10 · REQ-SEQ-11 · REQ-SEQ-12 · REQ-VFY-8 (prod legs)**

## What lands (the whole diff)

- `infra/config/stages.ts`: `STAGES.prod.spaSurfaces` —
  `["usage","inbox","settings","voices","onboarding"]` →
  `["usage","inbox","settings","voices","onboarding","project-home"]`
  (flip order preserved; comment updated to name the six flips, the rollback, the REQ-SEQ-10
  nightly-green gate on the NEXT flip, the `ide-chrome` AND-gate note, and the `/app`
  precedence-redirect note).
- `infra/config/stages.test.ts`: the stage-fact pin updated — `prod` now asserts
  `["usage","inbox","settings","voices","onboarding","project-home"]`; `dev` unchanged
  `["usage","inbox","settings","voices","onboarding","ide-chrome","project-home"]`; `preview`
  stays `[]` (stack-config path unchanged).

That's it — **2 files, ~14 changed lines**, inside the ~20-line budget. Review scope check:
the diff touches only the prod stage fact + its test, exactly the AC1 envelope. No generated
config artifacts exist for this fact (`rhema:spaSurfaces` stack config is never committed).

## Deploy mechanics (what this does once merged + `pulumi up`)

- Prod web env `SPA_SURFACES` becomes `"usage,inbox,settings,voices,onboarding,project-home"`
  (`compute.ts`: `args.spaSurfaces ?? cfg.spaSurfaces.join(",")` — no prod stack config
  overrides it).
- `deps.spa(c,"project-home")` flips true for `GET /app` → the SPA shell serves — but only
  for a request that survives the server's own precedence: unauthed → 302 `/login`;
  showcase-only workspace with an unopened Showcase → 302 `/p/<slug>/review/<runId>`; a
  carried `?entry=draft|outline` intent → 302 `/app/new?entry=…[&held=1]` (`server.ts`
  ~2411–2491; the consult is at spec §4's fixed position after the session gate +
  precedence redirects, before the render).
- `?ssr=1` / `x-rhema-renderer: ssr` keep forcing SSR on **every** stage — the escape hatch is
  unaffected. `SPA_OVERRIDES` is emitted on non-prod kinds only, so prod can never be
  force-SPA'd per-request (REQ-SEQ-4).
- **Rollback = revert this line + redeploy** — SSR serving was never deleted (REQ-SEQ-11/12,
  design/29 F8/F11). Recorded arm: `D-SPAF.6-3`.

## Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` — **38/38 pass**.
- `pnpm --filter @rhema/infra typecheck` / `lint` — clean.
- The pin is real: removing `"project-home"` fails the test.
- Consult position verified in source: `/app`'s `spaShellResponse` call sits after the session
  gate + showcase/entry precedence redirects (`server.ts` ~2491); SPA.15's
  `project-home.dom.test.tsx` pins the precedence legs.

## Deferred live legs (operator-merge + deploy gated — DEFERRALS.md `## SPAF.6`)

| Row | Leg |
|---|---|
| D-SPAF.6-1 | `data-renderer="spa"` on `/app` + `?ssr=1` SSR escape; **and** the precedence legs must still 302 before any render — unauthed `/app` → `/login`, unopened-Showcase → dossier, `?entry=draft|outline` → `/app/new?entry=…` (curl recipes in the row) |
| D-SPAF.6-2 | `rhema-journeys --stage prod --surface project-home --expect-renderer spa` green (`SURFACE_GATES["project-home"]` = R1, R7, T2.badge, T6, T7, P1.project, X1.home) |
| D-SPAF.6-3 | Rollback arm: revert + `pulumi up` → SSR in one deploy (recorded, not exercised destructively) |
| D-SPAF.6-4 | REQ-SEQ-10 — ≥1 nightly journey green on prod post-deploy before SPAF.7 opens; D-SPAF.1-4/D-SPAF.2-4/D-SPAF.3-4/D-SPAF.4-4/D-SPAF.5-4 nightly-green preconditions restated as this flip's activation gate |

**Entry gate (orchestrator ruling, ledgered 2026-10-08T19:12Z):** REQ-SEQ-10's "≥1 nightly
green before the NEXT flip row" binds *activation order at merge/deploy time*, not PR
authoring — this PR is authored-dormant and must not be **deployed** until `onboarding`'s flip
(D-SPAF.5-4) has baked ≥1 nightly green (which itself waits on `voices`'s, `settings`'s,
`inbox`'s, and `usage`'s, D-SPAF.4-4 → D-SPAF.3-4 → D-SPAF.2-4 → D-SPAF.1-4). Pacing is
encoded in SPAREC.3's integration plan.

## Notes

- Deployable dark / additive-only: the flag-∅ serving path is byte-identical; SSR tests
  untouched (REQ-SEQ-11/12).
- `mergePolicy: OPERATOR` — this PR stacks on the unmerged round-4 chain; the operator merges
  bottom-up. Prod deploy is operator-run per the contract.
