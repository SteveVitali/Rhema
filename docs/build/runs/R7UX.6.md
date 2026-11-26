# Run ledger — R7UX.6 (row 329)

Harness: devin-cli/swe-2-high/subagent
Skills: implement-spec (full)
Started: 2026-11-25T21:26Z
Closed: 2026-11-25T23:4xZ
Spec: docs/tickets/329_R7UX.6__slash-menu.md
Base: `stevenvitali/r7ux-5-pricing-copy` @ `4e1d2c86` (unmerged — OPERATOR)
Branch: `stevenvitali/r7ux-6-slash-menu`
Config: implement-spec full (ledger/self-review/gap/tests/evidence on; live = Stage A + owned
pr-<n> preview walk per the 324 ruling, $0, prod untouched)
Budget: ~700 changed lines incl. tests (M) — stop past it; the ticket OWNS the design
(spec deferred REQ-WRITE-3 to "a real design owns it later") — keep it deliberately minimal.

## Deferrals read

- Read `docs/tickets/DEFERRALS.md` at run start (2026-11-25). No `OPEN` row names this
  ticket, its branch, REQ-WRITE-3, or the slash menu as its unblocker.
- `D-R7UX.1-1` … `D-R7UX.5-1` (OPEN) — the 324–328 deployed-tip re-walks — untouched:
  they unblock only on the operator's stack merge + a deploy carrying those SHAs.
- This ticket's Live stage is "Stage A + preview walk" (same ruling as 324): the
  deployed-tip re-walk lands as a new D-R7UX.6-1 row at close.

## Requirements (spec Goal/anchors)

1. `/` typed at a block start opens a small command menu of the document's
   block-level constructs (data-hook emitted).
2. Entries are schema-derived only — only constructs `pageSchema` actually has
   (headings, lists, quote/code blocks, figures…), not a Notion clone.
3. Typed text after `/` filters the entries.
4. Arrow keys navigate; Enter inserts the chosen node at the caret and consumes
   the typed `/`+query text.
5. Escape dismisses the menu.
6. No menu where the schema forbids (inside a code block; anywhere the caret is
   not a paragraph-position block start).
7. Keyboard-first; mouse hover/click also works.
8. Follow the keymap/command conventions (chord literals, `format-commands`);
   menu renders on `ui-menu*` primitive classes; new `data-*` selectors only via
   `apps/web/src/dom-contract.ts`; no private protocol text in a browser bundle.

## Acceptance criteria (working checklist)

- AC1 (engineered): unit/DOM tests — `/` at block start opens the menu (data-hook).
- AC2 (engineered): typed text filters the entries.
- AC3 (engineered): arrow+Enter inserts the chosen node at the caret; the typed
  `/` is consumed.
- AC4 (engineered): Escape dismisses.
- AC5 (engineered): no menu inside a code block (or wherever the schema forbids).
- AC6 (engineered): `pnpm turbo build lint typecheck` + editor + web suites +
  `check:dom-contract`/`spa-budget`/`spa-env`/`protocol-markers` green.
- AC7 (preview): preview walk — editor screenshot with the menu open.

## Plan

1. `packages/editor/src/slash-menu.ts` — a PM plugin (like `decorationsPlugin`):
   state derives `{open, from, query, dismissedFrom, active}` from the caret's
   textblock match `^\/(\S*)` inside a `paragraph` parent (covers code_block /
   heading / table_cell exclusion — their parent is not `paragraph`); a
   `handleKeyDown` claims ArrowUp/Down/Enter/Escape only while open; a plugin
   `view` renders a `.ui-menu` div (`data-slash-menu`, `data-slash-item` rows,
   listbox/option roles, `aria-selected` on the active row) positioned at
   `view.coordsAtPos`, appended to `document.body` (the cmdMenu precedent).
   Entries are a small table `SLASH_ENTRIES` whose `make()` builds the schema
   node(s); apply = `tr.replaceWith` of the `/`-paragraph by the entry's node(s)
   in ONE transaction (the typed `/`+query is inside that paragraph — consumed).
