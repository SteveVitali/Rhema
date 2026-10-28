# AGENTS.md — Documentation and build records

## Purpose

- Maintain contributor/operator guidance while preserving the specifications and evidence explaining
  how Rhema was built. Root `AGENTS.md` applies.
- Classify a document with `docs/README.md` before editing; maintained guidance, generated output,
  and historical records have different update rules.

## Key Files

| File                                     | Lines (approx) | Purpose                                           |
| ---------------------------------------- | -------------- | ------------------------------------------------- |
| `docs/build/tools/check-append-only.mjs` | ~250           | Checks protected history against a base revision. |
| `docs/build/README.md`                   | ~50            | Build-memory marker and record layout.            |

## Build & Test

- Run from the repo root, using the actual PR base instead of `origin/main` for a stacked change:

```bash
node docs/build/tools/check-append-only.mjs --base origin/main
```

- The structural checker belongs to the external `agent-skills` checkout. When that prerequisite
  is installed, run it too; an absent checker is an unrun check, not a pass:

```bash
bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .
```

- Validate changed links, example commands, and cited behavior against the current tree. Some tests
  read docs and build records; follow `docs/ci.md` instead of assuming Markdown changes skip CI.
- Format only the maintained files being changed. Do not run a formatter across historical records.

## Code Conventions

- Correct ✓: amend a historical claim with a dated note identifying new evidence.
  Wrong ✗: rewrite the earlier claim so it appears the evidence existed all along.
- Keep maintained onboarding pages focused on current workflows, and link to history for rationale.
  Distinguish source behavior from configured activation and observed deployment.
- State prerequisites before runnable commands; distinguish offline tests from credentials, cloud
  infrastructure, operator actions, or paid inference. Never embed a real credential in an example.
- Preserve generated artifacts through their owning generators. `docs/adr/README.md` is generated
  by `build-memory adr-index`; do not edit it by hand.

## Critical Gotchas

1. **DEFERRALS is a durable ledger.** Read `docs/tickets/DEFERRALS.md` at the beginning of a run.
   Verify newly unblocked owed criteria for your ticket; append new deferrals in the same run.
   Never delete a row. A status update retains earlier evidence and adds its dated verification or
   disposition. Phase gates cannot pass over unresolved phase-scoped OPEN rows.
2. **Contracts and history are append-only.** Preserve landed specifications, ADRs, run records,
   PR bodies, gate readouts, and historical log entries. Use a dated amendment or new ADR;
   respect any more specific update mode documented by the owning file.
3. **Machine-readable state has a schema.** `docs/build/LEDGER.md` contains CURRENT STATE,
   OPEN FINDINGS, GATE DECISIONS, RETURN PASS, and PHASE LOG. Preserve its keys and headings;
   `nextTicket` and `chainTip` are operational state, not free-form prose.
4. **The chain and records must agree.** `docs/tickets/00_MANIFEST.md` § The chain owns order.
   `docs/build/BUILD_INDEX.md` has one row per landed PR/chain record;
   `docs/build/runs` holds per-ticket ledgers, `docs/build/pr` PR bodies,
   `docs/build/readouts` gate readouts, and `docs/build/reports` committed evidence.
   Only `docs/build/logs` is the gitignored memory subtree; `.agents/scratch` is retired.
5. **Identifier grammar is shared across records.** Use the table below; do not create another
   spelling for an existing carrier or silently reuse an ID.
6. **A gate pauses for a ruling; it is not an implementation blocker.** Preserve the distinction
   between an awaiting decision, failed verification, and an accepted deviation. Build-chain PRs
   stack, `mergePolicy: OPERATOR` stays in force, and a run never merges itself.
7. **Public-facing prose is not a disclosure approval.** Private protocol/eval material and secrets
   must not be copied into guides, examples, event descriptions, screenshots, or logs. Public export
   readiness has its own review; do not rewrite a historical record to conceal that review gap.

## Terminology

| Identifier        | Record                                                                   |
| ----------------- | ------------------------------------------------------------------------ |
| `D-<TICKET>-<n>`  | Deferral carrier in `docs/tickets/DEFERRALS.md`.                         |
| `GD-<TICKET>-<n>` | Gate decision in the ledger's GATE DECISIONS section.                    |
| `F-<TICKET>-<n>`  | Defect found during live verification.                                   |
| `V-<n>`           | Post-deploy verification stream (post-SPA disposition specification §9). |
| `BL-<n>`          | Backlog item in `docs/build/BACKLOG.csv`.                                |

## Do / Don't

- **Do:** make current guidance easy to find while retaining the dated evidence behind it.
- **Don't:** mark work complete, close an obligation, or claim a live capability on documentation alone.
