# SPAF.10 — prod flip: `figures` (`STAGES.prod.spaSurfaces += "figures"`)

Manifest row 126 · stacks on
`stevevitali/spa-19-surface-figures` @ `4340474` · merge policy **OPERATOR** — do not
merge from the build environment · **$0** spend, no deploys, no production writes.

Implements `docs/tickets/126_SPAF.10__prod-flip-figures.md` per
`docs/design/29_spa-migration-sequencing.md` (§per-flip procedure, F8/F11 rollback
semantics) and `docs/frontend-spa-spec.md` §11 (REQ-SEQ-10/11/12). **The tenth prod
surface flip** of the strangler migration — the point where `/p/:p/figures`,
`/p/:p/figures/:figureId`, and `/p/:p/visualize` start serving the React SPA on prod once
the operator merges the chain and `pulumi up`s the deploy. `figures` is **unframed** — it
is not in `SPA_IDE_FRAMED_SURFACES`, so all three GETs consult on `figures` alone and
render **outside** the IDE chrome even while flagged. The session gates are not part of
the renderer decision: unauthed hits on all three GETs keep answering a renderer-free 302
`/login` ahead of their consults. The seven figures POSTs (visualize run-create, card
fields, spec-edit, version restore, propose, proposals accept/reject) were never documents
— unchanged on either renderer.

## Requirement IDs

**REQ-SEQ-10 · REQ-SEQ-11 · REQ-SEQ-12 · REQ-VFY-8 (prod legs)**

## What lands (the whole diff)

- `infra/config/stages.ts`: `STAGES.prod.spaSurfaces` —
  `["usage","inbox","settings","voices","onboarding","project-home","billing","export","ide-chrome","outline"]`
  → `[…,"ide-chrome","outline","figures"]` (flip order preserved — `figures` appended
  after `outline`; comment updated to name the ten flips, the SPAF.8 both-keys-out
  rollback note, the REQ-SEQ-10 nightly-green gate on the NEXT flip, the figures
  unframed-leaf semantics, and the standing session-gate/precedence notes).
- `infra/config/stages.test.ts`: the stage-fact pin updated — `prod` now asserts the
  eleven-key list; `dev` unchanged
  `["usage","inbox","settings","voices","onboarding","ide-chrome","project-home","billing","export","outline","figures"]`
  (`figures` rode SPA.19 on dev); `preview` stays `[]` (stack-config path unchanged).

That's it — **2 files, ~19 insertions / 15 deletions** (the fact itself is one line;
comments carry the rest), inside the ~20-line budget's intent. Review scope check: the
diff touches only the prod stage fact + its test, exactly the AC1 envelope. No generated
config artifacts exist for this fact (`rhema:spaSurfaces` stack config is never committed).

## Deploy mechanics (what this does once merged + `pulumi up`)

- Prod web env `SPA_SURFACES` becomes
  `"usage,inbox,settings,voices,onboarding,project-home,billing,export,ide-chrome,outline,figures"`
  (`compute.ts`: `args.spaSurfaces ?? cfg.spaSurfaces.join(",")` — no prod stack config
  overrides it).
- `deps.spa(c,"figures")` flips true for `GET /p/:project/figures` (`server.ts` ~2129),
  `GET /p/:project/figures/:figureId` (~2149), and `GET /p/:project/visualize` (~1992) —
  `figures` ∉ `SPA_IDE_FRAMED_SURFACES`, so the consults are the plain flag check and the
  leaves mount outside `.ide` (unframed — `contracts/src/spa.ts` route rows carry
  `surfaces: ["figures"]` only).
- `?ssr=1` / `x-rhema-renderer: ssr` keep forcing SSR on **every** stage — the escape
  hatch is unaffected. `SPA_OVERRIDES` is emitted on non-prod kinds only, so prod can never
  be force-SPA'd per-request (REQ-SEQ-4).
- The visualize run-create POST + the six card POSTs were never documents: JSON callers
  get the `mutationOutcome` envelopes (`{ok,redirect}`/`{ok,data}`/422 `request_required`),
  forms keep their 302s — identical on either renderer.
- **Rollback = revert this line + redeploy** — removes `figures`: all three figures GETs
  return to SSR in one deploy. SSR serving was never deleted (REQ-SEQ-11/12, design/29
  F8/F11). Recorded arm: `D-SPAF.10-3`.

## Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` — **38/38
  pass** (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` / `lint` — clean.
- The pin is real: removing the key fails the exact-equality assert (order + membership).
- Consult positions verified in source: `/p/:project/visualize` session-gates ~1989 →
  consults `"figures"` ~1992; `/p/:project/figures` gates ~2126 → consults ~2129;
  `/p/:project/figures/:figureId` gates ~2146 → consults ~2149 — all at spec §4's fixed
  position (after the session gate, before the page-data reads).

## Deferred live legs (operator-merge + deploy gated — DEFERRALS.md `## SPAF.10`)

| Row | Leg |
|---|---|
| D-SPAF.10-1 | `data-renderer="spa"` on `/p/:p/figures` + `/p/:p/figures/:figureId` + `/p/:p/visualize` + the `?ssr=1` SSR escape + session-gate precedence (curl recipes in the row) |
| D-SPAF.10-2 | `rhema-journeys --stage prod --surface figures --expect-renderer spa` green (`SURFACE_GATES.figures` = `P1.figures` — expected:red pending UX.2 ownership; the leg **owes**, it does not fail) |
| D-SPAF.10-3 | Rollback arm: revert + `pulumi up` → SSR on all three figures GETs in one deploy (recorded, not exercised destructively) |
| D-SPAF.10-4 | REQ-SEQ-10 — ≥1 nightly journey green on prod post-deploy before SPAF.11 opens; D-SPAF.1-4…D-SPAF.9-4 nightly-green preconditions restated as this flip's activation gate |

**Entry gate (orchestrator ruling, ledgered 2026-10-08T19:12Z):** REQ-SEQ-10's "≥1 nightly
green before the NEXT flip row" binds *activation order at merge/deploy time*, not PR
authoring — this PR is authored-dormant and must not be **deployed** until `outline`'s
flip (D-SPAF.9-4) has baked ≥1 nightly green (which itself waits on
`export`+`ide-chrome`'s, `billing`'s, `project-home`'s, `onboarding`'s, `voices`'s,
`settings`'s, `inbox`'s, and `usage`'s, D-SPAF.8-4 → D-SPAF.7-4 → D-SPAF.6-4 → D-SPAF.5-4 →
D-SPAF.4-4 → D-SPAF.3-4 → D-SPAF.2-4 → D-SPAF.1-4). Pacing is encoded in SPAREC.3's
integration plan.

## Notes

- Deployable dark / additive-only: the flag-∅ serving path is byte-identical; SSR tests
  untouched (REQ-SEQ-11/12).
- `mergePolicy: OPERATOR` — this PR stacks on the unmerged round-4 chain; the operator
  merges bottom-up. Prod deploy is operator-run per the contract.
