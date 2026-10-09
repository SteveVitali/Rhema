# SPAF.12 — prod flip: `dossier` (run ledger)

- **Status:** DONE for the in-repo legs (PR diff + unit-level verification); the four
  post-deploy/live legs are **OPEN deferrals** (`D-SPAF.12-1`…`-4`) — they materialize only
  when the operator merges the chain + `pulumi up`s prod.
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/130_SPAF.12__prod-flip-dossier.md` (manifest row 130)
- **Branch:** `stevevitali/spaf-12-prod-flip-dossier`, stacked on
  `stevevitali/spa-21-surface-dossier` @ `33ecb38` (`OPERATOR` merge policy,
  **not merged**).
- **PR:** #152 — opened at closeout; `gh pr checks --watch=false` read once at closeout
  (result recorded in § PR checks read below; inherited `integration`/privsep red, if it
  reports, is waived per GD-MAINT.4-1 — classified, not repaired).
- **Goal:** flip `dossier` to the SPA on prod — `STAGES.prod.spaSurfaces += 'dossier'`
  as the one-line stage-fact PR; the operator merges + `pulumi up` deploys; rollback =
  revert + redeploy.
- **Spend:** $0. No deploys, no production writes, no live legs. Preview legs not needed —
  this row's contract is the prod flip itself (the surface's two-leg/rollback evidence is
  D-SPA.21-1/-2's preview track, still OPEN behind the absent
  `rhema-nonprod-resend-api-key` operator secret — D-MAINT.6-1).

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): no `OPEN` row is unblocked by this run —
  `D-SPA.21-1`, `D-SPA.21-2`, `D-OPS.1-1`, `D-MAINT.6-1` all still need their named
  operator prerequisites; the `D-SPAF.1-*` … `D-SPAF.11-*` rows stay OPEN (operator merge +
  deploy gated). None closed, four opened.
- LEDGER CURRENT STATE read: `nextTicket: SPAF.12`, `chainTip:
  stevevitali/spa-21-surface-dossier`, `mergePolicy: OPERATOR`, `round: 4`,
  `dispatchTarget: subagent`, `pinnedBaseSha: fab08ed`.
- **Entry gate (REQ-SEQ-10 + the 2026-10-08T19:12Z sequencing ruling):** the ticket's
  operating clause is "a nightly green since the PREVIOUS flip is this row's entry gate —
  pause if unmet" — `D-SPAF.11-4` names it (≥1 nightly green on prod after the `run-sheet`
  deploy). The orchestrator's ledgered ruling (PHASE LOG 2026-10-08T19:12Z) interprets that
  gate as binding **activation order at merge/deploy time, not PR authoring**: with
  `mergePolicy: OPERATOR` and the whole stack unmerged, literal row-level gating would
  stall ~20 rows behind operator merges. This run therefore executes now as an
  **authored-dormant minimal PR** exactly as SPAF.1–SPAF.11 did — the stage-fact diff +
  unit pins land, every live leg is deferred with a verbatim verify recipe, and
  `D-SPAF.1-4`'s through `D-SPAF.11-4`'s nightly-green bakes are restated (in
  `D-SPAF.12-4`) as live preconditions for the operator's merge/deploy cadence of THIS
  flip. REQ-SEQ-10 pacing is encoded in SPAREC.3's integration plan (merge bottom-up,
  deploy, bake ≥1 nightly, next batch).
- **Sequencing reality:** the ticket's hard dependency is "the `dossier` surface
  ticket's PR merged + deployed (its code must be live)". PR #151 (SPA.21) is unmerged
  like the rest of the stack — but `mergePolicy: OPERATOR` stacks bottom-up, so
  SPA.1→…→SPA.21 land before this PR's deploy leg; the flip line is inert until the
  chain's code serves.
- **The consult shape (verified in source this run):**
  - `GET /p/:project/review/:runId` (`apps/web/src/server.ts` ~5326): session gate first
    (unauthed → 302 `/login` at ~5328), then
    `spaShellResponse(c, deps, "dossier", session)` at ~5330 — spec §4's fixed position,
    before the slug→row read and the `dossierComposition` call (~5215 — a missed slug or
    a run without a delivered dossier still lands the document's own 404 arm on SSR).
  - `GET /p/:project/obligations/new` (`server.ts` ~5675): session gate ~5677, consult
    ~5679, then the slug→row read + `safeBack` (`?next`/`?back` stay `/p/…`-confined).
  - `dossier` ∈ `SPA_IDE_FRAMED_SURFACES` (`packages/contracts/src/spa.ts` ~49 — the set
    is export/dossier/run-sheet/run-report/editor), so `deps.spa`'s key-level AND resolves
    `dossier ∧ ide-chrome` (`apps/web/src/spa-flag.ts` ~67) on **both** dossier consults —
    `ide-chrome` has been in prod's list since SPAF.8, so the single-key append lights
    both leaves. This is the **third IDE-framed prod activation** (after SPAF.8's
    `export` and SPAF.11's `run-sheet`).
  - `/p/$project/review/$runId` ∈ `SPA_IDE_FRAMED_ROUTES` (`spa.ts` ~181): the review
    leaf mounts `<IdeChrome>` (panes/palette/feed). `/p/$project/obligations/new` ∉ the
    framed routes: it serves the shell on the same `dossier ∧ ide-chrome` verdict but
    renders its leaf **outside** `.ide` — the flag consult is key-granular, the chrome
    mount is route-granular.
  - A flagged review hit serves the shell; the SPA's `/bff/p/:slug/review/:runId` twin
    performs the ONE shared `dossierComposition` — `getDossier` under the
    catch→not-found seam, the idempotent `markDossierSeen` + `run.report_viewed` emit,
    the shared `filterFindings`/`applySeverityBudget` list feeding the body + Margin +
    Desk, the `?gate=` focused card, the `?disposed`/`?applied`/`?promoted`/`?obligated`/
    `?bulk`+`?bulkdone` echoes — so the two renderers read + log identically.
    `/bff/p/:slug/obligations/new` answers `{obligationNew:{slug,projectTitle,back}}`.
  - The dossier POSTs are never documents: finding disposition/apply/promote/obligations
    (on both `/p/:p/review/:runId/findings/:fid/…` ~5605–5670 and the runless
    `/p/:p/findings/:fid/…` paths), `POST /p/:p/obligations` (~5701, the create), and
    `POST /p/:p/review/:runId/findings/bulk-preview` + `…/bulk` (~5751/~5770) all answer
    `mutationOutcome` envelopes (`{ok,redirect}` on the `?disposed`/`?applied`/`?promoted`/
    `?obligated`/`?bulk`+`?bulkdone`/`?obligation=new` vocabulary + preserved refusal
    statuses) for JSON callers while forms keep their 302s/re-renders — identical on
    either renderer. The gate/decision POSTs (`/p/:p/gates/:gid`, `/p/:p/decisions/:dcr`)
    the dossier's focused card posts through were likewise never documents.
- Sources applied: `docs/design/29_spa-migration-sequencing.md` §per-flip procedure +
  §rollback semantics (design F8/F11); `docs/frontend-spa-spec.md` §11 REQ-SEQ-10/11/12 +
  REQ-VFY-8; `infra/config/stages.ts` + `stages.test.ts` (the stage-fact convention);
  `infra/pulumi/compute.ts` (the `SPA_SURFACES` env wiring —
  `args.spaSurfaces ?? cfg.spaSurfaces.join(",")`); `apps/web/src/server.ts` (the two
  dossier consults + `dossierComposition`); `apps/web/src/spa-flag.ts` (the framed-key
  AND); `packages/contracts/src/spa.ts` (the framed/routed vocabulary);
  `packages/journeys/src/surface-gates.ts` + `registry.ts`
  (`SURFACE_GATES["dossier"]` = `N7`, `T1`, `T12F`, `T13F`, `P1.dossier` — N7/T1
  `expected:"green"`, T12F/T13F/P1.dossier `expected:"red"`, all `paid:false`).

## 1 — What landed (the whole diff)

### `infra/config/stages.ts` — the one-line stage fact (REQ-SEQ-10)

```diff
-    // … SPAF.10 — `figures` joins them; SPAF.11 — `run-sheet` joins them (REQ-SEQ-10):
-    // each prod flip is a one-line stage-fact commit, operator-merged + `pulumi up`-
-    // deployed; rollback = revert this line + redeploy — reverting removes BOTH SPAF.8
-    // keys, so the /p/:p/import* legs re-dormant together. ≥ one nightly green on prod
-    // precedes the NEXT surface's prod flip. Order is flip order — never re-sort.
+    // … SPAF.11 — `run-sheet` joins them; SPAF.12 — `dossier` joins them (REQ-SEQ-10):
+    // each prod flip is a one-line stage-fact commit, operator-merged + `pulumi up`-
+    // deployed; rollback = … (unchanged) … Order is flip order — never re-sort.
     // SPAF.8 is the first IDE-framed prod activation: … SPAF.11 is the SECOND …