2. `packages/editor/src/plugins.ts` — wire `slashMenuPlugin()` into `pagePlugins`
   (both local + collab states get it; read-only mounts never open it — the
   plugin view guards on `view.editable`).
3. `packages/editor/src/index.ts` — export the public surface (types + entries).
4. `packages/editor/src/slash-menu.test.ts` — PM-state tests (node env).
5. `apps/web/src/dom-contract.ts` — `data-slash-menu` + `data-slash-item`
   (editor surface, conditional, emittedBy `packages/editor`).
6. `apps/web/src/spa/slash-menu.dom.test.tsx` — happy-dom EditorView test
   proving the emitted hooks + keydown-driven insert through the real view.
7. Preview lifecycle on the PR head + signed-in headless walk (scratch project
   → `/` → `data-slash-menu` screenshot) → destroy → orphan sweep → rm.
8. Records: D-R7UX.6-1 deferral, runs/R7UX.6.md, BUILD_INDEX, LEDGER advance,
   BL-97 pointer in BACKLOG if applicable.

## Test matrix

| AC | Test |
|---|---|
| AC1 | plugin-state derive: "/" at empty-paragraph caret → open; "/" mid-text → closed |
| AC2 | `filterSlashEntries` — label/keyword substring match; query "he" narrows |
| AC3 | apply → paragraph carrying "/he" replaced by `heading{level:2}`; doc has no "/" text; selection inside the heading |
| AC3b | lists/quote/code/atoms — node shapes asserted (list>list_item>para, blockquote>para, table 2×2) |
| AC4 | Escape → dismissed at that `from`; further typing stays closed; leaving the match re-arms |
| AC5 | "/" inside code_block → closed; inside heading → closed |
| AC6 | suite runs |
| AC7 | signed-in preview walk |

## Progress

- 2026-11-25T21:2xZ — Phase 0: worktree on `stevenvitali/r7ux-6-slash-menu` @ `4e1d2c86`;
  `pnpm install --frozen-lockfile` clean; DEFERRALS read (ledger §Deferrals);
  scoped AGENTS read (root, apps/web, packages/ui, infra, journeys, docs;
  `packages/editor` has no scoped file — root applies).
- 2026-11-25T21:5xZ — Phase 1/2 implemented, design deviation from Plan §1 recorded: the
  menu DOM did NOT land as a plugin `view` inside `packages/editor` — that package is
  deliberately DOM-free (`decorations.ts` comment; `tsconfig` carries no DOM lib, the
  `HTMLElement` names fail typecheck). Split: `packages/editor/src/slash-menu.ts` owns the
  state plugin (match/derive/dismiss/move/set + `handleKeyDown` + `applySlashEntry`, zero DOM
  types) and `apps/web/src/spa/slash-menu.ts` owns the `.ui-menu` box — mounted in
  `PageMount`'s effect, synced through `installOriginDispatch`'s existing `onTransaction`
  tap (covers local commits AND remote ySync applies), plus capture-scroll/resize listeners.
  Same net shape, cleaner boundary. Editor plugin wired BEFORE the editing keymap so its
  while-open Enter/Escape/arrow claims beat `split`; PM's claimed-key preventDefault also
  keeps the chrome's layered-Esc handler out via its `e.defaultPrevented` guard.
