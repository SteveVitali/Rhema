// @rhema/engine — `FakeEngine`: replays recorded fixtures (ledger G21) for P0.15's integration suite.
//
// Deterministic, no SDK, no network: `FakeEngine` runs a recorded fixture's SDK messages through the REAL
// mapper, so integration tests exercise the actual mapping (not a hand-rolled event list) and stay honest as
// the mapper evolves. It honors `abort()` (so cancellation paths are testable) and reports the fixture's
// accumulated usage. Construct it from any `RecordedFixture`.

import type { Engine, EngineEvent, PhaseRequest, UsageSnapshot } from "./engine.js";
import { emptyUsage } from "./engine.js";
import type { RecordedFixture } from "./fixtures.js";
import type { SdkMessage } from "./sdk-types.js";
import { createMapper } from "./mapper/mapper.js";
import { driveMapper } from "./stream-runner.js";

export class FakeEngine implements Engine {
  private readonly messages: readonly SdkMessage[];
  private readonly seat: string;
  private controller = new AbortController();
  private currentMapperUsage: (() => UsageSnapshot) | undefined;
  private lastUsage: UsageSnapshot = emptyUsage();

  constructor(fixtureOrMessages: RecordedFixture | readonly SdkMessage[], seat = "editor") {
    if (Array.isArray(fixtureOrMessages)) {
      this.messages = fixtureOrMessages;
      this.seat = seat;
    } else {
      const f = fixtureOrMessages as RecordedFixture;
      this.messages = f.messages;
      this.seat = f.phase.seat;
    }
  }

  async *startPhase(req: PhaseRequest): AsyncIterable<EngineEvent> {
    this.controller = new AbortController();
    const mapper = createMapper({
      phaseKey: req.phase.key,
      ordinal: req.ordinal,
      of: req.of,
      mainAgentLabel: req.seat || this.seat,
    });
    this.currentMapperUsage = () => mapper.usage();
    const source = toAsync(this.messages);
    for await (const ev of driveMapper(source, mapper, this.controller)) {
      if (ev.kind === "result") this.lastUsage = ev.usage;
      yield ev;
    }
    this.lastUsage = mapper.usage();
  }

  abort(_reason: string): void {
    this.controller.abort();
  }

  usage(): UsageSnapshot {
    return this.currentMapperUsage?.() ?? this.lastUsage;
  }
}

async function* toAsync(msgs: readonly SdkMessage[]): AsyncIterable<SdkMessage> {
  for (const m of msgs) {
    yield m;
    // yield to the event loop so an abort between messages is observed (cancellation testability).
    await Promise.resolve();
  }
}
