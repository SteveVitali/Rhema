# DOC.2 — agent docs refresh (run ledger)

- **Spec:** `docs/tickets/93_DOC.2__agent-docs-refresh.md` (manifest row 93, round-3 tail —
  the last chain row)
- **Base:** `stevevitali/doc-1-repo-docs-refresh` @ `20e29ec` (PR #114 open; tree verified
  clean at fork; `git log -1` = `20e29ec`)
- **Branch:** `stevevitali/doc-2-agent-docs-refresh` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-cli subagent (Cognition agentic coding CLI)
- **Skills:** agent-docs @ `~/agent-skills` (refresh mode, scope `.`)
- **Requirement ids stamped:** REQ-SPEC-29 / REQ-SPEC-30 / REQ-SPEC-31 / REQ-SPEC-32 (the
  round-3 invariants the refreshed doc records)
- **Started:** 2026-10-04
- **Closed:** 2026-10-04
- **Config:** docs-only; **Live stage: none**; metered spend **$0**; zero prod writes, zero
  deploys, zero merges

## What this run did

Ran `agent-docs` refresh mode end-to-end on scope `.` against the composed build at
`20e29ec` (rounds 0–3, PRs #1–#114). The repo's agent-facing doc surface is the root
`AGENTS.md` (119 lines after this run — inside the ~250-line root budget); there is one
doc, no nested `AGENTS.md`/`agent_docs/` tree.

### Phase 0 — detector (first run)

`check-agent-docs-freshness.sh .` → 2 docs scanned, **4 critical**:

| Ref | Truth | Disposition |
|---|---|---|
| `.claude/worktrees/agent-*/AGENTS.md:43` `../../tsconfig.base.json` | a stale snapshot inside a **registered but gitignored** Claude-Code worktree (clean, on merged branch `stevevitali/rh1-build-memory-v2-migration` @ `201c013`) | **detector fix** — agent-harness dirs are out of scope (the skill's own commit rule excludes `.claude/`) |
| `AGENTS.md:18` `docs/build/LEDGER.md` | file exists and is committed | **detector fix** — the `*/build/*` exclusion nuked `docs/build/`, the build-memory root the same script's check 1F requires |
| `AGENTS.md:19` `docs/build/BUILD_INDEX.md` | file exists and is committed | same |
| `AGENTS.md:55` `../../tsconfig.base.json` | real drift — a package-relative path written where the detector (and a cold reader) resolves it repo-relative | **doc fix** (below) |

### Upstream detector fixes (applied in `~/agent-skills`, left uncommitted for review)

`skills/agent-docs/scripts/check-agent-docs-freshness.sh`:

1. `EXCLUDES` `*/build/*` → `-not ( -path */build/* -and -not -path */docs/build/* )` —
   build-output dirs stay excluded; the committed `docs/build/` memory root is indexed
   again. (macOS BSD `find` rejects `\(`— bare `(` `)` tokens required; verified live.)
2. `*/.claude/*` added to `EXCLUDES` and to the `AGENTS.md`/`agent_docs` doc find — stale
   worktree snapshots under `.claude/worktrees/` no longer produce phantom criticals.
   The worktree itself is left in place (gitignored, registered, clean — removal is an
   operator call).

### AGENTS.md — drift fixed

- **Commands comment (the flagged drift):** "runs against public stubs unless
  `RHEMA_PROTOCOLS_PATH` is set" was dead since the 2026-09-01 REQ-ARCH-37 amendment —
  `@rhema/protocols` is a **committed workspace member**; only `@rhema/evals` is
  path-resolved via `RHEMA_EVALS_PATH` (`.pnpmfile.cjs` + `scripts/resolve-protocols.mjs`
  verified). Comment corrected. Same fix DOC.1 made to `CONTRIBUTING.md`.
- **Command rows:** added `pnpm check:no-cookies` (the never-cookies ingestion gate, a
  real public-safe job step per `.github/workflows/ci.yml`); all other rows verified
  against root `package.json` scripts.
- **Stages:** `prod` was documented "AlloyDB min primary kept warm" — prod is **Cloud SQL
  `db-g1-small`** since the 2026-09-17 PRB.15 amendment (`infra/config/stages.ts` —
  `engine:"cloudsql"`; the ~$50/mo budget cannot carry an AlloyDB primary). dev/previews
  keep AlloyDB.
- **`../../tsconfig.base.json`:** reworded to "extending the repo-root `tsconfig.base.json`
  (`extends` = "../../tsconfig.base.json" from the package dir)" — accurate for both
  `apps/` and `packages/` members, and no longer a repo-relative dangling ref.

### AGENTS.md — sections added (per the ticket's round-3 notes)

- **Round-3 invariants** (00_MANIFEST § Cross-cutting invariants 12–14): journey
  acceptance (REQ-SPEC-29, ADR-016), user-serving vs system DB pools (REQ-SPEC-30,
  ADR-017), money/research truthfulness (REQ-SPEC-32, REQ-SPEC-31, ADR-014/015).
- **Browser journeys (JOURNEY.1):** `rhema-journeys` run instructions — build +
  `playwright install`, `--stage` (only `prod` has real DNS; other stages need
  `--web`/`--api`), `--steps` CSV, `--expect-sha`, `--paid` (weekly, spend-guard bound),
  the post-ADR-093 **`JOURNEY_DATABASE_URL` must be the system-role DSN** rule (an
  app-login DSN reads `usage_records` as $0 through FORCE RLS and blinds the guard), and
  the `expected:"red"→"green"` owner-flip convention. All verified against
  `packages/journeys/src/cli.ts` + its README.
- **Build memory:** the section already existed (marker present in
  `docs/build/README.md`); added `mergePolicy: OPERATOR` (the operator merges bottom-up,
  a run never merges) and the `check-append-only.mjs --base <sha>` validator alongside
  `check-build-memory.sh`.

### Phase 2 — shared tail

- **Validation re-run:** `check-agent-docs-freshness.sh .` → **0 issues, exit 0**.
- **Consistency sweep:** the one doc re-read end-to-end — no contradictions (Commands
  rows ↔ `package.json`, CI order ↔ `ci.yml`, stage facts ↔ `stages.ts`, pool rule ↔
  `cli.ts` comment + ADR-093).
- **CLAUDE.md bridge:** none existed — created root `CLAUDE.md` = `@AGENTS.md` (one
  source of truth across harnesses).
- **Coverage gaps / line-count drift / key-file tables:** none reported (the doc carries
  no `~N lines` claims and no Key Files table; every package dir is covered by the root
  doc under the ≥5-source-file rule).

## Verification

- `check-agent-docs-freshness.sh .` — **0 critical / 0 issues, exit 0** (deterministic
  AC; Build-memory section present — the 1F coverage check).
- `node docs/build/tools/check-append-only.mjs --base 20e29ec` — **OK**.
- `check-build-memory.sh .` — **0 violations**.
- Commands verified against `package.json` scripts, `ci.yml` job steps, `stages.ts`,
  `cli.ts` — nothing cited that code does not do.
- No code changed; no tests added (docs-only ticket) — the deterministic gate suite was
  not re-run since nothing it covers moved.

## Deferrals

- No DEFERRALS row unblocked or closed by this ticket; none opened (nothing deferred —
  the detector fixes were tooling bugs, the doc drift was fixed in place, the stale
  `.claude` worktree is noted for the operator, not owed work).

## Evidence

- Detector before: 4 critical (see table above) → after: **0 issues**.
- `git diff AGENTS.md` — commands comment, `check:no-cookies` row, `tsconfig.base.json`
  ref, Cloud-SQL stage correction, mergePolicy + append-only validator in Build memory,
  +35 lines (Round-3 invariants + JOURNEY.1).
- New file `CLAUDE.md` (one line: `@AGENTS.md`).
- Upstream (uncommitted, reported): `~/agent-skills` `check-agent-docs-freshness.sh`
  `docs/build` + `.claude` exclusion fixes.