- 2026-11-25T22:0xZ — Tests: `packages/editor/src/slash-menu.test.ts` 21 legs (node PM-state:
  match arms incl. atom-leading block, mid-text, caret-not-at-end; filter substring semantics;
  apply node shapes incl. nested list_item parent + schema `doc.check()`; dismiss/re-arm;
  collab-state arm). `apps/web/src/spa/slash-menu.dom.test.tsx` 9 legs (happy-dom real
  EditorView + real PM keydown: emit-only-while-open contract, filter, Enter insert through
  the keyboard path, Escape, read-only + code-block arms, the PageMount production-seam leg).
  All green. `turbo build lint typecheck` (editor+web) 17 tasks clean; editor+spa vitest
  921/921; `check:dom-contract` 88 editor hooks emitted+asserted; `check:spa-env` +
  `check:protocol-markers` OK; `check:spa-budget` ceilings held — entry delta +33.7 kB vs
  `04a4e98b` is the pre-existing cumulative drift (identical to the R7UX.2..R7UX.5 rows;
  this ticket ≈ +0 kB — the menu rides the lazy `editor` chunk).
- 2026-11-25T22:1xZ — Phase 3: **PR #423** (base `stevenvitali/r7ux-5-pricing-copy`,
  head `c854ed87`, ~817 changed lines incl. 501 test lines across 9 files) → owned
  preview `pr-423` lifecycle: `init` → `config` (gitSha `c854ed87`, protocolsVersion
  `0.4.0+07b1ad37ddaaa6f4`, placeholder image, oauth id, apparmor) → `resend-pull`
  (nonprodResendVersion 1 + `previews@rhema.tools`) → `pulumi install` → `up`:
  `ciPreviewSweepBucketsList` project role `pulumi import`ed (F-R7UX.1-1 class;
  `state delete`d + member at teardown); Cloud Build `8749ae1b` all-10 images @
  `c854ed87` (`_ALLOW_PLACEHOLDER_SDK=1`) → digests pinned
  (`serviceImages`/`runTaskImageDigest`/`proxyImage`) → api rev crashed pre-migrate
  (`database "rhema" does not exist` — pg-boss startup; R7DEP.2 class) → migrate
  Job `rhema-pr-423-migrate-5fb2269` (65 applied) → rev `00003` forced + serving →
  `appBaseUrl`/`apiPublicUrl` pinned → `up` converged (213 resources) → re-roll +
  re-migrate → `seed-invite` `prv-423-test`.
  Provenance: api `/healthz/` → `gitSha c854ed87…` (the PR head).
- CI (PR #423, head `c854ed87`): all 7 checks SUCCESS — fast-path,
  typecheck/lint/unit, contracts, public-safe (gitleaks/markers/licence),
  integration, images (build+scan+pin), ci-pass anchor (run 45707079471).
- 2026-11-25T22:2xZ — **Headless walk PASS** — JourneySessions magic-link
  `test+jr7ux6slash@rhema.tools` (invite-mode preview → `inviteCode: "prv-423-test"`;
  `useCache: true` reused the minted session — a re-mint raced the per-IP send
  bucket and the stale consumed link bounced to /login): `POST /app/new
  {entry:"scratch"}` (302 → slug from `Location`, `maxRedirects:0`) → `/p/untitled-2`
  mounted → `/` → `data-slash-menu` open, all 11 rows in SLASH_ENTRIES order →
  `/he` filtered to h2/h3/tasks/divider → ArrowDown → h3 `aria-selected` → Enter →
  `heading{level:3}` in doc, zero `/` text, menu closed → re-arm + `/qu` + Escape →
  closed, `/qu` text kept. `reports/2026-11-25_r7ux6-slash-menu-walk/` (5 PNGs +
  `walk-facts.json`, `verdict: PASS`).
- 2026-11-25T22:3xZ — teardown: `ci-preview-sweep-buckets-list` IAMMember +
  IAMCustomRole `state delete`d first (the shared project-level grant survives —
  F-R7UX.1-1 class) → `destroy` pass 1 deleted 132 (18m52s — AlloyDB instance
  338s, cluster 31s, Redis 175s, GKE nodepool 234s + cluster 314s) → the
  Google-owned `serverless-ipv4-cloudrun-1795644275405683418` reservation pinned
  `rhema-pr-423-private-app` (F-OPS.1-12 GC-lag class; R7UX.2–5 all waited
  ~1h24m–2h02m) → pass 2 deleted 22 more → pass 3 aborted on the subnet at the
  head of the graph → `destroy --continue-on-error` deleted the remaining 57 →
  only `private-app` subnet + `rhema-pr-423-net` (+ gcp provider) left.
- 2026-11-25T23:3xZ — reservation released ~23:28Z (~50 min GC lag, under the
  R7UX.2–5 ~1h24m–2h02m window) → final `destroy` deleted the last 3 (subnet +
  network + stack) → **orphan sweep CLEAN** (`preview-orphan-sweep.mjs` — zero
  live `pr-<n>` resources) → `rm` deregistered the stack.
- P-1 staging catch — the walk's `stateDir: ${OUT}/.state` session-cache file
  (a live `__Host-rhema.session_token` cookie) was caught at `git add` time and
  removed before the records commit; gitleaks did NOT flag it (not a known key
  format) — a warning comment now sits on the `stateDir` line in `walk.mjs`.
- Append-only note — `check-append-only --base 4e1d2c86` (the fork point): OK.
  Vs the advanced remote base `3f12d437` the checker's single flag is a
  base-side merge (`Merge branch 'main'`, operator) that restored the
  `319_R6FIX.48` manifest row to its in-sequence position; this branch's
  manifest blob is byte-identical to `4e1d2c86`'s (zero manifest diff authored
  here).
