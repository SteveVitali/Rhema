# R6ENG.1 — CI + provenance hygiene — run ledger

- **Spec:** `docs/tickets/176_R6ENG.1__ci-provenance-hygiene.md` (manifest row 176, round 6 —
  first round-6 row, Kind: ticket) — `implement-spec`
- **Base:** `stevevitali/r6-planning-corpus` tip @ `80adbcd` (the PR carries the round-6
  planning/decomposition commits — the `r5-synthesis` → #172 precedent)
- **Branch:** `stevevitali/r6eng-1-ci-provenance-hygiene` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills`
- **Requirement ids stamped:** REQ-ENG-1 REQ-ENG-4 REQ-ENG-5 REQ-ENG-6 REQ-ENG-8
- **Live stage:** offline-only · **Production mutations:** none · **Gate status:** none
- **Started:** 2026-10-20T16:34:33Z
- **Closed:** 2026-10-20T18:1xZ (commit-A closeout; the BL-87/D-R5REC.1-1 flips ride commit B
  on the second consecutive green CI read — their verify clause)
- **ci:** pass #195@`52389f4` (run 39465573137 — all five jobs, first attempt; unit 32m24s
  read through — zero mount-settle recurrence; boundary re-read 2026-10-20T18:10:11Z after
  the images tail outlasted the 2700s bound, the #193 precedent)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol — AGENTS.md). Rows this ticket unblocks:
`D-R5REC.1-1` (mount-settle flake — REQ-ENG-1 is its fix leg; flips DONE at closeout on the
two-green-CI evidence per its verify line) · `D-STB.5b-1` (doc half — REQ-ENG-5; its live
re-proof already landed via D-CAP.3-1 2026-10-06). `D-P1.22-2` gets a dated disposition note
(census §5 flag). Opened: none planned (any unverifiable AC → a new row this run).

## Requirements

- **REQ-ENG-1.** Replace bare/`!` post-mount selector access with mounted/settled `waitFor` in
  `outline.dom.test.tsx` + `figures.dom.test.tsx`; audit every `*.dom.test.tsx` sibling; commit
  the audit table under `docs/build/reports/2026-10-20_R6ENG.1/`. No assertion weakened.
- **REQ-ENG-4.** `references` for the five CIREP.1-recorded deps: `integration` →
  `@rhema/ledger` + `@rhema/live-clients`; `packages/benchmark` → `@rhema/findings-core` +
  `@rhema/mirror`; `apps/egress-proxy` → `@rhema/db`. The CIREP.1 drift check green.
- **REQ-ENG-5.** System-role `JOURNEY_DATABASE_URL` binding convention documented where the
  runbook + ADR-093 are read. (Live re-proof = R6FOR.1's; already verified live 2026-10-06 via
  D-CAP.3-1.)
- **REQ-ENG-6.** Verify the BL-02 cell-shape sweep clean; disposition each census §5 flag (flip
  with cited evidence or keep with named residual); re-point `REQ-FIX-BL22-T7DEST` →
  `deferral:D-P1.04-2`.
- **REQ-ENG-8.** Nightly provenance assert accepts `main` HEAD when deployed SHA is an ancestor
  and `git diff <deployed>..HEAD` ⊆ committed deploy-neutral allowlist; any other diff fails as
  today. Unit-pin both arms + a non-ancestor arm. The allowlist is this ticket's owned decision
  → ADR.

## Acceptance criteria

- [ ] Two consecutive green full-suite CI runs after the ENG-1 change; flaked tests pass in a
  loop locally ≥20 iterations *(deterministic · engineered)*
- [ ] Every `*.dom.test.tsx` audited; each finding fixed or explicitly cleared *(engineered)*
- [ ] `pnpm turbo build lint typecheck` + the CIREP.1 drift check green *(engineered)*
- [ ] ENG-8: tolerance accepts docs-only drift, rejects code drift + non-ancestry, each pinned
  by a test *(engineered)*
- [ ] Census §5 flags dispositioned; no cell flips without its evidence pointer *(engineered)*
- [ ] Universal phase-gate AC *(agentic)*

## Plan

1. **ENG-1** — `mountAt` in the two files gains the settled gate: `vi.waitFor` on
   `document.documentElement`'s `data-mounted` attribute (the REQ-NAVT-2 resolved-leaf marker,
   stamped by `spa/head.tsx` once the route's match resolves — `inbox.dom.test.tsx:201` already
   asserts it through this same mount path). A `settled(selector)` helper (document-scoped
   `vi.waitFor` returning the element) replaces the bare/`!` interaction targets. Siblings on
   the same `createSpaRouter` mount substrate get the same `mountAt` gate; non-router mounts
   (sync `render`/`createRoot` inside `act` — no async leaf boundary) are cleared with the
   reason recorded. Audit table → `reports/2026-10-20_R6ENG.1/dom-test-audit.md`.
2. **ENG-4** — three tsconfig edits; re-run `docs/build/logs/cirep1-drift-audit.mjs` → `NO DRIFT`.
3. **ENG-5** — ADR-093 dated addendum (append-only) + `packages/journeys/README.md` citation.
4. **ENG-6** — BL-02 sweep re-verified (positional canonical lead, 0 dirty / 0 orphans over 332
   rows); census §5 flag dispositions in `reports/2026-10-20_R6ENG.1/census-flag-dispositions.md`
   (BL-06 → closed with PR evidence; BL-80/82/74/24 keep-open with named residuals; D-P1.22-2
   dated cell note); COVERAGE_MATRIX routing re-point.
5. **ENG-8** — `scripts/deploy-neutral-paths.txt` (the committed allowlist — owned decision);
   the drift arm in `scripts/check-deploy-provenance.mjs` (standalone gate) and
   `packages/journeys/src/provenance.ts` (the in-process twin — the established twinning
   convention), wired in `cli.ts`; `journeys.yml` `fetch-depth: 0`; unit pins both arms +
   non-ancestor; ADR-114.

## Test matrix

| AC | test |
|---|---|
| ENG-1 flake dead | ≥20 local iterations of the two files; sibling mountAt settle; audit table |
| ENG-4 | `cirep1-drift-audit.mjs` → NO DRIFT; `pnpm turbo typecheck`/`tsc -b` scoped build |
| ENG-8 docs-only arm accepted | temp-git fixture test in `check-deploy-provenance.test.mjs` + `packages/journeys` provenance drift tests |
| ENG-8 code-drift arm rejected | same fixtures, code-path change → FAIL |
| ENG-8 non-ancestor arm rejected | divergent-branch deployed sha → FAIL |
| ENG-6 | `check-coverage-matrix.test.mjs` green; BL-02 sweep output committed |

## Progress

- 2026-10-20T16:34Z — branch forked @ `80adbcd`; spec + cited context loaded (round-6 spec §4.1/§8,
  DEFERRALS rows D-R5REC.1-1/D-STB.5b-1, LEDGER OPEN FINDINGS CIREP.1 audit verbatim, BACKLOG
  BL-02/06/24/74/80/82/87, census §5/§7, manifest invariants + operating rules, anchors).
- BL-02 cell-shape sweep **verified clean**: `deferral-status-census.mjs` → 332 rows, positional
  leads all canonical (DONE 193 / OPEN 67 / PARTIAL 29 / WONTFIX 43), 0 dirty leading tokens,
  0 orphans.
- Baseline: base tip `80adbcd` green in CI at the boundary read (PHASE LOG: pass #194@ad308e7,
  stack #180–193 green).
- 2026-10-20T17:0xZ — REQ-ENG-1 implemented: `settled()` + `SETTLE_TIMEOUT` in
  `apps/web/src/spa/testkit.ts`; `data-mounted` mount gates in the 15 router-mount siblings;
  `settled` on top-level post-mount lookups in outline/figures/inbox/dossier/export/
  onboarding/project-home/run-sheet/settings/transitions/usage/voices; six custom-substrate
  siblings explicitly cleared (spa/intercept/ide-chrome/page-collab/page-source/dom-contract —
  reasons in the audit table).
- REQ-ENG-1 second root cause found + fixed: the `*After` fixtures served on read COUNT —
  a StrictMode/staleTime-0 mount refetch could consume the post-mutation truth before the
  mutation posted (cited → delete form legitimately absent; pendingProposal → propose form
  absent). All three stubs (`outlineAfter`, `cardAfter`/`figuresAfter`, `twinAfter`) now gate
  on `posts.length > 0`. `settled` timeout errors now carry a 2000-char DOM excerpt so a
  future capture self-describes the rendered arm.
- REQ-ENG-4 green: five references added (integration→ledger/live-clients, benchmark→
  findings-core/mirror, egress-proxy→db); CIREP.1 drift audit `NO DRIFT` (47 manifests).
- REQ-ENG-5 green: ADR-093 dated addendum + `infra/PROD-BRINGUP.md` convention paragraph
  (journeys README already carried it); ADR index regenerated via `adr-index.sh docs/adr`.
- REQ-ENG-6 green: BL-02 sweep re-verified (332 rows / 0 dirty); §5 dispositions in
  `reports/2026-10-20_R6ENG.1/census-dispositions.md` — BL-06 flipped closed with evidence,
  BL-24 annotated (injection smoke discharged 2026-10-15), BL-80/82/74 kept with named
  residuals, D-P1.22-2 dated cell note appended; `REQ-FIX-BL22-T7DEST` re-pointed →
  `deferral:D-P1.04-2`; `check-coverage-matrix` 6/6 green.
- REQ-ENG-8 green: `scripts/deploy-neutral-paths.txt` + `scripts/deploy-neutral.mjs`;
  drift arm in `check-deploy-provenance.mjs` (PASS + drift note) and
  `packages/journeys/src/provenance.ts` (`deployNeutralDrift` + `provenanceDriftCheck`,
  `report.provenance.drift` labels the drifted legs); `cli.ts` second-opinion wiring;
  `journeys.yml` `fetch-depth: 0`; ADR-114 records the owned allowlist (docs/ subtree +
  `.gitleaks.toml`; workflows deliberately NOT neutral). Tests: 22 green —
  7 in `check-deploy-provenance.test.mjs`, 15 in `provenance.test.ts` — all three arms
  pinned (exact, allowed ancestor drift, rejected code drift/non-ancestor/absent) plus the
  fail-closed-outside-repo arm.
- 2026-10-20T17:4xZ — self-review pass 1 caught two defects: the `### Config keys` heading
  swallowed in `infra/PROD-BRINGUP.md` (restored), and an ADR-number collision — the
  round-6 decomposition pre-allocates **ADR-113** to R6UCD.1's §13.3 amendment (manifest
  row 179 + spec fold row 205); the deploy-neutral ADR renumbered to **ADR-114** everywhere
  (file, all citations, index regenerated).
