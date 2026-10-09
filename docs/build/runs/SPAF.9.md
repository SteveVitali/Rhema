# SPAF.9 — prod flip: `outline` (run ledger)

- **Status:** DONE for the in-repo legs (PR diff + unit-level verification); the four
  post-deploy/live legs are **OPEN deferrals** (`D-SPAF.9-1`…`-4`) — they materialize only
  when the operator merges the chain + `pulumi up`s prod.
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/124_SPAF.9__prod-flip-outline.md` (manifest row 124)
- **Branch:** `stevevitali/spaf-9-prod-flip-outline`, stacked on
  `stevevitali/spa-18-surface-outline` @ `ee8f0ad` (`OPERATOR` merge policy,
  **not merged**).
- **PR:** #146 — opened at closeout; `gh pr checks --watch=false` read once at closeout
  (result recorded in § PR checks read below; inherited `integration`/privsep red, if it
  reports, is waived per GD-MAINT.4-1 — classified, not repaired).
- **Goal:** flip `outline` to the SPA on prod — `STAGES.prod.spaSurfaces += 'outline'` as
  the one-line stage-fact PR; the operator merges + `pulumi up` deploys; rollback = revert +
  redeploy.
- **Spend:** $0. No deploys, no production writes, no live legs. Preview legs not needed —
  this row's contract is the prod flip itself (the surface's two-leg/rollback evidence is
  D-SPA.18-1/-2's preview track, still OPEN behind the absent
  `rhema-nonprod-resend-api-key` operator secret — D-MAINT.6-1).

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): no `OPEN` row is unblocked by this run —
  `D-SPA.18-1`, `D-SPA.18-2`, `D-OPS.1-1`, `D-MAINT.6-1` all still need their named
  operator prerequisites; the `D-SPAF.1-*` … `D-SPAF.8-*` rows stay OPEN (operator merge +
  deploy gated). None closed, four opened.
- LEDGER CURRENT STATE read: `nextTicket: SPAF.9`, `chainTip:
  stevevitali/spa-18-surface-outline`, `mergePolicy: OPERATOR`, `round: 4`,
  `dispatchTarget: subagent`, `pinnedBaseSha: fab08ed`.
- **Entry gate (REQ-SEQ-10 + the 2026-10-08T19:12Z sequencing ruling):** the ticket's
  operating clause is "a nightly green since the PREVIOUS flip is this row's entry gate —
  pause if unmet" — `D-SPAF.8-4` names it (≥1 nightly green on prod after the
  `export`+`ide-chrome` deploy). The orchestrator's ledgered ruling (PHASE LOG
  2026-10-08T19:12Z) interprets that gate as binding **activation order at merge/deploy
  time, not PR authoring**: with `mergePolicy: OPERATOR` and the whole stack unmerged,
  literal row-level gating would stall ~20 rows behind operator merges. This run therefore
  executes now as an **authored-dormant minimal PR** exactly as SPAF.1–SPAF.8 did — the
  stage-fact diff + unit pins land, every live leg is deferred with a verbatim verify
  recipe, and `D-SPAF.1-4`'s through `D-SPAF.8-4`'s nightly-green bakes are restated (in
  `D-SPAF.9-4`) as live preconditions for the operator's merge/deploy cadence of THIS
  flip. REQ-SEQ-10 pacing is encoded in SPAREC.3's integration plan (merge bottom-up,
  deploy, bake ≥1 nightly, next batch).
- **Sequencing reality:** the ticket's hard dependency is "the `outline` surface ticket's
  PR merged + deployed (its code must be live)". PR #145 (SPA.18) is unmerged like the rest
  of the stack — but `mergePolicy: OPERATOR` stacks bottom-up, so SPA.1→…→SPA.18 land
  before this PR's deploy leg; the flip line is inert until the chain's code serves.
- **The consult shape (verified in source this run):**
  - `GET /p/:project/outline` (`apps/web/src/server.ts` ~1766): session gate first
    (unauthed → 302 `/login` at ~1768), then
    `spaShellResponse(c, deps, "outline", session)` at ~1771 — spec §4's fixed position,
    before the slug→row read, the `getOutline` fetch, and the not-found arm.
  - `GET /p/:project/outline/promote` (~1639): session gate at ~1641, consult at ~1644 —
    BEFORE the `?scope`/`?threadId`/`?turnId`/`?slug` pick reads and the
    `getOutlinePromotion` fetch; a flagged promote hit serves the shell and the SPA's
    `/bff/p/:slug/outline/promote` twin performs the read.
  - `outline` ∉ `SPA_IDE_FRAMED_SURFACES` (`packages/contracts/src/spa.ts` ~47 — that set
    is export/dossier/run-sheet/run-report/editor), and the route rows carry
    `surfaces: ["outline"]` only (`spa.ts` ~190–191): the consult is the plain flag check,
    and both leaves render OUTSIDE the IDE chrome — the unframed-leaf case (`/outline` is
    named verbatim in the `spa.ts` ~59 comment).
  - The four outline POSTs (`/outline` save, `/outline/promote`, `/outline/delete`,
    `/outline/gaps/:gapId/answer`) are never documents: JSON callers get the
    `mutationOutcome` envelopes (`{ok,redirect}`/`{ok,data}`, 422 `save_failed`, 409
    `outline_cited`), forms keep their 302s — identical on either renderer.
- Sources applied: `docs/design/29_spa-migration-sequencing.md` §per-flip procedure +
  §rollback semantics (design F8/F11); `docs/frontend-spa-spec.md` §11 REQ-SEQ-10/11/12 +
  REQ-VFY-8; `infra/config/stages.ts` + `stages.test.ts` (the stage-fact convention);
  `infra/pulumi/compute.ts` (the `SPA_SURFACES` env wiring —
  `args.spaSurfaces ?? cfg.spaSurfaces.join(",")`); `apps/web/src/server.ts` (the two
  outline consults); `packages/contracts/src/spa.ts` (the framed/unframed vocabulary);
  `packages/journeys/src/surface-gates.ts` (`SURFACE_GATES.outline` = `P1.outline`).

## 1 — What landed (the whole diff)

### `infra/config/stages.ts` — the one-line stage fact (REQ-SEQ-10)

```diff
-    // SPAF.6 — `project-home` joins them; SPAF.7 — `billing` joins them; SPAF.8 — `export`
-    // AND `ide-chrome` join them together (REQ-SEQ-10): each prod flip is a one-line
-    // stage-fact commit, operator-merged + `pulumi up`-deployed; rollback = revert this
-    // line + redeploy — reverting removes BOTH keys, so the /p/:p/import* legs re-dormant
-    // together. ≥ one nightly green on prod precedes the NEXT surface's prod flip. Order is
-    // flip order — never re-sort.
-    // SPAF.8 is the first IDE-framed prod activation: … (unchanged prose)
-    spaSurfaces: ["usage", "inbox", "settings", "voices", "onboarding", "project-home", "billing", "export", "ide-chrome"],
+    // … SPAF.9 — `outline` joins them (REQ-SEQ-10): each prod flip is a one-line
+    // stage-fact commit, operator-merged + `pulumi up`-deployed; rollback = revert this
+    // line + redeploy — reverting removes BOTH SPAF.8 keys, so the /p/:p/import* legs
+    // re-dormant together. ≥ one nightly green on prod precedes the NEXT surface's prod
+    // flip. Order is flip order — never re-sort.
+    // SPAF.8 is the first IDE-framed prod activation: … (unchanged) … SPAF.9's `outline`
+    // is UNFRAMED — `/p/:p/outline` + `/p/:p/outline/promote` consult on `outline` alone
+    // and render outside the IDE shell even flagged. … the outline GETs' session gates
+    // precede their consults the same way (unauthed → 302 /login); the seven billing POSTs
+    // + the four outline POSTs stay server-validated envelopes/form redirects on either
+    // renderer — they were never documents.
+    spaSurfaces: ["usage", "inbox", "settings", "voices", "onboarding", "project-home", "billing", "export", "ide-chrome", "outline"],
```

Effect at deploy time: the Pulumi program renders the prod web env
`SPA_SURFACES=usage,inbox,settings,voices,onboarding,project-home,billing,export,ide-chrome,outline`
(`compute.ts` — no `rhema:spaSurfaces` stack config on prod, so the stage fact wins). The
web's consult then serves the SPA shell for `GET /p/:project/outline` + `GET
/p/:project/outline/promote` — plain flag membership (`outline` is unframed, so no
`ide-chrome` AND is involved); both leaves mount outside `.ide`. Every consult still sits
behind its session gate (unauthed → 302 `/login`). `?ssr=1` / `x-rhema-renderer: ssr`
still force SSR on every stage, and `SPA_OVERRIDES` is emitted **only** on non-prod kinds —
prod keeps force-SSR-but-never-force-SPA (REQ-SEQ-4). Flip order is preserved (`usage` …
`billing`, `export`,`ide-chrome`, then `outline` appended — the ticket's `+= 'outline'`).
No generated config artifacts exist for this fact (the stack config path is explicitly
never committed).

### `infra/config/stages.test.ts` — the stage-fact pin, updated honestly

The `spa.surfaces` block now asserts `STAGES.prod.spaSurfaces ===
["usage","inbox","settings","voices","onboarding","project-home","billing","export","ide-chrome","outline"]`
(the SPAF.1…SPAF.9 flips — `outline` appended in flip order), `dev` stays
`["usage","inbox","settings","voices","onboarding","ide-chrome","project-home","billing","export","outline"]`
(dev's own insertion order — `outline` rode SPA.18 — unchanged), and `preview` remains `[]`
(stack-config override path unchanged). The vocabulary pin (every listed key ∈
`SPA_SURFACES`) still holds.

**Nothing else** — no other source file touched. Diff stat: 2 files, 18 insertions / 13
deletions (comment lines dominate — the fact itself is one line, inside the ~20-line
budget's intent). Review scope check: the PR diff touches only `stages.ts` + its test —
exactly the ticket's AC1 envelope.

## 2 — Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` → **38/38
  pass** (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` → clean (`tsc -b`).
- `pnpm --filter @rhema/infra lint` → clean (eslint).
- Stage-fact test is a real pin: reverting the stage line fails
  `expect(STAGES.prod.spaSurfaces).toEqual([…,"ide-chrome","outline"])` (exact-equality
  assertion — order + membership both bound).
- Consult-position check: `apps/web/src/server.ts` read this run —
  `/p/:project/outline/promote` session-gates at ~1641 then consults `"outline"` at ~1644;
  `/p/:project/outline` gates at ~1768 then consults at ~1771. `outline` is NOT in
  `SPA_IDE_FRAMED_SURFACES` (`contracts/src/spa.ts` ~47); the route rows
  `/p/$project/outline` + `/p/$project/outline/promote` carry `surfaces:["outline"]` only
  (~190–191). SPA.18's `outline.dom.test.tsx` (23 tests) pins both leaves' mounts, the
  SsrHandoff-no-BFF leg, and the not-found arms.
- Full-suite + public-safe checks ride CI (`typecheck/lint/unit` job); no SPA/bundle
  surface is touched by this row.

## 3 — Deferred live legs (all gated on operator merge + `pulumi up` prod)

| Row | Leg | Verify recipe |
|---|---|---|
| D-SPAF.9-1 | `data-renderer="spa"` on `/p/:p/outline` + `/p/:p/outline/promote?…`; `?ssr=1` still SSR on each; session gates still 302 `/login` ahead of both consults | `curl -s https://rhema.tools/p/<slug>/outline` (session) `\| grep data-renderer` → `spa`; same for `/p/<slug>/outline/promote?scope=thread&threadId=<t>`; `…?ssr=1` → `ssr` on each; `curl -sI` (no cookie) on each → `302 /login` |
| D-SPAF.9-2 | `--expect-renderer spa` leg on prod | `rhema-journeys --stage prod --surface outline --expect-renderer spa --expect-sha <deployed>` → exit 0 (`SURFACE_GATES.outline` = `P1.outline` — expected:red pending UX.2 ownership: a red miss reports `owed`, never fails the leg) |
| D-SPAF.9-3 | Rollback arm | `git revert <flip>` + `pulumi up` → `data-renderer="ssr"` on both outline GETs in one deploy (recorded, not exercised destructively) |
| D-SPAF.9-4 | REQ-SEQ-10 nightly-green bake | next nightly `journeys.yml` green on prod before SPAF.10 opens; D-SPAF.1-4's through D-SPAF.8-4's nightly greens restated as this flip's merge/deploy preconditions |

All four appended to `docs/tickets/DEFERRALS.md` under `## SPAF.9` this run.

## 4 — Requirement IDs / AC status

- **REQ-SEQ-10** — separate minimal PR touching only `STAGES.prod.spaSurfaces`: SATISFIED
  in the diff. Operator-merge + `pulumi up` + nightly-green clauses: operator-gated /
  ledgered (D-SPAF.9-4, with D-SPAF.1-4's through D-SPAF.8-4's bakes restated as this
  flip's activation preconditions).
- **REQ-SEQ-11** — deployable dark: SATISFIED by construction (one config datum; SSR
  untouched; flag-∅ serving path identical on every other stage; rollback is the same
  line's revert).
- **REQ-SEQ-12** — mixed-mode coexistence: unchanged — the boot payload carries the
  effective flag set (the two outline routeIds' `["outline"]` verdicts flip to `"spa"` with
  the deploy; unflipped routes document-nav via `SsrHandoff`); the session gates keep
  answering 302s ahead of any renderer.
- **REQ-VFY-8 (prod legs)** — DEFERRED to the deploy (D-SPAF.9-1/-2).
- AC layers: AC1 (diff touches only `stages.ts` + test) — **deterministic/engineered,
  DONE**; AC2–AC4 (post-deploy markers, `?ssr=1`, journey leg, rollback) —
  **live-executed, DEFERRED** per above; universal gate AC — docs/index/ledger advanced,
  checks read at closeout.

## 5 — Deviations / owned decisions

- None beyond the operator-sanctioned sequencing: the ticket's "PR merged + deployed"
  phrasing is executed as "PR opened; live legs ledgered" per `mergePolicy: OPERATOR` +
  the $0/no-prod-mutation constraint — and the "≥1 nightly green … entry gate" clause is
  applied to activation order per the 2026-10-08T19:12Z orchestrator ruling (ledgered; no
  ADR needed — no design change).
- This flip is a single-key append again (unlike SPAF.8's pair): `outline` consults alone —
  it is unframed, so `ide-chrome`'s presence is orthogonal; no AND-gate semantics change.
- Pre-existing `integration`/privsep CI reds, if present on this branch, are inherited per
  GD-MAINT.4-1 — classified, not repaired.

## PR checks read (closeout)

Single `gh pr checks 146 --watch=false` read after the closeout-docs push: **"no checks
reported on the 'stevevitali/spaf-9-prod-flip-outline' branch"** (the pipeline had not
registered checks at stamp time — the same result as #140/#141/#142/#144 at their
closeouts). Recorded verbatim rather than re-polled; any `integration`/privsep red that
reports later is inherited, waived per GD-MAINT.4-1 — classified, not repaired.
