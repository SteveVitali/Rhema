// @rhema/engine — `ManagedAgentsEngine`: the stub second engine (REQ-ARCH-7; §12.9 stage 5).
//
// The orchestrator depends ONLY on `Engine`; a second engine is a test away. This stub proves that: it maps
// its provider's message stream through the SAME mapper as `AgentSdkEngine`, so it passes the identical
// event-mapper conformance suite (AC5). Managed Agents is not the MVP engine (it is beta and not ZDR-eligible
// — §12.9 rejected-for-stage-1); the value it delivers now is the CONFORMANCE it shares, holding the mapper
// honest as the single point where SDK-shaped messages become §12.5 events regardless of who produced them.
// Its provisioning (GKE sandboxes, its own hooks/routing) is out of scope until the §12.9 stage-5 trigger.

import type { Engine, EngineEvent, PhaseRequest, UsageSnapshot } from "./engine.js";
import { emptyUsage } from "./engine.js";
import type { SdkMessage } from "./sdk-types.js";
import { createMapper } from "./mapper/mapper.js";
import { driveMapper } from "./stream-runner.js";

/** The Managed Agents client narrowed to a message stream (injected; the real client is a superset). */
export type ManagedRunFn = (req: PhaseRequest) => AsyncIterable<SdkMessage>;

export interface ManagedAgentsEngineDeps {
  readonly run: ManagedRunFn;
}

export class ManagedAgentsEngine implements Engine {
  private readonly deps: ManagedAgentsEngineDeps;
  private controller = new AbortController();
  private currentMapperUsage: (() => UsageSnapshot) | undefined;
  private lastUsage: UsageSnapshot = emptyUsage();

  constructor(deps: ManagedAgentsEngineDeps) {
    this.deps = deps;
  }

  async *startPhase(req: PhaseRequest): AsyncIterable<EngineEvent> {
    this.controller = new AbortController();
    const mapper = createMapper({
      phaseKey: req.phase.key,
      ordinal: req.ordinal,
      of: req.of,
      mainAgentLabel: req.seat,
    });
    this.currentMapperUsage = () => mapper.usage();
    const messages = this.deps.run(req);
    for await (const ev of driveMapper(messages, mapper, this.controller)) {
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