- Phase 5 verification: `pnpm turbo build lint typecheck` **135/135** · `pnpm test`
  **502 files / 5,827 pass / 4 skip / 0 fail** · all six check:* green (licenses,
  protocol-markers, no-cookies, spa-budget, spa-env, dom-contract) · check-build-memory
  **0 violations** (7 pre-existing legacy warnings) · append-only vs `e4a43a2` OK ·
  CIREP.1 drift audit `NO DRIFT` (47 manifests) · check-coverage-matrix 6/6.
- Flake loop on the final code: **25/25 iterations clean** (50/50 tests each) —
  `reports/2026-10-20_R6ENG.1/flake-iterations.md`. Self-review pass 2: `settled` call
  signature uniform (95 call sites), counters write-only removed, diffs re-read.

## Gap table

| # | item | verdict |
| --- | --- | --- |
| REQ-ENG-1 | settle gates + `settled` in both files; every sibling audited (15 gated, 6 explicitly cleared); audit table committed; ≥20 iters | **met** — 25/25 clean; `dom-settle-audit.md` + `flake-iterations.md`; two CI green runs read at closeout |
| REQ-ENG-4 | five references; CIREP.1 audit green | **met** — `NO DRIFT` (47 manifests); turbo 135/135 |
| REQ-ENG-5 | convention where runbook + ADR-093 are read | **met** — ADR-093 addendum + PROD-BRINGUP §2 paragraph; README already carried it; live re-proof stays R6FOR.1's |
| REQ-ENG-6 | BL-02 sweep clean; §5 dispositions; re-point T7DEST | **met** — 332/0 dirty; `census-dispositions.md`; BL-06 flipped, BL-24 annotated, D-P1.22-2 noted, rest kept; 6/6 matrix tests |
| REQ-ENG-8 | ancestor + allowlist-diff tolerance; pinned arms | **met** — allowlist committed; both consumers gated; 22 tests (3 arms + outside-repo); ADR-114; `fetch-depth: 0` |
| AC | two consecutive green full-suite CI runs | **CI-bound** — local evidence green; recorded after the PR read (closeout) |
| AC | every `*.dom.test.tsx` audited; no assertion weakened | **met** — audit table; waits + fixture-order fix only, assertions untouched |
| AC | verification green; new behaviour has a failing-if-removed test | **met** — all gates above; provenance arms + settled waits pinned |
| AC | requirement ids stamped in the PR | **met at PR** — `pr/R6ENG.1.md` stamps REQ-ENG-1/4/5/6/8 |
| AC | unverifiable → DEFERRALS row | **met** — nothing new deferred; D-R5REC.1-1/BL-87 flips at closeout on CI evidence per their verify clauses |
| AC | ADR for owned decision | **met** — ADR-114 (deploy-neutral allowlist, owned; R6SWP.1/R6WATCH.1 consume) |
| AC | dates from the clock | **met** — 2026-10-20 throughout |
| AC | PR checks read + recorded | **at closeout** — `ci-boundary.sh --pr <n> --stack` |
| AC | protected records append-only | **met** — DEFERRALS/ADR-093 appended; append-only check OK; BACKLOG.csv row flips are the census-sanctioned dispositions with evidence pointers |
| AC | no living-record pins | **met** — SHAs cited are historical facts |
| Scope | no product code, no live legs | **met** — testkit/tests/scripts/workflow/docs only; zero prod contact, $0 |
| Size | ~400 lines excl. fixtures | **over** — sibling-audit breadth + REQ-ENG-8 twin implementation; the contract's own split clause covers it (ENG-8 is a separable unit but one PR was kept per the run's single-branch convention) |

