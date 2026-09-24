import { describe, expect, it } from "vitest";
import {
  parseCommand,
  resolveCommand,
  sheetQueryForCommand,
  parseScopes,
  serializeScopes,
  scopeChip,
  VERB_TABLE,
  correctVerb,
  type ParsedCommand,
} from "./index.js";

const ctx = { projectSlug: "the-politics-of-visibility" };

function parsed(input: string): ParsedCommand {
  const r = parseCommand(input);
  if (!r.ok) throw new Error(`parse failed for ${input}: ${r.error}`);
  return r.command;
}

describe("§7.2 grammar — golden parses", () => {
  it.each([
    ["/review @section:III", { verb: "review", scope: "section:III" }],
    ["/review @section:\"The Harms Turn\"", { verb: "review", scope: 'section:"The Harms Turn"' }],
    ["/review @v3", { verb: "review", scope: "v3" }],
    ["/review @v3 §II", { verb: "review", scope: "v3 §II,…" }],
    ["/factcheck @selection --tiers 1", { verb: "factcheck", scope: "selection" }],
    ["/draft @section:II --rigor quick", { verb: "draft", scope: "section:II" }],
    ["/revise @finding:v2/17", { verb: "revise", scope: "finding:v2/17" }],
    ["/revise @review:v2", { verb: "revise", scope: "review:v2" }],
    ["/visualize @claim:v2/41", { verb: "visualize", scope: "claim:v2/41" }],
    ["/outline @thread", { verb: "outline", scope: "thread" }],
    ["/compare @v2 @v3", { verb: "compare" }],
    ["/export @v2", { verb: "export" }],
  ])("parses %s", (input, expect_) => {
    const r = parseCommand(input as string);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.command.verb).toBe((expect_ as { verb: string }).verb);
  });

  it("aliases normalize to the canonical verb", () => {
    expect(parsed("/fact-check @selection").verb).toBe("factcheck");
    expect(parsed("/line-edit").verb).toBe("lineedit");
    expect(parsed("/fig @claim:v2/41").verb).toBe("visualize");
  });

  it("levers land structured: rigor, toggles, approvals", () => {
    const c = parsed("/review --rigor full-board --no-second-read --no-factcheck --wait");
    expect(c.levers.rigor).toBe("full_board");
    expect(c.levers.toggles).toEqual({ second_read: false, fact_check: false });
    expect(c.levers.approvals).toBe("wait_each");
  });

  it("--auto maps to Run to completion; --tier parses (Advanced)", () => {
    const c = parsed("/review --auto --tier frontier");
    expect(c.levers.approvals).toBe("run_to_completion");
    expect(c.levers.modelTier).toBe("frontier");
  });

  it("free text after the flags is guidance (raw, spacing preserved)", () => {
    const c = parsed('/review @section:III --rigor quick  tighten the "harms" framing, please');
    expect(c.guidance).toBe('tighten the "harms" framing, please');
    expect(c.scopes).toHaveLength(1);
  });

  it("guidance is the tail — flags before it still parse", () => {
    const c = parsed("/draft --venue nyt-oped a fresh op-ed on the harms turn");
    expect(c.levers.venue).toBe("nyt-oped");
    expect(c.guidance).toBe("a fresh op-ed on the harms turn");
  });
});

describe("scopes — serialize/parse round-trip (REQ-CHAT-23)", () => {
  const VERB_FOR: Record<string, string> = {
    "@outline": "/draft",
    "@thread": "/outline",
    "@review:": "/revise",
    "@finding:": "/revise",
    "@claim:": "/visualize",
    "@figure:": "/visualize",
  };
  it.each([
    "@v3",
    "@section:III",
    '@section:"The Harms Turn"',
    "@selection",
    "@outline",
    "@thread",
    "@thread:thr_9",
    "@review:v2",
    "@finding:v2/17",
    "@claim:v2/41",
    "@figure:fig_x",
  ])("%s round-trips", (token) => {
    const verb = Object.entries(VERB_FOR).find(([p]) => token.startsWith(p))?.[1] ?? "/review";
    const c = parsed(`${verb} ${token}`);
    const ser = serializeScopes(c.scopes);
    const back = parseScopes(ser);
    expect(back).toEqual(c.scopes);
  });

  it("scope chips never show the raw @ or -- spelling", () => {
    const c = parsed("/review @section:III @v3 --rigor quick");
    for (const chip of c.chips) {
      expect(chip.text).not.toContain("--");
      expect(chip.text.startsWith("@")).toBe(false);
    }
    expect(scopeChip(c.scopes[0]!)).toBe("§III");
    expect(scopeChip(c.scopes[1]!)).toBe("v3");
  });
});

