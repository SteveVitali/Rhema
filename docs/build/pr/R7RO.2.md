## R7RO.2 — the phone-reader island

Ticket `docs/tickets/247_R7RO.2__phone-reader-island.md`. Stage A only — local/unit/server evidence at $0; no preview, no prod mutation. **Unmerged (OPERATOR).**

- **The island is a reader now** — `client/ide.ts` **940 → 176 lines**; built `ide.js` **171,297 → 138,711 B (−19%)**. Kept: font preset + reader stepper, theme/paper writes (`POST /ide/theme`, `POST /p/:slug/paper-theme`), the §10.1 entry-point disclosures, the `auto` OS-theme listener. Deleted: pane toggles/drags, menus, palette, keymap dispatcher, findings cursor, suggestions/authorship arms, cheat sheet, live-feed SSE tail — all SPA-owned; a source-pin test fails if they return.
- **REQ-MOBILE-3 entry points** — phonebar links land on server-rendered `<details>` disclosures inside the Page: `#phone-timeline` (real `TimelinePane`, run-sheet hrefs withheld per §10.1 ✗, compact gate card inline), `#phone-findings` (`#finding-<id>` anchors + latest-review table → compact SPA dossier), `#phone-chat` (compact composer → `POST /p/:slug/chat/turns`), `#phone-reading`. One link per rendered section — never a dead end; native `<details>` is no-JS-capable.
- **Desktop subtrees never enter the phone DOM** — `IdeShell` `compact` omits panel/margin/status-bar/menus/cheat-sheet/focus-exit/handle/scrim (not CSS-hidden — absent).
- **Android tablets** — `isPhoneRequest` is `/Mobi/` + `Sec-CH-UA-Mobile: ?1` only; Android tablets get the SPA + PANE-2 breakpoints. UA table pins iPhone/Android-phone/Android-tablet/iPad/desktop/`?1`.
- **Demo stays SPA** — phone-UA `/demo/<essay>` documents serve `data-renderer="spa"` + `data-device="phone"`, never the reader (ADR-126).
- **Note form: REMOVE decision recorded** — §10.1 admits no note input; the read-only arm already withheld it.

### Verification

- Fresh `pnpm turbo build --filter=@rhema/web` first, then `typecheck`/`lint` (web+ui+tokens) — OK
- `pnpm exec vitest run apps/web/src` — **1661 pass / 0 fail** (100 files; +2 new files, ~25 new legs)
- `pnpm check:dom-contract` / `check:spa-env` / `check:protocol-markers` — OK
- `pnpm check:spa-budget` — all ceilings held (entry 244.3/300 kB). Entry delta vs baseline `04a4e98b`: **+33.2 kB cumulative** → WARN vs the ≤15 kB per-ticket allowance **as measured vs baseline**; `pages.tsx` is not in the browser graph and the SPA-touched diff is small — the increment is owed an operator ruling (recorded in `runs/R7RO.2.md`).

### Deferrals

- opens `D-R7RO.2-1` → `250_R7DEP.2`: Stage-B phone/tablet screenshots + real-UA evidence at the R7b phase preview.
