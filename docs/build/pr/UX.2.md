# UX.2 — Layout & responsive: styled /app/new, contained pricing matrix, ≥44px phone targets, in-flow sync pill, axe WCAG 2.2 AA on every touched surface

Ticket: `docs/tickets/77_UX.2__layout-responsive.md` · run ledger: `docs/build/runs/UX.2.md`
Stacks on `stevevitali/ux-1-copy-ia-brand` (PR #98, `OPERATOR` merge policy).
**DO NOT MERGE.**

## Summary

> The reviewed desktop (1440×900) and phone (390×844) surfaces now hold their
> layout contract: `/app/new` is a real workspace surface (never an unstyled IDE
> shell), the pricing matrix scrolls inside a labelled keyboard region instead of
> pushing the page sideways, phone actions are button-like ≥44-px controls over a
> 24-px floor, the sync pill sits in flow where the editor mounts, and every
> touched surface passes an axe WCAG 2.2 AA scan — proven on production.

- **`/app/new` is a workspace surface (ADR-065).** `NewProjectPage` renders the
  workspace `Shell` (+ `PhoneBlockedNote` on compact UAs) — it no longer wraps
  project-less content in `IdeFrame`. `render.tsx` gained a document invariant:
  IDE CSS + the `ide.js` island emit when `PageData.ide` is set **or** rendered
  markup carries `data-ide="1"`, so a future route cannot silently ship `.ide`
  markup without its chrome.
- **Contained pricing matrix (ADR-066).** The comparison table keeps its natural
  ≥560-px width (row/column mapping intact) inside `<div class="table-scroll"
  role="region" aria-label … tabIndex={0}>` — the region scrolls; the page never
  does, at 390 px and 320 px.
- **Phone targets (ADR-067).** `.ide-actions` links render as button-like
  controls at ≥44 px; phonebar links, gate actions, decision options, the chat
  composer, compact chat thread links and starter chips join the ≥44-px floor;
  every other control ≥24 px (WCAG 2.5.8). §10.1's desktop-only set still never
  renders on phone.
- **Sync pill in flow (ADR-069).** `role="status"`/`aria-live`/`data-sync-pill`
  unchanged; the pill moved from fixed positioning into a flex row at the paper
  head — it can no longer cover body text, the composer, or the status bar.
- **axe WCAG 2.2 AA in the harness (ADR-068).** The journeys runner injects
  axe-core via CDP evaluation (the site's nonce-based CSP blocks `addScriptTag`),
  tags `wcag2a/2aa/21a/21aa/22aa`, per-surface labels. axe-core is dev/test-only
  — MPL-2.0 exception recorded in `licenses.exceptions.json`; 610 packages pass.
- **Faint tier is a text tier (ADR-070).** Live axe found `color-contrast` on the
  footer at 3.3:1 — `--shell-fg-faint` retuned to ≥4.5:1 on every ground
  (`#868d97`/`#646b74` shell, `#9a948a`/`#6d6659` paper) with AA-pinned contrast
  tests.

## Live-axe findings fixed across deploy iterations

Stage B ran three production iterations; each live P1 run surfaced real findings
that were fixed and redeployed:

| iter | deploy | axe/geometry finding | fix |
| --- | --- | --- | --- |
| ux2b | `993920c` (upd 132) | CSP blocked inline script injection | axe source evaluated via CDP |
| ux2b | `993920c` | `color-contrast` `footer > span` | faint-tier AA retune (ADR-070) |
| ux2c | `6723784` (upd 133) | `target-size` compact chat links | ≥44-px phone floor |
| ux2c | `6723784` | `aria-required-children` `role=tablist` ×`data-ide-desk-toggle` | × moved into `.ide-desk-head` |
| ux2c | `6723784` | `select-name` `ov_*` overrides + /app filters | `aria-label` on all 11 selects |

## Verification

- **Deterministic:** `turbo build lint typecheck` 135/135 · `pnpm test` 432 files
  / 4,279 pass · `check:licenses` 610 pass · protocol-markers pass ·
  `ide-surfaces.test.tsx` (9) pins every CSS/route seam incl. a route-enum
  regression that fails if `/app/new` ever renders `IdeFrame` again.
- **Stage B ($0):** Cloud Builds `ux2`/`ux2b`/`ux2c` → `pulumi up` updates
  132+133 (image updates + proxy-template rotation; no stateful replace/delete)
  → provenance PASS — api+web `/healthz` report
  `6723784c2a3b4aa449fc237c7aaddca254ab4f00` → `deployments` row
  `prod:6723784…` (`protocols_version 0.4.0+ec61156725a895ab`).
- **P1 flipped red→green on prod proof** — run `4ff89a27d950`: no horizontal
  overflow at 390/320 px on `//pricing/login` + project page + run sheet;
  matrix region scrolls + is Tab-reachable with a ≥2-px focus ring; ≥44-px
  primaries / ≥24-px floor hold; §10.1 set absent on phone; sync pill in-flow
  and disjoint from composer/status bar at 1440; axe WCAG 2.2 AA clean on every
  touched surface; zero console errors / failed requests. Evidence:
  `docs/build/reports/UX.2/` (report.json + `p1-pricing-390.png`,
  `p1-project-390.png`, `p1-pill-390.png`, `p1-runsheet-390.png`,
  `p1-app-new-1440.png`, `p1-pill-1440.png`).

## Deferrals

- None opened. `D-P1.19-2` annotated — the ≤768-px geometry legs it mapped onto
  P1 are proven green on prod; its interactive legs (gate actions, disposition
  post, chat send, email deep link on a real device) remain HUMAN.
- Known pre-existing gate notes (unchanged by UX.2): `check:no-cookies` fails on
  base-SHA cookie lines in `server.ts`; several pre-existing files report
  prettier `--check` warnings (not gate-enforced; new UX.2 files are clean).
