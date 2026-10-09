# SPAF.13 — prod flip: `run-report` (`STAGES.prod.spaSurfaces += "run-report"`)

Manifest row 132 · stacks on
`stevevitali/spa-22-surface-run-report` @ `5cd6ad3` · merge policy **OPERATOR** — do not
merge from the build environment · **$0** spend, no deploys, no production writes.

Implements `docs/tickets/132_SPAF.13__prod-flip-run-report.md` per
`docs/design/29_spa-migration-sequencing.md` (§per-flip procedure, F8/F11 rollback
semantics) and `docs/frontend-spa-spec.md` §11 (REQ-SEQ-10/11/12). **The thirteenth prod
surface flip** of the strangler migration — the point where `/p/:p/r/:runId` (the run
report — §14.5's cost/phase-breakdown surface carrying the live meter) starts serving
the React SPA on prod once the operator merges the chain and `pulumi up`s the deploy.
`run-report` is **IDE-framed** — it is in `SPA_IDE_FRAMED_SURFACES`, so `deps.spa`'s
key-level AND resolves `run-report ∧ ide-chrome`: `ide-chrome` has been flipped on prod
since SPAF.8, so this single-key append lights the leaf — the **fourth IDE-framed prod
activation** — and `/p/$project/r/$runId` (∈ `SPA_IDE_FRAMED_ROUTES`) mounts
`<IdeChrome>` (panes/palette/SSE feed). A flagged GET serves the shell and the SPA's
`/bff/p/:slug/r/:runId` twin performs the ONE shared `runReportComposition` — the
`?advanced=1` report read + the Timeline read + the Inbox run read-mark — verbatim, so
the two renderers read + log identically — plus the `ide.feed` live slice (replayed
rows + `lastSeq` + the same-origin events URL) so the leaf's live meter stays a **live
`EventSource` binding** on `/p/:p/r/:runId/events` (the ticket's explicit constraint —
the run progress + spend ticker never becomes JSON polling). That SSE endpoint is
itself a non-document proxy — session-gated (unauthed → 401 JSON), never
flag-consulted, serving identically on either renderer. The document's session gate is
not part of the renderer decision: unauthed hits keep answering a renderer-free 302
`/login` ahead of the consult. `/app/usage/r/:runId` is a server-owned redirect-only
GET (`surfaces: null`, REQ-BND-3) — a renderer-free 302 to `/p/<slug>/r/<runId>#report`
on either renderer. The steering POSTs (pause/resume/stop/cancel/note/walkthrough) and
the refund POST were never documents — `wantsJson`/`mutationOutcome` envelopes +
preserved refusal statuses + form 302s identical on either renderer.

## Requirement IDs

**REQ-SEQ-10 · REQ-SEQ-11 · REQ-SEQ-12 · REQ-VFY-8 (prod legs)**

## What lands (the whole diff)

- `infra/config/stages.ts`: `STAGES.prod.spaSurfaces` —
  `["usage","inbox","settings","voices","onboarding","project-home","billing","export","ide-chrome","outline","figures","run-sheet","dossier"]`
  → `[…,"ide-chrome","outline","figures","run-sheet","dossier","run-report"]` (flip
  order preserved — `run-report` appended after `dossier`; comment updated to name the
  thirteen flips, the SPAF.8 both-keys-out rollback note, the REQ-SEQ-10 nightly-green
  gate on the NEXT flip, the fourth-IDE-framed-activation semantics + the
  shared-composition note + the SSE live-meter binding note, and the standing
  session-gate/POST/SSE-endpoint notes).
- `infra/config/stages.test.ts`: the stage-fact pin updated — `prod` now asserts the
  fourteen-key list; `dev` unchanged
  `["usage","inbox","settings","voices","onboarding","ide-chrome","project-home","billing","export","outline","figures","run-sheet","dossier","run-report"]`
  (`run-report` rode SPA.22 on dev); `preview` stays `[]` (stack-config path unchanged).

That's it — **2 files, 26 insertions / 9 deletions** (the fact itself is one line;
comments carry the rest), inside the ~20-line budget's intent. Review scope check: the
diff touches only the prod stage fact + its test, exactly the AC1 envelope. No
generated config artifacts exist for this fact (`rhema:spaSurfaces` stack config is
never committed).

## Deploy mechanics (what this does once merged + `pulumi up`)

- Prod web env `SPA_SURFACES` becomes
  `"usage,inbox,settings,voices,onboarding,project-home,billing,export,ide-chrome,outline,figures,run-sheet,dossier,run-report"`
  (`compute.ts`: `args.spaSurfaces ?? cfg.spaSurfaces.join(",")` — no prod stack config
  overrides it).
- `deps.spa(c,"run-report")` flips true for `GET /p/:project/r/:runId` (`server.ts`
  ~5437, after the ~5435 session gate) — `run-report` ∈ `SPA_IDE_FRAMED_SURFACES`, so
  the consult is the key-level `run-report ∧ ide-chrome` AND (`spa-flag.ts` ~67);
  `ide-chrome` is already flipped, so the single-key append lights the leaf —
  `<IdeChrome>` mounted (`/p/$project/r/$runId` ∈ `SPA_IDE_FRAMED_ROUTES`,
  `contracts/src/spa.ts` ~69).
