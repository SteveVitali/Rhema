# ADR-004: `docs/` is committed and build memory is versioned in git under `docs/build/` — retro-fitted record

- **Status:** Accepted
- **Date:** 2026-09-01 (docs committed; extended to `docs/build/` by MAINT.1, 2026-09-10)
- **Ticket:** MAINT.1 (this PR); origin Q-13
- **Requirement ids:** REQ-ARCH-37 (record); BM-MIGR-01..07, BM-COMPAT-04..05
- **Spec:** rhema-design-spec §0 (front matter); `~/agent-skills/.agents/design/build-memory-v2-spec.md` §3–§10

> Retro-fitted by MAINT.1 from the research ledger's Q-13 (git-init decision) and the manifest banner "These docs
> are committed and tracked", then **extended** by this ticket to move build memory out of the gitignored
> `.agents/scratch/` into the committed `docs/build/` v2 layout.

## Context

Q-13 put the spec + research/design notes in a git repo (`~/Rhēma`), and the ticket contracts were committed
under `docs/tickets/` with the canonical spec regenerable — but the **machine ledger** and the **per-ticket run
ledgers** stayed gitignored under `.agents/scratch/` as "per-run machine state". That cost Rhēma a build with no
committed completion record: the machine ledger never advanced past `NOT_STARTED/SETUP`, five of eight
hand-inserted P0.15 sub-tickets never reached the manifest chain table, and the run ledgers (the record a fresh
session resumes from) were invisible to git and to a sibling worktree. `build-memory` v2 (agent-skills SK.1)
makes committed `docs/build/` the standard, opted in by the `<!-- build-memory: v2 -->` marker.

## Decision

**Commit the build's memory under `docs/build/` in the build-memory v2 layout.** The run ledgers move from
`.agents/scratch/implement-spec_*.md` to `docs/build/runs/<ID>.md` (move/rename only; byte-identical); the
machine ledger is reconstructed at `docs/build/LEDGER.md` (CURRENT STATE / OPEN FINDINGS / GATE DECISIONS /
RETURN PASS / PHASE LOG); `BUILD_INDEX.md` gets one row per PR with a committed `pr/<ID>.md` evidence file; build
decisions become ADRs under `docs/adr/` with a generated index; `.agents/` is retired. The layout is **validated**
by `check-build-memory.sh` (not merely conventional). Secrets never enter any ledger; the migration dropped only
regenerable logs.

## Consequences

- A fresh session (or a sibling worktree) resumes from `docs/build/LEDGER.md` on its own chain tip; the build's
  history (owed, decided, deferred, verified) is auditable in git.
- Historical ticket filenames are **not** renamed (BM-COMPAT-05, SHOULD) — the manifest chain table carries the
  sequence — so the frozen spec's citations to the numbered docs stay valid.
- No product code, schema, or spec requirement changed; `pnpm turbo build lint typecheck` + `pnpm test` are
  unaffected. `.gitignore` re-includes `docs/build/` above the generic `build/` ignore and keeps `docs/build/logs/`.

## Alternatives considered

- **Keep the machine + run ledgers gitignored (status quo).** Rejected: the sibling-worktree defect and the
  "state not versioned with the tip" problem are exactly what v2 fixes; Rhēma's build had no completion record.
- **Promote only selected artifacts, keep `.agents/scratch/`.** Rejected (v2 D1/D2): promotion is a second,
  error-prone step; a committed directory of run ledgers is not "scratch".

## Revisit trigger

Revisit if committed build memory measurably bloats the repo beyond audit value (a single run ledger/report
exceeds the validator's 5 MB flag, or `docs/build/` growth dominates clone size) or if `build-memory` upstream
changes the layout contract in a way this repo's paths cannot follow — then prune to `logs/`-style carve-outs or
adopt the new layout via a new ADR.