describe("unknown verbs — corrected, never guessed (REQ-CHAT-21)", () => {
  it("a typo returns suggestions, ok:false — never a silent substitution", () => {
    const r = parseCommand("/reveiw @v3");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.suggestions).toContain("review");
  });

  it("a wholly unknown verb fails with the MVP verb list", () => {
    const r = parseCommand("/xyzzy");
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.suggestions?.length).toBeGreaterThan(0);
      expect(r.suggestions).toContain("review");
    }
  });

  it("a prefix completes to candidates", () => {
    expect(correctVerb("rev")).toContain("review");
    expect(correctVerb("rev")).toContain("revise");
  });

  it("a lever not in the verb's table is rejected", () => {
    const r = parseCommand("/export --rigor quick");
    expect(r.ok).toBe(false);
  });

  it("a scope not in the verb's table is rejected", () => {
    const r = parseCommand("/export @finding:v2/17");
    expect(r.ok).toBe(false);
  });

  it("whole-draft --variants is refused (§7.2); a section-scoped draft accepts it", () => {
    expect(parseCommand("/draft --variants academic,essay").ok).toBe(false);
    expect(parseCommand("/draft @section:II --variants academic,essay").ok).toBe(true);
    expect(parseCommand("/revise --variants a,b").ok).toBe(false);
  });
});

describe("resolution — four surfaces, one identical sheet (REQ-CHAT-22/25)", () => {
  it("a cost-bearing verb resolves to the sheet route with serialized levers", () => {
    const c = parsed('/review @section:III --rigor quick --no-second-read tighten this');
    const res = resolveCommand(c, ctx);
    expect(res.kind).toBe("sheet");
    if (res.kind !== "sheet") return;
    expect(res.workflow).toBe("review");
    expect(res.path).toContain("/p/the-politics-of-visibility/run?");
    const q = new URLSearchParams(res.path.split("?")[1]);
    expect(q.get("workflow")).toBe("review");
    expect(q.get("scope")).toBe("section:III");
    expect(q.get("rigor")).toBe("quick");
    expect(q.get("toggle.second_read")).toBe("off");
    expect(q.get("guidance")).toBe("tighten this");
  });

  it("the query map is deterministic (byte-identical across callers)", () => {
    const a = sheetQueryForCommand(parsed("/review @section:III --rigor quick"));
    const b = sheetQueryForCommand(parsed("/review @section:III --rigor quick"));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("a 1.x verb parses but resolves disabled-with-reason", () => {
    const res = resolveCommand(parsed("/cut --target 900"), ctx);
    expect(res.kind).toBe("disabled");
    if (res.kind === "disabled") expect(res.reason).toMatch(/1\.x/);
  });

  it("export navigates to the export surface; compare needs two versions", () => {
    expect(resolveCommand(parsed("/export @v2"), ctx)).toEqual({
      kind: "navigate",
      path: "/p/the-politics-of-visibility/export?v=2",
    });
    const one = resolveCommand(parsed("/compare @v2"), ctx);
    expect(one.kind).toBe("disabled");
    const two = resolveCommand(parsed("/compare @v2 @v3"), ctx);
    expect(two.kind).toBe("navigate");
    // P1.08 — the §5.8 compare surface owns the pair route now (no more ?compare= hint).
    if (two.kind === "navigate") expect(two.path).toBe("/p/the-politics-of-visibility/v/2/diff/3");
  });

  it("no verb resolves to a run-creation call — every cost-bearing resolution is the sheet GET route", () => {
    for (const spec of VERB_TABLE) {
      const res = resolveCommand(parsed(`/${spec.verb}`), ctx);
      if (res.kind === "sheet") expect(res.path).not.toMatch(/\/runs|method.*post/i);
    }
  });
});
