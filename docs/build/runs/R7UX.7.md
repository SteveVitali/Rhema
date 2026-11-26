# Run ledger — R7UX.7 (row 330)

Harness: devin-cli/swe-2-high/subagent
Skills: implement-spec (full)
Started: 2026-11-26T00:19Z
Closed: 2026-11-26T03:28Z (records commit; preview fully torn down)
Spec: docs/tickets/330_R7UX.7__pane-resize.md
Base: `stevenvitali/r7ux-6-slash-menu` @ `ba31e06b` (worktree tip at dispatch — carries the
operator's mid-run main merge; PR base stays `stevenvitali/r7ux-6-slash-menu`, unmerged — OPERATOR)
Branch: `stevenvitali/r7ux-7-pane-resize`
Config: implement-spec full (ledger/self-review/gap/tests/evidence on; live = Stage A + owned
pr-<n> preview walk per the 324 ruling, $0, prod untouched)
Budget: ~400 changed lines incl. tests (S–M) — stop past it.

## Deferrals read

- Read `docs/tickets/DEFERRALS.md` at run start (2026-11-26). No `OPEN` row names this ticket,
  BL-98, or REQ-PANE-1 persistence as its unblocker.
- `D-R7UX.1-1` … `D-R7UX.6-1` (OPEN) — the 324–329 deployed-tip re-walks — untouched: they
  unblock only on the operator's stack merge + a deploy carrying those SHAs.
- This ticket's Live stage is "Stage A + preview walk" (same ruling as 324): the deployed-tip
  re-walk lands as a new `D-R7UX.7-1` row at close.
- Owes: BACKLOG BL-98 landing pointer → `330_R7UX.7 (PR #<n>, unmerged)`.

## Requirements (spec Goal/anchors)

1. Pane split positions (the `[data-ide-handle]` divider) persist across sessions through the
   repo's existing UI-state seam — `rhema:panes:v2:<user>:<project>` localStorage via the
   `commit()` → `serializePaneState` path R7PANE.1 landed. No second store, no twin write.
2. A drag end writes the stored split (the codec's `panelWidth`); a reload renders it.
   ("ratio" in the ticket reads as the stored split position — the v2 codec stores px;
   a proportional codec would be a v3 schema change, out of proportion with the S budget.)
3. Double-clicking the divider snaps the split back to the default (320) AND clears the pref —
   the `panelWidth` key leaves the stored blob (the `panelOpen` absent-means-derive convention).
4. Overlay/sheet modes stay session-scoped — a reset there changes the visual split only
   (REQ-PANE-2 "never persisted from overlay mode" preserved).
5. ReadOnly/demo sessions keep the same local persistence; nothing user-visible beyond the
   local pref (pane commits already issue zero requests; the demo leg proves it).
6. Occlusion legs' selectors unchanged — `data-ide-handle` markup and `u3-occlusion.local.test.ts`
   untouched by the change.

## Acceptance criteria (working checklist)

- AC1 (engineered): DOM test — a drag end writes the stored split to `rhema:panes:v2:u:p`.
- AC2 (engineered): DOM test — a reload renders that split (`--panel-w` + aria-valuenow).
- AC3 (engineered): DOM test — dbl-click on the divider restores the default split and the
  blob carries no `panelWidth` key.
- AC4 (engineered): `pnpm turbo build lint typecheck` + web suite +
  `check:dom-contract`/`spa-budget`/`spa-env` green; `u3-occlusion.local.test.ts` green.
- AC5 (preview): preview walk — drag → reload → custom split persists → dbl-click resets
  (screenshots).

## Plan

1. `packages/ide/src/layout.ts` — `export const DEFAULT_PANEL_WIDTH = 320`; `panelWidth?:`
   optional (absent ⇒ the codec default, the `panelOpen` precedent); `pageChFor` falls back.
2. `packages/ide/src/state.ts` — `DEFAULT_PANE_STATE` drops `panelWidth` (a fresh state has no
   stored pref); v2 parse keeps the key absent; v1 migration keeps a concrete width
   (`DEFAULT_PANEL_WIDTH` default); serialize already drops `undefined` (documented).
3. `packages/ide/src/index.ts` — export `DEFAULT_PANEL_WIDTH`.
4. `apps/web/src/spa/ide/controller.ts` — `?? DEFAULT_PANEL_WIDTH` at the three read sites
   (`--panel-w`, `aria-valuenow`, arrow-key `cur`); a delegated `dblclick` arm on
   `[data-ide-handle]` — docked ⇒ `commit({panelWidth: undefined})` (the key leaves the blob),
   overlay/sheet ⇒ session-scoped `stateRef` reset + `apply()` (never persisted).
5. `apps/web/src/copy.ts` + `packages/ui/src/ide-shell.tsx` — a `title` hint on the separator
   ("double-click" discoverability; `data-ide-handle` markup otherwise unchanged).
6. Tests: `packages/ide/src/ide.test.ts` codec legs; `apps/web/src/spa/ide-chrome.dom.test.tsx`
   BL-98 describe (drag→blob, reload→render, dblclick→reset+clear, overlay session-scope,
   demo leg).
7. Preview lifecycle on the PR head + signed-in headless walk (drag → reload → persists →
   dblclick → default) → destroy → orphan sweep → rm.
8. Records: `D-R7UX.7-1` deferral, runs/R7UX.7.md, BUILD_INDEX, LEDGER advance
   (next → 331_R7UX.8), BL-98 pointer in BACKLOG.csv.

## Test matrix

| AC | Test |
|---|---|
| codec absent⇒default | `ide.test.ts` — blob without `panelWidth` → parsed state has it absent; serialize emits no key; explicit width round-trips; paneLayout falls back to 320 |
| AC1 drag→store | `ide-chrome.dom.test.tsx` — pointerdown/move/up on the handle at 1440 (stubbed rect) → blob `panelWidth` = snapped px, `--panel-w`/`aria-valuenow` stamped |
| AC2 reload→render | remount reads the blob → `--panel-w`/`aria-valuenow` = stored width |
| AC3 dblclick reset+clear | dblclick → `--panel-w`/`aria-valuenow` = 320 and the blob has no `panelWidth` key; a fresh mount with no pref stays 320 |
| overlay session-scope | at 1100: stored width stays in the blob across a session-scoped reset; nothing writes |
| demo arm | demo boot: drag writes the local key; zero POST requests |
| AC4 | `u3-occlusion.local.test.ts` green (selectors unchanged); suite runs |
| AC5 | signed-in preview walk |

## Progress

- 2026-11-26T00:1xZ — Phase 0: worktree on `stevenvitali/r7ux-7-pane-resize` @ `ba31e06b`;
  `pnpm install --frozen-lockfile` clean (evals stub). DEFERRALS read (§Deferrals). Anchors
  opened: `spa/ide/controller.ts` (drag `commit(next)` already writes `panelWidth` at docked —
  the persistence half mostly exists; the real gaps are the dblclick reset + the codec's
  "clears the pref" support), `state.ts`/`layout.ts` codec, `ide-shell.tsx` handle emission
  (`data-ide-handle="panel"`, `role="separator"`, aria 160–480), `u3-probe.ts` (asserts role
  only — no markup change permitted beyond inert attrs), `client/ide.ts` (phone island —
  compact omits the handle; out of scope), `ide-chrome.dom.test.tsx` (MemStorage harness +
  demo-boot leg).
- 2026-11-26T00:3xZ — Phase 2 implementation: `panelWidth` takes `panelOpen`'s three-state
  shape — `panelWidth?: number` (absent ⇒ `DEFAULT_PANEL_WIDTH=320`, exported from
  `layout.ts` via `index.ts`); `DEFAULT_PANE_STATE` drops the key; v2 parse keeps an absent
  key absent (still clamps a stored number to 160–480); v1 migration keeps a concrete width;
  serialize never re-emits a cleared key. Controller: `?? DEFAULT_PANEL_WIDTH` at the three
  read sites (`--panel-w`, `aria-valuenow`, arrow-key `cur`) + a delegated `dblclick` arm on
  `[data-ide-handle]` — docked ⇒ `commit({panelWidth: undefined})` (the key LEAVES the blob —
  "clears the pref"), overlay/sheet ⇒ session-scoped `stateRef` reset + `apply()` (mirrors
  the drag's REQ-PANE-2 arm exactly). `title={L.panel.resizeReset}` on the separator (copy
  leaf `panel.resizeReset`; the only markup delta — `data-ide-handle`/`role`/aria untouched).
  `IdeLabels` + the three literal label fixtures (ide-shell.test, occlusion-harness.test,
  review-tabs.dom.test) carry `resizeReset`.
- Phase 3 self-review: `commit` merges `{...state, ...patch}` → a `panelWidth: undefined`
  patch clears the key at serialize (JSON.stringify drops `undefined`; the explicit
  conditional spread documents it, matching `panelOpen`). `paneDrag` still returns a concrete
  width on open-drags and preserves absent width on the close arm — a drag can never create
  a spurious key. All `panelWidth` read sites in the tree guarded (grep-verified).
- Phase 4 gap analysis: every ticket AC maps to a landed leg (§Gap table). Out-of-scope held:
  no pane add/remove, no mobile-layout change (the sheet arm is the untouched REQ-PANE-2
  session scope), occlusion selectors byte-identical (`title` is an inert attr, not a hook).
- Phase 5 verification: `pnpm turbo build lint typecheck` — **138/138 tasks green**.
  Focused vitest: `ide.test.ts` 36/36, `ide-shell.test.tsx` 8/8, `review-tabs.dom.test.tsx`
  4/4, `ide-chrome.dom.test.tsx` 47/47 (all 5 BL-98 legs). `u3-occlusion.local.test.ts` 3/3
  (real Chromium, ~33s). `check:dom-contract`, `check:spa-env`, `check:spa-budget` — all OK;
  the budget WARN "entry +33.7 kB vs `04a4e98b`" is the standing cumulative drift disclosed
  on every R7UX row (this ticket ≈ +0 kB — ~30 client lines). Web suite: 1727/1730 on the
  first pass — the 3 `settings.dom.test.tsx` timeouts were machine contention (load avg
  ~47 from sibling worktrees); the file re-ran clean 37/37 with headroom — **zero real
  failures**.
- **Chain event at closeout:** the operator merged #423 (r7ux-6) to `main` at 00:12Z —
  `ba31e06b` (this branch's records-only base) sits on the merged branch, so this PR's base
  is `main` (ticket said r7ux-6 — now merged; same wave-bottom-up pattern as #423 itself).
- Phase 5.3 preview `pr-424` (owned lifecycle): `init` → `config` (gitSha `d63533cb…`,
  protocolsVersion `0.4.0+07b1ad37ddaaa6f4` via `scripts/compute-protocols-version.mjs
  --bare`, placeholder image `us-docker.pkg.dev/cloudrun/container/hello` — the `pause:3.9`
  default is unpullable, the F-R7UX.1-1-class pin, oauth id, apparmor `Localhost`/`rhema-run-task`,
  gcp:project/region) → `resend-pull` (nonprodResendVersion 1 + `previews@rhema.tools`) →
  `pulumi install` → `up` — `ciPreviewSweepBucketsList` IAMCustomRole `pulumi import`ed then
  `state delete`d (F-R7UX.1-1 class; delete the IAMMember first, then the role) → Cloud Build
  `cb96be2d` all-10 @ `d63533cb` (`_ALLOW_PLACEHOLDER_SDK=1`) → digests pinned
  (`serviceImages` + `runTaskImageDigest` + `proxyImage`) → api rev `00002` terminal
  pre-migrate ("database rhema does not exist", R7DEP.2 class) → migrate Job
  `rhema-pr-424-migrate-a7e635e` succeeded → `gcloud run deploy` forced rev `00003-lxm`
  serving 100% → `appBaseUrl`/`apiPublicUrl` pinned → `up` converged (198 resources) →
  `seed-invite` `prv-424-test` (exec `…-62l86`). Provenance: api `/healthz/` `gitSha
  d63533cb…` = PR head.
- Headless walk **PASS** at `https://rhema-pr-424-web-aa02bfb-tkbl73n3tq-uc.a.run.app`
  (`docs/build/reports/2026-11-26_r7ux7-pane-walk/`): JourneySessions magic-link
  `test+jr7ux7pane@rhema.tools` (signinVia mailbox, invite `prv-424-test`) → POST `/app/new`
  scratch → `/p/untitled` @1440 docked → initial `--panel-w`/`aria-valuenow` 320 → real
  pointer drag on `[data-ide-handle="panel"]` → 400 and the `rhema:panes:v2:<uid>:<pid>`
  blob carries `panelWidth:400` (`split-custom.png`) → reload → 400 renders back
  (`split-persisted.png`) → `dblclick` → 320 and the `panelWidth` key is ABSENT from the
  blob (`panelOpen:true` retained — the drag's legitimate open intent) (`split-reset.png`)
  → a second reload stays 320, key still absent (`walk-facts.json`, `verdict: PASS`). The
  `.state` session-cache dir (live cookie, P-1) was deleted before the records commit.
- Teardown: `destroy` pass 1 deleted 136 (18m44s — AlloyDB 359s, Redis 165s, nodepool 234s,
  GKE 305s) → pass 2 +18 → `--continue-on-error` +57 → `rhema-pr-424-private-app` subnet
  pinned by the Google-owned `serverless-ipv4-cloudrun-1795655204083942406` reservation
  (in-use 400, F-OPS.1-12 GC-lag class) → the reservation released ~03:27Z (~1h41m after
  services went down, inside the sibling 50min–2h02m window) → final `destroy` deleted the
  last 3 resources in 35s (subnet → net → stack) → `preview-orphan-sweep.mjs` CLEAN (zero
  live `pr-<n>` resources) → `preview-stack.mjs rm pr-424` deregistered the stack and the
  untracked `Pulumi.pr-424.yaml` residue was removed from the worktree.

## Gap table

| Requirement (spec) | Landed as | Status |
|---|---|---|
| "split positions persist across sessions" via existing seam | `commit(next)` on drag-up already wrote `panelWidth` to `rhema:panes:v2:<u>:<p>`; this ticket made the codec honest about absence | MET (AC1/AC2 DOM legs + reload remount leg) |
| "double-clicking a divider snaps the split back to its default" + "clears the pref" | delegated `dblclick` on `[data-ide-handle]` → `commit({panelWidth: undefined})`; the key leaves the blob; `DEFAULT_PANEL_WIDTH` at every read site | MET (AC3 DOM legs: reset+never-reserialize+reload) |
| "follow the R7PANE.1 UI-pref convention; no second store" | same codec/key/`safeSet` path; `panelWidth` now three-state like `panelOpen` | MET |
| "ReadOnly/demo … same visual persistence … nothing user-visible beyond the local pref" | demo-boot leg: drag writes `rhema:panes:v2:demo:p-alpha`, zero non-GET fetches | MET (DOM leg) |
| "occlusion legs' selectors unchanged" | `title` attr only; `data-ide-handle`/`role="separator"`/aria range byte-identical; `u3-occlusion.local.test.ts` 3/3 | MET |
| "pnpm turbo build lint typecheck + web suite + checks green" | §Phase-5 progress entry | MET |
| "preview walk: drag → reload → persists → dbl-click resets (screenshots)" | `pr-424` headless walk at head `d63533cb` — drag→400+blob, reload→400, dblclick→320+key absent, second reload stable; 3 PNGs + `walk-facts.json` | MET (preview walk PASS; deployed-tip re-walk → `D-R7UX.7-1`) |

## Evidence log

- Stage A (this commit): turbo 138/138 · vitest 95/95 focused + ide-chrome 47/47 ·
  occlusion 3/3 · dom-contract/spa-env/spa-budget OK · web suite green (5 contention
  timeouts resolved on re-run — 0 real failures).
- Preview (records commit): `docs/build/reports/2026-11-26_r7ux7-pane-walk/` —
  `walk.mjs` + `walk-facts.json` (`verdict: PASS`) + `split-custom.png` /
  `split-persisted.png` / `split-reset.png`; provenance `/healthz/` `gitSha d63533cb…`.

## Evidence report

- **Ticket:** 330_R7UX.7 (BL-98 / REQ-PANE-1) — the `[data-ide-handle]` panel split
  persists across sessions through the existing `rhema:panes:v2` codec, and a double-click
  snaps it back to the default while CLEARING the stored pref (the key leaves the blob).
- **Change:** `panelWidth?: number` three-state like `panelOpen` (absent ⇒
  `DEFAULT_PANEL_WIDTH` = 320); `DEFAULT_PANE_STATE` drops the key; v2 parse keeps absence;
  v1 migration keeps a concrete width; serialize never re-emits a cleared key; controller
  `?? DEFAULT_PANEL_WIDTH` at the three read sites + delegated `dblclick` on
  `[data-ide-handle]` — docked ⇒ `commit({panelWidth: undefined})`, overlay/sheet ⇒
  session-scoped reset (REQ-PANE-2 preserved); `title={L.panel.resizeReset}` on the
  separator. ~300 changed lines incl. tests (S–M budget).
- **Stage A:** `pnpm turbo build lint typecheck` 138/138 green · `ide.test.ts` 36/36 ·
  `ide-chrome.dom.test.tsx` 47/47 (all 5 BL-98 legs: drag→blob, remount→stored split,
  dblclick→320+key-gone+never-reserialized+remount, no-pref harmless, 1100px overlay
  session-scope, demo boot zero non-GET) · `ide-shell` 8/8 · `review-tabs` 4/4 ·
  `u3-occlusion.local.test.ts` 3/3 real Chromium (selectors byte-identical) ·
  `check:dom-contract`/`spa-env`/`spa-budget` OK — the +33.7 kB WARN is the standing
  cumulative drift vs `04a4e98b` disclosed on every R7UX row (this ticket ≈ +0 kB) · web
  suite green (3 first-pass `settings.dom` timeouts = load-avg ~47 contention; file re-ran
  37/37 clean — zero real failures) · gitleaks on staged diff clean.
- **Stage A + preview walk (the ticket's Live stage):** owned `pr-424` preview at the PR
  head `d63533cb` (`/healthz/` provenance) — headless signed-in walk PASS: drag →
  `--panel-w`/`aria-valuenow` 400 + blob `panelWidth:400`; reload → 400; `dblclick` → 320
  and the `panelWidth` key absent; second reload → 320, key still absent. Evidence:
  `docs/build/reports/2026-11-26_r7ux7-pane-walk/` (3 PNGs + `walk-facts.json`).
- **Preview lifecycle (GD-PREVIEW.R7):** `init` → `config` → `resend-pull` → `up`
  (converge passes per §Progress: `ciPreviewSweepBucketsList` import + `state delete`,
  placeholder `pause:3.9`→hello pin, gcp:project/region, AlertPolicy 404s self-healed,
  Cloud Build `cb96be2d` all-10 + digest pins, api rev `00002` pre-migrate → migrate
  `…-a7e635e` → rev `00003-lxm` forced — R7DEP.2 class) → `seed-invite` `prv-424-test` →
  walk → `destroy` 136+18+57 — `private-app` subnet pinned by Google-owned
  `serverless-ipv4-cloudrun-1795655204083942406` until its GC release (F-OPS.1-12 class;
  sibling waits ran ~50 min–2h02m) → final `destroy` pass deleted the last 4 (subnet + net
  + stack + provider) → `preview-orphan-sweep.mjs` CLEAN (zero `pr-<n>` resources) →
  `preview-stack.mjs rm pr-424` deregistered. `Pulumi.pr-424.yaml` removed by `rm`.
- **Records:** `docs/build/pr/330_R7UX.7.md` (PR #424 body) · BUILD_INDEX row 370 ·
  LEDGER CURRENT STATE (`nextTicket → 331_R7UX.8`, `lastCompleted → 330_R7UX.7`,
  `chainTip → stevenvitali/r7ux-7-pane-resize`) + PHASE LOG entry · `D-R7UX.7-1`
  appended (Stage-B re-walk of the persisted split + reset at a deployed tip) · BACKLOG
  BL-98 pointer → `330_R7UX.7 (PR #424, unmerged)` · append-only vs `origin/main` OK ·
  check-build-memory: the 3 pre-existing dup-id baseline violations only.
- **PR:** #424 `stevenvitali/r7ux-7-pane-resize` → `main` (ticket-named base r7ux-6 was
  merged by the operator at 00:12Z mid-dispatch), head `d63533cb` — unmerged, mergePolicy
  OPERATOR.
- **ci:** pass #424@`d63533cb` (run 45731694565 — ci-pass anchor, contracts, fast-path,
  images 9m50s, integration, public-safe, typecheck/lint/unit 26m37s — all 7 legs);
  records-head read pending the records commit.
