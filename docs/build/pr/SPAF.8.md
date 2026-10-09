# SPAF.8 — prod flip: `export` + `ide-chrome` (`STAGES.prod.spaSurfaces += "export","ide-chrome"`)

**PR #144** · Manifest row 122 · stacks on
`stevevitali/spa-17-surface-export-ide-chrome` @ `6099a71` · merge policy **OPERATOR** — do not
merge from the build environment · **$0** spend, no deploys, no production writes.

Implements `docs/tickets/122_SPAF.8__prod-flip-export.md` per
`docs/design/29_spa-migration-sequencing.md` (§per-flip procedure, F8/F11 rollback semantics)
and `docs/frontend-spa-spec.md` §11 (REQ-SEQ-10/11/12). **The eighth prod surface flip — and
the FIRST IDE-framed prod activation** of the strangler migration — the point where
`/p/:p/export` starts serving the React SPA **inside the IDE chrome** (panes/palette/SSE
feed) on prod once the operator merges the chain and `pulumi up`s the deploy, and where the
`/p/:p/import*` legs' `onboarding ∧ ide-chrome` AND-gate resolves for their **first spa
verdicts** (dormant since SPAF.5 flagged `onboarding` alone). The session gates are not part
of the renderer decision: unauthed hits on all three GETs keep answering a renderer-free 302
`/login` ahead of their consults — and `/p/:p/import/preview` keeps its server-owned
missing-`qk` → `/p/:p/import` 302 ahead of the consult too. The export POST (binary
download) + `/export/addition` + `/export/ai-use/:fmt` were never documents — unchanged on
either renderer.

## Requirement IDs

**REQ-SEQ-10 · REQ-SEQ-11 · REQ-SEQ-12 · REQ-VFY-8 (prod legs)**

## What lands (the whole diff)

- `infra/config/stages.ts`: `STAGES.prod.spaSurfaces` —
  `["usage","inbox","settings","voices","onboarding","project-home","billing"]` →
  `["usage","inbox","settings","voices","onboarding","project-home","billing","export","ide-chrome"]`
  (flip order preserved — the ticket's paired `+= 'export' + 'ide-chrome'`; comment updated to
  name the eight flips, the both-keys-out rollback, the REQ-SEQ-10 nightly-green gate on the
  NEXT flip, the first-IDE-framed-activation semantics, and the standing
  session-gate/precedence notes).
- `infra/config/stages.test.ts`: the stage-fact pin updated — `prod` now asserts the nine-key
  list; `dev` unchanged
  `["usage","inbox","settings","voices","onboarding","ide-chrome","project-home","billing","export"]`;
  `preview` stays `[]` (stack-config path unchanged).

That's it — **2 files, 25 insertions / 17 deletions** (the fact itself is one line; comments
carry the rest), inside the ~20-line budget's intent. Review scope check: the diff touches
only the prod stage fact + its test, exactly the AC1 envelope. No generated config artifacts
exist for this fact (`rhema:spaSurfaces` stack config is never committed).

## Deploy mechanics (what this does once merged + `pulumi up`)

- Prod web env `SPA_SURFACES` becomes
  `"usage,inbox,settings,voices,onboarding,project-home,billing,export,ide-chrome"`
  (`compute.ts`: `args.spaSurfaces ?? cfg.spaSurfaces.join(",")` — no prod stack config
  overrides it).
- `deps.spa(c,"export")` flips true for `GET /p/:project/export` (`server.ts` ~5884) —
  `export` ∈ `SPA_IDE_FRAMED_SURFACES`, so the key-level `export ∧ ide-chrome` AND resolves
  — the shell serves **and** the `p.$project` layout mounts `<IdeChrome>`
  (`/p/$project/export` ∈ `SPA_IDE_FRAMED_ROUTES`): prod's first chrome mount.
