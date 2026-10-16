# SPA.28 — run ledger: override-machinery removal (REQ-SEQ-4's removal leg; LAST cleanup ticket)

- **Ticket:** `docs/tickets/139_SPA.28__override-machinery-removal.md` (manifest row 139)
- **Branch:** `stevevitali/spa-28-override-machinery-removal` — forked from
  `stevevitali/spa-27-ssr-deletion-wave` (the requested chain tip).
- **PR:** #161, opened at closeout against `stevevitali/spa-27-ssr-deletion-wave`;
  `gh pr checks --watch=false` read once at closeout (§ 7).
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** offline-only, $0 — no deploys, no production writes, mergePolicy OPERATOR.
- **Spend:** `paid:false` legs only; no metered spend ($0).

## 1 — What landed

- **`spa-flag.ts` + `spa-flag.test.ts` — deleted.** The whole per-request consult
  module (the flag-on set, the session re-check, `ssrOverrideRequested`, the
  `SPA_OVERRIDES` force-spa forms) is gone with the SSR documents it gated.
- **`server.ts` — the last consults removed.** `WebDeps.spa`, `deps.surfaces`,
  `deps.spaOverrides`, `spaShellResponse`, and the per-route `deps.spa(c, surface)`
  calls are deleted. Every authenticated SPA-space GET serves `spaShellDocument`
  unconditionally (SPA.27 made this true on the render side; SPA.28 removes the
  dead consult path itself). The ONLY request-path renderer decisions remaining
  are the permanent ones: `isPhoneRequest(c)` and `row.showcase === true` on the
  Page family (REQ-ED-12/REQ-VFY-5), public SSR, and server-owned redirects/auth
  gates — which still precede the shell on every route.
