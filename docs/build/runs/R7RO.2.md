# R7RO.2 — the phone-reader island (manifest row 247 → ledger row 289)

- harness: devin-desktop/swe-2-high/subagent · branch `stevevitali/r7ro-2-phone-reader` · base `stevevitali/r7sync-1-state-speed` (chain tip `5c8fbf8a`)
- scope: Stage A only — local code + unit/server evidence. No preview, no prod, $0. Stage-B phone/tablet screenshots + real-UA browser evidence → `D-R7RO.2-1` (250_R7DEP.2).
- requirements: REQ-RELOAD-7, REQ-MOBILE-3 amended (§10.1 read+input contract), ADR-128, REQ-PANE-2 (Android tablets → SPA), REQ-VFY-5 (`data-device`), REQ-RELOAD-4 (envelope parity — untouched), ADR-126 (demo stays SPA). Contract: `docs/tickets/247_R7RO.2__phone-reader-island.md`.

## What landed

- **The island shrank to the reader subset** — `apps/web/src/client/ide.ts`: **940 → 176 lines**; built `public/ide.js` **171,297 → 138,711 B (−32,586 B, −19%)**. Kept: font preset + reader stepper (`rhema:font:v1`/`rhema:reader-step:v1` → `--paper-size`/`data-font`), theme + paper writes (`POST /ide/theme`, `POST /p/:slug/paper-theme`, same-origin JSON, REQ-ARCH-33), the §10.1 entry-point disclosures (`#phone-*` / `#finding-<id>` hash → open `<details>` + scroll + `data-selected`, plus `hashchange`), and the OS-theme `auto` listener. Deleted: pane toggles/drags, View/Theme menus, palette, keymap dispatcher, findings J/K cursor, suggestions preview, authorship toggle, cheat sheet, live-feed SSE tail. `phone-reader.test.ts` source-pins the deleted seams.
- **REQ-MOBILE-3 entry points (F4)** — `pages.tsx` `IdeFrame` compact arm mounts, inside `.paper`: a `data-phone-status` meter line (the hidden status bar's facts), `<details id="phone-reading">` (font/stepper/theme/paper), `<details id="phone-timeline">` (the real `TimelinePane` minus run-sheet `verbHref`/`nextStep` hrefs — §10.1 ✗ — plus the waiting run's compact `GateCard`), `<details id="phone-findings">` (`#finding-<id>` anchors + latest-review table → SPA dossier links), and `#phone-chat` (`data-phone-chat` compact composer). The phonebar emits one link per rendered section — never a dead end.
- **Desktop-only subtrees never enter the phone DOM** — `ide-shell.tsx` `compact` suppresses the panel, margin, status bar, menus, cheat sheet, focus-exit pill, drag handle, and scrim (frontend-spa-spec §216).
- **Android tablets (UXC-8)** — `isPhoneRequest` is now `/Mobi/i` + `Sec-CH-UA-Mobile: ?1` only. Android tablets (no `Mobile` token) get the desktop/SPA path and PANE-2 breakpoints. `device.test.ts` pins iPhone/Android-phone/Android-tablet/iPad-desktop-UA/desktop/`?1`/`?0` through `deviceClassFor`.
- **Demo stays SPA** — `demo.test.ts` leg: phone-UA `/demo/<essay>` + `/p/demo~…` documents answer `data-renderer="spa"` + `data-device="phone"`, no `data-ssr-cause`, no `data-ide` (ADR-126).

## Judgement calls

- **§10.1 inputs**: gate actions (the compact `GateCard`'s Approve/Wait-for-me/Stop forms → `POST /p/:slug/gates/:id`), disposition-with-note (the card's triage rows → `POST /p/:slug/findings/:fid/disposition`), and chat (`POST /p/:slug/chat/turns`) — all pre-existing no-JS routes, unchanged.
- **Note form decision: REMOVE** — REQ-MOBILE-3's admitted inputs list no note affordance; the read-only phone arm already withheld it. Recorded, not added.
- **`data-view`/`data-panel`/`data-margin` stamping** stays honest on compact (`closed`/`hidden`) — attributes are facts; no subtree emits.
- The "inputs' enhancement" = the disclosure opener; deeper in-place posting stays SPA-owned.

## Verification

- `pnpm turbo build --filter=@rhema/web` (+ui, tokens) — OK (fresh build first, per the stale-dist warning)
- `pnpm --filter @rhema/web typecheck` — OK · `lint` — OK (web + ui + tokens)
- `pnpm exec vitest run apps/web/src` — **1661 pass / 0 fail (100 files)**, incl. `device.test.ts`, `phone-reader.test.ts`, updated `server/chat-surfaces/demo/page` legs
- `pnpm check:dom-contract` — OK · `check:spa-env` — OK · `check:protocol-markers` — OK
- `pnpm check:spa-budget` — all ceilings held (entry graph 244.3/300 kB). Entry delta vs baseline `04a4e98b`: **+33.2 kB cumulative** → **WARN, exceeds the ≤15 kB per-ticket allowance as measured vs baseline**. Attribution: `pages.tsx` is not in the browser bundle graph (test-only import); the SPA-touched diff is `ide-shell.tsx` + `ide-css.ts` (~+0.3 kB gz est.) — the remaining cumulative came from base-branch commits after R7SYNC.1's recorded +19.1 kB. Reported honestly; operator ruling owed if the allowance is meant per-ticket-increment rather than cumulative.

## AC gap table

| AC | evidence | status |
|---|---|---|
| Island = reader subset, size reported | `client/ide.ts` 176 lines; ide.js 138,711 B; source-pin test | ✅ |
| §10.1 entry points, no dead ends | phone-reader.test.ts: phonebar links ×4 ↔ `#phone-*` sections; gate/disposition/chat forms + posts | ✅ |
| Desktop subtrees never in DOM | `data-pane="panel|margin"`, `class="ide-statusbar"`, `data-ide-menu`, `data-ide-cheatsheet` absent | ✅ |
| Android tablet → SPA/PANE-2 | `device.test.ts` UA table (8 legs) | ✅ |
| Demo SPA on phones (ADR-126) | `demo.test.ts` leg ×3 paths | ✅ |
| Stage-B phone/tablet + real-UA screenshots | deferred → `D-R7RO.2-1` | ⏳ owed |

## Evidence log

- vitest sweep output at `docs/build/logs/` (session run, not committed — logs dir is gitignored).
- PR body: `docs/build/pr/R7RO.2.md`.
