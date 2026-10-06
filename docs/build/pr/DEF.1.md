# DEF.1 — Run-pipeline blockers (F1/F2/F3)

Ticket: `docs/tickets/55_DEF.1__run-pipeline-blockers.md` · run ledger: `docs/build/runs/DEF.1.md`
Stacks on `stevevitali/p1-22-launch-checks`. **Stage A only ($0)** — Stage B (deploy + bounded
re-runs of the killed legs at their original caps, ≤$33 combined) is operator-gated.

## Summary

STB.3 ran 10 bounded prod legs; **8 died on deployed defects**, ~511 committed credits absorbed to
retries on F1 alone. This PR fixes the three delivery-blocking ones at the root so STB.4 doesn't
spend real money over them:

- **F1 — missing `.rhema/phase-result.json`** (killed outline `01M3DC1V…`, research
  `01M3DETHZ8E…`, full profile `01M3DJ5V3D…`). Three composing root causes:
  1. **Stale `assistant` tools in prod** — `agent_types` is seeded `on conflict do nothing`, so a
     pre-P1.11 row kept `read/web_search/…` with **no `write`/`subagent`**; the §12.6 hook denied
     every Write. Fix: migration `0043_assistant_run_tools.sql` stamps the current list + `subagent`
     (research `fetch` is `allowsSubagents:true`); `code-seed.ts` synchronized.
  2. **Persona-root `.rhema/` unmounted** — `persona_builder` had `profile/**` but no `.rhema/**`
     (seat table), and harness-created dirs were 0755 harness-owned (EACCES for uid `agent`).
     Fix: persona-root `.rhema/**` mount + `makeTreeAgentWritable(personaRoot)`.
  3. **Invisible contract** — the phase-result hint only rode the `sidecar` opt-in; `profile_voice`
     never set it. Fix: `sidecar:true` + seat-aware `phase_result_contract` are unconditional
     inputs.
- **F2 — `second_read_producer_checked` unsatisfiable** (killed memo `01M3DKQR0…`; the live
  manifestation of **D-P0.15h-5**). The judge-class phase ran the normal seat agent, which could
  never satisfy an orchestrator-launched-scoped-query predicate (`[hook] Agent deny second-reader`
  was the correct boundary). Now: **runspec mints `producerQueryId` + records the
  `subagent_launches` row** and ships `scopedLaunch`; the harness executes the phase via
  `scoped-query.js` in a **private mount namespace** (`unshare --mount` + stash/overmount/ro-binds —
  the kernel sees ONLY the draft) under a **distinct uid** with `tools:["Read"]`, and persists the
  returned text as `05-second-read.md` + the `.rhema/second-read.json` marker itself. No mounted
  draft ⇒ no launch order ⇒ the predicate fails honestly. No run token or proxy credential crosses
  the scoped boundary (scrubbed env allowlist only).
- **F3 — `structure-plan.json` anchors** (killed draft `01M3DGGCZR…`): contract hint + SKILL text
  now say **omit `anchor` on a forward plan**; emit it only when reverse-outlining, and then as the
  exact §11.3 `{blockId,quote,startOffset,endOffset,confidence}` object. Schema unchanged (already
  correct — the defect was guidance).

## What changed

- New: `apps/run-task/src/scoped-phase.ts` (+test), `apps/run-task/src/scoped-query.ts`,
  `packages/db/migrations/0043_assistant_run_tools.sql`, `packages/protocols/src/second-read.ts`.
- Edited: `packages/orchestrator/src/runspec.ts` (scoped launch + unconditional phase-result
  contract), `apps/run-task/src/harness-main.ts` (scoped branch + persona-root writability),
  `apps/run-task/docker/scoped-runner.sh` (mount sequence + spec staging + uid drop),
  `apps/run-task/src/work-reader.ts` (persona-root reads + `producerQueryId` on the harvested
  version), `packages/hooks/src/seat-tables.ts`, `packages/contracts/src/sidecars.ts`,
  `packages/db/src/seed/code-seed.ts`, `packages/protocols/src/index.ts` + stub,
  `packages/protocols/skills/draft-from-outline/SKILL.md` + `upstream-port.manifest.mjs`,
  `packages/protocols/src/version.ts` (re-frozen `0.4.0+ec61156725a895ab`).
- Tests: `runspec` (launch order / no-launch honesty), `scoped-phase` (namespace spec + persistence
  + blocked honesty), `work-reader`, `sidecars`, `seat-tables`.

## Gates

`turbo build lint typecheck` 132/132 · `pnpm test` 3,534 pass · licenses 607 · protocol-markers 45 ·
no-cookies 28 · upstream-diff 22 (sanctioned only) · build-memory 0.

## Deferrals

- **D-P0.15h-5 → DONE in code** (live leg = this ticket's Stage B memo re-run).
- No new deferrals.

## Stage B (not run — operator-gated)

Deploy (`pulumi up` — run-task image + migration 0043), then re-run only the affected legs within
their original caps (outline ≤945, research ≤765, draft ≤1068, memo ≤1083 — combined ≤$33) and
record per-leg evidence in `runs/DEF.1.md` §5 before STB.4.
