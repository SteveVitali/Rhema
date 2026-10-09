# SPAF.13 — prod flip: `run-report` (run ledger)

- **Status:** DONE for the in-repo legs (PR diff + unit-level verification); the four
  post-deploy/live legs are **OPEN deferrals** (`D-SPAF.13-1`…`-4`) — they materialize
  only when the operator merges the chain + `pulumi up`s prod.
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a
  (build work)
- **Ticket:** `docs/tickets/132_SPAF.13__prod-flip-run-report.md` (manifest row 132)
- **Branch:** `stevevitali/spaf-13-prod-flip-run-report`, stacked on
  `stevevitali/spa-22-surface-run-report` @ `5cd6ad3` (`OPERATOR` merge policy,
  **not merged**).
- **PR:** #154 — opened at closeout; `gh pr checks --watch=false` read once at closeout
  (result recorded in § PR checks read below; inherited `integration`/privsep red, if
  it reports, is waived per GD-MAINT.4-1 — classified, not repaired).
- **Goal:** flip `run-report` to the SPA on prod — `STAGES.prod.spaSurfaces +=
  'run-report'` as the one-line stage-fact PR; the operator merges + `pulumi up`
  deploys; rollback = revert + redeploy.
- **Spend:** $0. No deploys, no production writes, no live legs. Preview legs not
  needed — this row's contract is the prod flip itself (the surface's
  two-leg/rollback evidence is D-SPA.22-1/-2's preview track, still OPEN behind the
  absent `rhema-nonprod-resend-api-key` operator secret — D-MAINT.6-1).

## 0 — Context load

- DEFERRALS.md read first (per AGENTS): no `OPEN` row is unblocked by this run —
  `D-SPA.22-1`, `D-SPA.22-2`, `D-OPS.1-1`, `D-MAINT.6-1` all still need their named
  operator prerequisites; the `D-SPAF.1-*` … `D-SPAF.12-*` rows stay OPEN (operator
  merge + deploy gated). None closed, four opened.
- LEDGER CURRENT STATE read: `nextTicket: SPAF.13`, `chainTip:
  stevevitali/spa-22-surface-run-report`, `mergePolicy: OPERATOR`, `round: 4`,
  `dispatchTarget: subagent`, `pinnedBaseSha: fab08ed`.
- **Entry gate (REQ-SEQ-10 + the 2026-10-08T19:12Z sequencing ruling):** the ticket's
  operating clause is "a nightly green since the PREVIOUS flip is this row's entry
  gate — pause if unmet" — `D-SPAF.12-4` names it (≥1 nightly green on prod after the
  `dossier` deploy). The orchestrator's ledgered ruling (PHASE LOG
  2026-10-08T19:12Z) interprets that gate as binding **activation order at
  merge/deploy time, not PR authoring**: with `mergePolicy: OPERATOR` and the whole
  stack unmerged, literal row-level gating would stall ~20 rows behind operator
  merges. This run therefore executes now as an **authored-dormant minimal PR**
  exactly as SPAF.1–SPAF.12 did — the stage-fact diff + unit pins land, every live
  leg is deferred with a verbatim verify recipe, and `D-SPAF.1-4`'s through
  `D-SPAF.12-4`'s nightly-green bakes are restated (in `D-SPAF.13-4`) as live
  preconditions for the operator's merge/deploy cadence of THIS flip. REQ-SEQ-10
  pacing is encoded in SPAREC.3's integration plan (merge bottom-up, deploy, bake ≥1
  nightly, next batch).
- **Sequencing reality:** the ticket's hard dependency is "the `run-report` surface
  ticket's PR merged + deployed (its code must be live)". PR #153 (SPA.22) is
  unmerged like the rest of the stack — but `mergePolicy: OPERATOR` stacks bottom-up,
  so SPA.1→…→SPA.22 land before this PR's deploy leg; the flip line is inert until
  the chain's code serves.
