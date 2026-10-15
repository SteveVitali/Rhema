import { describe, it, expect } from "vitest";
import {
  COGS_FANOUT_BASELINE,
  COGS_FANOUT_TUNED,
  COGS_LEVER_KEYS,
  COGS_PHASE_COMPACT_WINDOWS,
  DEFAULT_COGS_LEVERS,
  parseCogsLeversEnv,
  parseCogsLeversTestEnv,
  resolveCogsLevers,
  sanitizeCogsLevers,
} from "./cogs-levers.js";

// ECON.2 (REQ-SPEC-32(c)) — the lever-set contract: resolution, sanitizing, env parsing, and the
// pre-registered arm constants. A test fails if a flag is silently ignored or malformed input
// resolves to anything but the safe default.
describe("sanitizeCogsLevers", () => {
  it("fills missing keys from the base and drops unknown keys + non-boolean values", () => {
    const on = { ...DEFAULT_COGS_LEVERS, l3PhaseRouting: true };
    expect(sanitizeCogsLevers({ l3PhaseRouting: true, junk: true, l1PerPhaseWindow: "yes" }, on)).toEqual(on);
    expect(sanitizeCogsLevers({ l1PerPhaseWindow: "yes" })).toEqual(DEFAULT_COGS_LEVERS);
  });
  it("treats absent/malformed input as the base set (pre-ECON.2 runs are all-off)", () => {
    for (const raw of [undefined, null, 42, "levers", [true]]) {
      expect(sanitizeCogsLevers(raw)).toEqual(DEFAULT_COGS_LEVERS);
    }
  });
  it("keeps every declared lever key", () => {
    const allOn = sanitizeCogsLevers(Object.fromEntries(COGS_LEVER_KEYS.map((k) => [k, true])));
    for (const k of COGS_LEVER_KEYS) expect(allOn[k]).toBe(true);
  });
});

describe("resolveCogsLevers (the frozen-at-creation rule)", () => {
  const defaults = { ...DEFAULT_COGS_LEVERS, l4CacheTtl5m: true };
  it("honors client overrides ONLY on a test workspace (the measurement ON/OFF arms)", () => {
    expect(
      resolveCogsLevers({ client: { l3PhaseRouting: true }, isTest: true, defaults }),
    ).toEqual({ ...defaults, l3PhaseRouting: true });
  });
  it("discards the client value entirely on a non-test workspace — server-authored only", () => {
    for (const client of [{ l3PhaseRouting: true }, "junk", undefined]) {
      expect(resolveCogsLevers({ client, isTest: false, defaults })).toEqual(defaults);
    }
  });
  it("defaults to all-off when no deploy default is bound", () => {
    expect(resolveCogsLevers({ client: { l3PhaseRouting: true }, isTest: true })).toEqual({
      ...DEFAULT_COGS_LEVERS,
      l3PhaseRouting: true,
    });
  });
});

// R5ECON.2 (REQ-ECON-1/2/10; Q-ECON.e) — the is_test-scoped arm. `testCheapRoute` is the one lever
// the resolution rule constrains twice: it can never freeze ON outside a flagged workspace, and on
// one it defaults from the deploy's COGS_LEVERS_TEST overlay with the client's per-leg opt-out on top.
describe("resolveCogsLevers — testCheapRoute (R5ECON.2)", () => {
  const mainEnv = { ...DEFAULT_COGS_LEVERS, l1PerPhaseWindow: true };
  const testEnv = { testCheapRoute: true } as const;

  it("COGS_LEVERS_TEST defaults the arm ON on an is_test workspace — the UI-launch posture", () => {
    expect(
      resolveCogsLevers({ client: undefined, isTest: true, defaults: mainEnv, testDefaults: testEnv }),
    ).toEqual({ ...mainEnv, testCheapRoute: true });
  });

  it("an explicit per-leg testCheapRoute:false overrides the is_test default (REQ-ECON-11's opt-out)", () => {
    expect(
      resolveCogsLevers({
        client: { testCheapRoute: false },
        isTest: true,
        defaults: mainEnv,
        testDefaults: testEnv,
      }).testCheapRoute,
    ).toBe(false);
    // …and an explicit ON still wins for a leg that opts IN under a cheap-default-off env.
    expect(
      resolveCogsLevers({ client: { testCheapRoute: true }, isTest: true, defaults: mainEnv }).testCheapRoute,
    ).toBe(true);
  });

  it("the overlay preserves the main env's adopted arms — it layers, never replaces", () => {
    const resolved = resolveCogsLevers({
      client: undefined,
      isTest: true,
      defaults: { ...mainEnv, l3PhaseRouting: true },
      testDefaults: testEnv,
    });
    expect(resolved.l3PhaseRouting).toBe(true); // COGS_LEVERS_TEST={testCheapRoute:true} did NOT strip l1/l3
    expect(resolved.l1PerPhaseWindow).toBe(true);
    expect(resolved.testCheapRoute).toBe(true);
  });

  it("refuses on every non-test workspace — env default, test overlay, AND client arm all strip", () => {
    for (const args of [
      { client: undefined, defaults: { ...mainEnv, testCheapRoute: true } },
      { client: undefined, defaults: mainEnv, testDefaults: testEnv },
      { client: { testCheapRoute: true }, defaults: mainEnv, testDefaults: testEnv },
    ]) {
      expect(
        resolveCogsLevers({ isTest: false, ...args }).testCheapRoute,
      ).toBe(false);
    }
  });

  it("COGS_LEVERS_TEST is never consulted off-test — a production run freezes the main default verbatim", () => {
    expect(
      resolveCogsLevers({ client: undefined, isTest: false, defaults: mainEnv, testDefaults: testEnv }),
    ).toEqual({ ...mainEnv, testCheapRoute: false });
  });
});

