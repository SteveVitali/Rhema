# Run ledger — R7UX.3 (row 326)

Harness: devin-cli/swe-2-high/subagent
Skills: unknown
Started: 2026-11-25T12:24Z
Closed: (pending)
Spec: docs/tickets/326_R7UX.3__files-panel-polish.md
Base: `stevenvitali/r7ux-2-timeline-polish` @ `1023045d` (unmerged — OPERATOR)
Branch: `stevenvitali/r7ux-3-files-panel-polish`
Config: implement-spec full (ledger/self-review/gap/tests/evidence on; live = Stage A + owned
pr-<n> preview walk per the 324 ruling, $0, prod untouched)
Budget: ~400 changed lines incl. tests (S–M)

## Deferrals read

- Read `docs/tickets/DEFERRALS.md` at run start (2026-11-25). No `OPEN` row names this
  ticket, its branch, or the Files tree surface as its unblocker. The wave's own
  deferral obligation is the ticket's Live-stage line (Stage A + preview walk — same
  ruling as 324): a deployed-tip re-walk rides the standing deferral mechanism
  (D-R7UX.3-1 appended at close).
- `D-R7UX.1-1`, `D-R7UX.2-1` (OPEN) — the 324/325 deployed re-walks — are untouched:
  they unblock only on the operator's stack merge + deploy carrying those SHAs.

## Requirements (spec Goal/anchors)

1. Rebalance the Files panel from a dense 11–12 px wall to a readable type scale via
   `ui-*` tokens (presentation only — same rows, same navigation).
2. Lock affordance only where a lock is meaningful — read-only/immutable/inspect rows,
   gated on `readOnly`/`lock`, not on "is a draft".
3. Provenance collapsed — a single subtle line or behind a title/aria label, not a
   block line per row.
4. File-kind icons asserted by a data-hook (the `KindIcon` set already exists — it
   needs an emitted hook).
5. A hover state signalling clickability via a `ui-*` interactive class.
6. ReadOnlyProject + demo guards unchanged (R7RO.1 — write controls stay hidden); new
   `data-*` names only via `dom-contract.ts`.
7. Out of scope: tree behavior (expand/reorder), new file kinds, editor integration.

## Acceptance criteria (working checklist — layers on close)

- [x] DOM tests: lock badge absent on an ordinary draft row, present on a
      read-only/demo row; provenance collapsed (≤1 line or behind title/aria);
      `data-kind-icon` per kind; `ui-*` interactive hover class on rows.
- [x] `pnpm turbo build lint typecheck` + web suite +
      `check:dom-contract`/`spa-budget`/`spa-env` green.
- [x] Preview walk: files panel screenshot on a project with mixed
      draft/delivered/demo rows; owned `pr-<n>` lifecycle, destroy + orphan check + rm.
- [x] Stage-B re-walk at a deployed tip → `met-engineered(D-R7UX.3-1)` per Live-stage.

## Anchors resolved at read time

- The Files tree = `packages/ui/src/files-pane.tsx` `FilesPane`, mounted ONLY by
  `apps/web/src/spa/app-shell.tsx` (sidebar project scope, `?view=tree` twin). SSR
  pages no longer emit it; labels via `apps/web/src/files-labels.ts` ← `COPY.files`.
- Rows: `FileRowView`/`FileRowDto` — `lock` ∈ editable|immutable|inspect, `readOnly`
  (AGENT_MEMORY kinds or `editMode:"none"`, `apps/api/src/version-routes.ts:367`).
- Current noise: every row renders a `Badge` lock label (Working/Frozen/Inspect only)
  + a `display:block` `data-provenance` line; rows are `ui-t-p20 ui-d-fs`
  (2px pad, fs-micro 12px). `KindIcon` exists (Lucide per kind) but emits no hook.
- `uiCss()` is at 24,567/24,576 B (REQ-KIT-5) — new rules must ride `uiTailCss()`
  (4,466/5,120 B), `.ui-t-*` convention.
- `check:dom-contract` needs: manifest ⊆ emitted ⊆ asserted — `data-kind-icon` gets a
  manifest row + a test reference; the rest of the row hooks already exist
  (`data-file-row`, `data-lock-badge`, `data-provenance` is declared under dossier).
- Keyboard treeview walk (`app-shell.tsx onProjectTreeKeyDown`) uses
  `[role='treeitem']` + `closest('details')` — both preserved.
