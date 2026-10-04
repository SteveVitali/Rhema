import { describe, it, expect } from "vitest";
import type { PhaseManifest } from "@rhema/protocols";
import {
  buildQueryOptions,
  buildPrompt,
  COSMETIC_DISALLOWED_TOOLS,
  MAX_CONCURRENT_SUBAGENTS,
  TRANSCRIPT_COMPACTION_WINDOW_TOKENS,
} from "./options.js";
import { OTEL_CONTENT_FLAGS } from "./otel.js";
import { FORBIDDEN_AGENT_ENV_KEYS } from "./scrubbed-env.js";
import type { PhaseRequest } from "./engine.js";

// §12.2 engine options, verbatim. The security-critical ones are asserted here: the scrubbed env (REQ-SPEC-10),
// dontAsk, the COSMETIC disallowedTools (review 13 F18), per-phase budget/turns, subagent depth 1 / ≤5, 1-h
// caching, OTel content-flags-off, and the injected PreToolUse hook.

function req(): PhaseRequest {
  const phase = { key: "verification", skillPhase: "1", seat: "editor" } as unknown as PhaseManifest;
  return {
    runId: "run_1",
    attempt: 2,
    cwd: "/work/project",
    phase,
    ordinal: 3,
    of: 7,
    skill: "editorial-review",
    inputs: { scope: "all" },
    seat: "editor",
    maxBudgetUsd: 4.2,
    maxTurns: 40,
  };
}

function build() {
  return buildQueryOptions(req(), {
    proxyBaseUrl: "http://proxy.internal",
    configDir: "/work/.config",
    skillsDir: "/opt/skills",
    tier: "base",
    hook: () => ({}),
    sessionStore: { kind: "gcs" },
    abortController: new AbortController(),
  });
}

// ECON.2 (ADR-087) — a request carrying the frozen lever set + a real phaseClass.
function reqWithLevers(levers: PhaseRequest["levers"], phaseClass: PhaseManifest["phaseClass"]): PhaseRequest {
  return {
    ...req(),
    phase: { ...req().phase, phaseClass } as PhaseManifest,
    ...(levers ? { levers } : {}),
  };
}
function buildWith(r: PhaseRequest, tier: "base" | "balanced" | "frontier" = "base") {
  return buildQueryOptions(r, {
    proxyBaseUrl: "http://proxy.internal",
    configDir: "/work/.config",
    skillsDir: "/opt/skills",
    tier,
    hook: () => ({}),
    sessionStore: { kind: "gcs" },
    abortController: new AbortController(),
  });
}
const LEVERS = {
  l1PerPhaseWindow: true,
  l2FanoutShape: true,
  l3PhaseRouting: true,
  l4CacheTtl5m: true,
  l5ResearchEnvelope: true,
};

