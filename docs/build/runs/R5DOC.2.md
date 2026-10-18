# R5DOC.2 — Agent-docs refresh (post-round-5) — run ledger

- **Spec:** `docs/tickets/175_R5DOC.2__agent-docs-refresh.md` (manifest row 175, round 5 —
  the LAST chain row, Kind: docs) — `implement-spec` + `agent-docs` (refresh mode, scope `.`)
- **Base:** `stevevitali/r5doc-1-repo-docs-refresh` tip @ `b139260`
- **Branch:** `stevevitali/r5doc-2-agent-docs-refresh` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high · **Skills:** implement-spec + agent-docs +
  build-memory @ `~/agent-skills`
- **Requirement ids stamped:** none — docs row
- **Live stage:** none · **Production mutations:** none — offline-only, $0, zero live
  contact; every claim verified against the tree (or prior committed build records)
- **Started:** 2026-10-18T06:56Z

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol — AGENTS.md). A docs-refresh ticket
unblocks no `OPEN` row (all live legs are merge/deploy- or human-gated). Opened: none
planned. Closed: none. Standing: `D-R5REC.1-1` (mount-settle flake, 3 occurrences) stays
OPEN — a test-harness leg for a future worker, out of a docs row's scope;
`GD-R5OPS.1-1` (~$150–300/night golden ruling) stays AWAITING — never answered here;
`GD-FUNDED.1-1` CARRY and `D-CAP.2-1` (funded wave carried, $0 spent) recorded, never
implied discharged.

## Requirements (from the contract's round-5 truth list)

1. **Delegated click interceptor (NAVC.1–NAVC.4, ADR-110, spec §14.18/§14.19 v1.2):**
   one `document`-level bubble-phase interceptor installed by `mountSpa` (never
   `createSpaRouter`); ordered guard pipeline + skip-list; `RELOAD_STUB_IDS` doc-nav
   arm; `SsrHandoff` → `replaceDocument` replace-mode; interception renderer-unconditional;
   push-only; NO intent-preload; `hashchange` compensation. → the "Frontend — the SPA
   hybrid" nav bullet (exists since R5REC.2 — converge + add the `hashchange` arm +
   `data-page-session`).
2. **Extended settle contract (NAVC.3):** `data-nav-count`, mounted-pending
   `data-mounted`, `data-page-session`; `settleClientNav`/`settleDocumentNav`;
   unconditional `documentLoads` counting → the journeys section's marker-vocabulary line.
3. **Funded-window regime (R5ECON.1–3, GATE-R5F, FUNDED.1):** `funded-window.mjs` 9-row
   fail-closed §5.5 checklist; `--headroom` covering summed `capUsd` (REQ-ECON-9);
   `CapOverrunError` per-leg enforcement + `funded-pause.json`; ordering T9 → launchers →
   riders → B19C last-and-conditional; `JOURNEY_FUNDED_STABLE_TAG` tenant + purge
   exemption; REQ-ECON-6 exclusions (`req_jrn_` seeds out of the pinned scope);
   `testCheapRoute` levered-expected caps with per-leg opt-outs (N6/R4/B19C full-tier).
   Exercised at bind 2026-10-16 and REFUSED ($80.86 ≥ ~$60) — CARRIED, $0; never imply
   the wave ran.
4. **Stream/V naming:** run ledgers + registry use stream ids (`V-1`/`V-2`/`V-3`,
   spec §9), live findings `F-<TICKET>-<n>`, gate decisions `GD-<TICKET>-<n>`,
   DEFERRALS carriers `D-<TICKET>-<n>`; journey leg ids family-prefixed
   (`N*`/`R*`/`T*`/`B*`/`P1.*`/`X1.*`/`C1`, `.sub` sub-assertions); nightly/`--paid`
   weekly cadence stays true.
5. **Preview conventions (VERIF.2):** `preview-stack.mjs` is the ONLY `pr-<n>`
   lifecycle path (verbs incl. `resend-pull`/`seed-invite`; prod refused on every
   verb; mutations need `rhema:owner=ops-preview`); `rhema-nonprod-resend-api-key`
   operator-seeded; journeys consume `--invite-code prv-<n>-test`; teardown =
   destroy → orphan enumeration → `rm` as three guarded acts.
6. **Check commands:** `pnpm check:*` list matches `package.json` — verified 6/6
   (licenses, protocol-markers, no-cookies, spa-budget, spa-env, dom-contract); none
   added this round.
