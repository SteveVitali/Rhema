# AGENTS.md — Orchestrator

## Purpose

- Own run creation, lifecycle transitions, locking, gates, retries, delivery, and accounting coupling.
- Root `AGENTS.md` applies. API/worker code adapts this injected core to service infrastructure.

## Architecture

- `TxRunner`, clock, queue, ledger, event writer, and launch interfaces are injected.
- `packages/live-clients` provides production adapters; colocated tests use deterministic seams.
- The ledger interface is defined here, with the SQL implementation in `packages/ledger`.
  Preserve that dependency direction.

## Key Files

| File                                           | Lines (approx) | Purpose                                              |
| ---------------------------------------------- | -------------- | ---------------------------------------------------- |
| `packages/orchestrator/src/state-machine.ts`   | ~100           | Allowed lifecycle edges and terminal states.         |
| `packages/orchestrator/src/run-creation.ts`    | ~350           | Run admission and initial state/hold work.           |
| `packages/orchestrator/src/internal-api.ts`    | ~2.1k          | Harness-facing phase and commit operations.          |
| `packages/orchestrator/src/phase-loop.ts`      | ~200           | Phase progression and completion decisions.          |
| `packages/orchestrator/src/spend.ts`           | ~300           | Proxy-meter reconciliation and debit-mode semantics. |
| `packages/orchestrator/src/research-budget.ts` | ~100           | Research budget remaining across attempts.           |

## Build & Test

```bash
pnpm turbo build --filter=@rhema/orchestrator...
pnpm --filter @rhema/orchestrator typecheck
pnpm --filter @rhema/orchestrator lint
pnpm exec vitest run packages/orchestrator/src
```

- Run from the repo root. For changes affecting service wiring, build the relevant API/worker
  dependency closures and run the FakeEngine integration suite described in `docs/testing.md`.

## Code Conventions

- Route state changes through `applyTransition` / `transition` in
  `packages/orchestrator/src/transition.ts`; state and `run.state_changed` commit together.
- Correct ✓: perform a guarded transition and its associated writes in one tenant transaction.
  Wrong ✗: update `runs.state` directly and publish the event in an unrelated transaction.
- Keep transaction-scoped dependencies inside the caller's transaction and retain idempotency
  keys for retryable work. Use injected clocks/IDs in deterministic tests.
- Preserve the lock, hold, credential, and terminal-event consequences when adding a lifecycle edge;
  the adjacency table alone does not implement those effects.

## Critical Gotchas

1. **Metered cost and charged credits are distinct facts.** `spend.ts` supports `committed` and
   `metered` modes. Both cap net debits; REQ-SPEC-32 requires charging proxy burn clamped at
   the cap. Stage facts and the ordered operator activation determine the active mode. Do not
   silently flip defaults, substitute SDK estimates for proxy rows, or relabel committed charges.
2. **Delivery and financial recovery have intentional transaction boundaries.**
   `packages/orchestrator/src/delivery.ts` commits validated artifacts, completion, initial metered
   debit settlement, hold release, events, and credential revocation together. Initial debit
   settlement happens before hold release inside that transaction. Unverified platform-fault
   settlement runs post-commit with a durable retry; its failure must not roll back the dossier.
3. **Research failure must remain visible and refundable.** An unverified delivery records its
   label/event; platform-fault settlement refunds research phases, accounts for absorbed burn, and
   restores trial entitlement as applicable. Preserve the stranded-sweep recovery path.
4. **Retries do not buy a new research budget.** `researchBudgetConsult` sums proxy searches/fetches
   across all attempts, excluding separately budgeted preflight/backfill classes. An attempt or
   pod restart must not reset that envelope; admission remains the proxy's responsibility.
5. **Parked and terminal states differ.** A gate or orphaned run can retain holds/locks and resume.
   Use the shared state helpers; do not equate “not running now” with “finished”.
6. **Tenant rules apply to injected adapters too.** User requests must never select a system
   runner. Audited system operations retain explicit workspace predicates and their boundary tests.

## Terminology

- **Hold:** reserved credits or entitlement capacity; it is not itself a debit.
- **Delivery:** the validated artifact transaction; generation alone is not delivery.
- **Attempt:** one execution episode of a run, not a fresh accounting/research allowance.

## Do / Don't

- **Do:** test retries, cancellation, and financial effects when changing lifecycle behavior.
- **Don't:** bypass state guards or turn an unverified result into a success claim without evidence.
