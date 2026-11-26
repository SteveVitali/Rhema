# Run ledger — R7UX.10 (row 333)

Harness: devin-cli/swe-2-high/subagent
Skills: implement-spec (full)
Started: 2026-11-26
Closed: —
Spec: docs/tickets/333_R7UX.10__word-diff-marks.md
Base: `stevenvitali/r7ux-9-token-stream-render` (worktree tip `a05289fc` at dispatch —
unmerged; mergePolicy OPERATOR). _2026-11-26: PR #426 still open; the PR is stacked on `main`._
Branch: `stevenvitali/r7ux-10-word-diff-marks`
Config: implement-spec full; live = Stage A + owned pr-<n> preview walk (324 ruling; $0,
prod untouched)
Budget: ~700 changed lines incl. tests (M) — stop + request a split past it.

## Deferrals read

- Read `docs/tickets/DEFERRALS.md` at run start (2026-11-26). No `OPEN` row names this
  ticket or BL-88 as its unblocker.
- `D-R7UX.1-1` … `D-R7UX.9-1` (OPEN) — the sibling deployed-tip re-walks — untouched:
  they unblock only on the operator's stack merge + a deploy carrying those SHAs.
- This ticket's Live stage is "Stage A + preview walk": the deployed-tip re-walk lands as
  a new `D-R7UX.10-1` row at close.
- Owes: BACKLOG BL-88 landing pointer → `333_R7UX.10 (PR #427, unmerged)`; BL-88 closes
  when the operator merges.

## Requirements (spec Goal/anchors, BL-88)

1. Inside a changed paragraph of the §5.8 compare view, inserted/deleted words carry
   stronger marks — del = strike, ins = underline — while the paragraph keeps its tint.
