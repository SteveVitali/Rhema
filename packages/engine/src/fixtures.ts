// @rhema/engine — the recorded-fixture format (ledger G21).
//
// A fixture is a recorded SDK message stream for one phase plus the events it must map to. The conformance
// suite (REQ-ARCH-7) drives every fixture through the mapper AND through both engines; `FakeEngine` replays
// the same fixtures so P0.15's integration suite runs deterministically with no SDK and no network. Record
// deliberately: gates, cancel, budget-stop, subagent activity, refusal, and a hostile fetched page (ticket
// Notes).

import type { RunEventType } from "@rhema/contracts";
import type { ResultSubtype } from "./engine.js";
import type { SdkMessage } from "./sdk-types.js";

/** One expected mapped run event (the `event`-kind projection the suite compares against). */
export interface ExpectedEvent {
  readonly type: RunEventType;
  readonly payload: unknown;
  readonly agentLabel?: string;
}

/** A recorded scenario: SDK messages in, expected events + terminal subtype out. */
export interface RecordedFixture {
  readonly name: string;
  readonly description: string;
  readonly phase: { readonly key: string; readonly ordinal: number; readonly of: number; readonly seat: string };
  readonly messages: readonly SdkMessage[];
  readonly expectedEvents: readonly ExpectedEvent[];
  readonly expectedResult: ResultSubtype;
}
