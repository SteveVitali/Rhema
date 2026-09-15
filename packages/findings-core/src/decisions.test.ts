import { describe, it, expect } from "vitest";
import { buildDecisionsList, decisionNeedsYou } from "./decisions.js";

// PRB.05 — the Decisions list (§5.7; REQ-OBJ-7/8): escalation asks, horizon arrivals, and stall
// escalations all land as open decision_requests; the list shows open rows only, oldest first.

const row = (over: Partial<{ id: string; text: string; state: string; createdAt: string | null }>) => ({
  id: "dcr_1",
  projectId: "prj_1",
  obligationId: null,
  text: "Escalated finding: x",
  options: ["decide", "dismiss"],
  state: "open",
  createdAt: null,
  ...over,
});

describe("buildDecisionsList", () => {
  it("shows open rows only, oldest first, every row carrying its options", () => {
    const list = buildDecisionsList([
      row({ id: "dcr_b", createdAt: "2026-09-16T01:00:00Z" }),
      row({ id: "dcr_a", createdAt: "2026-09-16T00:00:00Z" }),
      row({ id: "dcr_done", state: "answered" }),
      row({ id: "dcr_c" }), // null createdAt sorts before dated rows ("" < any ISO string)
    ]);
    expect(list.map((i) => i.id)).toEqual(["dcr_c", "dcr_a", "dcr_b"]);
    expect(list[0]!.options).toEqual(["decide", "dismiss"]);
  });

  it("decisionNeedsYou is true iff the row is open", () => {
    expect(decisionNeedsYou("open")).toBe(true);
    expect(decisionNeedsYou("answered")).toBe(false);
  });
});