- **The consult shape (verified in source this run):**
  - `GET /p/:project/r/:runId` (`apps/web/src/server.ts` ~5433): session gate first
    (unauthed → 302 `/login` at ~5435), then
    `spaShellResponse(c, deps, "run-report", session)` at ~5437 — spec §4's fixed
    position, BEFORE the slug→row read (~5441) and the `runReportComposition` call
    (~5404/5443 — a missed slug or a run without a report still lands the document's
    own 404 arm on SSR).
  - `run-report` ∈ `SPA_IDE_FRAMED_SURFACES` (`packages/contracts/src/spa.ts` ~51 —
    the set is export/dossier/run-sheet/run-report/editor), so `deps.spa`'s
    key-level AND resolves `run-report ∧ ide-chrome` (`apps/web/src/spa-flag.ts`
    ~67) — `ide-chrome` has been in prod's list since SPAF.8, so the single-key
    append lights the leaf. This is the **fourth IDE-framed prod activation**
    (after SPAF.8's `export`, SPAF.11's `run-sheet`, and SPAF.12's `dossier`).
  - `/p/$project/r/$runId` ∈ `SPA_IDE_FRAMED_ROUTES` (`spa.ts` ~69): the report leaf
    mounts `<IdeChrome>` (panes/palette/feed).
  - A flagged hit serves the shell; the SPA's `/bff/p/:slug/r/:runId` twin performs
    the ONE shared `runReportComposition` (~5404) — `?advanced=1` →
    `getRunReport(session,runId,{advanced})`, the Timeline read best-effort, the
    Inbox `markInboxRunRead` read-receipt best-effort, missing report → the 404 arm
    — so the two renderers read + log identically. The twin additionally carries
    `ide.feed` (replayed rows + `lastSeq` + the same-origin `eventsUrl`,
    `density:"details"`), and the leaf's `useIdeFeed` binds exactly ONE
    `EventSource` to `/p/:slug/r/:runId/events?after=<lastSeq>` — **the SSE live
    meter is part of the surface's truthfulness** (the ticket's explicit
    constraint): `usage.tick` patches progress/spend in place, non-tick events
    converge one debounced BFF reread; it is a live binding, never JSON polling.
  - The feed endpoint itself — `GET /p/:project/r/:runId/events` (`server.ts`
    ~5506) — is a **non-document**: session-gated (unauthed → 401
    `{error:unauthenticated}` JSON, never a 302), slug→row → 404 JSON, then the
    upstream `streamRunEvents` proxy honoring `?after`/`Last-Event-ID` resume and
    answering `text/event-stream`. It is never flag-consulted and serves
    identically on either renderer — but the prod leg must still probe it stays
    live (a shell verdict on the document means nothing if the feed died). Its
    arms are already unit-covered in `server.test.ts` (session → upstream
    `streamRunEvents` with `?after`; upstream-down → 502; the twin's
    `ide.feed.eventsUrl`).
  - `/app/usage/r/:runId` (`server.ts` ~5495) is a server-owned redirect-only GET
    (`surfaces: null`, REQ-BND-3): session gate → `getRunReport` → renderer-free
    302 to `/p/<slug>/r/<runId>#report` on either renderer.
  - The run-report POSTs were never documents: the §6.5 steering POSTs
    (pause/resume/stop/cancel/note/walkthrough ~5592–5600) and the §14.4 refund
    POST (~5606) answer `mutationOutcome`/`wantsJson` envelopes (`{ok,redirect}` +
    `{error}` at preserved refusal statuses via `bffFail`) for JSON callers while
    forms keep their 302s/re-renders — identical on either renderer.
- Sources applied: `docs/design/29_spa-migration-sequencing.md` §per-flip procedure +
  §rollback semantics (design F8/F11); `docs/frontend-spa-spec.md` §11 REQ-SEQ-10/11/12
  + REQ-VFY-8; `infra/config/stages.ts` + `stages.test.ts` (the stage-fact
  convention); `infra/pulumi/compute.ts` (the `SPA_SURFACES` env wiring —
  `args.spaSurfaces ?? cfg.spaSurfaces.join(",")`); `apps/web/src/server.ts` (the
  run-report consult + `runReportComposition` + the events proxy + the
  steering/refund POSTs); `apps/web/src/spa-flag.ts` (the framed-key AND);
  `packages/contracts/src/spa.ts` (the framed/routed vocabulary + `surfaces:null`
  redirect rows); `packages/journeys/src/surface-gates.ts` + `registry.ts`
  (`SURFACE_GATES["run-report"]` = `R6F` — `expected:"red"`, `paid:false`;
  `weeklyHolds` `["R6","R9"]`).

