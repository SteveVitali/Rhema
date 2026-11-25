# Run ledger — R7UX.2 (row 325)

Harness: devin-cli/swe-2-high/subagent
Skills: unknown
Started: 2026-11-25T09:36Z
Closed: 2026-11-25 (records commit)
Spec: docs/tickets/325_R7UX.2__timeline-polish.md
Base: `stevenvitali/r7ux-1-app-content-column` @ `b695ee7a` (unmerged — OPERATOR)
Branch: `stevenvitali/r7ux-2-timeline-polish`
Config: implement-spec full (ledger/self-review/gap/tests/evidence on; live = Stage A + owned
pr-<n> preview walk per GD-UXBACKLOG-1/GD-PREVIEW.R7, $0, prod untouched)
Budget: ~400 changed lines incl. tests (S–M)

## Deferrals read

- Read `docs/tickets/DEFERRALS.md` at run start (2026-11-25). No `OPEN` row names this
  ticket, its branch, or the timeline/run-card surface as its unblocker. The wave's own
  deferral obligation is the ticket's Live-stage line (Stage A + preview walk — same
  ruling as 324): a deployed-tip re-walk rides the standing deferral mechanism
  (D-R7UX.2-1 appended at close).
- `D-R7UX.1-1` (OPEN) — the 324 deployed re-walk — is untouched: unblocks only on the
  operator's stack merge + deploy carrying that PR's SHA.

## Requirements (spec Goal/anchors)

1. Differentiate run states in the timeline: failed vs delivered vs in-flight get
   distinct, non-shouty treatments (visual only — same data, same routes).
2. Soften the all-caps labels ("WHAT IT DELIVERED"-class) to the design system's label
   style.
3. Approvals render as structured items (kind, when, actor — not a bare text line) with
   a data-hook per kind.
4. Reuse `ui-*` label/badge primitives from `packages/ui`; `data-run-state` already
   exists — extend the declared vocabulary only via `dom-contract.ts` for the new hook.
5. Out of scope: files panel (UX.3), run-card internals, notification/real-time.

## Acceptance criteria (working checklist — layers on close)

- [x] DOM tests: delivered/failed/in-flight run rows carry distinguishable state
      treatments.
- [x] No `WHAT IT DELIVERED`-style hard-caps strings remain (case-insensitive check).
- [x] Approval entries render as structured rows (a data-hook per kind).
- [x] `pnpm turbo build lint typecheck` for touched packages + web suite +
      `check:dom-contract`/`spa-budget`/`spa-env` green.
- [x] Preview walk: owned `pr-419` lifecycle — mixed run states screenshotted; destroy +
      orphan check + rm.
- [x] Stage-B re-walk at a deployed tip → `met-engineered(D-R7UX.2-1)` per the Live-stage
      line.

## Anchors resolved at read time

- Timeline surface = `packages/ui/src/timeline.tsx` `TimelinePane` → per-run `RunCard`
  (`packages/ui/src/run-card.tsx`); mounted SSR (`pages.tsx`), SPA (`ide/chrome.tsx` +
  `chrome-data.tsx` via `runCardLabels` in `dossier-labels.tsx`), phone reader
  (`pages.tsx` compact arm), dossier embedded card (`dossier-view.tsx`).
- "WHAT IT DELIVERED" = `COPY.steer.deliveredHeading` ("What it delivered",
  copy.ts:1802) rendered under `ui-d-cap` (`text-transform:uppercase`, ui-css.ts:77) on
  `run-card.tsx`'s delivered block.
- Approvals = `RunCardView.decisions` (`GateDecisionView` — id/kind/action/byActor/at);
  rendered as bare `<li data-decision>` text lines in BOTH `run-card.tsx`
  (`data-run-decisions`) and `gate-card.tsx` (`data-gate-decisions`); line composed by
  `decisionLine` (apps/web/src/gate-card.tsx).
- Existing vocabulary: `data-run-state` (declared, emitted on the card + status bar),
  `data-decision`/`data-kind` (manifested). New hook needed: `data-state-tone`.
- `?view=tree` is the sidebar project twin — not the run-history surface; the Timeline
  pane is the run history.

## Plan

- `primitives/chips.tsx`: `Pill` forwards `...rest` span props (dom hooks).
- `run-card.tsx`: export `runStateTone(state)` (in-flight→running · waiting→needs_you ·
  completed→ready · failed/orphaned→attention · quiet→neutral); state label → `Pill`
  with `data-state-tone`; card gets a tone-tinted left border; delivered heading drops
  `ui-d-cap`; decision rows → kind `Chip` + `data-kind` + composed line; new
  `decisionKindLabel` label member.
