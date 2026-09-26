import { describe, it, expect } from "vitest";
import type { FindingView } from "@rhema/contracts";
import {
  reconciliationStateOf,
  summarizeReconciliation,
  detectReconciliationConflicts,
  collapsedRejected,
} from "./reconciliation.js";

function view(over: Partial<FindingView>): FindingView {
  return {
    id: "f_1",
    correspondenceId: "c_1",
    draftId: "d_1",
    kind: "argument",
    severity: "major",
    origin: "editor",
    anchor: null,
    title: "t",
    body: "b",
    rubricDims: [],
    provisional: false,
    ...over,
  };
}

const user = { kind: "user", userId: "u_1" } as const;

describe("reconciliation states (§5.7; REQ-IDE-26)", () => {
  it("classifies corroborated / second-read-only / editor-kept / rejected", () => {
    expect(reconciliationStateOf(view({ origin: "both" }))).toBe("corroborated");
    expect(reconciliationStateOf(view({ origin: "second_read", reconciliation: "kept" }))).toBe("second_read_only");
    expect(reconciliationStateOf(view({ origin: "editor" }))).toBe("editor_kept");
    expect(reconciliationStateOf(view({ reconciliation: "rejected" }))).toBe("rejected");
  });

  it("summarizes the reconciliation tally with promotable === rejected", () => {
    const s = summarizeReconciliation([
      view({ id: "a", origin: "both" }),
      view({ id: "b", origin: "second_read", reconciliation: "kept" }),
      view({ id: "c", reconciliation: "rejected" }),
      view({ id: "d", reconciliation: "rejected" }),
    ]);
    expect(s).toMatchObject({ corroborated: 1, secondReadOnly: 1, rejected: 2, promotable: 2 });
  });
});

describe("conflict rows (REQ-IDE-15 amended / AC3)", () => {
  it("surfaces a conflict when a user-pre-triaged finding is later reconciliation-rejected", () => {
    const conflicts = detectReconciliationConflicts([
      view({
        id: "f_conf",
        title: "the 2019 Home Office guidance",
        reconciliation: "rejected",
        disposition: { kind: "accept", by: user, at: "2026-09-16T00:00:00Z", frozen: false },
      }),
      view({ id: "f_ok", reconciliation: "rejected" }), // rejected but NOT pre-triaged → not a conflict
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ findingId: "f_conf", userDisposition: "accept" });
  });

  it("carries the user's rationale into the conflict row when present", () => {
    const [c] = detectReconciliationConflicts([
      view({
        id: "f_x",
        reconciliation: "rejected",
        disposition: { kind: "rebut", rationale: "I still think it stands", by: user, at: "t", frozen: false },
      }),
    ]);
    expect(c?.userRationale).toBe("I still think it stands");
  });

  it("collapsedRejected returns only rejected findings without a user disposition (promotable group)", () => {
    const rows = collapsedRejected([
      view({ id: "a", reconciliation: "rejected" }),
      view({ id: "b", reconciliation: "rejected", disposition: { kind: "accept", by: user, at: "t", frozen: false } }),
      view({ id: "c", origin: "both" }),
    ]);
    expect(rows.map((r) => r.id)).toEqual(["a"]);
  });
});