describe("buildQueryOptions (§12.2)", () => {
  const o = build();

  it("runs cwd = the seat mount and loads the baked skills", () => {
    expect(o.cwd).toBe("/work/project");
    expect(o.skillsDir).toBe("/opt/skills");
  });

  it("sets an explicit main-context model (F4) — base tier ⇒ claude-sonnet-5", () => {
    expect(o.model).toBe("claude-sonnet-5");
  });

  it("enables the harness-staged skills so /editorial-review resolves (F2)", () => {
    expect(o.skills).toBe("all");
  });

  it("is non-interactive (permissionMode dontAsk)", () => {
    expect(o.permissionMode).toBe("dontAsk");
  });

  it("carries the COSMETIC disallowedTools verbatim", () => {
    expect(o.disallowedTools).toEqual([...COSMETIC_DISALLOWED_TOOLS]);
  });

  it("enables NEITHER client web tool — both are sandbox-unroutable and pre-empt the proxy server tool (P0.15i AC1)", () => {
    expect(o.allowedTools).not.toContain("WebFetch");
    expect(o.allowedTools).not.toContain("WebSearch");
  });

  it("PRB.23 — restricts the ADVERTISED tool set (`tools`), not just the permission gate", () => {
    // `allowedTools` alone still ships every built-in schema (~77.8 KB / ~19K tokens per
    // request — measured on the vendored CLI). `tools` sets the base set actually serialized:
    // the seven real built-ins the seats use; WebFetch/WebSearch stop shipping entirely.
    expect(o.tools).toEqual(["Agent", "Bash", "Edit", "Glob", "Grep", "Read", "Write"]);
    expect(o.tools).not.toContain("WebFetch");
    expect(o.tools).not.toContain("WebSearch");
    expect(o.tools).not.toContain("Skill"); // the slash command is expanded client-side
  });

  it("PRB.24 — sets `settings.autoCompactWindow`, the hard intra-phase transcript bound", () => {
    // Every phase is already a fresh `query()` session (no `resume`), so accumulation is
    // INTRA-phase: the verification loop metered ~40 requests averaging ~60K cache-read tokens
    // each before `cap_reached` (run 01M35Y9BH…). The flag-tier settings object's
    // `autoCompactWindow` forces the CLI's own auto-compaction (live-exercised: 2 compactions in
    // that run) at ~80K instead of the default ~200K model window — a per-request ceiling on
    // transcript resend for the session AND its subagents.
    expect(o.settings).toEqual({ autoCompactWindow: TRANSCRIPT_COMPACTION_WINDOW_TOKENS });
    expect(TRANSCRIPT_COMPACTION_WINDOW_TOKENS).toBe(80_000);
    // sized above one bounded claim-batch working set (~16K envelope + ≤5×8K pages + ~15K notes)
    // and far below the default window that let the verify run reach ~200K twice.
    expect(TRANSCRIPT_COMPACTION_WINDOW_TOKENS).toBeGreaterThan(70_000);
    expect(TRANSCRIPT_COMPACTION_WINDOW_TOKENS).toBeLessThan(150_000);
  });

  it("passes the per-phase budget and turn ceilings", () => {
    expect(o.maxBudgetUsd).toBe(4.2);
    expect(o.maxTurns).toBe(40);
  });

  it("caps subagent fan-out at depth 1 and ≤5 concurrent", () => {
    expect(o.maxSubagentDepth).toBe(1);
    expect(o.maxConcurrentSubagents).toBe(MAX_CONCURRENT_SUBAGENTS);
    expect(MAX_CONCURRENT_SUBAGENTS).toBe(5);
  });

  it("enables 1-hour prompt caching", () => {
    expect(o.cacheControlTtl).toBe("1h");
  });

  it("wires the injected PreToolUse hook", () => {
    expect(o.hooks.PreToolUse).toHaveLength(1);
    expect(typeof o.hooks.PreToolUse[0]).toBe("function");
  });

  it("carries the five-subagent roster with input-scoped ones marked", () => {
    expect(Object.keys(o.agents).sort()).toEqual(
      ["fidelity-auditor", "gap-analyst", "holdout-calibrator", "researcher", "second-reader"].sort(),
    );
    expect(o.agents["second-reader"].inputScoped).toBe(true);
    expect(o.agents["researcher"].inputScoped).toBe(false);
  });

  it("gives the model a SCRUBBED env with OTel content flags off and NO secret (REQ-SPEC-10; §13.5)", () => {
    for (const k of FORBIDDEN_AGENT_ENV_KEYS) expect(k in o.env).toBe(false);
    expect(o.env.ANTHROPIC_BASE_URL).toBe("http://proxy.internal");
    for (const flag of OTEL_CONTENT_FLAGS) expect(o.env[flag]).toBe("0");
  });
});

