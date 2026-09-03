import { describe, it, expect } from "vitest";
import { guidanceSchema } from "./guidance.js";

describe("guidanceSchema — the §6.5 Guidance object (REQ-GATE-9)", () => {
  const RUN = "01JQ00000000000000000000R1";
  const base = {
    id: "01JQ00000000000000000000D1",
    projectId: "01JQ00000000000000000000P1",
    source: "queued_message" as const,
    text: "Keep §I under 700 words.",
    createdBy: "01JQ00000000000000000000V1",
    createdAt: "2026-09-03T12:00:00.000Z",
    active: true,
  };

  it("accepts run-scope queued-message guidance", () => {
    const g = guidanceSchema.parse({ ...base, scope: "run", runId: RUN });
    expect(g.scope).toBe("run");
    expect(g.source).toBe("queued_message");
  });

  it("accepts standing (project-scope) guidance that is retirable via active:false", () => {
    const g = guidanceSchema.parse({ ...base, scope: "project", source: "gate_edit", active: false, workflows: ["draft", "revise"] });
    expect(g.scope).toBe("project");
    expect(g.active).toBe(false);
    expect(g.workflows).toEqual(["draft", "revise"]);
  });

  it("records consumedBy run/phase entries", () => {
    const g = guidanceSchema.parse({ ...base, scope: "run", runId: RUN, consumedBy: [{ runId: RUN, phase: "draft" }] });
    expect(g.consumedBy).toEqual([{ runId: RUN, phase: "draft" }]);
  });

  it("rejects an unknown source", () => {
    expect(guidanceSchema.safeParse({ ...base, scope: "run", source: "telepathy" }).success).toBe(false);
  });
});
