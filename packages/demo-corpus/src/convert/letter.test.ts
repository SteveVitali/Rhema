import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseLetter } from "./letter.js";
import { parseSecondRead } from "./second-read.js";
import { reconcileSecondRead, OVERLAP_FLOOR } from "./reconcile.js";
import { OverrideBook, readConvertOverrides } from "./overrides.js";

// REQ-CONV-7/8 — the typed letter + second-read parsers and the reconciliation rule on the
// synthetic fixture (R2 §1 variants; REQ-CORPUS-15).

const PKG = fileURLToPath(new URL("../../", import.meta.url));
const CORPUS = join(PKG, "fixtures/synthetic/corpus/the-borrowed-commons");
const letterMd = (r: string) =>
  readFileSync(join(CORPUS, "correspondence", `${r}-review`, "editors-letter.md"), "utf8");
const srMd = (r: string) =>
  readFileSync(join(CORPUS, "correspondence", `${r}-review`, "05-second-read.md"), "utf8");

const v1 = parseLetter(letterMd("v1"));
const v1sr = parseSecondRead(srMd("v1"));
const v2 = parseLetter(letterMd("v2"));

describe("letter parser (REQ-CONV-7; R2 §1 variants)", () => {
  it("v1 parses: verdict, one thing, majors with all four parts, strengths, minors, line notes, CaR, roadmap OQs, scorecard", () => {
    expect(v1.verdict).toBe("major revisions");
    expect(v1.oneThing).toContain("the grammar precedes the budget");
    expect(v1.majors).toHaveLength(2);
    for (const m of v1.majors) {
      expect(m.where).not.toBe("");
      expect(m.problem).not.toBe("");
      expect(m.why).not.toBe("");
      expect(m.direction).not.toBe("");
      // body = the verbatim slice covering Problem+Why+Direction, bold labels kept.
      expect(m.problemBody).toContain("**The problem:**");
      expect(m.problemBody).toContain("**Direction:**");
      expect(m.problemBody).not.toContain("**Where:**");
      expect(letterMd("v1")).toContain(m.problemBody);
      expect(letterMd("v1")).toContain(m.title);
    }
    expect(v1.majors[0]!.n).toBe(1);
    expect(v1.strengths).toHaveLength(5);
    expect(v1.minors).toHaveLength(2);
    expect(v1.lineNotes).toHaveLength(2);
    expect(v1.considered).toHaveLength(1);
    expect(v1.considered[0]!.origin).toBe("editor");
    expect(v1.roadmap.filter((r) => r.openQuestion)).toHaveLength(1);
    expect(v1.scorecard).toHaveLength(8);
    expect(v1.diagnostics.filter((d) => d.code === "dimension_unmapped")).toEqual([]);
  });

  it("the problem-variant rule holds: every non-Where/Why/Direction bullet is problem text", () => {
    const md =
      "### 1. Multi-part problem\n\n- **Where:** x\n- **The problem, part one (the architecture):** a\n" +
      "- **Part two (identity…):** b\n- **Why it matters here:** c\n- **Direction:** d\n";
    const l = parseLetter(md);
    expect(l.majors[0]!.problem).toContain("part one");
    expect(l.majors[0]!.problem).toContain("Part two");
    expect(l.majors[0]!.labels).toContain("The problem, part one (the architecture)");
  });

  it("v2 minimal variant parses: verdict + one thing + scorecard, no majors", () => {
    expect(v2.verdict).toBe("minor revisions");
    expect(v2.oneThing).toContain("limit it to water"); // verbatim slice keeps the source wrap
    expect(v2.majors).toEqual([]);
    expect(v2.scorecard).toHaveLength(8);
    expect(v2.diagnostics.every((d) => d.severity === "warning")).toBe(true);
  });
});

describe("second-read parser (REQ-CONV-7)", () => {
  it("parses objections (labelled), strengths and verdict; strengths are never findings", () => {
    expect(v1sr.objections.map((o) => o.label)).toEqual(["1", "2"]);
    expect(v1sr.objections[0]!.title).toBe("The hinge is one example deep");
    expect(v1sr.strengths).toHaveLength(2);
    expect(v1sr.verdict).toContain("Major revisions");
    expect(v1sr.unlabeled).toEqual([]);
  });
});

describe("reconciliation (REQ-CONV-8)", () => {
  const rec = reconcileSecondRead(v1, v1sr);
  it("the overlap heuristic merges both fixture objections into their majors", () => {
    expect(rec.outcomes.get("1")).toEqual({ kind: "merged", major: 1 });
    expect(rec.outcomes.get("2")).toEqual({ kind: "merged", major: 2 });
    expect(rec.mergedInto.get(1)).toEqual(["1"]);
    expect(rec.diagnostics).toEqual([]);
  });

  it("an override is authoritative; a heuristic disagreement warns", () => {
    const file = readConvertOverrides({
      version: 1,
      overrides: [
        { kind: "reconciliation", objection: "1", outcome: "kept", cite: "x.md:9" },
        { kind: "reconciliation", objection: "2", outcome: "merged", major: 2, cite: "x.md:10" },
      ],
    });
    if (!file.ok) throw new Error("override file rejected");
    const r = reconcileSecondRead(v1, v1sr, OverrideBook.from(file.value));
    expect(r.outcomes.get("1")).toEqual({ kind: "kept" }); // heuristic said merged:1 — override wins
    expect(r.outcomes.get("2")).toEqual({ kind: "merged", major: 2 });
    expect(r.diagnostics.some((d) => d.code === "reconcile_disagreement")).toBe(true);
    expect(r.diagnostics.filter((d) => d.code === "reconcile_disagreement")).toHaveLength(1);
  });

  it("an explicit rejection in Considered-and-rejected wins over a merge", () => {
    const md =
      letterMd("v1").replace(
        "## Considered and rejected",
        "## Considered and rejected\n\nFrom the second read, evaluated and not adopted:\n\n- Objection 2 — the roster reading is wrong.",
      );
    const l = parseLetter(md);
    expect(l.considered.some((c) => c.origin === "second_read")).toBe(true);
    const r = reconcileSecondRead(l, v1sr);
    expect(r.outcomes.get("2")).toEqual({ kind: "rejected" });
    expect(r.outcomes.get("1")).toEqual({ kind: "merged", major: 1 });
  });

  it("the overlap floor is the declared 0.15 / 2× margin", () => {
    expect(OVERLAP_FLOOR).toBe(0.15);
  });
});
