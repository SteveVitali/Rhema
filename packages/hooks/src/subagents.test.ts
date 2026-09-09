import { describe, expect, it } from "vitest";
import { inheritForSubagent, renderAllowedPaths } from "./subagents.js";
import { compileSeatPolicy } from "./seat-tables.js";
import { evaluateToolUse } from "./hook.js";
import { newDenialState } from "./denials.js";
import { lexicalRealpath } from "./realpath.js";
import type { PhasePolicy } from "./types.js";

const CTX = { resolveRealpath: lexicalRealpath, now: () => "T" };
const RESEARCH: PhasePolicy = { key: "verification", phaseClass: "research", allowsSubagents: true };
const JUDGE: PhasePolicy = { key: "second_read", phaseClass: "judge", allowsSubagents: false };

const editor = compileSeatPolicy({
  seat: "editor",
  personaId: "p1",
  tools: ["read", "write", "subagent"],
  phase: RESEARCH,
  runId: "r1",
  agentLabel: "editor",
});

describe("renderAllowedPaths (REQ-DATA-13)", () => {
  it("lists the seat's readable and writable paths verbatim", () => {
    const text = renderAllowedPaths(editor);
    expect(text).toContain("Readable:");
    expect(text).toContain("Writable:");
    expect(text).toContain("/work/project/drafts/** (read)");
    expect(text).toContain("/work/project/agents/editor/** (readwrite)");
    // The wall holds even in the rendered set — no Drafter notebook or persona voice files.
    expect(text).not.toContain("agents/author");
    expect(text).not.toContain("voice-print");
  });
});

describe("inheritForSubagent (REQ-DATA-12)", () => {
  it("a plain subagent inherits the parent mounts and is attributed by its own agent_id", () => {
    const sub = inheritForSubagent(editor, { agentLabel: "researcher-1" });
    expect(sub.agentLabel).toBe("researcher-1");
    expect(sub.mounts).toBe(editor.mounts);
    expect(sub.runId).toBe("r1");
    // The inherited hook still allows a shared read for the subagent.
    const d = evaluateToolUse({ tool: "Read", input: { file_path: "/work/project/drafts/v1.md" } }, sub, newDenialState(), CTX);
    expect(d.decision).toBe("allow");
    expect(d.accessRows[0]?.agentLabel).toBe("researcher-1");
  });

  it("an input-scoped subagent is narrowed to exactly the enumerated files, read-only, Read-only tools", () => {
    // The second-reader receives the draft only (§12.6).
    const second = inheritForSubagent(editor, {
      agentLabel: "second-read",
      scopedFiles: ["/work/project/drafts/v3.md"],
      resolveRealpath: lexicalRealpath,
    });
    expect([...second.tools]).toEqual(["read"]);

    // The scoped Read-only token set denies a Write even where a mount might otherwise allow it.
    const write = evaluateToolUse(
      { tool: "Write", input: { file_path: "/work/project/drafts/v3.md", content: "x" } },
      second,
      newDenialState(),
      CTX,
    );
    expect(write.decision).toBe("deny");

    // It can read the one enumerated file…
    const ok = evaluateToolUse({ tool: "Read", input: { file_path: "/work/project/drafts/v3.md" } }, second, newDenialState(), CTX);
    expect(ok.decision).toBe("allow");

    // …but not a sibling draft that was not enumerated.
    const no = evaluateToolUse({ tool: "Read", input: { file_path: "/work/project/drafts/v1.md" } }, second, newDenialState(), CTX);
    expect(no.decision).toBe("deny");
  });

  it("carries the calibrator flag onto the scoped subagent", () => {
    const cal = inheritForSubagent(editor, {
      agentLabel: "holdout-calibrator",
      scopedFiles: ["/work/personas/p1/profile/index.md"],
      isCalibrator: true,
      resolveRealpath: lexicalRealpath,
    });
    expect(cal.isCalibrator).toBe(true);
  });

  it("a subagent still inherits the phase — a judge phase rejects its Agent calls", () => {
    const judgeParent = compileSeatPolicy({
      seat: "editor",
      personaId: "p1",
      tools: ["read"],
      phase: JUDGE,
      runId: "r1",
    });
    const sub = inheritForSubagent(judgeParent, { agentLabel: "x" });
    const d = evaluateToolUse({ tool: "Agent", input: {} }, sub, newDenialState(), CTX);
    expect(d.decision).toBe("deny");
  });
});