- The same `ide-chrome` key completes the route-level `["onboarding","ide-chrome"]` AND on
  `GET /p/:project/import` (~4372) + `GET /p/:project/import/preview` (~4457, after the
  missing-`qk` 302) — their first spa verdicts. `ide-chrome` alone still gates nothing else:
  `dossier`/`run-sheet`/`run-report`/`editor` stay unflipped.
- `?ssr=1` / `x-rhema-renderer: ssr` keep forcing SSR on **every** stage — the escape hatch
  is unaffected. `SPA_OVERRIDES` is emitted on non-prod kinds only, so prod can never be
  force-SPA'd per-request (REQ-SEQ-4).
- **Rollback = revert this line + redeploy** — removes BOTH keys: `/p/:p/export` returns to
  SSR and the import legs re-dormant together in one deploy. SSR serving was never deleted
  (REQ-SEQ-11/12, design/29 F8/F11). Recorded arm: `D-SPAF.8-3`.

## Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` — **38/38 pass**.
- `pnpm --filter @rhema/infra typecheck` / `lint` — clean.
- The pin is real: removing the keys fails the exact-equality assert.
- Consult positions verified in source: `/p/:p/export` gates ~5882 → consults ~5884;
  `/p/:p/import` gates ~4367 → consults ~4372; `/p/:p/import/preview` answers the `qk` 302
  ~4454 → consults ~4457; the key-level AND-gate lives in `spa-flag.ts` ~67 +
  `contracts/src/spa.ts` ~47.
- **Known chain debt (pre-existing, not this run's):** `pnpm check:dom-contract` fails on the
  base with 4 unasserted billing hooks (`data-plan-ladder`, `data-topups`,
  `data-auto-reload`, `packId`) — SPA.16 debt, SPA.18 owns the repair; unchanged by this diff.

## Deferred live legs (operator-merge + deploy gated — DEFERRALS.md `## SPAF.8`)

| Row | Leg |
|---|---|
| D-SPAF.8-1 | `data-renderer="spa"` on `/p/:p/export` + `/p/:p/import` + `/p/:p/import/preview?qk=…` + the IdeChrome mount on the export leaf + `?ssr=1` SSR escape + session-gate/`qk`-redirect precedence (curl recipes in the row) |
| D-SPAF.8-2 | `rhema-journeys --stage prod --surface export,ide-chrome --expect-renderer spa` green (`SURFACE_GATES.export` = `R5`,`T4`,`T8`-owed-reporting; `SURFACE_GATES["ide-chrome"]` = `P1.project` — the phone-width IDE frame) |
| D-SPAF.8-3 | Rollback arm: revert + `pulumi up` → SSR on export AND both import legs in one deploy (both keys out together — recorded, not exercised destructively) |
| D-SPAF.8-4 | REQ-SEQ-10 — ≥1 nightly journey green on prod post-deploy before SPAF.9 opens; D-SPAF.1-4…D-SPAF.7-4 nightly-green preconditions restated as this flip's activation gate |

**Entry gate (orchestrator ruling, ledgered 2026-10-08T19:12Z):** REQ-SEQ-10's "≥1 nightly
green before the NEXT flip row" binds *activation order at merge/deploy time*, not PR
authoring — this PR is authored-dormant and must not be **deployed** until `billing`'s
flip (D-SPAF.7-4) has baked ≥1 nightly green (which itself waits on `project-home`'s,
`onboarding`'s, `voices`'s, `settings`'s, `inbox`'s, and `usage`'s, D-SPAF.6-4 → D-SPAF.5-4 →
D-SPAF.4-4 → D-SPAF.3-4 → D-SPAF.2-4 → D-SPAF.1-4). Pacing is encoded in SPAREC.3's
integration plan.

## Notes

- Deployable dark / additive-only: the flag-∅ serving path is byte-identical; SSR tests
  untouched (REQ-SEQ-11/12).
- `mergePolicy: OPERATOR` — this PR stacks on the unmerged round-4 chain; the operator merges
  bottom-up. Prod deploy is operator-run per the contract.