// ECON.2 (ADR-087; REQ-SPEC-32(c)) — each lever flag changes exactly its own knob and nothing else;
// absent flags reproduce the pre-ECON.2 options shape bit for bit (a removal-catches test per lever).
describe("buildQueryOptions — the ECON.2 levers", () => {
  it("L1: per-`phaseClass` autoCompactWindow; off ⇒ the flat 80K everywhere", () => {
    const off = buildWith(reqWithLevers(undefined, "generate"));
    expect(off.settings.autoCompactWindow).toBe(80_000);
    expect(buildWith(reqWithLevers({ ...LEVERS, l1PerPhaseWindow: false }, "generate"))
      .settings.autoCompactWindow).toBe(80_000);
    const on = (cls: Parameters<typeof reqWithLevers>[1]) =>
      buildWith(reqWithLevers(LEVERS, cls)).settings.autoCompactWindow;
    expect(on("research")).toBe(80_000); // the bounded-batch working-set floor — never tighter
    expect(on("judge")).toBe(48_000);
    expect(on("generate")).toBe(120_000);
    expect(on("package")).toBe(64_000);
  });

  it("L2: the tuned fan-out drops the concurrent-subagent cap (env + advisory); off ⇒ 5", () => {
    const off = buildWith(reqWithLevers({ ...LEVERS, l2FanoutShape: false }, "research"));
    expect(off.maxConcurrentSubagents).toBe(5);
    expect(off.env.CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION).toBe("5");
    const on = buildWith(reqWithLevers(LEVERS, "research"));
    expect(on.maxConcurrentSubagents).toBe(3);
    expect(on.env.CLAUDE_CODE_MAX_SUBAGENTS_PER_SESSION).toBe("3");
    // an all-off request is still the baseline arm
    expect(buildWith(reqWithLevers(undefined, "research")).maxConcurrentSubagents).toBe(5);
  });

  it("L3: §12.3 per-class routing; off ⇒ the flat tier main model", () => {
    // Base resolves every class to Sonnet — no in-table cheaper route (the ticket's prediction).
    expect(buildWith(reqWithLevers(LEVERS, "research"), "base").model).toBe("claude-sonnet-5");
    // Balanced: research + package move Opus→Sonnet; judge/generate stay Opus.
    expect(buildWith(reqWithLevers(LEVERS, "research"), "balanced").model).toBe("claude-sonnet-5");
    expect(buildWith(reqWithLevers(LEVERS, "package"), "balanced").model).toBe("claude-sonnet-5");
    expect(buildWith(reqWithLevers(LEVERS, "judge"), "balanced").model).toBe("claude-opus-5");
    expect(buildWith(reqWithLevers(LEVERS, "generate"), "balanced").model).toBe("claude-opus-5");
    // Frontier: research + package move Fable→Opus; judge/generate stay Fable.
    expect(buildWith(reqWithLevers(LEVERS, "research"), "frontier").model).toBe("claude-opus-5");
    expect(buildWith(reqWithLevers(LEVERS, "judge"), "frontier").model).toBe("claude-fable-5");
    // OFF ⇒ flat main model regardless of class.
    expect(buildWith(reqWithLevers({ ...LEVERS, l3PhaseRouting: false }, "research"), "balanced").model)
      .toBe("claude-opus-5");
  });

  it("L4: the ON arm omits ENABLE_PROMPT_CACHING_1H (5-m TTL); off ⇒ the §12.2 1-h env + advisory", () => {
    const off = buildWith(reqWithLevers({ ...LEVERS, l4CacheTtl5m: false }, "research"));
    expect(off.cacheControlTtl).toBe("1h");
    expect(off.env.ENABLE_PROMPT_CACHING_1H).toBe("1");
    const on = buildWith(reqWithLevers(LEVERS, "research"));
    expect(on.cacheControlTtl).toBe("5m");
    expect("ENABLE_PROMPT_CACHING_1H" in on.env).toBe(false);
  });

  it("the scrubbed env stays within the allowed key set with levers on (REQ-SPEC-10)", () => {
    const on = buildWith(reqWithLevers(LEVERS, "research"));
    expect(() => {
      // assertScrubbed throws on any non-allowlisted key — the lever knobs are all allowlisted.
      for (const k of FORBIDDEN_AGENT_ENV_KEYS) expect(k in on.env).toBe(false);
    }).not.toThrow();
  });
});

describe("buildPrompt (§12.2)", () => {
  it("is /<skill> plus key=value input lines", () => {
    const p = buildPrompt("editorial-review", { phase: "1", scope: "all", sidecar: true });
    expect(p.split("\n")[0]).toBe("/editorial-review");
    expect(p).toContain("phase=1");
    expect(p).toContain("scope=all");
    expect(p).toContain("sidecar=true");
  });
});
