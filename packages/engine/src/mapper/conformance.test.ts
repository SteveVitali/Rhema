import { describe, it, expect } from "vitest";
import { INTERNAL_EVENT_TYPES, isUserVisible } from "@rhema/contracts";
import type { PhaseManifest } from "@rhema/protocols";
import { mapMessages } from "./mapper.js";
import { FIXTURES } from "./fixtures/index.js";
import type { RecordedFixture, ExpectedEvent } from "../fixtures.js";
import type { EngineEvent, PhaseRequest, ResultSubtype } from "../engine.js";
import { AgentSdkEngine } from "../agent-sdk-engine.js";
import { ManagedAgentsEngine } from "../managed-agents-engine.js";
import { FakeEngine } from "../fake-engine.js";
import type { SdkMessage } from "../sdk-types.js";

// The event-mapper conformance suite (REQ-ARCH-7; AC3, AC5). Every recorded fixture must map to its expected
// §12.5 events, and BOTH engines (AgentSdkEngine, ManagedAgentsEngine) must produce identical results — the
// second engine is a test away because both route through the one mapper. Cross-cutting: no internal type is
// ever tagged `user` (REQ-ARCH-12), and hostile fetched-page text never reaches an event (REQ-ARCH-14/15).

/** Project the `event`-kind items to the comparable shape; capture the terminal result subtype. */
function project(events: EngineEvent[]): { events: ExpectedEvent[]; result: ResultSubtype | undefined } {
  const out: ExpectedEvent[] = [];
  let result: ResultSubtype | undefined;
  for (const ev of events) {
    if (ev.kind === "event") {
      out.push({ type: ev.type, payload: ev.payload, ...(ev.agentLabel ? { agentLabel: ev.agentLabel } : {}) });
    } else if (ev.kind === "result") {
      result = ev.subtype;
    }
  }
  return { events: out, result };
}

/** Normalize an expected entry so a missing agentLabel compares equal on both sides. */
function norm(e: ExpectedEvent): ExpectedEvent {
  return { type: e.type, payload: e.payload, ...(e.agentLabel ? { agentLabel: e.agentLabel } : {}) };
}

function ctxOf(f: RecordedFixture) {
  return { phaseKey: f.phase.key, ordinal: f.phase.ordinal, of: f.phase.of, mainAgentLabel: f.phase.seat };
}

/** A minimal PhaseRequest to drive the engines with a fixture's messages. */
function reqOf(f: RecordedFixture): PhaseRequest {
  const phase = { key: f.phase.key, skillPhase: "0", seat: f.phase.seat } as unknown as PhaseManifest;
  return {
    runId: "run_1",
    attempt: 1,
    cwd: "/work/project",
    phase,
    ordinal: f.phase.ordinal,
    of: f.phase.of,
    skill: "editorial-review",
    inputs: {},
    seat: f.phase.seat,
    maxBudgetUsd: 5,
    maxTurns: 40,
  };
}

async function drain(it: AsyncIterable<EngineEvent>): Promise<EngineEvent[]> {
  const out: EngineEvent[] = [];
  for await (const ev of it) out.push(ev);
  return out;
}

const replayQuery = (messages: readonly SdkMessage[]) =>
  async function* () {
    for (const m of messages) yield m;
  };

describe("event-mapper conformance suite (REQ-ARCH-7)", () => {
  for (const f of FIXTURES) {
    it(`maps '${f.name}' to its expected events`, () => {
      // The pure mapper maps messages; the terminal-result SYNTHESIS for a truncated stream is an engine
      // concern (driveMapper), asserted in the engine paths below. Here we assert the mapped events, and the
      // result subtype only when the stream actually carried a result message.
      const { events, result } = project(mapMessages(f.messages, ctxOf(f)));
      expect(events).toEqual(f.expectedEvents.map(norm));
      const hasResultMessage = f.messages.some((m) => m.type === "result");
      expect(result).toBe(hasResultMessage ? f.expectedResult : undefined);
    });

    it(`AgentSdkEngine and ManagedAgentsEngine agree on '${f.name}' (AC5)`, async () => {
      const sdk = new AgentSdkEngine({
        query: replayQuery(f.messages),
        proxyBaseUrl: "http://proxy.internal",
        configDir: "/work/.config",
        skillsDir: "/opt/skills",
        hook: () => ({}),
        sessionStore: { kind: "s3" },
      });
      const managed = new ManagedAgentsEngine({ run: () => replayQuery(f.messages)() });

      const sdkOut = project(await drain(sdk.startPhase(reqOf(f))));
      const managedOut = project(await drain(managed.startPhase(reqOf(f))));

      expect(sdkOut.events).toEqual(f.expectedEvents.map(norm));
      expect(sdkOut).toEqual(managedOut);
      expect(sdkOut.result).toBe(f.expectedResult);
    });

    it(`FakeEngine replays '${f.name}' identically (ledger G21)`, async () => {
      const fake = new FakeEngine(f);
      const out = project(await drain(fake.startPhase(reqOf(f))));
      expect(out.events).toEqual(f.expectedEvents.map(norm));
      expect(out.result).toBe(f.expectedResult);
    });
  }

  it("never tags an internal event type as user (REQ-ARCH-12)", () => {
    for (const f of FIXTURES) {
      for (const ev of mapMessages(f.messages, ctxOf(f))) {
        if (ev.kind !== "event") continue;
        if (INTERNAL_EVENT_TYPES.includes(ev.type)) {
          expect(ev.visibility).toBe("internal");
          expect(isUserVisible(ev.type)).toBe(false);
        }
      }
    }
  });

  it("hostile fetched-page text and the exfil URL never reach any event (REQ-ARCH-14/15)", () => {
    const hostile = FIXTURES.find((f) => f.name === "hostile-page")!;
    const events = mapMessages(hostile.messages, ctxOf(hostile));
    const serialized = JSON.stringify(events);
    expect(serialized).not.toContain("evil.example");
    expect(serialized).not.toContain("SECRETDRAFTPARAGRAPH");
    expect(serialized).not.toContain("IGNORE PREVIOUS");
    // the source.read URL is the structured resolved URL, not anything from the page body:
    const read = events.find((e) => e.kind === "event" && e.type === "source.read");
    expect(read && read.kind === "event" && (read.payload as { url: string }).url).toBe("https://news.example/article");
    // the only agent.note is a template count:
    const note = events.find((e) => e.kind === "event" && e.type === "agent.note");
    expect(note && note.kind === "event" && (note.payload as { text: string }).text).toBe("Read 1 source so far");
  });

  it("every agent.note in every fixture is a whitelisted template (REQ-ARCH-14)", () => {
    for (const f of FIXTURES) {
      for (const ev of mapMessages(f.messages, ctxOf(f))) {
        if (ev.kind === "event" && ev.type === "agent.note") {
          const p = ev.payload as { template: string; text: string };
          expect(typeof p.template).toBe("string");
          expect(p.text.length).toBeLessThanOrEqual(280);
        }
      }
    }
  });
});