- `gate-card.tsx`: same structured decision rows (`decisionKindLabel` member).
- `copy.ts`: `deliveredHeading` → "Delivered" (kills the caps string case-insensitively;
  the block's REQ-COPY-4 name stays in comments).
- `dossier-labels.tsx` + `apps/web/src/gate-card.tsx`: `decisionKindLabel` →
  `COPY.gates.kindLabel`.
- `dom-contract.ts`: declare `data-state-tone`; extend `data-kind`'s owner note to the
  run-card/gate-card decision rows.
- Tests: R7UX.2 describe block in `run-card.test.tsx` (tone map, per-state DOM
  treatments, no-caps case-insensitive scan, structured decision rows) + fixture heading
  update.

## Test matrix

- `runStateTone` pure map: every RUN_STATES member → its tone (unit).
- DOM: `data-state-tone` + `ui-pill--*` on completed/failed/running/waiting_gate cards
  are pairwise distinguishable; the card's accent border differs per tone.
- DOM: rendered card/timeline markup carries no `/what it delivered/i` match and no
  `ui-d-cap` on the delivered block (the AC's case-insensitive scan).
- DOM: decision rows carry `data-kind` per row + a `ui-chip` badge + actor/time text.
- Repo gates: turbo build/lint/typecheck (ui, web + closure), web suite,
  `check:dom-contract`, `check:spa-budget`, `check:spa-env`, `check:spa-entry-graph`.
- Live: owned `pr-<n>` preview — headless walk of a project timeline with mixed run
  states, screenshot; destroy + orphan sweep + rm.

## Progress

- 2026-11-25 — setup complete; anchors resolved (above); baseline build running.
- 2026-11-25 — implementation landed (`runStateTone` map + `Pill`/`data-state-tone` +
  tone accent border; `ui-d-cap` off the delivered heading; `data-kind` structured
  decision rows in run-card + gate-card; `deliveredHeading` copy → "Delivered").
  +255/−16 over 8 files. All static gates green: `turbo build` 13/13; `packages/ui`
  183 tests; ui+web typecheck/lint; web suite 1713/102 files; `check:dom-contract`,
  `check:spa-env`, `check:spa-entry-graph` pass. `check:spa-budget` WARN +33.7 kB is
  cumulative drift vs pinned baseline `04a4e98b` (2026-11-05) — informational; this
  ticket's own entry-graph delta ≈0.
- 2026-11-25 — code commit `d34c0427` → pushed → **PR #419** (base
  `stevenvitali/r7ux-1-app-content-column`).
- 2026-11-25 — **preview `pr-419`** lifecycle: `init` → config (project/region/gitSha
  `d34c0427`/protocolsVersion `0.4.0+07b1ad37ddaaa6f4`/googleOauthClientId/
  runTaskAppArmor*) → `resend-pull` (nonprod key @1 + `previews@rhema.tools`) → `up`.
  First `up` pass: (a) `ciPreviewSweepBucketsList` custom project role already existed
  (F-R7UX.1-1 class — a prior preview's orphan) → `pulumi import`ed into the stack so
  teardown can `state delete` it; (b) all 8 Cloud Run creates failed on
  `gcr.io/google-containers/pause:3.9` image-not-found (the placeholder fallback is
  still gone — F-R7UX.1-1, dated infra note already open). AR repo + AlloyDB + GKE
  created. Cloud Build `9e6fab3b` all-10 images @ `d34c0427` submitted
  (`_ALLOW_PLACEHOLDER_SDK=1` — clean worktree, run-task never launches here).

## Gap table

- Differentiate run states → `runStateTone(state)` in `run-card.tsx` (every
  `RUN_STATES` member → one of running/needs_you/ready/attention/neutral); the header
  `Pill` carries `runStateLabel(state)` + `data-state-tone`, and the card root gains a
  per-tone left accent border (`TONE_ACCENT[tone]`). DOM tests assert pairwise-
  distinguishable treatments on completed/failed/running/waiting_gate.
- Soften all-caps labels → `ui-d-cap` removed from the delivered block's heading and
  `COPY.steer.deliveredHeading` → "Delivered" (REQ-COPY-4 name retained in comments;
  the case-insensitive `/what it delivered/i` scan finds nothing rendered).
- Approvals as structured rows → `view.decisions` map to `<li data-kind={kind}>` rows
  with a `ui-chip` kind badge + composed `decisionLine` text, in both `run-card.tsx`
  (`data-run-decisions`) and `packages/ui/src/gate-card.tsx` (`data-gate-decisions`).
- Vocabulary discipline → only `data-state-tone` added to `dom-contract.ts`
  (conditional hook); `data-kind`'s owner note extended to the two decision-row sites.
- Out of scope respected → no files-panel, run-card-internals, or realtime changes.

## Evidence log

- `pnpm exec vitest run packages/ui/src` — 183 pass (incl. the +144-line R7UX.2 DOM
  block: tone map, per-state treatments, no-caps scan, structured decision rows).
- `pnpm turbo build` — 13/13; `@rhema/ui` + `@rhema/web` typecheck + lint clean.
- Web suite — 1713 tests / 102 files pass; `check:dom-contract` / `check:spa-env` /
  `check:spa-entry-graph` pass. `check:spa-budget` WARN +33.7 kB = cumulative drift vs
  pinned baseline `04a4e98b` (2026-11-05), informational; this ticket's delta ≈0.
- **ci:** `pass #419@d34c0427` (run 45588618037 — all seven legs + `ci-pass` anchor).
- **Preview `pr-419` (owned lifecycle):** `init` → config (gitSha `d34c0427`,
  protocolsVersion `0.4.0+07b1ad37ddaaa6f4`, oauth id, apparmor) → `resend-pull` →
  `up` in converging passes: `ciPreviewSweepBucketsList` project role `pulumi import`ed
  (F-R7UX.1-1 class, `state delete`d at teardown); `pause:3.9` still gone → all-8
  Cloud Run creates failed pass 1 (F-R7UX.1-1 stands); Cloud Build `9e6fab3b` all-10
  images @ `d34c0427` (11m55s, `_ALLOW_PLACEHOLDER_SDK=1`); digests pinned; api rev
  `00001` terminal pre-migrate (R7DEP.2 class) → migrate job `…-7k89c` applied the
  schema → rev `00002-8qg` serving; `appBaseUrl`/`apiPublicUrl` set + 3-service
  re-roll; `seed-invite` → `prv-419-test` (`…-9kv7c`). Provenance: api `/healthz/` →
  `gitSha d34c0427ee9978681fd7884ad738445c692a9db6` (the PR head).
- **Fixture seed ($0, in-VPC):** the migrate Job's `--args` seam ran a one-shot
  `node -e` fixture (execution `…-q6rkp`, `R7UX2-SEED-OK`): `seedWritableDossier`
  (completed review `01M8949E0K4…`) + two column-list clones → `failed` (`01M8949E3S…W4`)
  + `waiting_gate` (`01M8949E3S…VD0` via `seedOpenApprovalGate`) + two resolved
  `gates`+`decisions` rows (`approve_triage`/`approve_scope`, action `approve` /
  `proceed_as_proposed`) — one project `r7ux2-mixed`, three run states, two decision
  rows. No inference, no spend.
- **Headless walk PASS** — real magic-link mint (`test+r7ux2@rhema.tools` via the
  pinned `test@rhema.tools` mailbox, `signinVia: mailbox`) → `/app` → workspace →
  seed → `/p/r7ux2-mixed` → Timeline tab: `panelTab="timeline"`, **3 run cards**
  `failed|attention` + `waiting_gate|needs_you` + `completed|ready` (distinct
  `data-run-state` + `data-state-tone`), `data-run-decisions` on two cards with
  `data-kind` rows `approve_scope`/`approve_triage`, zero `WHAT IT DELIVERED` caps in
  rendered markup — `reports/2026-11-25_r7ux-2-timeline-walk/` (`timeline-1440.png`,
  WALK-FACTS JSON; test-tenant evidence, P-1 clean).
- **Teardown:** `ci-preview-sweep-buckets-list` role + its IAMMember `state delete`d
  (shared project resource preserved, F-R7UX.1-1 handling) → `destroy` pass 1
  deleted 127, then `rhema-pr-419-private-app` pinned by Google-owned
  `serverless-ipv4-cloudrun-1795601737738535295` reservation — the F-OPS.1-12 GC-lag
  class (~1–2h); retried until released → pass 2 to zero → orphan sweep + `rm`.

## Evidence report

(in the PR body + this ledger; `reports/2026-11-25_r7ux-2-timeline-walk/` carries the
screenshot and measured DOM facts.)

Teardown tail, completed after the GC lag: `destroy` pass 2 (12:11Z+) deleted the
remaining 87 resources → 0 — once Google released the
`serverless-ipv4-cloudrun-1795601737738535295` reservation (~1h24m after the Cloud Run
deletes, the F-OPS.1-12 class). Orphan sweep CLEAN across compute addressing, Cloud
Run, SQL, Redis, AlloyDB, secrets, buckets, DNS zones, cert-manager, VPC connectors,
scheduler, Artifact Registry, log sinks/metrics, custom IAM roles, and service
accounts — zero live `pr-419` resources. `rm` deregistered the stack (dev + prod
only remain). Records commit follows; ci re-read on the records head.
