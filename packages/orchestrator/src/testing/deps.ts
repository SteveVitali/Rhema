// Assembles the orchestrator's DI bundle with in-memory fakes over a PGlite database, for deterministic tests.

import { FixedClock } from "../clock.js";
import { sequentialIds, sequentialUlids } from "../ids.js";
import { InMemoryQueue } from "../queue.js";
import { InMemoryHeartbeatStore } from "../heartbeat.js";
import { HmacRunTokenService } from "../token.js";
import { TestHoldLedger } from "../ledger.js";
import { InMemoryEventWriter } from "../event-writer.js";
import type { OrchestratorDeps } from "../internal-api.js";
import type { PhaseLoopDeps, CreditRenderer } from "../phase-loop.js";
import type { OrchestratorTestDb } from "./pg.js";

export interface TestDeps extends OrchestratorDeps, PhaseLoopDeps {
  readonly clock: FixedClock;
  readonly queue: InMemoryQueue;
  readonly heartbeats: InMemoryHeartbeatStore;
  readonly ledger: TestHoldLedger;
  readonly eventWriter: InMemoryEventWriter;
  readonly tokens: HmacRunTokenService;
}

export function makeDeps(
  db: OrchestratorTestDb,
  opts: { now?: Date; renderCredits?: CreditRenderer; ledger?: TestHoldLedger; readableIds?: boolean } = {},
): TestDeps {
  const clock = new FixedClock(opts.now ?? new Date("2026-09-02T12:00:00Z"));
  return {
    txRunner: db.txRunner,
    eventWriter: new InMemoryEventWriter(),
    clock,
    // ULID-shaped ids by default so ids emitted into events pass the write-boundary id validation; opt into the
    // readable `prefix_000001` form for tests that inspect ids by eye.
    ids: opts.readableIds ? sequentialIds() : sequentialUlids(),
    heartbeats: new InMemoryHeartbeatStore(),
    tokens: new HmacRunTokenService("test-secret", clock),
    ledger: opts.ledger ?? new TestHoldLedger(),
    queue: new InMemoryQueue(),
    renderCredits: opts.renderCredits,
  };
}
