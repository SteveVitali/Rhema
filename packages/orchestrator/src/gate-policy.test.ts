import { describe, it, expect } from "vitest";
import { GATE_KINDS, NEVER_AUTOPROCEED_GATES, isAutoProceed, type GateKind } from "@rhema/contracts";
import { resolveGatePolicy, type ApprovalPolicy } from "./gate-policy.js";

const NOW = new Date("2026-09-03T12:00:00Z");
const POLICIES: ApprovalPolicy[] = ["named", "wait_each", "run_to_completion"];

describe("resolveGatePolicy (§6.4; REQ-GATE-3; REQ-SPEC-1)", () => {
  it("AC2 — spend/refusal kinds never auto-proceed and are never skipped, under any policy/timer/flag", () => {
    for (const kind of NEVER_AUTOPROCEED_GATES) {
      for (const policy of POLICIES) {
        for (const gatesOff of [false, true]) {
          const r = resolveGatePolicy(kind, { policy, gatesOff, now: NOW });
          expect(r.action).toBe("open"); // never skipped
          if (r.action === "open") expect(isAutoProceed(r.onExpiry)).toBe(false); // never proceed_*
        }
      }
    }
  });

  it("Run-to-completion skips named gates (Decision{by:'policy'}) but opens spend/refusal + continue_rounds", () => {
    for (const kind of GATE_KINDS) {
      const r = resolveGatePolicy(kind, { policy: "run_to_completion", now: NOW });
      const isSpendOrRefusal = (NEVER_AUTOPROCEED_GATES as readonly GateKind[]).includes(kind);
      if (isSpendOrRefusal || kind === "continue_rounds") {
        expect(r.action).toBe("open");
      } else {
        expect(r).toMatchObject({ action: "skip", by: "policy", reason: "run_to_completion" });
      }
    }
  });

  it("the autonomous flag turns off later NAMED gates (skip:autonomous), spend/refusal still open", () => {
    expect(resolveGatePolicy("approve_plan", { policy: "named", gatesOff: true, now: NOW })).toMatchObject({ action: "skip", reason: "autonomous" });
    expect(resolveGatePolicy("spend_overrun", { policy: "named", gatesOff: true, now: NOW }).action).toBe("open");
  });

  it("named policy uses the R3 default deadline (approve_plan → 24 h, proceed_conservative)", () => {
    const r = resolveGatePolicy("approve_plan", { policy: "named", now: NOW });
    expect(r).toMatchObject({ action: "open", onExpiry: "proceed_conservative" });
    if (r.action === "open") expect(r.deadlineAt).toEqual(new Date(NOW.getTime() + 24 * 3600_000));
  });

  it("wait_each removes deadlines everywhere and blocks (no auto-proceed)", () => {
    const r = resolveGatePolicy("approve_plan", { policy: "wait_each", now: NOW });
    expect(r).toMatchObject({ action: "open", blocking: true });
    if (r.action === "open") {
      expect(r.deadlineAt).toBeNull();
      expect(isAutoProceed(r.onExpiry)).toBe(false);
    }
  });

  it("approve_scope is informational by default, blocking under a blocking condition, waits when over cap (REQ-SPEC-17)", () => {
    const info = resolveGatePolicy("approve_scope", { policy: "named", now: NOW });
    expect(info).toMatchObject({ action: "open", blocking: false });

    const blocking = resolveGatePolicy("approve_scope", { policy: "named", now: NOW, scopeBlocking: true });
    expect(blocking).toMatchObject({ action: "open", blocking: true, onExpiry: "proceed_as_proposed" });
    if (blocking.action === "open") expect(blocking.deadlineAt).toEqual(new Date(NOW.getTime() + 2 * 3600_000));

    const spend = resolveGatePolicy("approve_scope", { policy: "named", now: NOW, scopeExceedsCap: true });
    expect(spend).toMatchObject({ action: "open", blocking: true, onExpiry: "wait" });
    if (spend.action === "open") expect(spend.deadlineAt).toBeNull();
  });

  // RUN.1 (ADR-050) — `approve_scope: null` is the explicit "the scope card WAITS FOR ME" opt-in:
  // the kind's informational default has no deadline to remove, so the only legal override's "wait"
  // reads as a BLOCKING wait. Every surface (sheet line, Needs-you row, the park itself) derives
  // from this one resolution.
  it("approve_scope: null override opts IN to a blocking wait (the card waits for you)", () => {
    const project = resolveGatePolicy("approve_scope", { policy: "named", now: NOW, overrides: { approve_scope: null } });
    expect(project).toMatchObject({ action: "open", blocking: true, onExpiry: "wait" });
    if (project.action === "open") expect(project.deadlineAt).toBeNull();

    // a run-level null layers identically ("this run only").
    const run = resolveGatePolicy("approve_scope", { policy: "named", now: NOW, runOverrides: { approve_scope: null } });
    expect(run).toMatchObject({ action: "open", blocking: true, onExpiry: "wait" });
  });

  it("applies a lengthen override (approve_plan 24 h → 48 h) and a remove override (→ wait)", () => {
    const lengthened = resolveGatePolicy("approve_plan", { policy: "named", now: NOW, overrides: { approve_plan: 48 * 3600_000 } });
    if (lengthened.action === "open") expect(lengthened.deadlineAt).toEqual(new Date(NOW.getTime() + 48 * 3600_000));

    const removed = resolveGatePolicy("approve_plan", { policy: "named", now: NOW, overrides: { approve_plan: null } });
    if (removed.action === "open") {
      expect(removed.deadlineAt).toBeNull();
      expect(removed.onExpiry).toBe("wait");
    }
  });

  it("an add override on a wait-default kind opens with the added deadline + proceed_as_proposed", () => {
    const r = resolveGatePolicy("approve_triage", { policy: "named", now: NOW, overrides: { approve_triage: 2 * 3600_000 } });
    expect(r).toMatchObject({ action: "open", onExpiry: "proceed_as_proposed" });
    if (r.action === "open") expect(r.deadlineAt).toEqual(new Date(NOW.getTime() + 2 * 3600_000));
  });
});