## 1 — What landed (the whole diff)

### `infra/config/stages.ts` — the one-line stage fact (REQ-SEQ-10)

```diff
-    // … SPAF.11 — `run-sheet` joins them; SPAF.12 — `dossier` joins
-    // them (REQ-SEQ-10): each prod flip is a one-line stage-fact commit, operator-
-    // merged + `pulumi up`-deployed; rollback = … ≥ one nightly green on prod
-    // precedes the NEXT surface's prod flip. Order is flip order — never re-sort.
+    // … SPAF.12 — `dossier` joins them; SPAF.13 — `run-report` joins them
+    // (REQ-SEQ-10): each prod flip is a one-line stage-fact commit, operator-merged
+    // + `pulumi up`-deployed; rollback = … (unchanged) … never re-sort.
     // … SPAF.11 is the SECOND … SPAF.12 is the THIRD IDE-framed prod activation …
-    // `ide-chrome` alone still gates nothing else — run-report/editor stay
-    // unflipped.
+    // SPAF.13 is the FOURTH IDE-framed prod activation: `run-report` ∈
+    // SPA_IDE_FRAMED_SURFACES too, so the `/p/:p/r/:runId` consult ANDs `ide-chrome`
+    // — already flipped since SPAF.8 — and `/p/$project/r/$runId` (∈
+    // SPA_IDE_FRAMED_ROUTES) mounts the chrome. A flagged GET serves the shell and
+    // the `/bff/p/:slug/r/:runId` twin performs the ONE shared
+    // `runReportComposition` — the `?advanced=1` report read + the Timeline read +
+    // the Inbox read-receipt — so the two renderers read + log identically; the
+    // twin additionally carries `ide.feed` (replayed rows + lastSeq + the same-
+    // origin events URL), so the leaf's live meter stays a LIVE EventSource binding
+    // on `/p/:p/r/:runId/events` — that SSE endpoint is itself a non-document proxy
+    // (session-gated, never flag-consulted) serving identically on either renderer.
+    // `ide-chrome` alone still gates nothing else — editor stays unflipped.
-    // … + the two dossier GETs' session gates precede their consults the same way
-    // (unauthed → 302 /login); … + the dossier finding POSTs (…) stay
-    // server-validated envelopes/form redirects on either renderer — they were
-    // never documents.
+    // … + the run-report GET's session gate precedes its consult the same way
+    // (unauthed → 302 /login); … + the run-report steering POSTs
+    // (pause/resume/stop/cancel/note/walkthrough + refund) stay server-validated
+    // envelopes/form redirects on either renderer — they were never documents; the
+    // `/p/:p/r/:runId/events` SSE proxy isn't a document either — the live meter's
+    // feed stays live on either renderer.
-    spaSurfaces: […, "export", "ide-chrome", "outline", "figures", "run-sheet", "dossier"],
+    spaSurfaces: […, "export", "ide-chrome", "outline", "figures", "run-sheet", "dossier", "run-report"],
```

Effect at deploy time: the Pulumi program renders the prod web env
`SPA_SURFACES=usage,inbox,settings,voices,onboarding,project-home,billing,export,ide-chrome,outline,figures,run-sheet,dossier,run-report`
(`compute.ts` — no `rhema:spaSurfaces` stack config on prod, so the stage fact
wins). The web's consult then serves the SPA shell for `GET /p/:project/r/:runId` via
`deps.spa`'s key-level `run-report ∧ ide-chrome` AND — `ide-chrome` already flipped,
so `run-report`'s append is sufficient — and the `p.$project` layout mounts
`<IdeChrome>` on the leaf (`/p/$project/r/$runId` ∈ `SPA_IDE_FRAMED_ROUTES`). The
consult still sits behind its session gate (unauthed → 302 `/login`). `?ssr=1` /
`x-rhema-renderer: ssr` still force SSR on every stage, and `SPA_OVERRIDES` is emitted
**only** on non-prod kinds — prod keeps force-SSR-but-never-force-SPA (REQ-SEQ-4).
Flip order is preserved (`usage` … `dossier`, then `run-report` appended — the
ticket's `+= 'run-report'`). No generated config artifacts exist for this fact (the
stack config path is explicitly never committed).