7. **Stale classes:** `?ssr=1`/`x-rhema-renderer`/`--pin-renderer`/`SPA_OVERRIDES`/
   `SPA_SURFACES`-as-runtime stay described as deleted/contract-vocabulary only — the
   existing AGENTS.md already does this; keep it true. No MPA-era nav claims.

## Acceptance criteria

- [ ] AGENTS.md reflects the round-5 code + conventions (deterministic)
- [ ] CLAUDE.md stays `@AGENTS.md` (deterministic)
- [ ] Universal phase-gate AC (green gate, validators, ledger close)

## Plan

Single-file surgical refresh of root `AGENTS.md` (~150 changed-line budget, converge —
don't rewrite): (a) nav bullet += `hashchange` compensation + `data-page-session`;
(b) journeys section — `--paid`/`--headroom`/capUsd posture, extended marker vocabulary +
mechanism-pinned settles, leg/stream id grammar, NEW funded-window regime paragraph;
(c) Stages section — `pr-<n>` preview-stack conventions; (d) Build memory section — the
`D-*`/`GD-*`/`F-*`/`V-*` naming line. CLAUDE.md untouched (`@AGENTS.md` bridge).

## Test matrix

Docs row — verification is claim-verbatim-against-tree + the structural detector
(`check-agent-docs-freshness.sh .`) + the universal green gate.

## Progress

- 06:56Z — branch cut @ `b139260`; DEFERRALS read; drift detector run — 1 doc scanned,
  0 structural issues (this is a semantic/round-5-truth converge per the contract).
- Verified against code: `nav-intercept.ts` (pipeline verbatim, RELOAD_STUB_IDS,
  push-only), `main.tsx` (mountSpa installs), `head.tsx`/`render.tsx`/`spa-shell.ts`
  (`data-nav-count="0"` on EVERY served document; HeadManager ticks), `dom.ts`/`states.tsx`
  (`SsrHandoff`→`replaceDocument`), `ide/controller.ts:1120–1157` (hashchange
  compensation, REQ-NAVM-10), `page-mount.tsx:331` (`data-page-session`),
  `settle.ts:247/308` + `runner.ts:214–293` (`settleClientNav`/`settleDocumentNav`,
  unconditional `documentLoads`), `funded-window.mjs` (9-row checklist, `--headroom`,
  `CapOverrunError`, `JOURNEY_FUNDED_STABLE_TAG`, REQ-ECON-6 scope), `registry.ts`
  (`capUsd` ≥ $0.50 floor; `cogsLevers:{testCheapRoute:false}` on N6/R4/B19C),
  `cli.ts`/`cli-flags.ts` (`--paid` requires system DSN + `--headroom`; no-db attestation
  only for scheduled cron), `preview-stack.mjs` (verbs + `rhema:owner=ops-preview` +
  prod-refused + resend-pull/seed-invite runbook + destroy→orphans→rm),
  `journeys.yml` (nightly 06:05Z / Mon 04:35Z paid), `package.json` (6 check:* verbatim),
  registry id families + `.sub` sub-assertion suffix.

## Gap table

| item (contract) | required | achieved | status | evidence |
|---|---|---|---|---|
| 1. Delegated-interceptor nav paragraph | engineered | engineered | met | `AGENTS.md` "Client-side navigation is one delegated interceptor" bullet — `nav-intercept.ts` pipeline/skip-list/`RELOAD_STUB_IDS`, `mountSpa`-installed, renderer-unconditional, push-only, no intent-preload, `hashchange` compensation named |
| 2. Extended settle contract in journeys marker vocabulary | engineered | engineered | met | AGENTS.md journeys paragraph — `data-nav-count`/`data-mounted`/`data-page-session`, `settleClientNav`/`settleDocumentNav`, unconditional `documentLoads` |
| 3. Funded-window regime conventions | engineered | engineered | met | AGENTS.md new paragraph — `funded-window.mjs` 9-row fail-closed `--dry-run` checklist verbatim-ish, `--headroom`/`capUsd`/`CapOverrunError`/`funded-pause.json`, ordering, `JOURNEY_FUNDED_STABLE_TAG`, REQ-ECON-6/11; exercised-at-bind refusal recorded, wave carried (never implied ran) |
| 4. Stream/V + id naming | engineered | engineered | met | Build-memory id-grammar sentence (`D-*`/`GD-*`/`F-*`/`V-*`/`BL-*`) + journeys leg-family line; nightly/`--paid` weekly cadence kept |
| 5. Preview conventions (VERIF.2) | engineered | engineered | met | AGENTS.md Stages paragraph — `preview-stack.mjs` verb list, `rhema:owner=ops-preview` gate, prod-refused, `resend-pull`/`seed-invite`/`--invite-code prv-<n>-test`, destroy→orphans→`rm` teardown |
| 6. `pnpm check:*` list matches package.json | engineered | engineered | met | six `check:*` entries in Commands === `package.json` (none added in round 5) |
| 7. Stale classes stay flagged dead | engineered | engineered | met | `?ssr=1`/`x-rhema-renderer`/`--pin-renderer`/`SPA_OVERRIDES`/`SPA_SURFACES` retained as inert/contract-vocabulary-only text; no MPA-era nav claims introduced |
| AC: AGENTS.md round-5 truth + CLAUDE.md bridge | engineered | engineered | met | AGENTS.md +55/−10 (243 lines, ≤~250 root budget); CLAUDE.md untouched = `@AGENTS.md`; detector re-run 0 issues |
| AC: universal phase-gate | engineered | engineered | met | turbo 135/135 · pnpm test 501 files / 5,814 pass / 4 skip / 0 fail · six check:* green · check-build-memory 0 violations (9 pre-existing legacy warnings) · append-only vs b139260 OK |

## Evidence log

- Drift detector pre/post: `check-agent-docs-freshness.sh .` → 1 doc scanned, 0 issues
  (post-fix re-run clean; the `<stateDir>/funded-pause.json` placeholder phrasing satisfies
  the file-reference checker).
- `pnpm turbo build lint typecheck` → 135/135 (FULL TURBO).
- `pnpm test` → 501 files / 5,814 pass / 4 skip / 0 fail (354 s; the D-R5REC.1-1
  mount-settle flake did NOT recur this run).
- `pnpm check:licenses` (822 pkgs) · `check:protocol-markers` (248 files) ·
  `check:no-cookies` (257 files) · `check:spa-budget` · `check:spa-env` (115 src/146
  artifacts) · `check:dom-contract` — all OK.
- `check-build-memory.sh .` → 0 violations, 9 warnings (all pre-existing legacy classes:
  manifest banners, GATE-G3 cell, nextTicket-vs-unlanded, ledger budgets, index values,
  readout guard, harness headers on old ledgers).
- `node docs/build/tools/check-append-only.mjs --base b139260` → OK.
- **2026-10-18T09:27Z — head CI closeout.** Impl head `2a48660`: boundary pass, run
  39106538636, all five checks + stack #193–#172. Stamped head `6f9c610` (closeout
  records only): run 39110076578 attempt 1 went red on a CI flake —
  `apps/web/src/spa/figures.dom.test.tsx:435` `el()!.querySelector("form[data-propose-form]")!`
  raced the leaf mount (`TypeError: null.querySelector`; 5,802 pass / 16 skip / 1 fail)
  — the **D-R5REC.1-1/BL-87 mount-settle class in a sibling file** (fourth occurrence;
  dated note appended on the DEFERRALS row). `gh run rerun --failed`: attempt 2 green →
  boundary re-read **pass** — all five on `6f9c610`. Zero code delta vs `2a48660`.

