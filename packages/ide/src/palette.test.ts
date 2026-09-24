import { describe, expect, it } from "vitest";
import { buildPalette, paletteModel, commandForVerb, type PaletteData } from "./palette.js";

const DATA: PaletteData = {
  projectSlug: "demo",
  nextStep: { command: "/review", label: "Review v3", estimateCredits: 1300 },
  goto: [
    { label: "Draft v3", path: "/p/demo/v/3", keywords: ["v3", "draft"] },
    { label: "Finding v2/17 — load-bearing citation", path: "/p/demo/r/run_1#f_17", keywords: ["finding", "v2/17", "17"] },
  ],
  recentRuns: [{ label: "Review of v2", path: "/p/demo/r/run_1" }],
  threads: [{ label: "harms turn", path: "/p/demo#thread-thr_9" }],
  settings: [{ label: "Project settings", path: "/p/demo#settings" }],
};

describe("⌘K palette model (§5.12; REQ-CHAT-28)", () => {
  it("pins the state function's next step first in Run, with its estimate", () => {
    const [run] = buildPalette(DATA);
    const first = run!.rows[0]!;
    expect(first.pinned).toBe(true);
    expect(first.hint).toBe("≈ 1,300 cr");
    expect(first.action.kind).toBe("sheet");
    if (first.action.kind === "sheet") {
      expect(first.action.path).toContain("/p/demo/run?workflow=review");
    }
  });

  it("lists every table verb; 1.x verbs are marked and resolve disabled", () => {
    const [run] = buildPalette(DATA);
    const cut = run!.rows.find((r) => r.id === "verb:cut")!;
    expect(cut.hint).toBe("1.x");
    expect(cut.action.kind).toBe("disabled");
    // MVP verbs route to the sheet (cost-bearing) or navigate (free export/compare) — never a run POST
    for (const row of run!.rows) {
      if (row.action.kind === "sheet") expect(row.action.path).toContain("/p/demo/run?");
      if (row.action.kind === "navigate") expect(["verb:export", "verb:compare"]).toContain(row.id);
    }
  });

  it("sections: Run / Go to / Recent runs / Threads / Settings", () => {
    const keys = buildPalette(DATA).map((s) => s.key);
    expect(keys).toEqual(["run", "goto", "recent", "threads", "settings"]);
  });

  it("filters by substring across sections; findings match by number", () => {
    const m = paletteModel(DATA, "17");
    const labels = m.sections.flatMap((s) => s.rows.map((r) => r.label));
    expect(labels.some((l) => l.includes("v2/17"))).toBe(true);
    expect(paletteModel(DATA, "zzz").sections).toHaveLength(0);
  });
});

describe("/ — the structured command row (§7.2)", () => {
  it("/review @section:III parses into chips + a sheet resolution", () => {
    const m = paletteModel(DATA, "/review @section:III");
    expect(m.mode).toBe("command");
    expect(m.commandRow?.ok).toBe(true);
    expect(m.commandRow?.chips).toEqual(["Review", "§III"]);
    expect(m.commandRow?.resolution?.kind).toBe("sheet");
  });

  it("typed flags become chips; -- never renders", () => {
    const m = paletteModel(DATA, "/review --rigor full-board --no-second-read");
    const chips = m.commandRow?.chips ?? [];
    expect(chips).toContain("Full board");
    expect(chips).toContain("No second read");
    for (const c of chips) expect(c).not.toContain("--");
  });

  it("an unknown verb shows the correction, never a guess", () => {
    const m = paletteModel(DATA, "/reveiw @v3");
    expect(m.commandRow?.ok).toBe(false);
    expect(m.commandRow?.suggestions).toContain("review");
  });

  it("a parsed command resolves identically no matter which surface produced it", () => {
    // palette-typed vs popover/context-menu constructed — same string ⇒ same resolution.
    const typed = paletteModel(DATA, "/review @section:III").commandRow?.resolution;
    const built = paletteModel(DATA, commandForVerb("review", "section:III")).commandRow?.resolution;
    expect(built).toEqual(typed);
    if (typed?.kind === "sheet") {
      expect(typed.path).toBe("/p/demo/run?workflow=review&scope=section%3AIII");
    }
  });
});
