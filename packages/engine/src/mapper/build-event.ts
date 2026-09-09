// @rhema/engine/mapper — the ONLY constructor of a mapped run event.
//
// Every run event the mapper emits passes through `event()`: its payload is validated against the §12.5
// whitelist schema (`parseRunEvent`, throws on an unknown type or a bad/oversized payload — REQ-DATA-37),
// and its visibility + density are read from the contract catalogue, never hand-set. That single choke point
// is what lets the conformance suite assert REQ-ARCH-12 (no internal type ever routed as `user`) structurally
// rather than by inspection: an event's visibility is whatever the contract says it is.

import type { EventVisibility, RunEventType } from "@rhema/contracts";
import { RUN_EVENTS, parseRunEvent } from "@rhema/contracts";
import type { EngineEvent } from "../engine.js";

/** Build a validated, catalogue-tagged mapped event. `agentLabel` attributes it to a (sub)agent. */
export function event(type: RunEventType, payload: unknown, agentLabel?: string): EngineEvent {
  const { payload: validated } = parseRunEvent(type, payload);
  const def = RUN_EVENTS[type];
  return {
    kind: "event",
    type,
    payload: validated,
    visibility: def.visibility as EventVisibility,
    density: def.density,
    ...(agentLabel ? { agentLabel } : {}),
  };
}