## Evidence report

AGENTS.md converged on the round-5 truth with surgical edits only (structure/voice
preserved, +55/−10 ≈ 65 changed lines vs the ~150 budget):

- **Deferred-obligation/build-memory naming** — the shared id grammar
  (`D-<TICKET>-<n>` carriers, `GD-<TICKET>-<n>` gate decisions, `F-<TICKET>-<n>` live
  findings, `V-<n>` verification streams, `BL-<n>` backlog rows).
- **Nav bullet** — gains the `hashchange` compensation arm (REQ-NAVM-10,
  `spa/ide/controller.ts`) and `data-page-session` in the settle contract.
- **Journeys section** — REQ-ECON-8/9 paid-dispatch posture (system-role DSN +
  `--headroom`, cron no-db exception, `capUsd` ≥ $0.50 floor, `CapOverrunError`,
  `cogsLevers` opt-outs N6/R4/B19C); the NEW funded-window paragraph (the nine
  fail-closed §5.5 rows, ordering T9→launchers→riders→B19C-last, stable tenant +
  purge exemption, the 2026-10-16 exercised-at-bind refusal, carried standing —
  never implied ran); the extended marker vocabulary + mechanism-pinned settles +
  leg-family id grammar.
- **Stages section** — the `pr-<n>` preview-stack conventions (verbs, ownership tag,
  prod-refusal, Resend seed path, deterministic invite code, three-act teardown).

Nothing claims a round-4/5 surface is live; prod stays `ffbb8ad`-pre-chain; no secret
values written; `projectStatus` stays IN_PROGRESS (the operator's closure pass owns
DONE).