### `infra/config/stages.test.ts` — the stage-fact pin, updated honestly

The `spa.surfaces` block now asserts `STAGES.prod.spaSurfaces ===
["usage","inbox","settings","voices","onboarding","project-home","billing","export","ide-chrome","outline","figures","run-sheet","dossier","run-report"]`
(the SPAF.1…SPAF.13 flips — `run-report` appended in flip order), `dev` stays
`["usage","inbox","settings","voices","onboarding","ide-chrome","project-home","billing","export","outline","figures","run-sheet","dossier","run-report"]`
(dev's own insertion order — `run-report` rode SPA.22 — unchanged), and `preview`
remains `[]` (stack-config override path unchanged). The vocabulary pin (every listed
key ∈ `SPA_SURFACES`) still holds.

**Nothing else** — no other source file touched. Diff stat: 2 files, 26 insertions /
9 deletions (comment lines dominate — the fact itself is one line, inside the
~20-line budget's intent). Review scope check: the PR diff touches only `stages.ts` +
its test — exactly the ticket's AC1 envelope.

## 2 — Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` → **38/38
  pass** (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` → clean (`tsc -b`).
- `pnpm --filter @rhema/infra lint` → clean (eslint).
- Stage-fact test is a real pin: reverting the stage line fails
  `expect(STAGES.prod.spaSurfaces).toEqual([…,"run-sheet","dossier","run-report"])`
  (exact-equality assertion — order + membership both bound).
- Consult-position check: `apps/web/src/server.ts` read this run —
  `/p/:project/r/:runId` session-gates at ~5435 then consults `"run-report"` at
  ~5437, before the slug→row read + `runReportComposition` (~5404/5443).
  `run-report` IS in `SPA_IDE_FRAMED_SURFACES` (`contracts/src/spa.ts` ~51) and
  `/p/$project/r/$runId` IS in `SPA_IDE_FRAMED_ROUTES` (~69): `deps.spa` resolves the
  key-level `run-report ∧ ide-chrome` AND (`spa-flag.ts` ~67 —
  `surfaces.has(surface) && (!IDE_FRAMED.has(surface) || surfaces.has("ide-chrome"))`),
  so `ide-chrome`'s SPAF.8 presence makes this a single-key flip that lights the leaf
  chrome-mounted. The `/p/:project/r/:runId/events` SSE proxy (~5506) verified
  session-gated + non-document (401 JSON unauthed; upstream `streamRunEvents` with
  `?after`/`Last-Event-ID`; `text/event-stream`). `/app/usage/r/:runId` (~5495)
  verified `surfaces:null` redirect-only (302 → `#report`). SPA.22's
  `run-report.dom.test.tsx` (15 tests) pins the leaf's chrome mount, the
  one-EventSource `ide.feed`→`useIdeFeed` binding + tick legs, and the
  SsrHandoff-no-BFF handoff; `server.test.ts` (116) pins the events endpoint's arms.
- Full-suite + public-safe checks ride CI (`typecheck/lint/unit` job); no SPA/bundle
  surface is touched by this row.

## 3 — Deferred live legs (all gated on operator merge + `pulumi up` prod)

| Row | Leg | Verify recipe |
|---|---|---|
| D-SPAF.13-1 | `data-renderer="spa"` on `/p/:p/r/:runId`; `?ssr=1` still SSR; session gate still 302 `/login` ahead of the consult; **the SSE feed endpoint stays live** | `curl -s https://rhema.tools/p/<slug>/r/<runId>` (session) `\| grep data-renderer` → `spa`; `…?ssr=1` → `ssr`; `curl -sI` (no cookie) → `302 /login`; `curl -sI …/events` (no cookie) → `401` JSON; `curl -sN …/events` (session, live run) → `text/event-stream` opens |
| D-SPAF.13-2 | `--expect-renderer spa` leg on prod | `rhema-journeys --stage prod --surface run-report --expect-renderer spa --expect-sha <deployed>` → exit 0 (`SURFACE_GATES["run-report"]` = `R6F` — `expected:"red"` pending its first live leg: a red miss reports `owed`, never gates; `weeklyHolds` R6/R9 stay out) |
| D-SPAF.13-3 | Rollback arm | `git revert <flip>` + `pulumi up` → `data-renderer="ssr"` on `/p/:p/r/:runId` in one deploy — `ide-chrome` stays flipped, only the AND's `run-report` leg goes false; the events proxy was never flag-consulted (recorded, not exercised destructively) |
| D-SPAF.13-4 | REQ-SEQ-10 nightly-green bake | next nightly `journeys.yml` green on prod before SPAF.14 (prod flip: `editor` — the LAST surface) opens; D-SPAF.1-4's through D-SPAF.12-4's nightly greens restated as this flip's merge/deploy preconditions |

All four appended to `docs/tickets/DEFERRALS.md` under `## SPAF.13` this run.

## 4 — Requirement IDs / AC status

- **REQ-SEQ-10** — separate minimal PR touching only `STAGES.prod.spaSurfaces`:
  SATISFIED in the diff. Operator-merge + `pulumi up` + nightly-green clauses:
  operator-gated / ledgered (D-SPAF.13-4, with D-SPAF.1-4's through D-SPAF.12-4's
  bakes restated as this flip's activation preconditions).
- **REQ-SEQ-11** — deployable dark: SATISFIED by construction (one config datum; SSR
  untouched; flag-∅ serving path identical on every other stage; rollback is the same
  line's revert).
- **REQ-SEQ-12** — mixed-mode coexistence: unchanged — the boot payload carries the
  effective flag set (the `/p/$project/r/$runId` routeId's `["run-report"]` verdict
  flips to `"spa"` with the deploy — server-ANDed with `ide-chrome` per REQ-SEQ-6;
  unflipped routes document-nav via `SsrHandoff`); the session gate keeps answering
  302s ahead of the renderer; the events endpoint never enters the document path.
- **REQ-VFY-8 (prod legs)** — DEFERRED to the deploy (D-SPAF.13-1/-2).
- AC layers: AC1 (diff touches only `stages.ts` + test) — **deterministic/engineered,
  DONE**; AC2–AC4 (post-deploy markers, `?ssr=1`, journey leg, rollback) —
  **live-executed, DEFERRED** per above; universal gate AC — docs/index/ledger
  advanced, checks read at closeout.

## 5 — Deviations / owned decisions

- None beyond the operator-sanctioned sequencing: the ticket's "PR merged + deployed"
  phrasing is executed as "PR opened; live legs ledgered" per `mergePolicy: OPERATOR`
  + the $0/no-prod-mutation constraint — and the "≥1 nightly green … entry gate"
  clause is applied to activation order per the 2026-10-08T19:12Z orchestrator ruling
  (ledgered; no ADR needed — no design change).
- This flip is a single-key append again (like SPAF.9–SPAF.12, unlike SPAF.8's pair)
  — and like SPAF.11/SPAF.12 it is an **IDE-framed activation** (the fourth): the
  append alone lights the leaf because `ide-chrome` already satisfies the AND's other
  leg. A revert re-dormants `run-report` while leaving `ide-chrome` (and therefore
  `/p/:p/export`, the `/p/:p/import*` legs, `/p/:p/run`, and the dossier leaves)
  untouched.
- **The SSE live meter got a prod-leg probe.** The ticket's AC names the marker +
  escape + journey legs; the worker's instruction adds the feed endpoint probe to
  D-SPAF.13-1 (the surface's truthfulness is the live binding, not just the document
  — `curl -sN …/events` (session) → `text/event-stream` opens; unauthed → 401 JSON).
  Recorded here as an owned decision: no code change, an extra verify arm inside the
  existing marker leg's envelope.
- Pre-existing `integration`/privsep CI reds, if present on this branch, are
  inherited per GD-MAINT.4-1 — classified, not repaired.

## PR checks read (closeout)

_To be recorded after the closeout-docs push — `gh pr checks 154 --watch=false`._