- 2026-11-25T23:5xZ — records commit `e9930333` (records + pr-423 evidence +
  D-R7UX.6-1) pushed; records-head ci read — pass (run 45722614140, all 7 legs:
  fast-path 52s → typecheck/lint/unit 22m58s → public-safe/contracts/integration/
  images → ci-pass anchor).

## Gap table

| Spec line | Where satisfied | Note |
|---|---|---|
| `/` at a block start opens a menu of the doc's block-level constructs (data-hook) | `slashMatch` + `slashMenuPlugin` state (`packages/editor/src/slash-menu.ts`); `data-slash-menu`/`data-slash-item` emitted by `apps/web/src/spa/slash-menu.ts` | caret in a `paragraph` parent + `/^\S*`-block match at block end |
| entries are schema-derived only — not a Notion clone | `SLASH_ENTRIES` — 11 rows (h2/h3, quote, code, 3 lists, divider, figure, table 2×2, math) | every caret-insertable `group:"block"` construct; serialization constructs (`front_matter`/`footnote_definition`/`link_definition`/`html_block`) deliberately absent |
| typed text after `/` filters | `filterSlashEntries` — substring on label + keywords; plugin `query` | `/he` → h2/h3/tasks/divider |
| arrows navigate; Enter inserts at the caret and consumes `/`+query | `handleKeyDown` (open-only claims, wired before the editing keymap) + `applySlashEntry` — one `tr.replaceWith` of the `/`-paragraph | `/`+query lives inside the replaced paragraph — one undo restores it |
| Escape dismisses | `dismissedFrom` sticky-dismiss; match ending re-arms | typed `/qu` text kept after Escape |
| no menu where the schema forbids | `paragraph`-parent gate — `code_block`/heading/table-cell caret parents can't match | covered by PM-state + dom arms |
| keyboard-first; mouse works too | hover sets `active` (plugin meta `set`); mousedown `preventDefault` + click applies | |
| keymap/command + `ui-menu*` conventions; hooks via dom-contract; no private text in bundle | `format-commands`-style entry table; `.ui-menu`/`[data-highlighted]` primitive classes (zero new stylesheet lines); 2 hooks in `dom-contract.ts` | `check:dom-contract` 88 editor hooks emitted+asserted |
| AC1–AC5 engineered | 21 PM-state legs + 9 happy-dom legs (real EditorView + PM keydown + PageMount seam) | |
| AC6 gates | turbo 17/17; 921 vitest; dom-contract/spa-env/protocol-markers OK; spa-budget OK-with-WARN (cumulative drift, ticket delta ≈0) | |
| AC7 preview walk + screenshot | `reports/2026-11-25_r7ux6-slash-menu-walk/` | PASS — menu open at preview tip; deployed-tip re-walk → D-R7UX.6-1 |
| Out of scope: command palette, toolbar, AI entries, inline-slash mid-text | untouched by design ruling | |