- A flagged hit serves the shell; the `/bff/p/:slug/r/:runId` twin performs the ONE
  shared `runReportComposition` (`server.ts` ~5404 — `?advanced=1` → `getRunReport`,
  Timeline best-effort, Inbox `markInboxRunRead` best-effort, missing report → the 404
  arm) and adds `ide.feed` — the live meter binds `useIdeFeed` → exactly one
  `EventSource` on `/p/:slug/r/:runId/events` resuming at `?after=<lastSeq>`;
  `usage.tick` patches progress/spend in place, non-ticks converge one debounced BFF
  reread. The events endpoint (`~5506`) is unchanged: session-gated (unauthed → 401
  `{error:unauthenticated}` JSON), an upstream `streamRunEvents` proxy honoring
  `?after`/`Last-Event-ID` — never a document, identical on either renderer.
- `?ssr=1` / `x-rhema-renderer: ssr` keep forcing SSR on **every** stage — the escape
  hatch is unaffected. `SPA_OVERRIDES` is emitted on non-prod kinds only, so prod can
  never be force-SPA'd per-request (REQ-SEQ-4).
- The steering POSTs (pause/resume/stop/cancel/note/walkthrough ~5592–5600) and the
  refund POST (~5606) were never documents: JSON callers get `mutationOutcome`/`bffFail`
  envelopes (`{ok,redirect}` + preserved refusal statuses), forms keep their
  302s/re-renders — identical on either renderer.
- **Rollback = revert this line + redeploy** — removes `run-report`: the AND's
  `run-report` leg goes false and `/p/:p/r/:runId` returns to SSR in one deploy while
  `ide-chrome` (and therefore `/p/:p/export`, the `/p/:p/import*` legs, `/p/:p/run`, and
  the dossier leaves) stays live. SSR serving was never deleted (REQ-SEQ-11/12,
  design/29 F8/F11). Recorded arm: `D-SPAF.13-3`.

## Verification

- `pnpm vitest run infra/config/stages.test.ts infra/pulumi/compute.test.ts` — **38/38
  pass** (stages 23, compute 15).
- `pnpm --filter @rhema/infra typecheck` / `lint` — clean.
- The pin is real: removing the key fails the exact-equality assert (order + membership).
- Consult positions verified in source: `/p/:project/r/:runId` session-gates ~5435 →
  consults `"run-report"` ~5437 (before the slug→row read + `runReportComposition`
  ~5404) — spec §4's fixed position. The AND-gate + framed-route membership verified in
  `spa-flag.ts`/`spa.ts`; the `/p/:p/r/:runId/events` SSE proxy verified session-gated +
  non-document (`~5506`); SPA.22's `run-report.dom.test.tsx` (15 tests incl. the
  one-EventSource + tick legs) pins the leaf's live-meter binding.

## Deferred live legs (operator-merge + deploy gated — DEFERRALS.md `## SPAF.13`)

| Row | Leg |
|---|---|
| D-SPAF.13-1 | `data-renderer="spa"` on `/p/:p/r/:runId` + the `?ssr=1` SSR escape + session-gate 302 precedence + **the SSE feed endpoint stays live** (`/p/:p/r/:runId/events` — unauthed → 401 JSON; session → `text/event-stream`) — curl recipes in the row |
| D-SPAF.13-2 | `rhema-journeys --stage prod --surface run-report --expect-renderer spa` green (`SURFACE_GATES["run-report"]` = `R6F` — expected:red pending its first live leg: a red miss reports `owed`, never gates; `weeklyHolds` R6/R9 stay out) |
| D-SPAF.13-3 | Rollback arm: revert + `pulumi up` → SSR on `/p/:p/r/:runId` in one deploy — `ide-chrome` stays flipped, only the AND's `run-report` leg goes false (recorded, not exercised destructively) |
| D-SPAF.13-4 | REQ-SEQ-10 — ≥1 nightly journey green on prod post-deploy before SPAF.14 (prod flip: `editor` — the LAST surface) opens; D-SPAF.1-4…D-SPAF.12-4 nightly-green preconditions restated as this flip's activation gate |

**Entry gate (orchestrator ruling, ledgered 2026-10-08T19:12Z):** REQ-SEQ-10's "≥1 nightly
green before the NEXT flip row" binds *activation order at merge/deploy time*, not PR
authoring — this PR is authored-dormant and must not be **deployed** until `dossier`'s
flip (D-SPAF.12-4) has baked ≥1 nightly green (which itself waits on `run-sheet`'s,
`figures`'s, `outline`'s, `export`+`ide-chrome`'s, `billing`'s, `project-home`'s,
`onboarding`'s, `voices`'s, `settings`'s, `inbox`'s, and `usage`'s, D-SPAF.11-4 →
D-SPAF.10-4 → D-SPAF.9-4 → D-SPAF.8-4 → D-SPAF.7-4 → D-SPAF.6-4 → D-SPAF.5-4 →
D-SPAF.4-4 → D-SPAF.3-4 → D-SPAF.2-4 → D-SPAF.1-4). Pacing is encoded in SPAREC.3's
integration plan.

## Notes

- Deployable dark / additive-only: the flag-∅ serving path is byte-identical; SSR tests
  untouched (REQ-SEQ-11/12).
- `mergePolicy: OPERATOR` — this PR stacks on the unmerged round-4 chain; the operator
  merges bottom-up. Prod deploy is operator-run per the contract.