## Evidence log

| gate | command | result |
| --- | --- | --- |
| turbo | `pnpm turbo build lint typecheck` | **135/135** |
| tests | `pnpm test` | **502 files / 5,827 pass / 4 skip / 0 fail** |
| licenses | `pnpm check:licenses` | 822 packages OK |
| markers | `pnpm check:protocol-markers` | 248 files clean |
| cookies | `pnpm check:no-cookies` | 257 surfaces clean |
| budget | `pnpm check:spa-budget` | ceilings held |
| env | `pnpm check:spa-env` | 115 sources clean |
| dom | `pnpm check:dom-contract` | journey ⊆ manifest ⊆ emitted ⊆ asserted |
| build-memory | `check-build-memory.sh .` | **0 violations** (7 pre-existing legacy warnings) |
| append-only | `check-append-only.mjs --base e4a43a2` | OK |
| drift | `cirep1-drift-audit.mjs` | `NO DRIFT` (47 manifests) |
| matrix | `check-coverage-matrix.test.mjs` | 6/6 |
| flake loop | vitest × 25 on the two files | **25/25 clean** — `flake-iterations.md` |
| provenance | two test files | **22 green** — exact/drift/code/non-ancestor/outside-repo arms |

## Evidence report

PR **#195** `stevevitali/r6eng-1-ci-provenance-hygiene` → `stevevitali/r6-planning-corpus`
(OPERATOR — unmerged). Carries the round-6 planning/decomposition commits
(r5-synthesis → #172 precedent). Head `52389f4`.

**CI read (exact head):** `ci: pass #195@52389f4` — images / integration / contracts /
public-safe / typecheck+lint+unit all pass, run 39465573137, read 2026-10-20T18:10:11Z
via `ci-boundary.sh --pr 195 --stack` (record `/tmp/…/ci-boundary.qoczm3`; the images tail
outlasted the first 2700s bound → job-polled → boundary re-read, the #193 precedent).
`typecheck / lint / unit` green **32m24s first attempt — zero mount-settle recurrence.**

**AC layer statement:** every engineered AC is offline-verified except the AC's first
clause — "two consecutive green full-suite CI runs" needs a second head's read: commit A
(this one) triggers run #2; the BL-87 + D-R5REC.1-1 flips land in commit B only on that
second green, per the deferral's verbatim verify clause. No live/deploy/nightly/funded
claim is made anywhere — REQ-ENG-8's first real nightly read is R6SWP.1's; BL-74's
scheduled-nightly evidence stays owed.