2. Marks render only where the pair is a real edit (the hunk's own coverage floor);
   below the floor the blocks are remove+add and per-word marks would restate the tint.
3. Both compare layouts (side-by-side rows + inline hunk list) carry the marks.
4. The marks emit committed DOM-contract hooks; unchanged and one-sided blocks untouched.
5. Bounded work: a huge pair degrades to a truthful coarse mark, never unbounded LCS.

## Findings (Phase 0 exploration)

- The compare surface is `packages/ui/src/compare.tsx` (`CompareView`, layouts
  side/inline/moves); the block diff lives in `packages/findings-core/src/what-changed.ts`
  (`diffMarkdown`, `splitMarkdownBlocks`, `DiffHunk`/`BlockDiff`); DOM hooks in
  `apps/web/src/dom-contract.ts` (~line 1739: `data-compare`, `data-hunk`,
  `data-diff-kind`, `data-diff-side`).
- **No vendored word-diff helper exists.** The in-house LCS pattern is
  `packages/editor/src/source-mode.ts` (`diffTopBlocks`: prefix/suffix trim + cell-limited
  `Uint32Array` LCS, `LCS_CELL_LIMIT = 200_000`) and `what-changed.ts` — mirrored.
- `diffMarkdown` normalized each block's key **once per dp cell** — O(blocks²)
  `normalizeText` calls; hoisted to one pass per side (pure key ⇒ identical diff).
- The walkable surface is the demo-corpus compare route `/demo/<essay>/v/1/diff/2`:
  `packages/demo-corpus/snapshots/*/diffs/*.json` carry dozens of edited/mixed hunks
  (`structure-of-political-difference` v1→v2: 14 edited + 18 mixed, 79 paired rows) —
  $0, no inference, no sign-in.

## Implementation

- `packages/findings-core/src/word-diff.ts` (new) — `tokenizeWords` (unicode-aware
  tokens covering every char exactly once: word tokens incl. `'`/`’`/`_`/`-` joins,
  whitespace, punct runs); `diffWords(before, after, cellLimit)` emitting `WordRun[]`
  `{fromA,toA,fromB,toB,kind:"same"|"deleted"|"inserted"|"edited"}` — **deliberately
  shaped like prosemirror-changeset 1.x `Change`** (the seam to a future
  changeset-backed word diff). Prefix/suffix trim + cell-limited `Uint32Array` LCS;
  past `WORD_DIFF_CELL_LIMIT` the middle degrades to one coarse `edited` run.
  `wordCoverage`/`EDIT_PAIR_FLOOR`/`wordPairable`/`WORD_DIFF_CELL_LIMIT` exported;
  `what-changed.ts` imports the shared floor — one definition for hunk kind + render gate.
- `packages/ui/src/compare.tsx` — `WordMarks`, `wordMarks()` (gated by `wordPairable`),
  `MarkedCellText` emitting `<del data-diff-word="deleted">` on before cells /
  `<ins data-diff-word="inserted">` on after cells; `BlockCell` accepts `marks`;
  both layouts pair positionally inside the hunk.
- `apps/web/src/dom-contract.ts` — `data-diff-word` manifest row (conditional).
- `packages/findings-core/src/what-changed.ts` — per-block key memo in `diffMarkdown`.

## Verify (Stage A)

- `packages/findings-core/src/word-diff.test.ts` — 11 legs (token coverage, same/del/
  ins/edited runs, cell-limit coarse degradation, coverage floor, non-pairable).
- `packages/ui/src/compare.test.tsx` — 3 legs (edited pair marks both cells,
  below-floor pair renders no marks, one-sided hunk unchanged).
- `apps/web/src/spa/editor.dom.test.tsx` — BL-88 leg on the DIFF fixture
  (`WHAT_CHANGED.view.unlinked.hunks` — `data-diff-word` emitted inside hunk cells).
- Focused suites: findings-core + ui + editor 61 files / 566 tests green.
- `pnpm turbo build lint typecheck` — 138/138 tasks. Lint initially failed on 4
  errors (unused test imports, useless `\-` escapes in the tokenize regex) — fixed.
- Web suite: 103/104 files, 1733/1736 tests — the 3 `settings.dom.test.tsx` form-post
  timeouts are machine contention (load avg ~52–62; R7UX.7 documented the same flake);
  the file re-ran **37/37 green** at `--testTimeout=20000`. The file imports nothing
  this change touches.
- `check:dom-contract` / `check:spa-env` / `check:spa-budget` / `check:no-cookies` —
  all OK. spa-budget WARN is the standing cumulative +33.8 kB drift vs `04a4e98b`
  (GD-KIT3A-BUDGET/GD-SPA-ENTRY.R7 stand, disclosed on every R7UX row).
- **Measured diff budget:** 100 KB-class pair (101,178 chars) — block diff + word
  marks in **12.9 ms** at close (a first 269.2 ms read ran under load-avg ~52
  contention; the pre-fix normalize-per-cell alone ran ~1.5 s).
- 567+/31− across 8 files vs the ~700 budget.
- Code commit `d11d0e20` pushed; PR #427 on `main`. Walk-found fix `74c2fc3e` (below)
  pushed + redeployed as the walk head.

## Continuation (preview + walk)

- 2026-11-26 — `pr-427` bring-up (216 resources): `init` → config (project/region,
  gitSha `d11d0e20`, protocolsVersion `0.4.0+07b1ad37ddaaa6f4`, `placeholderImage`
  hello — pause:3.9 still gone, oauth id, apparmor `Localhost`/`rhema-run-task`) →
  `resend-pull` (`rhema-nonprod-resend-api-key@1` + `previews@rhema.tools`) →
  `pulumi install` → `up` converging passes: pass 1 — 78 created, AlertPolicy 404 on
  the just-created `lb_5xx` logging metric (≤10-min propagation class); pass 2 — 135
  created (AlloyDB primary 380 s, Redis 341 s, GKE 603 s, nodepool 73 s), 2
  AlertPolicy 404s on the just-created `slo_violations` metric; pass 3 — the last 2
  AlertPolicies → converged, 214 unchanged. `ciPreviewSweepBucketsList` created fresh
  (the prior-preview orphan survivor is finally gone — no import/state-delete needed).
- 2026-11-26 — Cloud Build `82fa9ec1` all-10 @ `d11d0e20` (13m3s, `_ALLOW_PLACEHOLDER_SDK=1`
  — the walk needs no run path) → digests pinned (`serviceImages` ×8 + `runTaskImageDigest`
  + `proxyImage`) → `up`: api rev `00002-z2d` terminal pre-migrate (`database "rhema" does
  not exist`, R7DEP.2 class) → migrate Job `…-f655d22-zxkcb` (65 applied) → rev
  `00003-mqm` forced via `gcloud run services update --image` + serving →
  `appBaseUrl`/`apiPublicUrl` pinned → converged.
- 2026-11-26 — **F-R7UX.8-1 class re-verified present + discharged per its own guard:**
  the image-pin `up` replaced the proxy template (`tmpl-7846694`) but did NOT roll the VM
  (`list-instances` showed `proxy-h5fn` still on `tmpl-f56ed98`) →
  `update-instances --minimal-action replace` → VM recreated on the new template.
- 2026-11-26 — **Walk leg 1 FAILED → real defect found + fixed (the preview doing its
  job):** `/demo/structure-of-political-difference/v/1/diff/2` served 200 + the SPA boot
  (`data-renderer="spa"`, route `/p/$project/v/$n/diff/$m`) but `[data-compare]` never
  mounted — `TypeError: Cannot read properties of undefined (reading 'end')` in the
  editor chunk. Root cause: `diffWords` read `token[i-1].end` for gap ends; a mark at
  paragraph offset 0 (insertion/deletion at start, or an LCS first anchor at index 0
  with a one-sided gap — exactly what an edited demo paragraph looks like) indexed
  `token[-1]` → undefined. Every Stage-A fixture shared a first token, so the prefix
  trim always sidestepped the gap path. Fix `74c2fc3e`: token bounds, not ends — the
  offset after token i−1 IS `aPos(i)` (contiguous coverage ⇒ identical offsets, never a
  −1 index); two regression legs added (12/12 green; budget re-measured 12.9 ms).
- 2026-11-26 — web-only rebuild `3710d42e` @ `74c2fc3e` (2m24s) → web digest repinned +
  `rhema:gitSha` updated → `up` (web rev rolled) → `/healthz/` `gitSha 74c2fc3e…` = PR
  head.
- 2026-11-26 — **Walk PASS** (`reports/2026-11-26_r7ux10-word-diff/`): the demo-corpus
  compare route `/demo/structure-of-political-difference/v/1/diff/2` ($0, no sign-in, no
  inference — the R7a read-only demo) rendered 34 hunks / 464 diff cells with **263
  `<del data-diff-word="deleted">`** marks — every one inside a `data-diff-side="before"`
  cell, all real DEL elements, computed `line-through` — and **317 `<ins
  data-diff-word="inserted">`** marks — all inside `data-diff-side="after"` cells, all
  real INS, computed `underline`. Screenshots: `compare-view.png` (side-by-side, 103
  unchanged passages + EDITED rows carrying the marks), `word-marks-crop.png` (`[^1]`
  struck before / `.[1]` + the new `*Figure 1…*` caption underlined after),
  `compare-mid.png` (a later hunk region). `verdict: PASS`.
- 2026-11-26 — Teardown per the owned lifecycle (destroy → orphan → rm, never
  `destroy --remove`): `destroy` pass 1 deleted 138, pass 2 `--continue-on-error`
  deleted 75 → `private-app` subnet `rhema-pr-427-private-app-4ebfa49` pinned by
  Google-owned `serverless-ipv4-cloudrun-1795691982955881237` (F-OPS.1-12 GC-lag
  class — the Cloud Run serverless reservation releases on Google's clock) →
  reservation released 13:30Z (~75 min lag, inside the 50 min–2 h window) →
  final pass deleted the last 3 (subnet + net + stack) → **orphan sweep CLEAN**
  (`preview-orphan-sweep.mjs` — zero live `pr-<n>` resources, no `--allow`
  needed; the other `serverless-ipv4-cloudrun-*` addresses in the project belong
  to other stacks) → `rm` deregistered; `Pulumi.pr-427.yaml` restored to the
  tree per the pr-425/426 precedent.
- 2026-11-26 — CI read on PR head `74c2fc3e` to follow on the records commit.

Closed: 2026-11-26T13:35Z