// -------------------------------------------------------------------------------------------------------------------
// P1.09 — the layered policy facts (project → run). loadGatePolicyFacts reads the run+project rows,
// re-validates both override JSONs against REQ-SPEC-1's schema (a malformed row is dropped, never
// trusted), and gatePolicyContextFromFacts turns them into the context the commit loop resolves on.

import { loadGatePolicyFacts, gatePolicyContextFromFacts } from "./gate-policy.js";

describe("loadGatePolicyFacts + gatePolicyContextFromFacts — the layered override (P1.09; AC5)", () => {
  const exec = (row: Record<string, unknown> | undefined) => ({
    query: async () => ({ rows: row ? [row] : [] }),
  });

  it("the run's gate_overrides layer OVER the project's; gates_off + context ride the row", async () => {
    const facts = await loadGatePolicyFacts(
      exec({
        gates_off: true,
        gate_overrides: { approve_triage: 6 * 3600_000, approve_plan: null }, // "this run only"
        inputs: { scopeBlocking: true, runAllRounds: true },
        estimate_credits: 560,
        cap_credits: 840,
        approval_policy: "wait_each",
        approval_overrides: { approve_triage: 24 * 3600_000 },
      }),
      "run_1",
    );
    expect(facts).not.toBeNull();
    expect(facts!.policy).toBe("wait_each");
    expect(facts!.gatesOff).toBe(true);
    expect(facts!.scopeBlocking).toBe(true);
    expect(facts!.runAllRounds).toBe(true);
    expect(facts!.overrides).toEqual({ approve_triage: 24 * 3600_000 });
    expect(facts!.runOverrides).toEqual({ approve_triage: 6 * 3600_000, approve_plan: null });

    const ctx = gatePolicyContextFromFacts(facts!, NOW);
    expect(ctx.policy).toBe("wait_each");
    expect(ctx.gatesOff).toBe(true);
    // gates_off skips named gates outright (the autonomous flag) — approve_scope included.
    expect(resolveGatePolicy("approve_scope", ctx)).toMatchObject({ action: "skip", reason: "autonomous" });
    // a spend kind still opens (never skipped), and the run's `null` override layers over the project's.
    const noFlag = { ...ctx, gatesOff: false };
    expect(resolveGatePolicy("confirm_cost", noFlag).action).toBe("open");
    const plan = resolveGatePolicy("approve_plan", { ...noFlag, policy: "named" });
    expect(plan).toMatchObject({ action: "open", onExpiry: "wait" }); // run-level null removed the deadline
    if (plan.action === "open") expect(plan.deadlineAt).toBeNull();
  });

  it("a malformed override row is dropped (the schema fails closed — defaults apply)", async () => {
    const facts = await loadGatePolicyFacts(
      exec({
        gates_off: false,
        gate_overrides: { confirm_cost: 4 * 3600_000 }, // illegal — spend kind
        inputs: {},
        estimate_credits: 100,
        cap_credits: 840,
        approval_policy: "bogus", // unknown → named
        approval_overrides: "not-an-object",
      }),
      "run_1",
    );
    expect(facts!.policy).toBe("named");
    expect(facts!.overrides).toBeNull();
    expect(facts!.runOverrides).toBeNull();
  });

  it("returns null for a missing run", async () => {
    expect(await loadGatePolicyFacts(exec(undefined), "run_none")).toBeNull();
  });

  it("scopeExceedsCap derives from the frozen estimate vs cap (the spend-gate variant)", async () => {
    const facts = await loadGatePolicyFacts(
      exec({
        gates_off: false,
        gate_overrides: null,
        inputs: {},
        estimate_credits: 1400,
        cap_credits: 840,
        approval_policy: "named",
        approval_overrides: null,
      }),
      "run_1",
    );
    expect(facts!.scopeExceedsCap).toBe(true);
    const r = resolveGatePolicy("approve_scope", gatePolicyContextFromFacts(facts!, NOW));
    expect(r).toMatchObject({ action: "open", blocking: true, onExpiry: "wait" });
  });
});