- **`?ssr=1`, `?renderer=spa`, `x-rhema-renderer` — inert request text.** No source
  consults them; the noscript no-JS floor no longer carries an `?ssr=1` escape link
  (it would loop back onto the same shell and lie — `spa-shell.ts`,
  `copy.ts`'s copy seam updated).
- **`contracts/src/spa.ts`** — `SPA_RENDERER_HEADER` and `parseSpaSurfaces` deleted;
  `SPA_SURFACES`/`SPA_IDE_FRAMED_SURFACES`/`SPA_DOCUMENT_ROUTES` retained as
  always-on vocabulary with a STAGE-FACT MIGRATION NOTE (the disposition the ticket
  offered — vocabulary kept, configuration removed).
- **Infra — the stage fact is gone.** `StageConfig.spaSurfaces` removed from
  `stages.ts`; `infra/pulumi/` drops the `rhema:spaSurfaces` config read, the
  `SPA_SURFACES` + `SPA_OVERRIDES` env emissions; `secrets-manifests.test.ts`,
  `compute.test.ts`, `stages.test.ts` retargeted to assert the retired names are
  absent from generated deploy config.
- **Journeys — the pin is retired loudly.** `--pin-renderer`/`JOURNEY_PIN_RENDERER`
  now refuse at the CLI with exit 2 (`cli.ts`); session/runner contexts carry no
  `extraHTTPHeaders` renderer injection (`session.ts`, `runner.ts`, `settle.ts`,
  `steps.ts`, `cli-flags.ts`, `surface-gates.ts`). `--expect-renderer`/`--surface`
  stay — the `data-renderer` markers remain contractually true (`spa` on every
  authenticated SPA-space document; `ssr` on public + forced-SSR Page arms).
  `registry.ts` T17's "SSR-pinned stages" clause re-spec'd — no SSR-pinned stage
  can exist post-wave.
- **`SsrHandoff` re-scoped.** It now covers only phone forced-SSR and server-owned
  redirects — there is no unflipped-surface flag case left.
- **`SsrHandoff`/boot/shape comments** across `spa/boot.ts`, `spa/states.tsx`,
  `spa/main.tsx`, `spa/dom.ts`, `spa/ide/chrome.tsx`, `main.ts`, `routes.tsx`,
  `pages.tsx` updated to name the permanent posture.
- **Test wave.** Every stale `?ssr=1` leg retargeted by intent (auth-redirect legs
  kept renderer-independent; desktop SSR-composition legs moved to
  `showcase: true` rows; phone legs keep the UA header): `page.test.ts`,
  `server.test.ts`, `chat-surfaces.test.ts`, `voice-surfaces.test.ts`,
  `versions-surface.test.ts`, `triage-surfaces.test.ts`, `ide-surfaces.test.tsx`,
  `asset-parity.test.ts`, `spa-shell.test.ts`.
- **Removal-detecting tests (the resurrection tripwires).** New
  `renderer-overrides.test.ts` — a source scan proves no non-test file consults
  `?ssr=1`, `?renderer=`, `x-rhema-renderer`, `SPA_OVERRIDES`, or `deps.spa`, plus
  behavioral legs asserting every signal converges on the shell;
  `spa-shell.test.ts` — inert-escape legs on flipped + deep-link routes and the
  anonymous-gate-stays-gated leg; `page.test.ts` — `?ssr=1`/`x-rhema-renderer: ssr`
  on a non-showcase row serves the shell; `spa.test.ts` — the contracts module
  carries no `SPA_RENDERER_HEADER`/`parseSpaSurfaces`; `compute.test.ts` /
  `stages.test.ts` — retired names absent from stage/deploy config;
  `cli-flags.test.ts`/`session.test.ts`/`runner.test.ts`/`settle.test.ts` — the
  retired flag refuses and no context injects renderer headers.
- **`check-spa-env.mjs`** keeps `SPA_SURFACES`/`SPA_OVERRIDES` on the banned-env
  list — the tripwire outlives the machinery (a bundle carrying either name is
  still a leak).

## 2 — AC accounting

- **Override machinery removed** — MET: all four channels deleted; the
  source-scan tripwire fails the moment any consult is resurrected.
- **`deps.spa` collapses to forced-SSR checks** — MET: the consult type itself is
  gone; `isPhoneRequest || showcase` are the only survivors.
- **`SPA_SURFACES`/`StageConfig.spaSurfaces` disposition recorded** — MET:
  vocabulary kept, configuration removed; migration notes on `spa.ts`,
  `stages.ts`, `compute.ts`, `index.ts`.
- **Journey `--expect-renderer`/`--surface` stay; override legs retire** — MET:
  flag validation + gates unchanged; `--pin-renderer` refuses; no context injects
  `x-rhema-renderer`.
- **Renderer-parity legs comparing deleted documents retired** — MET: parity
  blocks already fell at SPA.27; the override-pin legs fall here.
- **Deferred rollback/two-leg recipes updated honestly** — MET: dated
  2026-10-10 SPA.28 amendment notes on `D-SPA.23-1/-2`, `D-SPA.24-1/-2`,
  `D-SPAF.14-1/-3`, `D-SPA.25-1`, `D-SPA.26-1`, `D-SPA.27-1` (append-only —
  no row rewritten); `D-SPA.28-2` records the amendment set itself.
- **Removal-detecting tests** — MET: listed in § 1.
- **Phone/showcase + public + no-JS floor preserved** — MET: forced-SSR arms
  verbatim and asserted; noscript floor serves without the dead escape link.
- **Universal phase-gate AC** — MET: verification green; REQ ids stamped in
  `pr/SPA.28.md`; `D-SPA.28-1/-2` ledgered; BUILD_INDEX + LEDGER advanced; PR
  checks read once at closeout; append-only honored.

## 3 — Verify (all run this session)

- `pnpm turbo build lint typecheck` — **135/135 tasks** green.
- `pnpm test` — **5,549 pass / 6 skip / 0 fail** (487 files).
- `pnpm check:licenses` — OK (822 packages).
- `pnpm check:protocol-markers` — OK.
- `pnpm check:no-cookies` — OK (253 ingestion-surface files scanned).
- `pnpm check:spa-budget` — OK, all ceilings held (entry graph 201.5/250 kB).
- `pnpm check:spa-env` — OK (111 client sources, 146 emitted artifacts).
- `pnpm check:dom-contract` — **OK** (827 hooks across 18 surfaces, all
  emitted+asserted) — see § 4.1.
- Validators: build-memory + append-only — see § 6.

## 4 — Deviations / owned decisions

1. **Inherited-red `check:dom-contract` repaired honestly (§ 4.1).** SPA.27's
   closeout omitted the gate; it was red at fork (14 manifest hooks emitted but
   unasserted — real emitters, never phantom entries). Rather than leave it red or
   weaken the invariant, this run added the missing assertions where the emitted
   branches already exercised: `voices.dom.test.tsx` (`data-holdout-hidden`,
   `data-add-url`, `name=known/include/provider/handle`),
   `onboarding.dom.test.tsx` (`name=startVersion`), `billing.dom.test.tsx`
   (`data-past-due`, all four `data-trial-state` values), `run-sheet.dom.test.tsx`
   (`data-plan-offer`), `figures.dom.test.tsx` (`data-declined-note`),
   `dossier.dom.test.tsx` (`data-evidence-explainer`, `data-phone-chat` —
   new phone-width arm + `ChatPanelDto` fixture). Gate now green 18/18 surfaces.
2. **`--pin-renderer` refuses loudly rather than silently ignoring.** A retired
   flag that still parsed would let an operator believe an override existed; the
   exit-2 refusal names why (`cli.ts`).
3. **Retired env names stay banned in `check-spa-env.mjs`** — a client bundle
   embedding `SPA_SURFACES`/`SPA_OVERRIDES` is still a leak worth failing on.

## 5 — Deferrals

Opened: `D-SPA.28-1` — the REQ-SEQ-10 entry gate binds this row's merge+deploy
(same posture as D-SPA.26-1/D-SPA.27-1; `D-SPAF.14-4` names the cleanup wave);
`D-SPA.28-2` — the recipe-amendment record (DONE this run). Amended with dated
notes: `D-SPA.23-1/-2`, `D-SPA.24-1/-2`, `D-SPAF.14-1/-3`, `D-SPA.25-1`,
`D-SPA.26-1`, `D-SPA.27-1`. Closed: none. `D-OPS.1-1` / `D-MAINT.6-1` stay OPEN
unchanged (the `rhema-nonprod-resend-api-key` blocker remains the preview debt's
live prerequisite).

## 6 — Validators

- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` —
  **no violations (7 warnings, all pre-existing classes):** manifest banner/
  row-order advisories, the `nextTicket`-vs-`GATE-G2` note (G2 is
  operator-deferred), PHASE LOG >2 KiB entry budget (structural), legacy
  live-verification vocabulary in old BUILD_INDEX rows, pre-guard readouts, and
  old run ledgers lacking a Harness line (this ledger carries one).
- `node docs/build/tools/check-append-only.mjs --base 2100ad8` — **OK** (history
  only grew). Re-run post-closeout-commit to cover the artifact adds.

## 7 — PR checks read

`gh pr checks 161 --watch=false` (2026-10-10, on impl tip `dde21b1`) →
**"no checks reported on the 'stevevitali/spa-28-override-machinery-removal'
branch"** — the same first-read status as SPA.23's and PRs #140–#154 (checks
either report later or the branch's check suite hasn't registered at read time).
The inherited `integration`/privsep red, if it reports later, is waived per
GD-MAINT.4-1 (classified, not repaired).
