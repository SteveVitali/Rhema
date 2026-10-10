# SPADOC.2 — agent docs refresh, SPA era (run ledger)

- **Spec:** `docs/tickets/148_SPADOC.2__agent-docs-refresh.md` (manifest row 148, round-4 tail —
  the last chain row)
- **Base:** `stevevitali/spadoc-1-repo-docs-refresh` @ `930778b` (chain tip, confirmed clean +
  synced at fork — `git log -1` = `930778b`)
- **Branch:** `stevevitali/spadoc-2-agent-docs-refresh` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-cli subagent (Cognition agentic coding CLI)
- **Skills:** agent-docs @ `~/agent-skills` (refresh mode, scope `.`)
- **Requirement ids stamped:** none — process/capstone row (the ticket names none; the SPA REQ
  ids are audited by SPACAP.1's matrix)
- **Started:** 2026-10-10 · **Closed:** 2026-10-10
- **Config:** docs-only; **Live stage: none**; metered spend **$0**; zero prod writes, zero
  deploys, zero merges

## What this run did

Ran `agent-docs` refresh mode on scope `.` against the composed build at `930778b` (rounds 0–4,
PRs #1–#168 open). The repo's agent-facing doc surface is the root `AGENTS.md` (186 lines after
this run — inside the ~250-line root budget); `CLAUDE.md` is the one-line `@AGENTS.md` bridge
created by DOC.2 — correct as-is, unchanged (one source of truth, shared across harnesses).

### Phase 0 — detector

`check-agent-docs-freshness.sh .` → **1 doc scanned, 0 issues, exit 0** (DOC.2's upstream
detector fixes still hold — `docs/build/` indexed, `.claude/` excluded). No structural drift:
the doc's staleness was *semantic*, not broken refs — it never described the frontend at all,
so every round-4 claim it needed was absent rather than wrong.

### AGENTS.md — drift fixed

- **Commands:** `pnpm check:dom-contract` was missing from the canonical gate list (SPADOC.1
  had flagged the same gap class for `apps/web/README`). Added — it runs in CI's
  `typecheck/lint/unit` job (`.github/workflows/ci.yml:46`) and exists at `package.json:25`.
  `check:spa-env` was already listed (SPA.8 added it); all six `check:*` rows now match
  `package.json` 1:1.

### AGENTS.md — section added (the SPA era; every bullet verified against code)

New **"Frontend — the SPA hybrid (round 4; ADR-106/107/108)"** section (~55 lines, structured
bullets per the authoring guidelines):

- **Hybrid + honesty clause:** Hono SSR host + Vite/TanStack SPA + same-origin BFF; React
  Router is the server-side manifest/match library only, never shipped (ADR-106 verbatim).
  **Authored vs activated:** prod still serves pre-chain ancestors (`6ebb1cb`/`0acd16d`);
  live posture changes only through the operator's §R4 activation — never claim a round-4
  surface live without `check-deploy-provenance` green.
- **Renderer split:** `SPA_PUBLIC_ROUTES` (6 public docs, SSR forever) vs unconditional
  `spaShellDocument` on every other authenticated document GET (`apps/web/src/spa-shell.ts`);
  `SPA_DOCUMENT_ROUTES` census — `surfaces: null` rows are server-owned redirect GETs,
  registered in the client tree as `reloadDocument` stubs (verified: `p.$project.edit.$draftId`,
  `p.$project.f.$fid`, `app.usage.r.$runId`, `settings` throw `redirect({reloadDocument:true})`;
  `SpaNotFound` consults `spaRouteFor` → `SsrHandoff`).
- **Flag machinery dead (SPA.27/28):** `?ssr=1`, `?renderer=spa`, `x-rhema-renderer`,
  `SPA_OVERRIDES`, `SPA_SURFACES` env, `rhema:spaSurfaces` — inert/removed;
  `renderer-overrides.test.ts` + `check:spa-env` are the resurrection tripwires (verified:
  `check-spa-env.mjs` keeps both retired env names banned; `cli.ts` `--pin-renderer` refuses
  exit 2). `SPA_SURFACES`/`SPA_IDE_FRAMED_*`/`SPA_DOCUMENT_ROUTES` survive as vocabulary only
  (`packages/contracts/src/spa.ts` STAGE-FACT MIGRATION NOTE, verbatim).
- **Forced-SSR is code (REQ-ED-12, ADR-108):** five Page-family GETs serve SSR on
  `isPhoneRequest(c) || row.showcase === true` (5 verbatim arms in `server.ts`); boot map owns
  the phone leg, the BFF twin's `project.showcase` owns the showcase leg; leaves consult
  `twinForcesSsr` (`spa/states.tsx:66`) → `SsrHandoff` → `navigateDocument` (`spa/dom.ts:18` —
  the one document-nav seam). Boundary rule intact: `/logout`, external hand-offs, binaries →
  document navigations.
- **Transport:** `bffFetch` (`spa/bff.ts`) is the ONE JSON transport — same-origin `/…` only,
  `credentials:"same-origin"`, no client POST retries, `BffError{status,code,detail?,requestId}`,
  401 → `/login` document nav. Typed `/bff/*` twins for reads; writes dual-mode: JSON callers
  get `{ok:true, redirect?, flash?, data?, pending?, url?}` (`url` = allowlist-validated
  external only — `externalNavTarget`); form posts get the verbatim 302+flash URL (no-JS
  equivalence); failures `{error:"<stable_code>", detail?}` at preserved status, a JSON caller
  never gets a redirect; stale-state 400/404/409 = re-read → invalidate Query keys.
- **Query conventions (REQ-FW-7):** loaders `ensureQueryData` + endpoint-verbatim keys +
  `defaultPreloadStaleTime: 0` (`spa/main.tsx:55`); leaves `useQuery` + `SurfaceShell`, not
  `useSuspenseQuery`.
- **DOM contract:** `apps/web/src/dom-contract.ts` (1,561 lines) is the committed selector
  manifest; `check:dom-contract` enforces journeys ⊆ manifest ⊆ emitted ⊆ asserted — never
  invent an undeclared `data-*` hook.
- **Component tests:** `*.dom.test.tsx` → happy-dom + Testing Library + `axe-core`
  (`apps/web/vitest.config.ts` `environmentMatchGlobs` + `test-setup.ts`; deps verified in
  `apps/web/package.json`); layout-dependent axe rules off, journey-level axe is the deferred
  authoritative tier.
- **Permanent islands (ADR-107):** `CLIENT_ENTRIES = ["ide","page","landing"]`
  (`client-entries.mjs`); `page.js`/`ide.js` mount forever on the forced-SSR family +
  SSR-framed IDE docs; `outline` SPA.26 / `editor` SPA.24 retired; removal rule = an entry
  leaves only when nothing served can mount it (a `page`/`ide` removal is a REQ-ED-12 design
  change, not cleanup).
- **Source mode (SPA.25, REQ-ED-17):** `spa/page-source-mode.ts` CodeMirror 6 via `import()`
  (async `codemirror` group; plain-text — `@codemirror/lang-markdown` broke the REQ-SAFE-7
  ceiling); commits through `applySourceMarkdown` (`packages/editor/src/source-mode.ts`,
  three-way top-level-block merge); PM view stays mounted+dispatching inside `data-pm-host`.
- **Rollback = `git revert` + redeploy** — no flag exists to flip (spec §14.4).

### AGENTS.md — journeys section extended (round-4 CLI surface)

Added after the `--paid`/`JOURNEY_DATABASE_URL` paragraph: `--surface <key[,key…]>` (the
`SURFACE_GATES` subset), `--expect-renderer <ssr|spa>` (asserts `data-renderer` — `spa` on
every authenticated SPA-space document, `ssr` on public + forced-SSR arms), `--invite-code`
(env `RHEMA_INVITE_CODE`, MAINT.6), and the `--pin-renderer`/`JOURNEY_PIN_RENDERER` retirement
(exit 2 — verified `cli.ts:71-73`). The `data-renderer`/`data-mounted`/`data-route` marker
vocabulary recorded as the settle + renderer contract, true on both renderers.

### Phase 2 — shared tail

- **Validation re-run:** `check-agent-docs-freshness.sh .` → **0 issues, exit 0**.
- **Consistency sweep:** the one doc re-read end-to-end — Commands rows ↔ `package.json`,
  CI order ↔ `ci.yml`, stage facts ↔ `stages.ts`, journeys CLI ↔ `cli.ts`, every cited path +
  symbol verified (`bff.ts`, `bff.ts`'s `MutationEnvelope`, `states.tsx`, `dom.ts`,
  `main.tsx`, `dom-contract.ts`, `vitest.config.ts`, `client-entries.mjs`,
  `contracts/src/spa.ts`, `editor/src/source-mode.ts`, `page-source-mode.ts`,
  `check-deploy-provenance.mjs`, `renderer-overrides`/`cli-flags` tripwires). No
  contradictions.
- **CLAUDE.md bridge:** already exists (`@AGENTS.md`) — correct; unchanged.
- **Coverage gaps / line-count drift / key-file tables:** none — the doc carries no `~N
  lines` claims and no Key Files table; every package dir is covered under the root doc.

## Verification

- `check-agent-docs-freshness.sh .` — **0 issues, exit 0** (deterministic AC).
- `pnpm turbo build lint typecheck` — **135/135** (FULL TURBO; docs-only).
- `pnpm test` — **487 files, 5,562 pass / 6 skip / 0 fail**.
- All six `check:*` green — licenses 822 · protocol-markers 248 · no-cookies 253 ·
  spa-budget (all ceilings held) · spa-env (111 sources / 146 artifacts; retired env names
  still banned) · dom-contract (journeys ⊆ manifest ⊆ emitted+asserted).
- `node docs/build/tools/check-append-only.mjs --base 930778b` — **OK**.
- `check-build-memory.sh .` — 0 violations; the standing pre-existing-class warnings only.
- Canonical vocabulary held in new copy (surface/leaf/twin/envelope are the spec's own words;
  no banned strings introduced).
- `gh pr checks --watch=false` read once at closeout on PR #169 — `typecheck / lint / unit`
  **pending** (CI registered, in flight; the recurring first-read class). No
  `integration`/privsep red reported; if it reports later it is the GD-MAINT.4-1 waived class.

## Deferrals

- No DEFERRALS row unblocked or closed by this ticket; none opened — docs-only; every owed leg
  still needs a deploy, an operator act, or a funded window (rows homed on BL-80/81/82).
  This run was the last manifest row: `nextTicket: DONE` per the DOC.2 end-of-chain convention
  (`projectStatus` stays `IN_PROGRESS` — open rows remain ledgered; per `OPERATIONAL_READINESS`
  critical-path step 10, `DONE` requires every open row to carry a landed disposition).

## Evidence

- `git diff 930778b -- AGENTS.md` — +65 lines: `check:dom-contract` Commands row; the
  "Frontend — the SPA hybrid" section; the round-4 journeys CLI paragraph.
- Detector before + after: 0 issues both runs (the drift was semantic absence, not broken refs).
- No code changed; the deterministic gate suite re-run anyway per the ticket's green-gate AC —
  all green above.