- Existing assertion `app-shell.dom.test.tsx:310` wants ≥1 `[data-lock-badge]` — the
  twin's immutable/inspect rows keep theirs.

## Plan

- `files-pane.tsx`: `li` → `ui-t-frow` interactive row (flex line, fs-dense, radius-2,
  hover/focus-within `shell-raised` + link underline); `KindIcon` wrapped in
  `<span data-kind-icon={kind}>`; lock `Badge` gated on
  `readOnly || lock !== "editable"`; provenance `data-provenance` becomes an inline,
  right-aligned, truncated `ui-t-frow-prov` span sharing the row line (run link kept),
  with the full provenance also on the anchor `title`; meta (`v{n}` · words) merges
  into the link line; freshness keeps a `ui-t-frow-sub` wrapped full-width line;
  anchor keeps `role="treeitem"` + roving tabindex + `data-file-link`.
- `ui-tail-css.ts`: add the `.ui-t-frow*` rules (inside the 5 kB bound).
- `dom-contract.ts`: declare `data-kind-icon` in the Files-tree hook block; update the
  `data-lock-badge`/`data-provenance` owner notes.
- Tests: new `packages/ui/src/files-pane.test.tsx` (renderToStaticMarkup — the run-card
  pattern): badge gate matrix, collapsed provenance (one-line carrier + title hook),
  `data-kind-icon` values, `ui-t-frow` class + `uiTailCss()` hover rule, run link
  kept; tail bound test still green.

## Test matrix

- DOM markup: editable+!readOnly draft row ⇒ no `[data-lock-badge]`; immutable /
  inspect / `readOnly` rows ⇒ badge present with lock title.
- DOM markup: `data-provenance` is a `ui-t-frow-prov` span INSIDE the row's flex line
  (one line by construction), `data-run` + run link preserved when runId, and the
  anchor `title` carries the full provenance text.
- DOM markup: `data-kind-icon` = draft/outline/figure/voice/research/round per row
  kind; rows carry `ui-t-frow`; `uiTailCss()` contains `.ui-t-frow:hover` and
  `fs-dense` on `.ui-t-frow` (the readable-scale half).
- Repo gates: turbo build/lint/typecheck (ui, web + closure), web suite,
  `check:dom-contract`, `check:spa-budget`, `check:spa-env`, `check:spa-entry-graph`.
- Live: owned `pr-<n>` preview — headless walk of a project with mixed
  draft/delivered/demo rows, files-panel screenshot; destroy + orphan sweep + rm.

## Progress

- 2026-11-25 — setup complete; anchors resolved (above); baseline `turbo build` 13/13
  green at `1023045d`.
- 2026-11-25 — implementation landed: `ui-t-frow*` interactive row (tail block —
  `uiCss()` is at its 24,576 B bound, tail 4,466→~5,050 B), `data-kind-icon`, lock
  Badge gated on `lock !== "editable"`, provenance collapsed to an in-line truncated
  span + anchor `title`, meta merged into the link line, freshness → `ui-t-frow-sub`.
  +files-pane.test.tsx (5 tests). Static gates green: `turbo build/lint/typecheck`
  17/17; `packages/ui` 188 tests; web suite 1,713; `check:dom-contract`,
  `check:spa-env`, `check:spa-entry-graph` pass; `check:spa-budget` WARN +33.7 kB =
  the same cumulative drift vs pinned baseline `04a4e98b` R7UX.2 recorded —
  informational; this ticket's own delta ≈0.
- 2026-11-25 — code committed `1959db52` + pushed; PR **#420** open
  (`stevenvitali/r7ux-3-files-panel-polish` on `r7ux-2-timeline-polish`).
  Preview `pr-420` lifecycle: `init` → config → `resend-pull` → `up` pass 1
  (97+62 — `ciPreviewSweepBucketsList` role `pulumi import`ed; all 8 Cloud Run
  creates failed on `pause:3.9`, F-R7UX.1-1 class) → Cloud Build `2da45961`
  all-10 (13m43s) → digests pinned → `up` pass 2: api rev `00001` terminal
  pre-migrate (R7DEP.2 class) → migrate job `…-v9qq5` (65 applied, roles LOGIN,
  deployments row for `1959db52`) → api rev `…-mig2` forced + serving →
  `appBaseUrl`/`apiPublicUrl` pinned → `up` converged (206 resources).
  `seed-invite` → `prv-420-test` (`…-mqkj7`). Provenance: api `/healthz/` →
  `gitSha 1959db529364e9e3e8e884051faa6ad1a0d68965`.
