// @rhema/engine — the shared SDK-message → EngineEvent driver both engines use.
//
// `AgentSdkEngine` and `ManagedAgentsEngine` differ only in HOW they obtain the SDK message stream (the
// self-hosted SDK vs the Managed Agents client); the mapping is identical, which is exactly why both pass
// the same conformance suite (REQ-ARCH-7). That shared mapping lives here. Abort is cooperative: on
// `abortController.abort()` the loop stops draining and a terminal `aborted` result is synthesised if the
// stream had not already produced one (cancellation → `Engine.abort` → the reduced commit, §12.4).

import type { EngineEvent } from "./engine.js";
import type { SdkMessage } from "./sdk-types.js";
import type { Mapper } from "./mapper/mapper.js";

/** A fixed, content-free internal error event so a single bad message never kills the phase's event stream. */
function mapErrorEvent(message: string): EngineEvent {
  return { kind: "event", type: "engine.error", payload: { stage: "map", message: message.slice(0, 200) }, visibility: "internal", density: "internal" };
}

export async function* driveMapper(
  messages: AsyncIterable<SdkMessage>,
  mapper: Mapper,
  abortController: AbortController,
): AsyncGenerator<EngineEvent> {
  let resultSeen = false;
  for await (const msg of messages) {
    if (abortController.signal.aborted) break;
    // Backstop: an unexpected payload that fails whitelist validation must not abort the generator (which
    // would leave the phase with no terminal result — a plausible partial the oracle could miscount). Isolate
    // the offending message as an internal error and keep streaming (REQ-DATA-37 / REQ-SPEC-13).
    let mapped: EngineEvent[];
    try {
      mapped = mapper.push(msg);
    } catch (err) {
      yield mapErrorEvent(String((err as Error)?.message ?? err));
      continue;
    }
    for (const ev of mapped) {
      if (ev.kind === "result") resultSeen = true;
      yield ev;
    }
  }
  try {
    for (const ev of mapper.flush()) yield ev;
  } catch (err) {
    yield mapErrorEvent(String((err as Error)?.message ?? err));
  }
  if (!resultSeen) {
    yield {
      kind: "result",
      subtype: abortController.signal.aborted ? "aborted" : "error_during_execution",
      usage: mapper.usage(),
    };
  }
}
