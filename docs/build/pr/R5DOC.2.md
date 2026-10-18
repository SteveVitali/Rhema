# R5DOC.2 — Agent-docs refresh (post-round-5)

Stacked on `stevevitali/r5doc-1-repo-docs-refresh` · `mergePolicy: OPERATOR` —
**do not merge; the operator merges the chain bottom-up.** Offline-only docs row;
$0; no live stage; zero prod contact. `implement-spec
spec=docs/tickets/175_R5DOC.2__agent-docs-refresh.md` + `agent-docs` refresh mode
(scope `.`). Docs row — no REQ ids. **Manifest row 175 — the last chain row.**

## What

Root `AGENTS.md` converges on the round-5 code + conventions — surgical edits only,
structure/voice preserved, **+55/−10** (65 changed lines vs the ~150 budget; file now
243 lines, inside the ~250 monorepo-root budget). `CLAUDE.md` stays `@AGENTS.md`.

- **Build-memory section** — the shared id grammar the ledgers and run records use:
  DEFERRALS carriers `D-<TICKET>-<n>`, gate decisions `GD-<TICKET>-<n>`, live-found
  defects `F-<TICKET>-<n>`, verification streams `V-<n>` (post-spa spec §9), backlog
  rows `BL-<n>`.
- **"Client-side navigation" bullet (NAVC.1–NAVC.4, ADR-110)** — kept verbatim-true;
  extended with the `hashchange` compensation arm (native fragment hops the router
  never sees → the IDE controller's `hashchange` listener, `spa/ide/controller.ts`,
  REQ-NAVM-10) and `data-page-session` in the settle contract.
- **Browser journeys section** —
  - the `--paid` paragraph now carries the REQ-ECON-8/9 posture: every paid dispatch
    declares `--headroom <legCapUsd>` (cron's standing bound $3); operator dispatch
    additionally requires the **system-role** `JOURNEY_DATABASE_URL` (only the
    scheduled cron may attest no-db); `capUsd` ≥ $0.50 on every paid row +
    `CapOverrunError` leg-close (REQ-ECON-7); `cogsLevers` model-judgment opt-outs
    (N6/R4/B19C pin `testCheapRoute:false`); cron times named.
  - NEW funded-window paragraph (`scripts/live/funded-window.mjs`, R5ECON.1–3): the
    nine fail-closed §5.5 `--dry-run` checklist rows — system-role DSN → pinned-scope
    cumulative (flagged-tenant proxy rows, `req_jrn_` seeds excluded, REQ-ECON-6) <
    re-authorized `FUNDED_WINDOW_CAP_USD` (~$60) → `--headroom` covering summed
    `capUsd` → per-leg `CapOverrunError` → T9→launchers→riders→B19C-last ordering →
    `JOURNEY_FUNDED_STABLE_TAG` purge-exempt tenant (`funded-tenant.mjs`) →
    REQ-ECON-6 exclusions → REQ-ECON-11 opt-outs → unpaused — plus the
    `cap_overrun` → `<stateDir>/funded-pause.json` window pause. Recorded honestly:
    exercised at bind 2026-10-16 and **refused** ($80.86 ≥ ~$60, zero legs, $0) —
    the wave stays carried (GD-FUNDED.1-1 / D-CAP.2-1), never implied ran.
  - the marker-vocabulary line extended: `data-renderer` / `data-route` /
    `data-mounted` / `data-nav-count` / `data-page-session` + the mechanism-pinned
    settles `settleClientNav`/`settleDocumentNav` reading the runner's unconditional
    `documentLoads` same-origin response counter; leg ids family-prefixed
    (`N*`/`R*`/`T*`/`B*`/`P1.*`/`X1.*`/`C1`, `.sub` sub-assertions).
- **Stages section** — the `pr-<n>` preview-stack conventions (OPS.1 + MAINT.6 +
  VERIF.2): `scripts/live/preview-stack.mjs` is the ONE lifecycle path (verbs
  `init`/`select`/`output`/`config`/`resend-pull`/`preview`/`up`/`refresh`/
  `seed-invite`/`destroy`/`rm`; `prod` refused on every verb incl. reads; mutations
  need `rhema:owner=ops-preview`); the session-capable recipe — `resend-pull` pipes
  the operator-seeded `rhema-nonprod-resend-api-key` into `rhema:resendApiKey`
  (stdin, never printed), `seed-invite` mints the deterministic `prv-<n>-test`,
  journeys consume `--invite-code`; teardown = `destroy` → zero-orphan enumeration →
  `rm` as three guarded acts.

## Evidence

| Claim | Proof |
|---|---|
| Every new claim verified against the tree | `nav-intercept.ts` (ordered pipeline verbatim, `RELOAD_STUB_IDS`, push-only) · `main.tsx:88` (`mountSpa` installs) · `render.tsx:86`/`spa-shell.ts:217`/`head.tsx:51–59` (`data-nav-count="0"` every document + committed-transition ticks) · `dom.ts`/`states.tsx` (`SsrHandoff`→`replaceDocument`) · `ide/controller.ts:1120–1157` (`hashchange` compensation) · `page-mount.tsx:331` + `dom-contract.ts:1345` (`data-page-session`) · `settle.ts:247/308` + `runner.ts:214–293` (`settleClientNav`/`settleDocumentNav`, unconditional `documentLoads`) · `funded-window.mjs` header + `windowChecklist` (the 9 §5.5 rows) · `registry.ts` (`capUsd` floor, `cogsLevers` pins on N6/R4/B19C, id families) · `cli.ts`/`cli-flags.ts` (`--headroom` + system-DSN preflight, cron exception) · `preview-stack.mjs` (verb table, `OWNER_TAG`, prod refusal, resend/seed runbook, three-act teardown) · `journeys.yml` (cron 06:05Z / Mon 04:35Z, `--paid --headroom 3`) · `package.json` (six `check:*` verbatim — none added) |
| No stale machinery presented live | `?ssr=1`/`x-rhema-renderer`/`--pin-renderer`/`SPA_OVERRIDES`/`SPA_SURFACES` stay described as deleted/contract-vocabulary only (pre-existing, kept true); no MPA-era nav claims |
| Funded wave never implied ran | AGENTS.md records the 2026-10-16 exercised-at-bind refusal + CARRY verbatim |
| `pnpm turbo build lint typecheck` | 135/135 (FULL TURBO) |
| `pnpm test` | 501 files / **5,814 pass / 4 skip / 0 fail** — the `D-R5REC.1-1` mount-settle flake did NOT recur |
| Six `check:*` | licenses 822 pkgs · protocol-markers 248 files · no-cookies 257 files · spa-budget ceilings held · spa-env clean · dom-contract OK |
| `check-agent-docs-freshness.sh .` | 1 doc scanned, **0 issues** |
| `check-build-memory.sh .` | 0 violations, 9 warnings (all pre-existing legacy classes) |
| `check-append-only.mjs --base b139260` | OK — history only grew |

## Acceptance criteria

- [x] AGENTS.md reflects the round-5 code + conventions (deterministic — every claim
  cited to source this run)
- [x] CLAUDE.md stays `@AGENTS.md` (untouched)
- [x] Universal phase-gate AC — green gate + validators above

## Deferrals

None opened · none closed — a docs row unblocks no live/deploy-gated row.
`D-R5REC.1-1` stays OPEN (mount-settle flake — test-harness leg for a future worker);
`GD-R5OPS.1-1` stays AWAITING; `GD-FUNDED.1-1` CARRY stands.

## Live / spend

None — offline docs pass, $0, zero prod contact. Prod stays `ffbb8ad`-pre-chain; the
doc claims landed code only.
