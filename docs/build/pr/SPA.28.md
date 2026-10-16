# SPA.28 — override-machinery removal: the migration-window controls are gone (LAST cleanup ticket)

Manifest row 139 · stacks on `stevevitali/spa-27-ssr-deletion-wave` @ `2100ad8` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend, no
deploys, no production writes.

Implements `docs/tickets/139_SPA.28__override-machinery-removal.md` per
`docs/frontend-spa-spec.md` §4/§10 — REQ-SEQ-4's removal leg.

**Requirement IDs:** REQ-SEQ-4 (removal leg) · REQ-SEQ-9 · REQ-ED-12/REQ-VFY-5
(the forced-SSR carve-out preserved) · REQ-BND-12 (the no-JS floor, escape link
dropped) · REQ-VFY-8 (`--expect-renderer`/`--surface` retained).

## What this does

- **`spa-flag.ts` + its test — deleted.** With SPA.27's SSR deletion there is no
  per-request consult left to run: every authenticated SPA-space GET serves
  `spaShellDocument` unconditionally. The ONE remaining request-path renderer
  decision is permanent — `isPhoneRequest(c)` or `row.showcase === true` on the
  Page family (REQ-ED-12) — plus public SSR and the server-owned redirects/auth
  gates that still precede the shell everywhere.
- **`?ssr=1`, `?renderer=spa`, `x-rhema-renderer`, `SPA_OVERRIDES` — removed, not
  just ignored.** `WebDeps.spa`/`deps.surfaces`/`deps.spaOverrides`,
  `spaShellResponse`, `SPA_RENDERER_HEADER`, and `parseSpaSurfaces` are all
  deleted; the params/headers are inert request text no source consults (a
  source-scan tripwire in `renderer-overrides.test.ts` fails if any consult is
  resurrected). The noscript floor drops its `?ssr=1` escape link — it would only
  loop back onto the same shell.
- **`SPA_SURFACES` disposition: vocabulary kept, configuration removed**
  (the ticket's offered alternative) — `StageConfig.spaSurfaces`,
  `rhema:spaSurfaces`, and the `SPA_SURFACES`/`SPA_OVERRIDES` env emissions are
  gone from `stages.ts`/`infra/pulumi/`; the surface list stays an always-on
  contract fact with a stage-fact migration note.
- **Journey harness: override-pin machinery retired, marker machinery kept.**
  `--pin-renderer`/`JOURNEY_PIN_RENDERER` refuse at the CLI (exit 2 — a flag that
  cannot change anything must not parse silently); session/runner contexts inject
  no `x-rhema-renderer`. `--expect-renderer`/`--surface` and the
  `data-renderer` markers remain contractual (`spa` on every authenticated
  SPA-space document; `ssr` on public + forced-SSR arms). T17's registry text
  re-spec'd — no SSR-pinned stage can exist.
- **`SsrHandoff` re-scoped** to phone forced-SSR + server-owned redirects — the
  unflipped-surface flag case is gone by construction.
- **Deferred recipes updated honestly (append-only).** Dated 2026-10-10 notes on
  the DEFERRALS rows that named the deleted controls: the `x-rhema-renderer` pin
  legs are inert, the `rhema:spaSurfaces`-drop rollback drills are moot (no flag,
  no fallback doc — `git revert` + redeploy is the only rollback), and the
  after-deploy `?ssr=1` curls read as inert-signal checks or run on the
  pre-cleanup tip. `D-SPA.28-2` records the amendment set.

## Verification (offline, all green)

`pnpm turbo build lint typecheck` **135/135** · `pnpm test` **5,549 pass / 6 skip /
0 fail** (487 files) · `check:licenses` OK (822) · `check:protocol-markers` OK ·
`check:no-cookies` OK (253 files) · `check:spa-budget` OK · `check:spa-env` OK ·
`check:dom-contract` OK — 827 hooks / 18 surfaces, all emitted+asserted (the gate
was red at fork — inherited from SPA.27's omitted check; repaired honestly with
assertions on the real emitted branches, never by weakening the manifest or the
checker).

Diff vs base: **+723 / −1,089 across 54 files** (incl. `spa-flag.ts` and its test
deleted outright).

## Deferred

`D-SPA.28-1` — the REQ-SEQ-10 entry gate (all flips merged + ≥1 nightly green
since the last flip) binds this row's merge+deploy, not its authoring (the
2026-10-08T19:12Z ruling; `D-SPAF.14-4` names SPA.28 in the cleanup wave). After
deploy: `?ssr=1`/`x-rhema-renderer` on any migrated surface serve the same shell
(inert, not an error); a phone-UA Page GET still serves SSR + `page.js`/`ide.js`.
No other live legs — every behavior is deterministic in-repo.
