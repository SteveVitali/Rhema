# SPAF.12 — prod flip: `dossier` (`STAGES.prod.spaSurfaces += "dossier"`)

Manifest row 130 · stacks on
`stevevitali/spa-21-surface-dossier` @ `33ecb38` · merge policy **OPERATOR** — do not
merge from the build environment · **$0** spend, no deploys, no production writes.

Implements `docs/tickets/130_SPAF.12__prod-flip-dossier.md` per
`docs/design/29_spa-migration-sequencing.md` (§per-flip procedure, F8/F11 rollback
semantics) and `docs/frontend-spa-spec.md` §11 (REQ-SEQ-10/11/12). **The twelfth prod
surface flip** of the strangler migration — the point where `/p/:p/review/:runId` (the
dossier — the IDE's flagship reading surface) and `/p/:p/obligations/new` start serving
the React SPA on prod once the operator merges the chain and `pulumi up`s the deploy.
`dossier` is **IDE-framed** — it is in `SPA_IDE_FRAMED_SURFACES`, so `deps.spa`'s
key-level AND resolves `dossier ∧ ide-chrome` on BOTH dossier consults: `ide-chrome` has
been flipped on prod since SPAF.8, so this single-key append lights both leaves — the
**third IDE-framed prod activation** — and `/p/$project/review/$runId` (∈
`SPA_IDE_FRAMED_ROUTES`) mounts `<IdeChrome>` (panes/palette/SSE feed) while
`/p/$project/obligations/new` (∉ the framed routes) serves the shell but renders its
leaf OUTSIDE `.ide`. A flagged review GET serves the shell and the SPA's
`/bff/p/:slug/review/:runId` twin performs the ONE shared `dossierComposition` — the
idempotent `markDossierSeen` + `run.report_viewed` emit, the shared
`filterFindings`/`applySeverityBudget` list feeding the body/Margin/Desk, the `?gate=`
focused card — verbatim, so the two renderers read + log identically. The session gates
are not part of the renderer decision: unauthed hits keep answering a renderer-free 302
`/login` ahead of both consults. The dossier POSTs (finding disposition/apply/promote/
obligations on both the `/review/:runId/findings/…` and runless `/findings/…` paths, the
`/p/:p/obligations` create, the bulk preview/confirm pair) were never documents —
unchanged on either renderer.

## Requirement IDs

**REQ-SEQ-10 · REQ-SEQ-11 · REQ-SEQ-12 · REQ-VFY-8 (prod legs)**

## What lands (the whole diff)

- `infra/config/stages.ts`: `STAGES.prod.spaSurfaces` —
  `["usage","inbox","settings","voices","onboarding","project-home","billing","export","ide-chrome","outline","figures","run-sheet"]`
  → `[…,"ide-chrome","outline","figures","run-sheet","dossier"]` (flip order preserved —
  `dossier` appended after `run-sheet`; comment updated to name the twelve flips, the
  SPAF.8 both-keys-out rollback note, the REQ-SEQ-10 nightly-green gate on the NEXT flip,
  the third-IDE-framed-activation semantics + the two-leaf framing split + the
  shared-composition note, and the standing session-gate/POST notes).
- `infra/config/stages.test.ts`: the stage-fact pin updated — `prod` now asserts the
  thirteen-key list; `dev` unchanged
  `["usage","inbox","settings","voices","onboarding","ide-chrome","project-home","billing","export","outline","figures","run-sheet","dossier"]`
  (`dossier` rode SPA.21 on dev); `preview` stays `[]` (stack-config path unchanged).

That's it — **2 files, ~24 insertions / 7 deletions** (the fact itself is one line;
comments carry the rest), inside the ~20-line budget's intent. Review scope check: the
diff touches only the prod stage fact + its test, exactly the AC1 envelope. No generated
config artifacts exist for this fact (`rhema:spaSurfaces` stack config is never committed).

## Deploy mechanics (what this does once merged + `pulumi up`)

- Prod web env `SPA_SURFACES` becomes
  `"usage,inbox,settings,voices,onboarding,project-home,billing,export,ide-chrome,outline,figures,run-sheet,dossier"`
  (`compute.ts`: `args.spaSurfaces ?? cfg.spaSurfaces.join(",")` — no prod stack config
  overrides it).
- `deps.spa(c,"dossier")` flips true for `GET /p/:project/review/:runId` (`server.ts`
  ~5330, after the ~5328 session gate) AND `GET /p/:project/obligations/new` (~5679,
  after the ~5677 session gate) — `dossier` ∈ `SPA_IDE_FRAMED_SURFACES`, so both consults
  are the key-level `dossier ∧ ide-chrome` AND (`spa-flag.ts` ~67); `ide-chrome` is
  already flipped, so both leaves light. The review leaf mounts `<IdeChrome>`
  (`/p/$project/review/$runId` ∈ `SPA_IDE_FRAMED_ROUTES`, `contracts/src/spa.ts` ~181);
  the obligations leaf renders outside `.ide` (∉ the framed routes) even with the spa
  verdict.
