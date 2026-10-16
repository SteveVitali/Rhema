# SPAF.14 — prod flip: `editor` (run ledger)

- **Status:** DONE for the in-repo legs (PR diff + unit-level verification); the four
  post-deploy/live legs are **OPEN deferrals** (`D-SPAF.14-1`…`-4`) — they materialize
  only when the operator merges the chain + `pulumi up`s prod.
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a
  (build work)
- **Ticket:** `docs/tickets/135_SPAF.14__prod-flip-editor.md` (manifest row 135)
- **Branch:** `stevevitali/spaf-14-prod-flip-editor`, stacked on
  `stevevitali/spa-24-editor-collab` @ `2777fa3` (`OPERATOR` merge policy,
  **not merged**).
- **PR:** #157 — opened at closeout; `gh pr checks --watch=false` read once at
  closeout (result recorded in § PR checks read below; inherited
  `integration`/privsep red, if it reports, is waived per GD-MAINT.4-1 —
  classified, not repaired).
- **Goal:** flip `editor` to the SPA on prod — `STAGES.prod.spaSurfaces += 'editor'`
  as the one-line stage-fact PR; the operator merges + `pulumi up` deploys; rollback =
  revert + redeploy. **REQ-ED-13: this is the LAST surface flip** — the strangler's
  point of no immediate return for `/p/:p`, `/p/:p/v/*`, `/p/:p/*/diff/*`,
  `/p/:p/a/*`, `/p/:p/revisions/*`.
- **Spend:** $0. No deploys, no production writes, no live legs. Preview legs not
  needed — this row's contract is the prod flip itself (the surface's
  two-leg/rollback evidence is D-SPA.23-1/-2 + D-SPA.24-1/-2's preview track, still
  OPEN behind the absent `rhema-nonprod-resend-api-key` operator secret —
  D-MAINT.6-1).

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): no `OPEN` row is unblocked by this run —
  `D-SPA.23-1`/`-2`, `D-SPA.24-1`/`-2`, `D-OPS.1-1`, `D-MAINT.6-1` all still need
  their named operator prerequisites; the `D-SPAF.1-*` … `D-SPAF.13-*` rows stay
  OPEN (operator merge + deploy gated). None closed, four opened.
- LEDGER CURRENT STATE read: `nextTicket: SPAF.14`, `chainTip:
  stevevitali/spa-24-editor-collab`, `mergePolicy: OPERATOR`, `round: 4`,
  `dispatchTarget: subagent`, `pinnedBaseSha: fab08ed`.
- **Entry gate (REQ-SEQ-10 + the 2026-10-08T19:12Z sequencing ruling):** the ticket's
  operating clause is "a nightly green since the PREVIOUS flip is this row's entry
  gate — pause if unmet" — `D-SPAF.13-4` names it (≥1 nightly green on prod after the
  `run-report` deploy). The orchestrator's ledgered ruling (PHASE LOG
  2026-10-08T19:12Z) interprets that gate as binding **activation order at
  merge/deploy time, not PR authoring**: with `mergePolicy: OPERATOR` and the whole
  stack unmerged, literal row-level gating would stall ~14 rows behind operator
  merges. This run therefore executes now as an **authored-dormant minimal PR**
  exactly as SPAF.1–SPAF.13 did — the stage-fact diff + unit pins land, every live
  leg is deferred with a verbatim verify recipe, and `D-SPAF.1-4`'s through
  `D-SPAF.13-4`'s nightly-green bakes are restated (in `D-SPAF.14-4`) as live
  preconditions for the operator's merge/deploy cadence of THIS flip. REQ-SEQ-10
  pacing is encoded in SPAREC.3's integration plan (merge bottom-up, deploy, bake ≥1
  nightly, next batch).
