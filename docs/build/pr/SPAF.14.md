# SPAF.14 — prod flip: `editor` (`STAGES.prod.spaSurfaces += "editor"`)

Manifest row 135 · stacks on
`stevevitali/spa-24-editor-collab` @ `2777fa3` · merge policy **OPERATOR** — do not
merge from the build environment · **$0** spend, no deploys, no production writes.

Implements `docs/tickets/135_SPAF.14__prod-flip-editor.md` per
`docs/design/29_spa-migration-sequencing.md` (§per-flip procedure, F8/F11 rollback
semantics) and `docs/frontend-spa-spec.md` §11 (REQ-SEQ-10/11/12). **The fourteenth
and LAST prod surface flip** of the strangler migration (REQ-ED-13 — the editor
flips last) — the point where `/p/:p`, `/p/:p/v/*`, `/p/:p/*/diff/*`, `/p/:p/a/*`,
and `/p/:p/revisions/*` (the Page family — the product's editing surface) start
serving the React SPA on prod once the operator merges the chain and `pulumi up`s
the deploy. `editor` is **IDE-framed** — it is in `SPA_IDE_FRAMED_SURFACES`, so
`deps.spa`'s key-level AND resolves `editor ∧ ide-chrome`: `ide-chrome` has been
flipped on prod since SPAF.8, so this single-key append lights all five leaves —
the **fifth and last IDE-framed prod activation** — and every flipped route (∈
`SPA_IDE_FRAMED_ROUTES`) mounts `<IdeChrome>` (panes/palette/feed). A flagged GET
serves the shell and the SPA's `/bff/p/:slug*` twins perform the ONE shared
compositions verbatim, plus `POST /bff/p/:slug/handoff` re-performs the `/p/:p`
unread-`run_finished` mark-read + workflow-href redirect from the leaf's
`beforeLoad` (`?focus=1` suppresses verbatim).

**The forced-SSR posture (REQ-ED-12 + REQ-VFY-5) — this flip's distinctive half:**
every editor consult sits AFTER `!isPhoneRequest(c) && row.showcase !== true`, so a
phone-width request or a `showcase: true` project's Page keeps the server-rendered
read-only Page **even with the flag on — by design, forever**; the server withholds
`collabWsUrl` on both paths so the SPA cannot enable collab by asking. The
collab wire is the SAME `client/collab.ts` `createCollabSession` on either renderer
(REQ-ISL-4 — the SPA binds it through `PageSessionRegistry`, the SSR `page.js`
island binds it directly), so a revert drops live collab sessions back onto the SSR
mount seamlessly. The document's session gates are not part of the renderer
decision: unauthed hits keep answering a renderer-free 302 `/login` ahead of every
consult (and `/p/:p`'s handoff read still precedes its consult). The transport
family was never a document: `/p/:p/edit/:draftId` stays a `surfaces:null`
canonical 302 (REQ-BND-3), `/p/:p/f/:fid` the blob redirect, `/doc` `/save` `/note`
`/cancel-run` `/revise` + the hunk-comment POSTs + the collab WebSocket serve
identically on either renderer.

## Requirement IDs

**REQ-SEQ-10 · REQ-SEQ-11 · REQ-SEQ-12 · REQ-ED-12 · REQ-ED-13 · REQ-VFY-8 (prod legs)**

## What lands (the whole diff)

- `infra/config/stages.ts`: `STAGES.prod.spaSurfaces` —
  `["usage","inbox","settings","voices","onboarding","project-home","billing","export","ide-chrome","outline","figures","run-sheet","dossier","run-report"]`
  → `[…,"run-report","editor"]` (flip order preserved — `editor` appended last per
  Appendix D's normative order; comment updated to name all fourteen flips, the
  last-flip cleanup-wave gate, the SPAF.8 both-keys-out rollback note, the fifth
  IDE-framed activation semantics, the forced-SSR capability ordering + collab
  fallback, and the standing session-gate/POST/non-document notes).
- `infra/config/stages.test.ts`: the stage-fact pin updated — `prod` now asserts
  the fifteen-key list (every surface key flipped on prod); `dev` unchanged
  `["usage","inbox","settings","voices","onboarding","ide-chrome","project-home","billing","export","outline","figures","run-sheet","dossier","run-report","editor"]`
  (`editor` rode SPA.23 on dev); `preview` stays `[]` (stack-config path
  unchanged).

That's it — **2 files** (the fact itself is one line; comments carry the rest),
inside the ~20-line budget's intent. Review scope check: the diff touches only the
prod stage fact + its test, exactly the AC1 envelope. No generated config
artifacts exist for this fact (`rhema:spaSurfaces` stack config is never
committed).

## Deploy mechanics (what this does once merged + `pulumi up`)

- Prod web env `SPA_SURFACES` becomes
  `"usage,inbox,settings,voices,onboarding,project-home,billing,export,ide-chrome,outline,figures,run-sheet,dossier,run-report,editor"`
  (`compute.ts`: `args.spaSurfaces ?? cfg.spaSurfaces.join(",")` — no prod stack
  config overrides it). Every surface key is now flipped on prod.
- `deps.spa(c,"editor")` flips true for the five Page-family GETs (`server.ts`
  ~4480/~6196/~6274/~6385/~6447 — each AFTER its session gate, its slug→row read,
  and the `!isPhoneRequest && !row.showcase` forced-SSR check; `/p/:p` additionally
  runs the unread-`run_finished` handoff ~4459–4474 first) — `editor` ∈
  `SPA_IDE_FRAMED_SURFACES`, so the consult is the key-level `editor ∧ ide-chrome`
  AND (`spa-flag.ts` ~67); `ide-chrome` is already flipped, so the single-key
  append lights all five leaves — `<IdeChrome>` mounted on each (all five routeIds
  ∈ `SPA_IDE_FRAMED_ROUTES`, `contracts/src/spa.ts` ~64/70–73).
- Flagged hits serve the shell; the `/bff/p/:slug` + `/v/:v` + `/v/:n/diff/:m` +
  `/a/:artifactId` + `/revisions/:cid` twins perform the ONE shared compositions
  (the overview / version / diff / artifact / what-changed reads — 401/404 parity,
  the `/v/working` miss rides the document's own `{ok,redirect}` arm), and
  `POST /bff/p/:slug/handoff` re-performs the `run_finished` mark-read + workflow-
  href redirect (REQ-BFF-22).
- **Forced-SSR arms kept and asserted:** phone-UA and `showcase` Page requests keep
  `data-renderer="ssr"` + the read-only Page + NO `collabWsUrl` — the flag never
  re-enables a refused mount (REQ-ED-12/REQ-VFY-5; asserted in D-SPAF.14-1's
  recipe).
- `?ssr=1` / `x-rhema-renderer: ssr` keep forcing SSR on **every** stage — the
  escape hatch is unaffected. `SPA_OVERRIDES` is emitted on non-prod kinds only, so
  prod can never be force-SPA'd per-request (REQ-SEQ-4).
- The editor POSTs (rename/approvals/decisions/revision+compare hunk comments/
  restore + the Page transport's `/save` `/note` `/cancel-run` `/revise` family)
  were never documents: JSON callers get `mutationOutcome`/`bffFail` envelopes
  (`{ok,redirect}`/`{ok,data}` + preserved refusal statuses), forms keep their
  302s/re-renders — identical on either renderer; `/doc` and the collab WS are
  non-document transport, identical on either renderer.
- **Rollback = revert this line + redeploy** — removes `editor`: the AND's
  `editor` leg goes false and all five GETs return to SSR in one deploy while
  `ide-chrome` (and therefore `/p/:p/export`, the `/p/:p/import*` legs,
  `/p/:p/run`, the dossier leaves, `/p/:p/r/:runId`) stays live. **Collab
  continuity:** live collab sessions fall back to the SSR Page mount — the
  island binds the SAME `collab.ts` wire (REQ-ISL-4); the registry wrap is
  in-memory only, so a flag-off document reload re-acquires the session through
  the island path and `pagehide`/visibility flushes make the hand-off lossless.
  SSR serving was never deleted (REQ-SEQ-11/12, design/29 F8/F11). Recorded arm:
  `D-SPAF.14-3`.

## Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` —
  **38/38 pass** (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` / `lint` — clean.
- The pin is real: removing the key fails the exact-equality assert (order +
  membership).
- Consult positions verified in source: all five GETs session-gate → slug→row →
  forced-SSR check → consult `"editor"` (~4480/~6196/~6274/~6385/~6447; `/p/:p`'s
  handoff precedes). The AND-gate + framed-route membership verified in
  `spa-flag.ts`/`spa.ts`; the transport family verified non-document
  (`/edit/:draftId` ~6482 `surfaces:null`, `/f/:fid` ~6003, `/doc` ~6499, `/save`
  ~6515, `/note` ~6554, `/cancel-run` ~6577, `/revise` ~6595, hunk comments
  ~6215/~6411); `collabWsUrl` withholding on phone/showcase verified
  (~4531/~6062/~6103/~6327). SPA.23/24's `editor.dom.test.tsx` (16),
  `page-sessions.test.ts` (9), `page-collab.dom.test.tsx` (15) pin the leaf's
  mount/registry/wire behavior.

## Deferred live legs (operator-merge + deploy gated — DEFERRALS.md `## SPAF.14`)

| Row | Leg |
|---|---|
| D-SPAF.14-1 | `data-renderer="spa"` on all five editor GETs + the `?ssr=1` SSR escape + session-gate 302 precedence + **the forced-SSR posture asserted** (phone-UA + showcase → `ssr`, read-only, no `collabWsUrl`) + transport probes (`/doc` JSON, collab WS upgrade) — curl recipes in the row |
| D-SPAF.14-2 | `rhema-journeys --stage prod --surface editor --expect-renderer spa` green (`SURFACE_GATES.editor` = N8, P1.pill, P1.project, R7, T2.badge, T6, T7 — all `expected:"green"` carried legs: a green step failing FAILS the run; the owed note covers the SPA.23/24 preview two-legs) |
| D-SPAF.14-3 | Rollback arm: revert + `pulumi up` → SSR on all five GETs in one deploy — `ide-chrome` stays flipped, only the AND's `editor` leg goes false; live collab sessions fall back to the SSR `page.js` mount (same `collab.ts` wire, REQ-ISL-4) — recorded, not exercised destructively |
| D-SPAF.14-4 | REQ-SEQ-10 — ≥1 nightly journey green on prod post-deploy; **no next flip exists, so this bake gates the CLEANUP wave's activation** — SPA.26/27/28's island-bundle/SSR/override deletions (and SPA.25) must not merge-deploy until the editor flip has baked; D-SPAF.1-4…D-SPAF.13-4 nightly-green preconditions restated as this flip's activation gate |

**Entry gate (orchestrator ruling, ledgered 2026-10-08T19:12Z):** REQ-SEQ-10's "≥1
nightly green before the NEXT flip row" binds *activation order at merge/deploy
time*, not PR authoring — this PR is authored-dormant and must not be **deployed**
until `run-report`'s flip (D-SPAF.13-4) has baked ≥1 nightly green (which itself
waits on `dossier`'s, `run-sheet`'s, `figures`'s, `outline`'s,
`export`+`ide-chrome`'s, `billing`'s, `project-home`'s, `onboarding`'s, `voices`'s,
`settings`'s, `inbox`'s, and `usage`'s, D-SPAF.12-4 → D-SPAF.11-4 → D-SPAF.10-4 →
D-SPAF.9-4 → D-SPAF.8-4 → D-SPAF.7-4 → D-SPAF.6-4 → D-SPAF.5-4 → D-SPAF.4-4 →
D-SPAF.3-4 → D-SPAF.2-4 → D-SPAF.1-4). Pacing is encoded in SPAREC.3's
integration plan — and D-SPAF.14-4 names the cleanup wave (SPA.25–28) as the
gated downstream of THIS bake.

## Notes

- Deployable dark / additive-only: the flag-∅ serving path is byte-identical; SSR
  tests untouched (REQ-SEQ-11/12).
- `mergePolicy: OPERATOR` — this PR stacks on the unmerged round-4 chain; the
  operator merges bottom-up. Prod deploy is operator-run per the contract.
- **Last-flip consequence:** with `editor` flipped, every surface key is live on
  prod. The cleanup wave's deletions (island bundles SPA.26, SSR render paths
  SPA.27, override machinery SPA.28) exist precisely to remove what this flip
  leaves dark — they must not land until the bake proves the flip, or the rollback
  arm is destroyed at the moment it could be needed.
