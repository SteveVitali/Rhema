# SPAF.11 — prod flip: `run-sheet` (`STAGES.prod.spaSurfaces += "run-sheet"`)

Manifest row 128 · stacks on
`stevevitali/spa-20-surface-run-sheet` @ `aede4d5` · merge policy **OPERATOR** — do not
merge from the build environment · **$0** spend, no deploys, no production writes.

Implements `docs/tickets/128_SPAF.11__prod-flip-run-sheet.md` per
`docs/design/29_spa-migration-sequencing.md` (§per-flip procedure, F8/F11 rollback
semantics) and `docs/frontend-spa-spec.md` §11 (REQ-SEQ-10/11/12). **The eleventh prod
surface flip** of the strangler migration — the point where `/p/:p/run` (the run sheet,
the ONLY run creator and the ONLY paywall) starts serving the React SPA on prod once the
operator merges the chain and `pulumi up`s the deploy. `run-sheet` is **IDE-framed** — it
is in `SPA_IDE_FRAMED_SURFACES`, so `deps.spa`'s key-level AND resolves `run-sheet ∧
ide-chrome`: `ide-chrome` has been flipped on prod since SPAF.8, so this single-key
append lights the leaf — the **second IDE-framed prod activation** — and `/p/$project/run`
(∈ `SPA_IDE_FRAMED_ROUTES`) mounts `<IdeChrome>` (panes/palette/SSE feed). A flagged GET
serves the shell and the SPA's `/bff/p/:slug/run` twin performs the ONE shared
`runSheetComposition` — the `rhema_fp` mint, `voice.staleness_shown`, and the
exhausted-prompt impression ride inside verbatim, so the two renderers price + log
identically (the estimator stays server IP — the leaf repaints off `recompute.cells`,
never calls it). The session gate is not part of the renderer decision: unauthed hits keep
answering a renderer-free 302 `/login` ahead of the consult. The two run-sheet POSTs
(run-create + exhausted) were never documents — unchanged on either renderer.

## Requirement IDs

**REQ-SEQ-10 · REQ-SEQ-11 · REQ-SEQ-12 · REQ-VFY-8 (prod legs)**

## What lands (the whole diff)

- `infra/config/stages.ts`: `STAGES.prod.spaSurfaces` —
  `["usage","inbox","settings","voices","onboarding","project-home","billing","export","ide-chrome","outline","figures"]`
  → `[…,"ide-chrome","outline","figures","run-sheet"]` (flip order preserved —
  `run-sheet` appended after `figures`; comment updated to name the eleven flips, the
  SPAF.8 both-keys-out rollback note, the REQ-SEQ-10 nightly-green gate on the NEXT flip,
  the second-IDE-framed-activation semantics + the shared-composition/`rhema_fp` note, and
  the standing session-gate/POST notes).
- `infra/config/stages.test.ts`: the stage-fact pin updated — `prod` now asserts the
  twelve-key list; `dev` unchanged
  `["usage","inbox","settings","voices","onboarding","ide-chrome","project-home","billing","export","outline","figures","run-sheet"]`
  (`run-sheet` rode SPA.20 on dev); `preview` stays `[]` (stack-config path unchanged).

That's it — **2 files, ~28 insertions / 17 deletions** (the fact itself is one line;
comments carry the rest), inside the ~20-line budget's intent. Review scope check: the
diff touches only the prod stage fact + its test, exactly the AC1 envelope. No generated
config artifacts exist for this fact (`rhema:spaSurfaces` stack config is never committed).

## Deploy mechanics (what this does once merged + `pulumi up`)

- Prod web env `SPA_SURFACES` becomes
  `"usage,inbox,settings,voices,onboarding,project-home,billing,export,ide-chrome,outline,figures,run-sheet"`
  (`compute.ts`: `args.spaSurfaces ?? cfg.spaSurfaces.join(",")` — no prod stack config
  overrides it).
- `deps.spa(c,"run-sheet")` flips true for `GET /p/:project/run` (`server.ts` ~4868,
  after the ~4866 session gate) — `run-sheet` ∈ `SPA_IDE_FRAMED_SURFACES`, so the consult
  is the key-level `run-sheet ∧ ide-chrome` AND (`spa-flag.ts` ~67); `ide-chrome` is
  already flipped, so the leaf lights and mounts `<IdeChrome>` (`/p/$project/run` ∈
  `SPA_IDE_FRAMED_ROUTES`, `contracts/src/spa.ts` ~67).
- `?ssr=1` / `x-rhema-renderer: ssr` keep forcing SSR on **every** stage — the escape
  hatch is unaffected. `SPA_OVERRIDES` is emitted on non-prod kinds only, so prod can never
  be force-SPA'd per-request (REQ-SEQ-4).
- The run POST + the exhausted POST were never documents: JSON callers get the
  `mutationOutcome` envelopes (`{ok,data:{runId,state}}`, `{ok,url}` allowlisted Payment
  Link, `{ok,redirect}` + preserved refusal statuses), forms keep their 302s/re-renders —
  identical on either renderer.
- **Rollback = revert this line + redeploy** — removes `run-sheet`: the AND's
  `run-sheet` leg goes false and `/p/:p/run` returns to SSR in one deploy while
  `ide-chrome` (and therefore `/p/:p/export` + the `/p/:p/import*` verdicts) stays live.
  SSR serving was never deleted (REQ-SEQ-11/12, design/29 F8/F11). Recorded arm:
  `D-SPAF.11-3`.

## Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` — **38/38
  pass** (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` / `lint` — clean.
- The pin is real: removing the key fails the exact-equality assert (order + membership).
- Consult position verified in source: `/p/:project/run` session-gates ~4866 → consults
  `"run-sheet"` ~4868 — spec §4's fixed position (after the session gate, before the
  slug→row read + `runSheetComposition`); the AND-gate + framed-route membership verified
  in `spa-flag.ts`/`spa.ts`; SPA.20's `run-sheet.dom.test.tsx` (26 tests) pins the leaf's
  chrome mount + the SsrHandoff-no-BFF leg.

## Deferred live legs (operator-merge + deploy gated — DEFERRALS.md `## SPAF.11`)

| Row | Leg |
|---|---|
| D-SPAF.11-1 | `data-renderer="spa"` on `/p/:p/run` + the `?ssr=1` SSR escape + session-gate precedence (curl recipes in the row) |
| D-SPAF.11-2 | `rhema-journeys --stage prod --surface run-sheet --expect-renderer spa` green (`SURFACE_GATES["run-sheet"]` = `N4`, `R7`, `N9`, `P1.runsheet` — all expected:green carried legs: a green miss fails the run) |
| D-SPAF.11-3 | Rollback arm: revert + `pulumi up` → SSR on `/p/:p/run` in one deploy — `ide-chrome` stays flipped (recorded, not exercised destructively) |
| D-SPAF.11-4 | REQ-SEQ-10 — ≥1 nightly journey green on prod post-deploy before SPAF.12 opens; D-SPAF.1-4…D-SPAF.10-4 nightly-green preconditions restated as this flip's activation gate |

**Entry gate (orchestrator ruling, ledgered 2026-10-08T19:12Z):** REQ-SEQ-10's "≥1 nightly
green before the NEXT flip row" binds *activation order at merge/deploy time*, not PR
authoring — this PR is authored-dormant and must not be **deployed** until `figures`'s
flip (D-SPAF.10-4) has baked ≥1 nightly green (which itself waits on `outline`'s,
`export`+`ide-chrome`'s, `billing`'s, `project-home`'s, `onboarding`'s, `voices`'s,
`settings`'s, `inbox`'s, and `usage`'s, D-SPAF.9-4 → D-SPAF.8-4 → D-SPAF.7-4 → D-SPAF.6-4 →
D-SPAF.5-4 → D-SPAF.4-4 → D-SPAF.3-4 → D-SPAF.2-4 → D-SPAF.1-4). Pacing is encoded in
SPAREC.3's integration plan.

## Notes

- Deployable dark / additive-only: the flag-∅ serving path is byte-identical; SSR tests
  untouched (REQ-SEQ-11/12).
- `mergePolicy: OPERATOR` — this PR stacks on the unmerged round-4 chain; the operator
  merges bottom-up. Prod deploy is operator-run per the contract.