- **The last-flip consequence (new this row):** with `editor` flipped every surface
  key is live on prod, so `D-SPAF.14-4`'s bake gates nothing downstream in the flip
  sequence — it binds the **cleanup wave** instead: SPA.25–28 (manifest rows 136–139 —
  source-mode revival, island-bundle retirement, the SSR deletion wave, override-
  machinery removal) must not merge+deploy their deletions until this flip has baked
  ≥1 nightly green. Deleting the SSR render paths / the `page.js` island / the
  `?ssr=1` escape before the last flip bakes would destroy the rollback arm
  (D-SPAF.14-3) the moment it could be needed.
- **Sequencing reality:** the ticket's hard dependency is "the `editor` surface
  ticket's PR merged + deployed (its code must be live)" — satisfied by SPA.23 (PR
  #155) + SPA.24 (PR #156), which this PR directly stacks on; unmerged like the rest
  of the stack, but `mergePolicy: OPERATOR` stacks bottom-up so SPA.1→…→SPA.24 land
  before this PR's deploy leg; the flip line is inert until the chain's code serves.
- **The consult shape (verified in source this run):**
  - `editor` flips **five** document GETs — each `pageMount: true` in
    `SPA_DOCUMENT_ROUTES` (`packages/contracts/src/spa.ts` ~177/183–186) and each ∈
    `SPA_IDE_FRAMED_ROUTES` (~64, ~70–73 — the leaf mounts `<IdeChrome>`):
    - `GET /p/:project` (`server.ts` ~4480): session gate ~4449 (unauthed → 302
      `/login`), slug→row ~4451–4453 (miss → SSR 404), the P1.19 unread-
      `run_finished` handoff read ~4459–4474 (marks read + redirects to the
      workflow href; `?focus=1` suppresses), THEN the forced-SSR check ~4479, THEN
      `spaShellResponse(c, deps, "editor", session, {paperTheme})` ~4480, ahead of
      `projectOverviewComposition` ~4483.
    - `GET /p/:project/v/:v` (~6274): session ~6267, row ~6269, forced-SSR ~6273,
      consult ~6274, then `versionPageComposition` ~6278 (`/v/working` miss → the
      document's own 302 to `/p/<slug>`; numeric miss → 404 arm).
    - `GET /p/:project/v/:n/diff/:m` (~6385): session ~6378, row ~6380, forced-SSR
      ~6384, consult ~6385, then `getVersionDiff` ~6390 (miss → 404).
    - `GET /p/:project/a/:artifactId` (~6447): session ~6440, row ~6442, forced-SSR
      ~6446, consult ~6447, then `getArtifactPage` ~6450 (404/415 → 404 arm).
    - `GET /p/:project/revisions/:cid` (~6196): session ~6188, row ~6191,
      forced-SSR ~6195, consult ~6196, then `getWhatChanged` ~6199 (miss → 404).
  - **The forced-SSR posture (REQ-ED-12 + REQ-VFY-5) — this flip's distinctive
    half:** every one of the five consults sits AFTER
    `!isPhoneRequest(c) && row.showcase !== true`, so a phone-width request or a
    `showcase: true` project's Page keeps the server-rendered read-only Page **even
    with the flag on, forever** — the flag never re-enables a mount the capability
    refused, and the server withholds `collabWsUrl` on both paths (~4531/~6062/
    ~6103/~6327) so the SPA cannot enable collab by asking. The post-deploy marker
    leg must assert this distinction, not just the flip (D-SPAF.14-1).
  - `editor` ∈ `SPA_IDE_FRAMED_SURFACES` (`spa.ts` ~52 — export/dossier/run-sheet/
    run-report/editor), so `deps.spa`'s key-level AND resolves `editor ∧
    ide-chrome` (`spa-flag.ts` ~67) — `ide-chrome` flipped on prod at SPAF.8 — the
    single-key append lights all five leaves: the **fifth and LAST IDE-framed prod
    activation**.
  - A flagged hit serves the shell; the SPA's five `/bff/p/:slug*` twins perform
    the ONE shared compositions verbatim (SPA.23), plus `POST
    /bff/p/:slug/handoff` (REQ-BFF-22) re-performs the unread-`run_finished`
    mark-read + workflow-href redirect from the `/p/:p` leaf's `beforeLoad`. The
    collab wire is the SAME `client/collab.ts` `createCollabSession` on either
    renderer (REQ-ISL-4) — the SPA binds it through `PageSessionRegistry`
    (SPA.24's `page-collab.ts`), the SSR Page's `page.js` island binds it
    directly — so a revert drops live collab sessions back onto the SSR mount.
  - Non-documents (never flag-consulted, identical on either renderer):
    `/p/:project/edit/:draftId` (~6482 — `surfaces:null` canonical 302 to
    `/v/:n`, REQ-BND-3), `/p/:project/f/:fid` (~6003 — the blob redirect), the
    Page transport endpoints `/doc` (~6499) `/save` (~6515) `/note` (~6554)
    `/cancel-run` (~6577) `/revise` (~6595), the hunk-comment POSTs
    (~6215/~6411 — `mutationOutcome` forked), and the collab WebSocket itself
    (`deps.collabWsUrl` → `apps/collab`). The prod leg still probes the transport
    stays live.
- Sources applied: `docs/design/29_spa-migration-sequencing.md` §per-flip procedure +
  §rollback semantics (design F8/F11); `docs/frontend-spa-spec.md` §11 REQ-SEQ-10/11/12
  + REQ-VFY-8 + REQ-ED-12/13; `infra/config/stages.ts` + `stages.test.ts` (the
  stage-fact convention); `infra/pulumi/compute.ts` (the `SPA_SURFACES` env wiring —
  `args.spaSurfaces ?? cfg.spaSurfaces.join(",")`); `apps/web/src/server.ts` (all five
  consults + the transport endpoints + the forced-SSR checks);
  `apps/web/src/spa-flag.ts` (the framed-key AND); `packages/contracts/src/spa.ts`
  (the framed/routed vocabulary + `pageMount` + `surfaces:null` rows);
  `packages/journeys/src/surface-gates.ts` + `registry.ts` (`SURFACE_GATES.editor` =
  `N8, P1.pill, P1.project, R7, T2.badge, T6, T7` — all `expected:"green"`,
  `paid:false` carried legs).

## 1 — What landed (the whole diff)

### `infra/config/stages.ts` — the one-line stage fact (REQ-SEQ-10)

```diff
-    // … SPAF.13 — `run-report` joins them (REQ-SEQ-10): each prod flip …
-    // ≥ one nightly green on prod precedes the NEXT surface's prod flip.
+    // … SPAF.13 — `run-report` joins them; SPAF.14 — `editor` joins them — the
+    // LAST surface flip (REQ-ED-13) (REQ-SEQ-10): … ≥ one nightly green on prod
+    // precedes the NEXT surface's prod flip — SPAF.14 has no next flip, so its
+    // bake instead gates the CLEANUP wave's activation: SPA.26/27/28's
+    // island-bundle/SSR/override deletions must not merge-deploy until this
+    // flip has baked ≥1 nightly green.
     // … SPAF.13 is the FOURTH IDE-framed prod activation …
+    // SPAF.14 is the FIFTH and LAST IDE-framed prod activation: `editor` ∈
+    // SPA_IDE_FRAMED_SURFACES too, so all five Page-family consults AND
+    // `ide-chrome` — already flipped since SPAF.8 — and every flipped editor
+    // route (∈ SPA_IDE_FRAMED_ROUTES) mounts the chrome. Every editor consult
+    // sits AFTER the Page family's forced-SSR capability check (REQ-ED-12 +
+    // REQ-VFY-5): phone / read-only `showcase` keeps the server-rendered Page
+    // even flagged; `collabWsUrl` withheld so the SPA cannot enable collab by
+    // asking; the collab wire is the SAME `client/collab.ts` `createCollabSession`
+    // on either renderer (REQ-ISL-4) — a revert drops live collab sessions back
+    // onto the SSR `page.js` mount.
-    // `ide-chrome` alone still gates nothing else — editor stays unflipped.
+    // `ide-chrome` alone now gates nothing else — with SPAF.14 every surface key
+    // is flipped on prod.
     // … + the run-report GET's session gate … + the five editor GETs' session
     // gates precede their consults (unauthed → 302 /login — and on `/p/:p` the
     // unread-`run_finished` handoff read + the phone/showcase forced-SSR check
     // still run ahead of the consult); … + the editor POSTs stay server-
     // validated envelopes/form redirects; the `/doc` poll + the apps/collab
     // WebSocket aren't documents either — both serve identically on either
     // renderer.
-    spaSurfaces: […, "run-sheet", "dossier", "run-report"],
+    spaSurfaces: […, "run-sheet", "dossier", "run-report", "editor"],
```

Effect at deploy time: the Pulumi program renders the prod web env
`SPA_SURFACES=usage,inbox,settings,voices,onboarding,project-home,billing,export,ide-chrome,outline,figures,run-sheet,dossier,run-report,editor`
(`compute.ts` — no `rhema:spaSurfaces` stack config on prod, so the stage fact
wins). The web's consults then serve the SPA shell for all five Page-family GETs via
`deps.spa`'s key-level `editor ∧ ide-chrome` AND — `ide-chrome` already flipped —
and every route mounts `<IdeChrome>` (all five ∈ `SPA_IDE_FRAMED_ROUTES`). The
consults still sit behind their session gates AND behind the forced-SSR capability
check (phone/showcase → SSR read-only Page forever, `collabWsUrl` withheld).
`?ssr=1` / `x-rhema-renderer: ssr` still force SSR on every stage, and
`SPA_OVERRIDES` is emitted **only** on non-prod kinds — prod keeps
force-SSR-but-never-force-SPA (REQ-SEQ-4). Flip order preserved — `editor` appended
last (the ticket's `+= 'editor'`; Appendix D's normative order, REQ-ED-13). No
generated config artifacts exist for this fact (the stack config path is explicitly
never committed).

### `infra/config/stages.test.ts` — the stage-fact pin, updated honestly

The `spa.surfaces` block now asserts `STAGES.prod.spaSurfaces ===
["usage","inbox","settings","voices","onboarding","project-home","billing","export","ide-chrome","outline","figures","run-sheet","dossier","run-report","editor"]`
(the SPAF.1…SPAF.14 flips — ALL surface keys now flipped on prod, `editor` appended
in flip order), `dev` unchanged
`["usage","inbox","settings","voices","onboarding","ide-chrome","project-home","billing","export","outline","figures","run-sheet","dossier","run-report","editor"]`
(dev's own insertion order — `editor` rode SPA.23 — unchanged), and `preview`
remains `[]`. The vocabulary pin (every listed key ∈ `SPA_SURFACES`) still holds.

**Nothing else** — no other source file touched. Diff stat: 2 files, +41/−11
(comment lines dominate — the fact itself is one line, inside the ~20-line budget's
intent; prior flips ran ~26). Review scope check: the PR diff touches only
`stages.ts` + its test — exactly the ticket's AC1 envelope.

## 2 — Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` →
  **38/38 pass** (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` → clean (`tsc -b`).
- `pnpm --filter @rhema/infra lint` → clean (eslint).
- Stage-fact test is a real pin: reverting the stage line fails
  `expect(STAGES.prod.spaSurfaces).toEqual([…,"run-report","editor"])` (exact-
  equality assertion — order + membership both bound).
- Consult-position check: `apps/web/src/server.ts` read this run — all five
  editor GETs session-gate first, resolve slug→row, run the forced-SSR check
  (`!isPhoneRequest && !row.showcase`), THEN consult `"editor"` (~4480/~6196/
  ~6274/~6385/~6447); `/p/:p` additionally runs the unread-`run_finished` handoff
  ~4459–4474 ahead of the check. `editor` IS in `SPA_IDE_FRAMED_SURFACES`
  (`contracts/src/spa.ts` ~52) and all five routeIds ARE in
  `SPA_IDE_FRAMED_ROUTES` (~64/70–73): `deps.spa` resolves the key-level
  `editor ∧ ide-chrome` AND (`spa-flag.ts` ~67), so `ide-chrome`'s SPAF.8 presence
  makes this a single-key flip that lights all five leaves chrome-mounted. The
  transport family verified non-document: `/edit/:draftId` redirect ~6482
  (`surfaces:null`), `/f/:fid` ~6003, `/doc` ~6499, `/save` ~6515, `/note` ~6554,
  `/cancel-run` ~6577, `/revise` ~6595, hunk comments ~6215/~6411; `collabWsUrl`
  withheld on phone/showcase (~4531/~6062/~6103/~6327). SPA.23's
  `editor.dom.test.tsx` (16) + `page-sessions.test.ts` (9) and SPA.24's
  `page-collab.dom.test.tsx` (15) pin the leaf's mount/registry/wire behavior;
  `server.test.ts` pins the consult arms.
- Full-suite + public-safe checks ride CI (`typecheck/lint/unit` job); no
  SPA/bundle surface is touched by this row.

## 3 — Deferred live legs (all gated on operator merge + `pulumi up` prod)

| Row | Leg | Verify recipe |
|---|---|---|
| D-SPAF.14-1 | `data-renderer="spa"` on `/p/:p`, `/p/:p/v/:v`, `/p/:p/v/:n/diff/:m`, `/p/:p/a/:artifactId`, `/p/:p/revisions/:cid`; `?ssr=1` still SSR on each; session gates still 302 `/login` ahead of the consults; **forced-SSR asserted** — phone-UA + `showcase` rows still serve `data-renderer="ssr"` read-only with `collabWsUrl` withheld; transport probes (`/doc`, collab WS) stay live | curl recipes in-row (session cookie per route; `?ssr=1`; `-A <mobile UA>` + showcase slug → `ssr`; unauthed → 302; `/doc` JSON + WS upgrade) |
| D-SPAF.14-2 | `--expect-renderer spa` leg on prod | `rhema-journeys --stage prod --surface editor --expect-renderer spa --expect-sha <deployed>` → exit 0 (`SURFACE_GATES.editor` = `N8, P1.pill, P1.project, R7, T2.badge, T6, T7` — all `expected:"green"` carried legs: a green step failing FAILS the run; the owed note covers the SPA.23/24 preview two-legs) |
| D-SPAF.14-3 | Rollback arm | `git revert <flip>` + `pulumi up` → `data-renderer="ssr"` on all five GETs in one deploy — `ide-chrome` stays flipped, only the AND's `editor` leg goes false; live collab sessions fall back to the SSR `page.js` mount (the SAME `collab.ts` wire, REQ-ISL-4) (recorded, not exercised destructively) |
| D-SPAF.14-4 | REQ-SEQ-10 nightly-green bake | next nightly `journeys.yml` green on prod — no next flip exists, so it binds the **cleanup wave's activation**: SPA.26/27/28 (and SPA.25) must not merge-deploy deletions until this bake; D-SPAF.1-4…D-SPAF.13-4's nightly greens restated as this flip's merge/deploy preconditions |

All four appended to `docs/tickets/DEFERRALS.md` under `## SPAF.14` this run.

## 4 — Requirement IDs / AC status

- **REQ-SEQ-10** — separate minimal PR touching only `STAGES.prod.spaSurfaces`:
  SATISFIED in the diff. Operator-merge + `pulumi up` + nightly-green clauses:
  operator-gated / ledgered (D-SPAF.14-4, with D-SPAF.1-4's through D-SPAF.13-4's
  bakes restated as this flip's activation preconditions; the cleanup wave named
  as the gated downstream).
- **REQ-SEQ-11** — deployable dark: SATISFIED by construction (one config datum;
  SSR untouched; flag-∅ serving path identical on every other stage; rollback is
  the same line's revert).
- **REQ-SEQ-12** — mixed-mode coexistence: unchanged — the boot payload carries the
  effective flag set (the five `pageMount` routeIds' `["editor"]` verdicts flip to
  `"spa"` with the deploy — server-ANDed with `ide-chrome` per REQ-SEQ-6 and still
  subject to the capability SSR the boot map mirrors); unflipped-forced paths
  (phone/showcase) document-nav to SSR; the session gates keep answering 302s
  ahead of the renderers; the transport family never enters the document path.
- **REQ-ED-12/REQ-VFY-5** — the forced-SSR posture is structural, not flag-driven:
  preserved verbatim and pinned in the post-deploy recipe (D-SPAF.14-1).
- **REQ-ED-13** — the editor flips LAST: satisfied — this is the final
  `spaSurfaces` append; every surface key is now flipped on prod.
- **REQ-VFY-8 (prod legs)** — DEFERRED to the deploy (D-SPAF.14-1/-2).
- AC layers: AC1 (diff touches only `stages.ts` + test) — **deterministic/
  engineered, DONE**; AC2–AC4 (post-deploy markers, `?ssr=1`, journey leg,
  rollback) — **live-executed, DEFERRED** per above; universal gate AC —
  docs/index/ledger advanced, checks read at closeout.

## 5 — Deviations / owned decisions

- None beyond the operator-sanctioned sequencing: the ticket's "PR merged +
  deployed" phrasing is executed as "PR opened; live legs ledgered" per
  `mergePolicy: OPERATOR` + the $0/no-prod-mutation constraint — and the "≥1
  nightly green … entry gate" clause is applied to activation order per the
  2026-10-08T19:12Z orchestrator ruling (ledgered; no ADR needed — no design
  change).
- This flip is a single-key append again — and an **IDE-framed activation** (the
  fifth and last): the append alone lights all five leaves because `ide-chrome`
  already satisfies the AND's other leg. A revert re-dormants `editor` while
  leaving `ide-chrome` (and therefore every prior flipped surface) untouched.
- **The forced-SSR posture is asserted IN the post-deploy recipe, not just
  preserved.** The ticket's AC names markers + escape + journey + rollback; this
  surface is the only one whose flag consult sits behind a permanent capability
  check (REQ-ED-12 — phone/showcase read-only Pages serve SSR **by design,
  forever**), so D-SPAF.14-1's recipe asserts `data-renderer="ssr"` on the phone +
  showcase arms explicitly — a green flip that accidentally re-enabled those
  mounts would be a defect, not a pass. Recorded as an owned decision: no code
  change, extra verify arms inside the marker leg's envelope.
- **The nightly-green row binds the cleanup wave** (worker instruction + the
  manifest's row ordering): with no next flip, `D-SPAF.14-4` names SPA.25–28's
  deletions as the gated activation — recorded so SPAREC.3's integration plan and
  the cleanup rows' own ledgers inherit the binding verbatim.
- Pre-existing `integration`/privsep CI reds, if present on this branch, are
  inherited per GD-MAINT.4-1 — classified, not repaired.

## PR checks read (closeout)

Single `gh pr checks 157 --watch=false` read after the closeout-docs push
(2026-10-09T23:50Z, on closeout tip `81aefac`): **"no checks reported"** — the same
read as on #140–#153 and #156's second read (the pipeline had not registered a job
for the stacked branch at stamp time; recorded verbatim rather than re-polled).
Any `integration`/privsep red that reports later is inherited, waived per
GD-MAINT.4-1 — classified, not repaired.
