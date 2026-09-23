# MAINT.1 (RH.1) — migrate Rhēma onto build memory v2

- **Sequence:** first of the three post-P0.15i follow-ups · **Phase:** 0 (maintenance) · **Kind:** ticket · **Gate:** none · **Live stage:** offline-only (NO spend)
- **base_branch:** the current chain tip (`stevevitali/p0-15i-agent-web-research-sandbox`, PR #25, if unmerged; else its merge). This is a doc/build-memory reorg only — no code, no deploy.
- **Depends on:** the `build-memory` skill being installed (SK.1 landed — `build-memory`, `synthesize-spec`, `reconcile-build` are present). Nothing in Rhēma's runtime.
- **Run:** `implement-spec spec=docs/tickets/16z_MAINT.1__build-memory-v2-migration.md`

## Authoritative contract

This ticket implements **RH.1** of `~/MetaHarness/build-memory-v2-spec.md`. **Read that spec's Part 0 and
Part I in full first — they are the contract** — then the `RH.1` section (Part II), and
`~/agent-skills/skills/build-memory/layout.md` + the `build-memory` SKILL.md (migrate / init / adr-index
modes). Implement RH.1 exactly as specified there; this file is the chain-table entry + the build-time
reconfirmations, not a re-statement of the contract.

## What RH.1 does (summary — the spec is authoritative)

Bring Rhēma onto the v2 layout **without renaming the numbered docs the frozen spec cites**:
1. **Init + migrate** (BM-MIGR-01): `build-memory init` + `build-memory migrate from=.agents/scratch apply=true` — move the run ledgers to `docs/build/runs/<ID>.md`, the machine ledger to `docs/build/LEDGER.md`; retire `.agents/`.
2. **Ledger reconstruction** (BM-MIGR-02): rewrite `LEDGER.md` to the v2 state-only shape; PHASE LOG = one "done" entry per landed PR in chain order.
3. **`BUILD_INDEX.md`** (BM-MIGR-03): one row per PR + a committed evidence file per PR under `docs/build/pr/`.
4. **ADRs** (BM-MIGR-04): retro-fit `ADR-001..004` from the manifest's "Spec amendments applied" + the research-ledger change log; generate `docs/adr/README.md`.
5. **Manifest + markers** (BM-MIGR-05): add the missing chain-table rows for the hand-inserted `16_P0.15e…i` **and** the two new follow-ups this session created (`16_P0.15j`, `16_P0.15k`) **and** this ticket; add the `## Plan extensions` section; append `(ADR-00x)` pointers; append the `> Updated` block to `16a_GATE-G1`; tick the provably-done `00a_HUMAN-H0` items.
6. **Deferrals** (BM-MIGR-06): extend the header status vocabulary (`PARTIAL` already in use); add the `docs/build/LEDGER.md` pointer; do NOT rewrite existing rows.
7. **Docs** (BM-MIGR-07): `docs/README.md` mode map; the `AGENTS.md` "Build memory" section (≤ 250 lines, existing "Deferred obligations" stays first).
8. **Validation**: `check-build-memory.sh .` green; add the `req_id_pattern` line so REQ coverage runs.

## Re-confirm at build time (the spec's numbers have MOVED since it was written — 2026-09-10)

- **P0.15i landed** as PR #25 with its own run ledger and DEFERRALS edits. So the spec's "22 run ledgers / 24 PRs / 60 `D-*` rows" figures are now higher — **count them yourself** (`ls .agents/scratch/implement-spec_*.md`, `gh pr list --state all`, `grep -c 'D-P0' docs/tickets/DEFERRALS.md`) and use the real counts.
- `LEDGER.md` `lastCompleted` = the newest landed sub-ticket (P0.15i); `chainTip` = the current branch; `nextTicket` after `16z_MAINT.1` is `16_P0.15j` (the citation-discipline ticket), NOT `16a_GATE-G1` — G1 now runs after `16_P0.15k`.
- DEFERRALS already carries P0.15e–i rows plus new `D-P0.15i-1` and `D-P0.15i-2` — reflect them.
- `.agents/scratch` resolves to the shared path under the git-common-dir, so the ledgers are reachable from a worktree.

## Acceptance criteria

Exactly RH.1's ACs in the spec (deterministic + the fresh-context reviewer check). Headline: `check-build-memory.sh .` exits 0; `test ! -d .agents`; `docs/build/runs/` has one `<ID>.md` per migrated ledger; `LEDGER.md`/`BUILD_INDEX.md`/`docs/adr/` per BM-LEDGER/INDEX/ADR; the manifest chain table has a row for every `NN*_` ticket file (incl. `16_P0.15e…i`, `16_P0.15j`, `16_P0.15k`, `16z_MAINT.1`); `pnpm turbo build lint typecheck` + `pnpm test` unchanged (no code touched).

## Out of scope

Renaming numbered docs; editing existing DEFERRALS/ticket rows beyond the living-header/append edits RH.1 specifies; any code change; running G1; merging.
