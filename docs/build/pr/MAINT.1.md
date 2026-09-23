# MAINT.1 (RH.1) — migrate Rhēma onto build memory v2

Implements **RH.1** of `~/agent-skills/.agents/design/build-memory-v2-spec.md` (build-memory v2). A **doc/build-memory
reorg only — no code, no deploy, no spend.** It gives Rhēma's Phase-0 build a committed completion record.

## Summary

The multi-session Phase-0 build kept its machine ledger + 23 per-ticket run ledgers in the gitignored
`.agents/scratch/`, so the build had no committed record: the machine ledger never advanced past `SETUP`, and
five of the hand-inserted `16_P0.15*` sub-tickets never reached the manifest chain table. This migration adopts
the committed `docs/build/` v2 layout, reconstructs the machine ledger + build index from git and the 25 pull
requests, retro-fits the three build-time decisions as ADRs, and reconciles the manifest + docs — leaving
`check-build-memory.sh` green, **without renaming any numbered doc or ticket** (BM-COMPAT-05) and **without
rewriting any DEFERRALS row's substance**.

## What changed

- **Migrated (move/rename only, byte-identical):** 23 run ledgers `.agents/scratch/implement-spec_*.md` →
  `docs/build/runs/<ID>.md` (23/23 sha256 match); `.agents/` retired.
- **Reconstructed:** `docs/build/LEDGER.md` (v2 state-only: BM-LEDGER-02 CURRENT STATE + OPEN FINDINGS + GATE
  DECISIONS + RETURN PASS + PHASE LOG, one `done` entry per PR in chain order); `docs/build/BUILD_INDEX.md`
  (26 rows = 25 PRs + this ticket); a committed `docs/build/pr/<ID>.md` per PR (25); `docs/build/readouts/GATE-G1.md`.
- **ADRs:** `docs/adr/ADR-001..004` (retro-fitted records — cloud switch AWS→GCP + Anthropic API; `@rhema/protocols`
  committed member; SST→Pulumi IaC rewrite; build memory committed in git) + generated `docs/adr/README.md`.
- **Manifest + markers:** `companions:` + `req_id_pattern:` lines; chain-table rows for `16_P0.15e..i`; a
  `## Plan extensions` section; `(ADR-00x)` pointers on the spec amendments; the machine-ledger banner repointed
  to `docs/build/LEDGER.md`; a `> Updated` block on `16a_GATE-G1` (disposition now in `docs/build/`); `00a_HUMAN-H0`
  GCP-project + Anthropic-key items ticked with evidence.
- **Docs:** `docs/README.md` mode map; the `AGENTS.md` "Build memory" section; a `docs/2_research-and-design-ledger.md`
  change-log line.
- **DEFERRALS:** `PARTIAL` added to the status vocabulary; a `docs/build/LEDGER.md` pointer; AWS→GCP in the living
  header; 3 keyword-less rows given a canonical status prefix (see Design decisions). Existing rows not rewritten.
- **`.gitignore`:** re-includes `docs/build/` above the generic `build/` ignore; keeps `docs/build/logs/` ignored.

## Design decisions

- **Re-confirmed the stale spec figures** (the ticket's re-confirm instruction): **25 PRs** (P0.15i landed as
  PR #25, so not the spec's 24), **23 run ledgers** (not 22), **88 `D-*` rows** (not 60). The frozen AC's 22/24/25
  counts are superseded by the real counts.
- **Patched the shared validator instead of churning Rhēma** (operator-approved). The landed
  `check-build-memory.sh` keyed its duplicate-sequence check on the numeric filename prefix — so Rhēma's
  legitimate ID-suffixed inserts under one prefix (`16_P0.15`, `16_P0.15b`, …) tripped a false "duplicate
  sequence key" — and required a DEFERRALS status to be the last cell's first bare word, so 34 markdown/prose
  statuses read as "orphan". Fixed at root in a **separate agent-skills PR**: dedup on the ticket **id** (the real
  invariant), and recognize the status as the first canonical token appearing anywhere in the last cell. This
  keeps RH.1's out-of-scope intact (no ticket renamed; no DEFERRALS row rewritten); `tests/run-tests.sh` stays green.
- **3 DEFERRALS rows** (`D-P0.15h-3` → `DONE`, `D-P0.15h-4` → `PARTIAL`, `D-P0.15i-1` → `PARTIAL`) carried only
  Rhēma idioms (`ROOT-CAUSED`/`FIXED`/`CODE-FIXED`) with **no** canonical status keyword, so no parser could
  classify them; one keyword was prepended per row, preserving all prose/dates/evidence.

## Verification

- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` → **exit 0, 0 violations, 0 warnings**.
- Migration byte-identity: **23/23 sha256 match**; `test ! -d .agents` ✓.
- `git status` → only `.gitignore`, `AGENTS.md`, `docs/**` changed — **no code file touched**, so
  `pnpm turbo build lint typecheck` + `pnpm test` are unchanged from base (verified by construction; the
  pre-existing `infra/pulumi/Pulumi.dev.yaml` change is unrelated and excluded).
- `adr-index --check` byte-identical to the committed index; REQ→ticket coverage runs clean (470 spec ids).
- agent-skills `tests/run-tests.sh` → ALL PASS.

## Acceptance criteria → evidence

| RH.1 AC | Verdict | Evidence |
|---|---|---|
| `check-build-memory.sh .` exits 0 | met | exit 0, 0 warnings |
| `test ! -d .agents` | met | `.agents` removed |
| `runs/` one `<ID>.md` per migrated ledger, id in chain table | met | 23 migrated (+ `MAINT.1`); all ids in the chain table |
| LEDGER key set per BM-LEDGER-02; lastCompleted/chainTip real; PHASE LOG ≥ 24 done | met | `docs/build/LEDGER.md` (validator green); 24 PR `done` + seeds + `MAINT.1` |
| BUILD_INDEX rows per PR; every evidence path exists; `pr/` per PR | met | 26 rows; `pr/` ×25; each evidence file present |
| `docs/adr/` ADR-001..004 with `## Revisit trigger`; README generated; regenerates byte-identically | met | 4 ADRs; generated marker; `--check` byte-identical |
| `docs/README.md` one row per top-level entry; `AGENTS.md` ≤ 250 lines + build-memory paths | met | mode map present; AGENTS.md 83 lines with `docs/build/LEDGER.md`, `docs/build/runs/`, `DEFERRALS.md` |
| manifest chain row for every `NN*_` file incl. `16_P0.15e..i`, `16z_MAINT.1`; GATE-G1 no longer `.agents/scratch` | met | rows added; validator confirms; GATE-G1 has 0 `.agents/scratch` refs |
| moved files byte-identical | met | 23/23 sha256 |
| `pnpm turbo build lint typecheck` + `pnpm test` unchanged (no code) | met | git shows zero code files changed |
| fresh session states next row / ledger / owed-before-G1 from AGENTS.md + manifest | met | verified by fresh-context review |
| Phase gate: BUILD_INDEX row for MAINT.1; LEDGER closed with `nextTicket` | met | `MAINT.1` row; `nextTicket: P0.15j` |

## Deviations / notes

The validator patch is a **separate agent-skills PR** (out-of-repo, but the AC invokes that script). Everything
else is contained to Rhēma's `docs/`, `AGENTS.md`, and `.gitignore`. G1 remains **not passable** — the next chain
rows `16_P0.15j` (citation discipline, `D-P0.15i-2`) then `16_P0.15k` (the live G1 legs, `D-P0.15-1/-2`) close it.

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01SfYKXPDaRUsRqc5AgHDfWT