- 2026-11-25 — **fixture + walk PASS**: in-VPC `node -e` seed via the migrate
  job's `--args` seam (exec `…-nzg58`, `R7UX3-SEED-OK`) → `r7ux3-files` w/
  11 mixed rows; magic-link mint `test+r7ux3@rhema.tools` (mailbox) → files
  tree walk — every arm verified live (see Evidence report).
  `reports/2026-11-25_r7ux-3-files-walk/`.
- 2026-11-25 — teardown: `ci-preview-sweep-buckets-list` role + IAMMember
  `state delete`d → `destroy` pass 1 deleted 143 then the subnet sat pinned by
  Google-owned `serverless-ipv4-cloudrun-1795611230316345831` (F-OPS.1-12 GC-lag
  class); `--continue-on-error` pass cleared 57 more → the reservation released
  ~14:48Z (~1h55m lag; R7UX.2's same class ran ~1h24m) → retry pass deleted the
  last 3 (subnet + net + stack) → **0 resources** → `preview-orphan-sweep.mjs`
  **CLEAN** → `rm` deregistered (dev+prod stacks only).

## Gap table

| item (spec §) | required | achieved | status | evidence |
|---|---|---|---|---|
| Readable type scale via `ui-*` tokens | engineered | engineered | met | `ui-t-frow` → `font-size: var(--fs-dense)` + `padding: 3px var(--s2)` (`ui-tail-css.ts:154`), applied on every row (`files-pane.tsx:159`); test asserts the rule |
| Lock glyph only where meaningful — not every draft | engineered | engineered | met | `locked = row.lock !== "editable"` (`files-pane.tsx:146`) — ordinary drafts show none; frozen/immutable/inspect keep `data-lock-badge`; test covers all four states |
| Lock glyph present on read-only/demo rows | engineered | engineered | met | demo/read-only rows are `editMode:"none"` ⇒ `lock:"immutable"` (`files-tree.ts:90`, `version-routes.ts:346`) ⇒ badge. Edge: `persona_seed` is `readOnly`+`editable` — no badge (a "Working" badge on an opens-read-only row would lie, and the artifact IS user-editable); `data-readonly` + the sr-only note still mark it. Recorded deviation, not a deferral |
| Provenance collapsed (≤1 line or title/aria) | engineered | engineered | met | `data-provenance` is now an in-line `ui-t-frow-prov` span sharing the row's flex line (nowrap+ellipsis) AND the full text rides the anchor `title` (`files-pane.tsx:188-201`); run link preserved inside; freshness → `ui-t-frow-sub` wrap |
| File-kind icons by data-hook | engineered | engineered | met | `data-kind-icon={kind}` on the icon wrapper (`files-pane.tsx:167`); declared in `dom-contract.ts:1822`; test asserts all six kinds |
| Hover affordance via `ui-*` interactive class | engineered | engineered | met | `.ui-t-frow:hover,:focus-within { background: var(--shell-raised) }` + link underline (`ui-tail-css.ts:155-156`); class emitted on every `data-file-row`; test asserts rule + class |
| Same rows, same navigation — presentation only | engineered | engineered | met | hrefs unchanged (draft/artifact/figure/run); `role="treeitem"` + roving tabindex + `onProjectTreeKeyDown` walk untouched; run link kept inside `data-provenance` |
| ReadOnlyProject + demo guards unchanged | engineered | engineered | met | presentation-only diff; `data-readonly`/`data-readonly-note` preserved; no guard touched |
| New `data-*` via dom-contract only | engineered | engineered | met | `data-kind-icon` + the files-pane `data-provenance` entry declared (`dom-contract.ts:1822-1823`); `check:dom-contract` OK |
| DOM tests (AC) | engineered | engineered | met | `packages/ui/src/files-pane.test.tsx` — 5 tests green |
| Build/lint/typecheck + web suite + checks | engineered | engineered | met | see Evidence log |
| Preview walk — mixed rows screenshot | fixture-verified (owned preview) | walked | met | `pr-420` @ `1959db52` — 11 rows / 7 sections, all three lock arms + run-linked provenance + freshness + sealed count; `reports/2026-11-25_r7ux-3-files-walk/` |
| Stage-B re-walk at deployed tip | live-executed | — | met-engineered(D-R7UX.3-1) | deferral appended at close per the 324 ruling |
| Out of scope: tree behavior / new kinds / editor integration | — | — | met | no expand/reorder, kind, or editor change in the diff |

## Evidence log

- `pnpm exec vitest run packages/ui` — 188 tests incl. the 5 new files-pane tests
  (badge gate, collapsed provenance + title hook + run link, `data-kind-icon` ×6,
  `ui-t-frow` + hover/fs-dense/ellipsis rules, treeitem + roving tabindex + freshness).
- `pnpm turbo build lint typecheck --filter=@rhema/ui --filter=@rhema/web` — 17/17.
- Web suite — 1,713 tests / 102 files pass; `app-shell.dom.test.tsx` 14/14.
- `pnpm check:dom-contract` OK · `check:spa-env` OK · `check:spa-entry-graph` OK ·
  `check:spa-budget` OK (WARN +33.7 kB = cumulative baseline drift, informational;
  this ticket's JS delta ≈0 — the `.ui-t-frow` rules ride the inlined tail CSS,
  +0.0 kB JS).
- **ci:** `pass #420@1959db52` (run 45614056371 — all seven legs + `ci-pass`
  anchor); records head `22dd5a6b` re-read `pass` (run 45638749318 — fast-path
  same-tree anchor on `1959db52`, all seven legs success).

## Evidence report

- **Preview `pr-420` (owned lifecycle):** `init` → config (gitSha `1959db52`,
  protocolsVersion `0.4.0+07b1ad37ddaaa6f4`, oauth id, apparmor) → `resend-pull` →
  `up` in converging passes: `ciPreviewSweepBucketsList` project role `pulumi import`ed
  (F-R7UX.1-1 class, `state delete`d at teardown); `pause:3.9` still gone → all-8
  Cloud Run creates failed pass 1 (F-R7UX.1-1 stands); Cloud Build `2da45961` all-10
  images @ `1959db52` (13m43s, `_ALLOW_PLACEHOLDER_SDK=1`); digests pinned; api rev
  `00001` terminal pre-migrate (R7DEP.2 class) → migrate job `…-v9qq5`
  applied the schema → rev `…-mig2` forced + serving; `appBaseUrl`/`apiPublicUrl`
  set + re-roll; `seed-invite` → `prv-420-test` (`…-mqkj7`). Provenance: api
  `/healthz/` → `gitSha 1959db529364e9e3e8e884051faa6ad1a0d68965` (the PR head).
- **Fixture seed ($0, in-VPC):** the migrate Job's `--args` seam ran a one-shot
  `node -e` fixture (execution `…-nzg58`, `R7UX3-SEED-OK`): `seedWritableDossier`
  (completed review `01M89CYD…`) + `steps.produced_version_ids` links
  (letter→`editors_letter`, craft→draft v2 head, letter→`run_report`) + direct
  artifact rows for the remaining arms — `figure` (assets), `source_note` (research),
  `persona_seed` (voice, user actor), `sample` (voice), `structure_plan`
  (advanced, guidance_only), `corpus_note` (H → sealed count). No inference, no spend.
- **Headless walk PASS** — real magic-link mint (`test+r7ux3@rhema.tools` via the
  pinned `test@rhema.tools` mailbox, `signinVia: mailbox` then cache) →
  `/p/r7ux3-files` → the sidebar Files tree: 11 `data-file-row`s across all 7
  `data-files-section`s. Lock-badge gate proven live — `editable` rows (working
  draft v2, **`persona_seed` readOnly+editable — the recorded deviation arm**,
  `sample`) carry **zero** `data-lock-badge`; `immutable` rows show "Frozen";
  `structure_plan` shows "Inspect only" inside the Advanced disclosure. Collapsed
  provenance: one muted line per row ("System" / "You" / "editor · review run ·
  letter" / "System · review run · craft"), full text on the anchor `title`, run rows
  keep `data-run` + a nested run anchor. `data-kind-icon` per row kind;
  `data-freshness data-stale="0"` ("describes v1") on the describing rows;
  `data-sealed-count="1"` for the H kind. `reports/2026-11-25_r7ux-3-files-walk/`
  (`files-1440.png`, `walk-facts.json`; test-tenant evidence, P-1 clean).
