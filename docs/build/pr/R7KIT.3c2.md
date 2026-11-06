## R7KIT.3c2 — migrate outline + figures surfaces to `@rhema/ui` primitives

**Ticket:** `docs/tickets/242_R7KIT.3c2__migrate-outline-figures.md` (row 242 of 254)
**Requirements stamped:** REQ-KIT-3 (batch c2), REQ-KIT-5 (allowance), REQ-GUARD-1 (batch-c2 enablement). Findings: RV-23, UXC-16, UXC-32, S-7, P4-21.
**Spend:** **$0 — Stage A only** (`GD-PREVIEW.R7`: no per-ticket preview; Stage-B evidence is owned by `250_R7DEP.2`). No preview, no production mutation, no run launched, no paid inference.

### What changed

**Migrations (batch c2):**

- `apps/web/src/spa/surfaces/outline.tsx` — save → `Button variant="primary"` (the hand-declared accent-primary literal is gone), delete → `Button variant="danger" size="sm"`, promote submit → `Button variant="primary"`, slug field → `TextField` (inside `.ui-vc-lab`), the promote sheet's `scope`/`threadId`/`turnId` hidden carriers → the exempted `HiddenField` (RV-36). Every `data-*` hook (`data-outline-editor`, `data-autosave-status`, `data-outline-delete`, `data-promotion-*`, `data-notice`/`data-saved-note`, `data-cited-note`, `data-started`) preserved verbatim; the autosave in-form PATCH and dual-form POST grammar unchanged.
- `apps/web/src/spa/surfaces/figures.tsx` — mark/spec-edit chips → `Button secondary sm`, fields caption/alt/sourceLine → `TextField`, restore → `Button secondary sm` (accent text via `.ui-c2-ca`), accept/reject/propose/start → `Button`, request → `TextArea`, `specKind` select → `Select` (Radix forbids an empty Item value, so `"auto"` is the auto pick — the api's kind match treats any non-enum value exactly as the old `""`; the post grammar is unchanged), `insist` → `Checkbox` (the BubbleInput posts `insist=1` only when ticked, same as the native carrier). The `specKind:"image"` imported-figure arm (S-7 / P4-21) is untouched in behaviour: `<img data-figure-image>` + caption/source line + version-arc chips; no spec/preview/provenance/insert surfaces mount.
- `packages/ui/src/outline-sections.tsx` — every `ed.*` text/number field → `TextField` (a real `<input>` — the no-JS gate-card post and the autosave `input` event are untouched); the claim strike checkbox stays a KIT-1-styled native `<input type="checkbox">` inside `EdCheckbox` — the named exemption: the Approve-outline gate card renders to static HTML where a Radix toggle is inert (RV-36). `editable:false` still emits zero `ed.*` fields; badges ride `.ui-badge` (+ `.ui-os-b`/`.ui-os-bw`).

**Zero inline spacing/type/colour/radius literals** — GUARD-1's banned-key list; layout-only keys (`display`, `flex`, `list-style`, `cursor`, the border shorthand, `text-decoration`, `grid-template-columns`, `align-items`, `overflow-x`, `white-space`) stay inline since they are not literals. New terse `.ui-c2-*`/`.ui-os-*` classes plus reused `.ui-set-*`/`.ui-vc-*`/`.ui-inbox-row`; shared text decls hoist once into selector groups (same decls, same cascade).

**`uiCss()` bound** — the c2 block needed ~2.6 kB over the 689 B of headroom, so a cascade-identical dedup hoisted repeated `font-size`/`color`/`display`/`gap`/radius decls into grouped selectors (hoisted groups placed at the array head so every later modifier/state decl still wins; the pinned `.ui-pill`/`.ui-action-link` moved-export strings restored verbatim — `ui-css.test.ts` 6/6 green): **26,931 → 24,430 B ≤ 24,576 B**. No ceiling touched.

**Tokens (UXC-32)** — the outline "saved" + figure "inserted" notes ride `--state-ok` (`.ui-tok`, `Chip color="var(--state-ok)"`); the audit's undefined `--sev-ok` is gone. `--paper-diff-add/del` remain consumed by the kit's diff surfaces (`compare.tsx`/`what-changed.tsx`); `contrast.test.ts` gained the named c2 usage leg in both themes.

**GUARD-1** — `outline.tsx`/`figures.tsx`/`outline-sections.tsx` appended to `NO_RAW_CONTROLS_ENABLED`; exemptions only for `HiddenField` (×2) and `EdCheckbox`; seeded raw-control legs fail on all three files.

### Verify (all run at this head)

`turbo build`/`typecheck`/`lint` green (one pre-existing `chat-live.tsx` warning, untouched) · `vitest apps/web/src` **1601/1601** (93 files — outline dom 21, figures dom 31 incl. the new `specKind:"image"` list + card legs, axe) · `packages/ui` + `packages/tokens` **203/203** (incl. `ui-css.test.ts` bound leg; contrast leg) · `no-raw-controls.test.ts` **21/21** (rule ON + seeded raw button fails on all three files) · `check:dom-contract` OK · `check:spa-budget`/`spa-env`/`protocol-markers` OK.

**Entry delta:** **+15.5 kB** gz vs `04a4e98b` — ticket increment **+0.0 kB** (Select/Checkbox/leaf-chunked Radix stay async; the primitives' static cost was already in the entry graph). The cumulative +0.5 over the ≤15.0 allowance is 240's `GD-KIT3A-BUDGET`-ruled COPY-map deficit, unchanged; `check:spa-budget` still WARNs on it — stated honestly, no ceiling touched.

### Owed at the R7b preview (never claimed green here)

`D-R7KIT.3c2-1` — screenshots + provenance + computed-style probe on outline / outline-promote / figures list / figure card / imported-image card at `250_R7DEP.2`'s preview SHA.
