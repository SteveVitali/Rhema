import { describe, expect, it } from "vitest";
import { SEAT_MOUNTS, compileSeatPolicy } from "@rhema/hooks";
import { WORKFLOW_MANIFESTS } from "@rhema/protocols";
import {
  checkTwoConduitRule,
  checkAssistantMountIsolation,
  checkChatWorkflowOutputs,
  chatOutputConduits,
  CHAT_CONDUITS,
} from "./conduit.js";

// REQ-SPEC-15 / §16.3 #7 — the two-conduit rule as a CONTRACT TEST over the real seat tables + the
// real manifests ("verified, not just asserted"). Three legs: mount isolation (no Drafter/Editor run
// mounts agents/assistant/**), output confinement (chat workflows declare only assistant-namespace
// artifacts), and the closed conduit list (outline artifact OR promoted Guidance — nothing else).

describe("two-conduit rule (REQ-SPEC-15; §16.3 #7)", () => {
  it("no Drafter/Editor (or any non-assistant) seat mounts agents/assistant/**", () => {
    expect(checkAssistantMountIsolation()).toEqual([]);
    // direct predicate over the real table — author/editor/system never match the namespace.
    for (const seat of ["author", "editor", "persona_builder", "system"] as const) {
      for (const s of SEAT_MOUNTS[seat]) {
        expect(s.glob.startsWith("agents/assistant"), `${seat}: ${s.glob}`).toBe(false);
      }
    }
    // and the compiled seat policies classify an assistant-namespace path as DENIED for them.
    for (const seat of ["author", "editor"] as const) {
      const policy = compileSeatPolicy({
        seat,
        tools: ["read", "write"],
        phase: { key: "p", phaseClass: "generate", allowsSubagents: false },
        runId: "r1",
      });
      const rule = policy.mounts.find((m) => {
        const g = m.glob;
        return g === "agents/assistant/**" || g.startsWith("agents/assistant");
      });
      expect(rule, `${seat} must not mount agents/assistant/**`).toBeUndefined();
    }
  });

  it("chat workflows' declared artifacts stay inside agents/assistant/**", () => {
    const violations = checkChatWorkflowOutputs();
    expect(violations).toEqual([]);
    for (const wf of ["chat_turn", "research_burst"] as const) {
      const m = WORKFLOW_MANIFESTS[wf];
      expect(m, `${wf} manifest registered`).toBeDefined();
      for (const p of m!.phases) {
        for (const a of p.artifacts) {
          expect(a.startsWith("agents/assistant/") || a.startsWith(".rhema/"), `${wf}.${p.key}: ${a}`).toBe(
            true,
          );
        }
      }
    }
  });

  it("the conduit list is closed: outline artifact OR promoted Guidance, nothing else", () => {
    expect(CHAT_CONDUITS.map((c) => c.kind)).toEqual(["outline_artifact", "guidance"]);
    expect(chatOutputConduits()).toHaveLength(2);
    // research_burst's declared outputs never include an outline/thesis/originality artifact —
    // checked above via checkChatWorkflowOutputs; assert the manifest's own word too.
    const rb = WORKFLOW_MANIFESTS.research_burst!;
    for (const p of rb.phases) {
      for (const a of p.artifacts) {
        expect(/outline|thesis|originality|drafts\//i.test(a), `${p.key}: ${a}`).toBe(false);
      }
    }
  });

  it("checkTwoConduitRule aggregates cleanly", () => {
    expect(checkTwoConduitRule()).toEqual([]);
  });
});