## Evidence log

- `pnpm exec vitest run packages/editor/src/slash-menu.test.ts` — 21/21 (match arms,
  filter semantics, apply node shapes incl. `doc.check()`, dismiss/re-arm, collab state).
- `pnpm exec vitest run apps/web/src/spa/slash-menu.dom.test.tsx` — 9/9 (happy-dom real
  EditorView + PM keydown; emit-only-while-open; Enter insert; Escape; PageMount seam).
- Editor + `apps/web/src/spa` vitest — **921/921**.
- `pnpm turbo build lint typecheck` — 17/17 tasks.
- `check:dom-contract` (88 editor hooks) · `check:spa-env` · `check:protocol-markers` — OK ·
  `check:spa-budget` — OK-with-WARN (entry +33.7 kB vs `04a4e98b` = pre-existing cumulative
  drift identical to R7UX.2–5; ticket delta ≈0 — lazy `editor` chunk).
- Preview `pr-423` @ `c854ed87` — signed-in walk: `initialRows` = all 11 SLASH_ENTRIES
  labels in order; `filteredRows` `/he` → `["h2","h3","tasks","divider"]`;
  `activeAfterArrow` = `h3`; post-Enter doc `hasH3:true`, `noSlash:true`,
  `menuClosedAfterEnter:true`; Escape leg `menuClosedAfterEscape:true`,
  `textKeptAfterEscape:true` (`walk-facts.json`); 5 PNGs incl. the open menu
  (P-1 clean — test account `test+jr7ux6slash@rhema.tools` on an owned preview).
- Provenance — api `/healthz/` served `{"gitSha":"c854ed87…"}` = PR head.

## Evidence report

- **Preview `pr-423` @ `c854ed87`** — the recorded walk is the AC7 surface:
  - magic-link session `test+jr7ux6slash@rhema.tools` (invite `prv-423-test`,
    JourneySessions cache reuse) → `POST /app/new {entry:"scratch"}` → `/p/untitled-2`.
  - `/` at block start → `.ui-menu[data-slash-menu]` renders below the caret with all 11
    `data-slash-item` rows (Heading 2/3, Quote, Code block, Bulleted/Numbered/Task list,
    Divider, Figure, Table, Math block) — `slash-menu-open.png`.
  - `/he` filters to `h2|h3|tasks|divider`; ArrowDown moves `aria-selected` to `h3`;
    Enter applies — doc gains `heading{level:3}`, the `/he` text is gone, menu closed.
  - Re-open + `/qu` + Escape → menu closed and the typed `/qu` survives.
  - provenance: api `/healthz/` → `{"gitSha":"c854ed87…"}` = PR head.
- **Teardown:** `ci-preview-sweep-buckets-list` IAMMember + IAMCustomRole `state delete`d
  first (the shared project-level grant survives — F-R7UX.1-1 class) → `destroy`
  passes deleted 132 + 22 + 57 (`--continue-on-error` after the pinned subnet
  aborted the pass-3 graph) → `private-app` subnet pinned by the Google-owned
  `serverless-ipv4-cloudrun-1795644275405683418` reservation until ~23:28Z
  (~50 min GC lag, F-OPS.1-12 class — under the prior 1h24m–2h02m window) →
  final pass deleted the last 3 → orphan sweep CLEAN → `rm`.
- **Deferral opened:** `D-R7UX.6-1` — Stage-B re-walk of the slash menu at a deployed tip
  (same shape as D-R7UX.1-1…5-1).
