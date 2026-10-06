import { describe, expect, it } from "vitest";
import {
  ALLOWED_TRANSITIONS,
  assertTransition,
  canTransition,
  IllegalTransitionError,
  isParked,
  isTerminal,
  type RunState,
} from "./state-machine.js";
import { RUN_STATES } from "@rhema/contracts";

describe("run state machine (§12.4; REQ-RUN-10)", () => {
  it("covers every RunState from @rhema/contracts (no state left unmodeled)", () => {
    for (const s of RUN_STATES) {
      expect(ALLOWED_TRANSITIONS[s as RunState], `state ${s} has no adjacency entry`).toBeDefined();
    }
  });

  it("terminal states are absorbing (no outgoing edges)", () => {
    for (const t of ["completed", "completed_partial", "failed", "cancelled"] as const) {
      expect(isTerminal(t)).toBe(true);
      expect(ALLOWED_TRANSITIONS[t]).toEqual([]);
    }
  });

  it("the §12.4 happy path is a legal chain", () => {
    const chain: RunState[] = [
      "created",
      "queued",
      "provisioning",
      "running",
      "waiting_gate",
      "queued",
      "provisioning",
      "running",
      "finalizing",
      "completed",
    ];
    for (let i = 0; i < chain.length - 1; i++) {
      expect(canTransition(chain[i], chain[i + 1]), `${chain[i]}→${chain[i + 1]}`).toBe(true);
    }
  });

  it("models the resumability + partial edges (orphaned→queued, waiting_gate→completed_partial)", () => {
    expect(canTransition("running", "orphaned")).toBe(true);
    expect(canTransition("orphaned", "queued")).toBe(true);
    expect(canTransition("orphaned", "waiting_gate")).toBe(true); // resumes exhausted → resume_partial
    expect(canTransition("waiting_gate", "completed_partial")).toBe(true); // resume_partial accepted
    expect(canTransition("running", "completed_partial")).toBe(true);
  });

  it("waiting_gate → finalizing is legal — a gate on the last committed phase resolves into run.finalize (DEF.1 live finding)", () => {
    // Regression: prod run 01M3E2EC1TH87TBVECMRN918SM 500'd on approve_outline approve with
    // IllegalTransitionError — gate-resolution's allCommitted path targets `finalizing` but the
    // table lacked the edge. The parked run must be able to finalize without a pod resume.
    expect(canTransition("waiting_gate", "finalizing")).toBe(true);
    expect(() => assertTransition("waiting_gate", "finalizing")).not.toThrow();
    // …and the full last-phase-gate chain stays legal end to end.
    for (const [from, to] of [
      ["running", "waiting_gate"],
      ["waiting_gate", "finalizing"],
      ["finalizing", "completed"],
    ] as const) {
      expect(canTransition(from, to), `${from}→${to}`).toBe(true);
    }
  });

  it("rejects illegal edges (a completed run cannot run again; created cannot jump to running)", () => {
    expect(canTransition("completed", "running")).toBe(false);
    expect(canTransition("created", "running")).toBe(false);
    expect(() => assertTransition("completed", "running")).toThrow(IllegalTransitionError);
  });

  it("isParked marks the no-compute states (queued / awaiting_consent / waiting_gate)", () => {
    expect(isParked("waiting_gate")).toBe(true);
    expect(isParked("queued")).toBe(true);
    expect(isParked("awaiting_consent")).toBe(true);
    expect(isParked("running")).toBe(false);
  });
});