-    // `ide-chrome` alone still gates nothing else — dossier/run-report/editor stay
-    // unflipped. SPAF.9's `outline` and SPAF.10's `figures` are UNFRAMED — …
+    // SPAF.12 is the THIRD IDE-framed prod activation: `dossier` ∈
+    // SPA_IDE_FRAMED_SURFACES too, so BOTH dossier consults AND `ide-chrome` — already
+    // flipped since SPAF.8 — and `/p/:p/review/:runId` (∈ SPA_IDE_FRAMED_ROUTES) mounts
+    // the chrome while `/p/:p/obligations/new` (∉ the framed routes) serves the shell
+    // but renders its leaf OUTSIDE `.ide`. A flagged review GET serves the shell and the
+    // `/bff/p/:slug/review/:runId` twin performs the ONE shared `dossierComposition` —
+    // the `run.report_viewed` emit + the findings/second-read/rubric/disposition state +
+    // the Margin/Desk filtered list verbatim — so the two renderers read identically.
+    // `ide-chrome` alone still gates nothing else — run-report/editor stay unflipped. …
-    // … the run-sheet GET's session gates precede their consults the same way
-    // (unauthed → 302 /login); … the run-sheet run/exhausted POSTs stay
-    // server-validated envelopes/form redirects on either renderer — they were never
-    // documents.
+    // … + the two dossier GETs' session gates precede their consults the same way
+    // (unauthed → 302 /login); … + the dossier finding POSTs
+    // (disposition/apply/promote/obligations + the obligations create + the bulk
+    // preview/confirm pair) stay server-validated envelopes/form redirects on either
+    // renderer — they were never documents.
-    spaSurfaces: […, "export", "ide-chrome", "outline", "figures", "run-sheet"],
+    spaSurfaces: […, "export", "ide-chrome", "outline", "figures", "run-sheet", "dossier"],
```

Effect at deploy time: the Pulumi program renders the prod web env
`SPA_SURFACES=usage,inbox,settings,voices,onboarding,project-home,billing,export,ide-chrome,outline,figures,run-sheet,dossier`
(`compute.ts` — no `rhema:spaSurfaces` stack config on prod, so the stage fact wins). The
web's consult then serves the SPA shell for `GET /p/:project/review/:runId` AND
`GET /p/:project/obligations/new` via `deps.spa`'s key-level `dossier ∧ ide-chrome` AND —
`ide-chrome` already flipped, so `dossier`'s append is sufficient — and the `p.$project`
layout mounts `<IdeChrome>` on the review leaf (`/p/$project/review/$runId` ∈
`SPA_IDE_FRAMED_ROUTES`) while the obligations leaf renders unframed. Both consults still
sit behind their session gates (unauthed → 302 `/login`). `?ssr=1` /
`x-rhema-renderer: ssr` still force SSR on every stage, and `SPA_OVERRIDES` is emitted
**only** on non-prod kinds — prod keeps force-SSR-but-never-force-SPA (REQ-SEQ-4). Flip
order is preserved (`usage` … `run-sheet`, then `dossier` appended — the ticket's
`+= 'dossier'`). No generated config artifacts exist for this fact (the stack config path
is explicitly never committed).

### `infra/config/stages.test.ts` — the stage-fact pin, updated honestly

The `spa.surfaces` block now asserts `STAGES.prod.spaSurfaces ===
["usage","inbox","settings","voices","onboarding","project-home","billing","export","ide-chrome","outline","figures","run-sheet","dossier"]`
(the SPAF.1…SPAF.12 flips — `dossier` appended in flip order), `dev` stays
`["usage","inbox","settings","voices","onboarding","ide-chrome","project-home","billing","export","outline","figures","run-sheet","dossier"]`
(dev's own insertion order — `dossier` rode SPA.21 — unchanged), and `preview` remains
`[]` (stack-config override path unchanged). The vocabulary pin (every listed key ∈
`SPA_SURFACES`) still holds.

**Nothing else** — no other source file touched. Diff stat: 2 files, 24 insertions / 7
deletions (comment lines dominate — the fact itself is one line, inside the ~20-line
budget's intent). Review scope check: the PR diff touches only `stages.ts` + its test —
exactly the ticket's AC1 envelope.

## 2 — Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` → **38/38
  pass** (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` → clean (`tsc -b`).
- `pnpm --filter @rhema/infra lint` → clean (eslint).
- Stage-fact test is a real pin: reverting the stage line fails
  `expect(STAGES.prod.spaSurfaces).toEqual([…,"run-sheet","dossier"])` (exact-equality
  assertion — order + membership both bound).
- Consult-position check: `apps/web/src/server.ts` read this run —
  `/p/:project/review/:runId` session-gates at ~5328 then consults `"dossier"` at ~5330,
  before the slug→row read + `dossierComposition`; `/p/:project/obligations/new`
  session-gates ~5677 then consults ~5679. `dossier` IS in
  `SPA_IDE_FRAMED_SURFACES` (`contracts/src/spa.ts` ~49) and `/p/$project/review/$runId`
  IS in `SPA_IDE_FRAMED_ROUTES` (~181) while `/p/$project/obligations/new` is NOT:
  `deps.spa` resolves the key-level `dossier ∧ ide-chrome` AND (`spa-flag.ts` ~67 —
  `surfaces.has(surface) && (!IDE_FRAMED.has(surface) || surfaces.has("ide-chrome"))`),
  so `ide-chrome`'s SPAF.8 presence makes this a single-key flip that lights both GETs —
  chrome-mounted on the review leaf, unframed on the obligations leaf. SPA.21's
  `dossier.dom.test.tsx` (16 tests) pins the leaf's chrome mount, the unframed
  obligations leaf, the SsrHandoff-no-BFF leg, and the composition parity.
- Full-suite + public-safe checks ride CI (`typecheck/lint/unit` job); no SPA/bundle
  surface is touched by this row.

## 3 — Deferred live legs (all gated on operator merge + `pulumi up` prod)

| Row | Leg | Verify recipe |
|---|---|---|
| D-SPAF.12-1 | `data-renderer="spa"` on `/p/:p/review/:runId` + `/p/:p/obligations/new`; `?ssr=1` still SSR; session gates still 302 `/login` ahead of both consults | `curl -s https://rhema.tools/p/<slug>/review/<runId>` (session) `\| grep data-renderer` → `spa`; `…?ssr=1` → `ssr`; same marker pair on `/p/<slug>/obligations/new` (shell served, leaf unframed — outside `.ide`); `curl -sI` (no cookie) → `302 /login` on BOTH |
| D-SPAF.12-2 | `--expect-renderer spa` leg on prod | `rhema-journeys --stage prod --surface dossier --expect-renderer spa --expect-sha <deployed>` → exit 0 (`SURFACE_GATES["dossier"]` = `N7`, `T1`, `T12F`, `T13F`, `P1.dossier` — N7/T1 expected:green carried legs: a green miss FAILS the run; T12F/T13F/P1.dossier expected:red pending their first live leg: a red miss reports `owed`, never gates) |
| D-SPAF.12-3 | Rollback arm | `git revert <flip>` + `pulumi up` → `data-renderer="ssr"` on BOTH dossier GETs in one deploy — `ide-chrome` stays flipped, only the AND's `dossier` leg goes false (recorded, not exercised destructively) |
| D-SPAF.12-4 | REQ-SEQ-10 nightly-green bake | next nightly `journeys.yml` green on prod before SPAF.13 opens; D-SPAF.1-4's through D-SPAF.11-4's nightly greens restated as this flip's merge/deploy preconditions |

All four appended to `docs/tickets/DEFERRALS.md` under `## SPAF.12` this run.

## 4 — Requirement IDs / AC status

- **REQ-SEQ-10** — separate minimal PR touching only `STAGES.prod.spaSurfaces`: SATISFIED
  in the diff. Operator-merge + `pulumi up` + nightly-green clauses: operator-gated /
  ledgered (D-SPAF.12-4, with D-SPAF.1-4's through D-SPAF.11-4's bakes restated as this
  flip's activation preconditions).
- **REQ-SEQ-11** — deployable dark: SATISFIED by construction (one config datum; SSR
  untouched; flag-∅ serving path identical on every other stage; rollback is the same
  line's revert).
- **REQ-SEQ-12** — mixed-mode coexistence: unchanged — the boot payload carries the
  effective flag set (the `/p/$project/review/$runId` routeId's `["dossier"]` verdict
  flips to `"spa"` with the deploy — server-ANDed with `ide-chrome` per REQ-SEQ-6;
  unflipped routes document-nav via `SsrHandoff`); the session gates keep answering 302s
  ahead of any renderer.
- **REQ-VFY-8 (prod legs)** — DEFERRED to the deploy (D-SPAF.12-1/-2).
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
- This flip is a single-key append again (like SPAF.9–SPAF.11, unlike SPAF.8's pair) —
  and like SPAF.11 it is an **IDE-framed activation** (the third): the append alone
  lights BOTH dossier leaves because `ide-chrome` already satisfies the AND's other leg.
  The framing split is route-granular: the review leaf mounts `<IdeChrome>`; the
  obligations leaf serves the shell but renders outside `.ide`. A revert re-dormants
  `dossier` while leaving `ide-chrome` (and therefore `/p/:p/export`, the
  `/p/:p/import*` legs, and `/p/:p/run`) untouched.
- Pre-existing `integration`/privsep CI reds, if present on this branch, are inherited per
  GD-MAINT.4-1 — classified, not repaired.

## PR checks read (closeout)

Single `gh pr checks 152 --watch=false` read after the closeout-docs push:
**`typecheck / lint / unit — pending`** (the pipeline had just registered the one job at
stamp time — stronger than the "no checks reported" reads on #140–#150; recorded verbatim
rather than re-polled). Any `integration`/privsep red that reports later is inherited,
waived per GD-MAINT.4-1 — classified, not repaired.
