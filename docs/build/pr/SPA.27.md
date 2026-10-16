# SPA.27 — SSR deletion wave: flipped auth'd surfaces serve the shell; the consult's flag-on set is universal

Manifest row 138 · stacks on `stevevitali/spa-26-island-retirement` @ `b90b3aa` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend, no
deploys, no production writes.

Implements `docs/tickets/138_SPA.27__ssr-deletion-wave.md` per
`docs/frontend-spa-spec.md` §4/§10/§12.3, and the disposition map in
`docs/research/04_test-surface-audit.md`.

**Requirement IDs:** REQ-TST-1 · REQ-TST-6 · REQ-TST-9 · REQ-BND-1 · REQ-SEQ-11
(conclusion — REQ-ED-12's forced-SSR carve-out preserved).

## What this does

- **`server.ts` — every flipped surface's SSR render branch is deleted.** The 14
  migrated authenticated surfaces (`/app`, `/app/inbox`, `/app/new`, import, run,
  review, run-report, outline + promote, figures ×2, visualize, obligations/new,
  project settings, export, voices ×3 + reseed, the settings leaves, usage ×2,
  billing, dossier leg) now serve `spaShellDocument` unconditionally — per-route
  comments stamp the deletion. Form-mode POST failures redirect back to the sheet URL
  instead of re-rendering a deleted document; transport, mutation, and redirect
  semantics are unchanged.
- **The ONE surviving SSR arm is by design.** The Page family's forced-SSR path —
  `isPhoneRequest(c) || row.showcase === true || ssrOverrideRequested(c)`
  (`server.ts:3929`, plus the per-route arms on `/v/:v`, `/v/:n/diff/:m`,
  `/a/:artifactId`, `/revisions/:cid`) — renders the read-only Page document forever
  (REQ-ED-12/REQ-VFY-5), mounting `page.js` + `ide.js` per ADR-107. Public funnel,
  login, invite, and not-found SSR untouched (REQ-BND-1).
- **`pages.tsx` — −3,962 lines.** Every flipped surface's SSR subtree deleted; only
  `InvitePage`, `LoginPage`, `ProjectPage`, `NotFoundPage`, `RevisionPage`,
  `ComparePage`, `PagePage`/`PageSurface`, `IdeFrame`, `PhoneBlockedNote` remain.
- **`routes.tsx` — flipped rows carry `element: null` (`SPA_ONLY`).** A comment pins
  the semantics: re-adding an element restores no render — handlers no longer render
  elements on flipped rows at all.
- **`spa-flag.ts` — the consult's leg (c) is unconditional.** The flag-on set IS the
  whole authenticated document set; REQ-SEQ-2's IDE-framed AND-gate is vacuous. The
  session gate, `?ssr=1`/`x-rhema-renderer: ssr`, and `SPA_OVERRIDES` machinery are
  preserved verbatim for SPA.28; `ssrOverrideRequested` is factored out so the Page
  forced-SSR arm honors the same signals.
- **Tests migrated per the disposition map (REQ-TST-1/6/9).** HTML-string asserts on
  deleted documents are retired or ported to `/bff/...` payload, shell/boot, redirect,
  and mutation contracts across 25+ suites; obsolete SSR↔SPA parity blocks removed
  from 14 dom suites (the SSR premise no longer exists). Removal-detecting pins land:
  flag-off still serves the shell on a flipped surface (`spa-shell.test.ts`), flipped
  rows are `element: null` (`ide-surfaces.test.tsx`), a resurrected manifest element
  fails (`routes.test.ts`), retired bundles 404 (`asset-parity.test.ts`), and the
  phone contract distinguishes shell+`deviceClass` boot from true forced-SSR Page
  (`inbox-phone.test.ts`).

## Verification (offline, all green)

`pnpm turbo build lint typecheck` **135/135** · `pnpm test` **5,554 pass / 6 skip /
0 fail** (487 files) · `check:licenses` OK (822) · `check:protocol-markers` OK ·
`check:no-cookies` OK (253 files) · `check:spa-budget` OK · `check:spa-env` OK ·
build-memory + append-only validators green.

Diff vs base: **+1,800 / −8,275 across 42 files** — deletion-dominated as required;
over the ~4,000-line planning estimate because the ~300 HTML-string test legs were
ported to live BFF/shell contracts rather than dropped wholesale (coverage did not
silently drop — REQ-TST-6's intent).

## Deferred

`D-SPA.27-1` — the REQ-SEQ-10 entry gate (all flips merged + ≥1 nightly green since
the last flip) binds this row's merge+deploy, not its authoring (the
2026-10-08T19:12Z ruling; `D-SPAF.14-4` names SPA.27 in the cleanup wave). No live
legs — every behavior is deterministic in-repo.