describe("parseCogsLeversTestEnv (R5ECON.2 — the is_test overlay)", () => {
  it("keeps only the keys the env named — an overlay, not a full set", () => {
    expect(parseCogsLeversTestEnv('{"testCheapRoute":true,"junk":1,"l1PerPhaseWindow":"yes"}')).toEqual({
      testCheapRoute: true,
    });
  });
  it("malformed/empty ⇒ undefined (no overlay)", () => {
    for (const raw of [undefined, "", "  ", "not json", "[true]", "42", '"x"', "null", "{}", '{"bogus":true}']) {
      expect(parseCogsLeversTestEnv(raw)).toBeUndefined();
    }
  });
});

describe("parseCogsLeversEnv", () => {
  it("parses a JSON lever object; malformed/empty ⇒ undefined (caller falls back to the default)", () => {
    expect(parseCogsLeversEnv('{"l3PhaseRouting":true,"junk":1}')).toEqual({
      ...DEFAULT_COGS_LEVERS,
      l3PhaseRouting: true,
    });
    for (const raw of [undefined, "", "  ", "not json", "[true]", "42", '"x"', "null"]) {
      expect(parseCogsLeversEnv(raw)).toBeUndefined();
    }
  });
});

describe("the pre-registered arm constants (ADR-087)", () => {
  it("L2's tuned arm is fewer, larger batches at lower concurrency", () => {
    expect(COGS_FANOUT_BASELINE).toEqual({ batchSize: 5, maxConcurrent: 5 });
    expect(COGS_FANOUT_TUNED.batchSize).toBeGreaterThan(COGS_FANOUT_BASELINE.batchSize);
    expect(COGS_FANOUT_TUNED.maxConcurrent).toBeLessThan(COGS_FANOUT_BASELINE.maxConcurrent);
    expect(COGS_FANOUT_TUNED.maxConcurrent).toBeGreaterThanOrEqual(1);
  });
  it("L1's table covers every manifest phaseClass and never tightens research below the batch floor", () => {
    for (const cls of ["research", "judge", "generate", "package"]) {
      expect(typeof COGS_PHASE_COMPACT_WINDOWS[cls]).toBe("number");
    }
    // 80 K is the bounded-batch working-set floor (one researcher ≈71 K); research may not tighten.
    expect(COGS_PHASE_COMPACT_WINDOWS.research).toBeGreaterThanOrEqual(80_000);
    expect(COGS_PHASE_COMPACT_WINDOWS.judge).toBeLessThan(80_000);
    expect(COGS_PHASE_COMPACT_WINDOWS.generate).toBeGreaterThan(80_000);
  });
  it("lever keys can never collide with the §6.5 toggle/phase-flag namespace", () => {
    // The §6.5 toggles freeze as bare input keys (fact_check, discourse, second_read, …) the
    // runspec `isOptedOut` reads; a cogsLevers key that looked like one would corrupt phase
    // selection. The l<n>Camel form is disjoint by construction — pin it. R5ECON.2's
    // `testCheapRoute` is the one non-`l<N>` name (the test-scoped arm, not an ADR-087 lever).
    const TOGGLE_FLAG_KEYS = ["fact_check", "discourse", "second_read", "repair_research", "gap_check", "grounding", "audit"];
    for (const k of COGS_LEVER_KEYS) {
      expect(TOGGLE_FLAG_KEYS).not.toContain(k);
      expect(k === "testCheapRoute" || /^l[1-5][A-Z]/.test(k)).toBe(true);
    }
  });
});
