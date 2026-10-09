# SPAF.9 — prod flip: `outline` (`STAGES.prod.spaSurfaces += "outline"`)

**PR #146** · Manifest row 124 · stacks on
`stevevitali/spa-18-surface-outline` @ `ee8f0ad` · merge policy **OPERATOR** — do not
merge from the build environment · **$0** spend, no deploys, no production writes.

Implements `docs/tickets/124_SPAF.9__prod-flip-outline.md` per
`docs/design/29_spa-migration-sequencing.md` (§per-flip procedure, F8/F11 rollback semantics)
and `docs/frontend-spa-spec.md` §11 (REQ-SEQ-10/11/12). **The ninth prod surface flip** of
the strangler migration — the point where `/p/:p/outline` + `/p/:p/outline/promote` start
serving the React SPA on prod once the operator merges the chain and `pulumi up`s the
deploy. `outline` is **unframed** — it is not in `SPA_IDE_FRAMED_SURFACES`, so both GETs
consult on `outline` alone and render **outside** the IDE chrome even while flagged. The
session gates are not part of the renderer decision: unauthed hits on both GETs keep
answering a renderer-free 302 `/login` ahead of their consults. The four outline POSTs
(save / promote / delete / gap-answer) were never documents — unchanged on either renderer.

## Requirement IDs

**REQ-SEQ-10 · REQ-SEQ-11 · REQ-SEQ-12 · REQ-VFY-8 (prod legs)**

## What lands (the whole diff)

- `infra/config/stages.ts`: `STAGES.prod.spaSurfaces` —
  `["usage","inbox","settings","voices","onboarding","project-home","billing","export","ide-chrome"]`
  → `[…,"ide-chrome","outline"]` (flip order preserved — `outline` appended after the
  SPAF.8 pair; comment updated to name the nine flips, the SPAF.8 both-keys-out rollback
  note, the REQ-SEQ-10 nightly-green gate on the NEXT flip, the outline unframed-leaf
  semantics, and the standing session-gate/precedence notes).
- `infra/config/stages.test.ts`: the stage-fact pin updated — `prod` now asserts the
  ten-key list; `dev` unchanged
  `["usage","inbox","settings","voices","onboarding","ide-chrome","project-home","billing","export","outline"]`
  (`outline` rode SPA.18 on dev); `preview` stays `[]` (stack-config path unchanged).

That's it — **2 files, ~18 insertions / 13 deletions** (the fact itself is one line;
comments carry the rest), inside the ~20-line budget's intent. Review scope check: the
diff touches only the prod stage fact + its test, exactly the AC1 envelope. No generated
config artifacts exist for this fact (`rhema:spaSurfaces` stack config is never committed).

## Deploy mechanics (what this does once merged + `pulumi up`)

- Prod web env `SPA_SURFACES` becomes
  `"usage,inbox,settings,voices,onboarding,project-home,billing,export,ide-chrome,outline"`
  (`compute.ts`: `args.spaSurfaces ?? cfg.spaSurfaces.join(",")` — no prod stack config
  overrides it).
- `deps.spa(c,"outline")` flips true for `GET /p/:project/outline` (`server.ts` ~1771)
  and `GET /p/:project/outline/promote` (~1644) — `outline` ∉ `SPA_IDE_FRAMED_SURFACES`, so
  the consult is the plain flag check and the leaves mount outside `.ide` (unframed —
  `contracts/src/spa.ts` route rows carry `surfaces: ["outline"]` only).
- `?ssr=1` / `x-rhema-renderer: ssr` keep forcing SSR on **every** stage — the escape
  hatch is unaffected. `SPA_OVERRIDES` is emitted on non-prod kinds only, so prod can never
  be force-SPA'd per-request (REQ-SEQ-4).
- The promote POST + save/delete/gap-answer POSTs were never documents: JSON callers get
  the `mutationOutcome` envelopes (`{ok,redirect}`/`{ok,data}`/409 `outline_cited`), forms
  keep their 302s — identical on either renderer.
- **Rollback = revert this line + redeploy** — removes `outline`: both outline GETs return
  to SSR in one deploy. SSR serving was never deleted (REQ-SEQ-11/12, design/29 F8/F11).
  Recorded arm: `D-SPAF.9-3`.

## Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` — **38/38
  pass** (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` / `lint` — clean.
- The pin is real: removing the key fails the exact-equality assert (order + membership).
- Consult positions verified in source: `/p/:project/outline/promote` session-gates ~1641 →
  consults `"outline"` ~1644; `/p/:project/outline` gates ~1768 → consults ~1771 — both at
  spec §4's fixed position (after the session gate, before the page-data reads).

## Deferred live legs (operator-merge + deploy gated — DEFERRALS.md `## SPAF.9`)

| Row | Leg |
|---|---|
| D-SPAF.9-1 | `data-renderer="spa"` on `/p/:p/outline` + `/p/:p/outline/promote` + the `?ssr=1` SSR escape + session-gate precedence (curl recipes in the row) |
| D-SPAF.9-2 | `rhema-journeys --stage prod --surface outline --expect-renderer spa` green (`SURFACE_GATES.outline` = `P1.outline` — expected:red pending UX.2 ownership; the leg **owes**, it does not fail) |
| D-SPAF.9-3 | Rollback arm: revert + `pulumi up` → SSR on both outline GETs in one deploy (recorded, not exercised destructively) |
| D-SPAF.9-4 | REQ-SEQ-10 — ≥1 nightly journey green on prod post-deploy before SPAF.10 opens; D-SPAF.1-4…D-SPAF.8-4 nightly-green preconditions restated as this flip's activation gate |

**Entry gate (orchestrator ruling, ledgered 2026-10-08T19:12Z):** REQ-SEQ-10's "≥1 nightly
green before the NEXT flip row" binds *activation order at merge/deploy time*, not PR
authoring — this PR is authored-dormant and must not be **deployed** until
`export`+`ide-chrome`'s flip (D-SPAF.8-4) has baked ≥1 nightly green (which itself waits on
`billing`'s, `project-home`'s, `onboarding`'s, `voices`'s, `settings`'s, `inbox`'s, and
`usage`'s, D-SPAF.7-4 → D-SPAF.6-4 → D-SPAF.5-4 → D-SPAF.4-4 → D-SPAF.3-4 → D-SPAF.2-4 →
D-SPAF.1-4). Pacing is encoded in SPAREC.3's integration plan.

## Notes

- Deployable dark / additive-only: the flag-∅ serving path is byte-identical; SSR tests
  untouched (REQ-SEQ-11/12).
- `mergePolicy: OPERATOR` — this PR stacks on the unmerged round-4 chain; the operator
  merges bottom-up. Prod deploy is operator-run per the contract.