- `?ssr=1` / `x-rhema-renderer: ssr` keep forcing SSR on **every** stage — the escape
  hatch is unaffected. `SPA_OVERRIDES` is emitted on non-prod kinds only, so prod can never
  be force-SPA'd per-request (REQ-SEQ-4).
- The dossier POSTs were never documents: JSON callers get the `mutationOutcome`
  envelopes (`{ok,redirect}` on the `?disposed`/`?applied`/`?promoted`/`?obligated`/
  `?bulk`+`?bulkdone`/`?obligation=new` vocabulary + preserved refusal statuses), forms
  keep their 302s/re-renders — identical on either renderer.
- **Rollback = revert this line + redeploy** — removes `dossier`: the AND's `dossier` leg
  goes false and BOTH dossier GETs return to SSR in one deploy while `ide-chrome` (and
  therefore `/p/:p/export`, the `/p/:p/import*` legs, and `/p/:p/run`) stays live.
  SSR serving was never deleted (REQ-SEQ-11/12, design/29 F8/F11). Recorded arm:
  `D-SPAF.12-3`.

## Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` — **38/38
  pass** (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` / `lint` — clean.
- The pin is real: removing the key fails the exact-equality assert (order + membership).
- Consult positions verified in source: `/p/:project/review/:runId` session-gates ~5328 →
  consults `"dossier"` ~5330 (before the slug→row read + `dossierComposition` ~5215);
  `/p/:project/obligations/new` session-gates ~5677 → consults ~5679 — spec §4's fixed
  position on both. The AND-gate + framed/unframed route membership verified in
  `spa-flag.ts`/`spa.ts`; SPA.21's `dossier.dom.test.tsx` pins the review leaf's chrome
  mount, the unframed obligations leaf, and the SsrHandoff-no-BFF leg.

## Deferred live legs (operator-merge + deploy gated — DEFERRALS.md `## SPAF.12`)

| Row | Leg |
|---|---|
| D-SPAF.12-1 | `data-renderer="spa"` on `/p/:p/review/:runId` + `/p/:p/obligations/new` + the `?ssr=1` SSR escape + session-gate precedence on both (curl recipes in the row) |
| D-SPAF.12-2 | `rhema-journeys --stage prod --surface dossier --expect-renderer spa` green (`SURFACE_GATES["dossier"]` = `N7`, `T1`, `T12F`, `T13F`, `P1.dossier` — N7/T1 expected:green carried legs (a green miss fails the run); T12F/T13F/P1.dossier expected:red pending their first live leg — a red miss reports `owed`, never gates) |
| D-SPAF.12-3 | Rollback arm: revert + `pulumi up` → SSR on both dossier GETs in one deploy — `ide-chrome` stays flipped, only the AND's `dossier` leg goes false (recorded, not exercised destructively) |
| D-SPAF.12-4 | REQ-SEQ-10 — ≥1 nightly journey green on prod post-deploy before SPAF.13 opens; D-SPAF.1-4…D-SPAF.11-4 nightly-green preconditions restated as this flip's activation gate |

**Entry gate (orchestrator ruling, ledgered 2026-10-08T19:12Z):** REQ-SEQ-10's "≥1 nightly
green before the NEXT flip row" binds *activation order at merge/deploy time*, not PR
authoring — this PR is authored-dormant and must not be **deployed** until `run-sheet`'s
flip (D-SPAF.11-4) has baked ≥1 nightly green (which itself waits on `figures`'s,
`outline`'s, `export`+`ide-chrome`'s, `billing`'s, `project-home`'s, `onboarding`'s,
`voices`'s, `settings`'s, `inbox`'s, and `usage`'s, D-SPAF.10-4 → D-SPAF.9-4 → D-SPAF.8-4 →
D-SPAF.7-4 → D-SPAF.6-4 → D-SPAF.5-4 → D-SPAF.4-4 → D-SPAF.3-4 → D-SPAF.2-4 → D-SPAF.1-4).
Pacing is encoded in SPAREC.3's integration plan.

## Notes

- Deployable dark / additive-only: the flag-∅ serving path is byte-identical; SSR tests
  untouched (REQ-SEQ-11/12).
- `mergePolicy: OPERATOR` — this PR stacks on the unmerged round-4 chain; the operator
  merges bottom-up. Prod deploy is operator-run per the contract.
