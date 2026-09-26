import { describe, it, expect } from "vitest";
import type { FindingView, ResponseLedgerEntry } from "@rhema/contracts";
import {
  buildTriageQueue,
  buildPretriageLedger,
  mergeTriageProposals,
  pretriageSummary,
  dispositionToLedgerEntry,
  triageTier,
  TRIAGE_PROMO_THRESHOLD,
} from "./triage.js";

// PRB.05 — the §5.7 triage ordering + the response-ledger write/merge rules (REQ-SPEC-9, REQ-IDE-28,
// REQ-WF-9). Pure, deterministic.

const user = { kind: "user", userId: "u_1" } as const;

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

function disposed(kind: "accept" | "adapt" | "rebut" | "defer" | "escalate", rationale?: string) {
  return {
    kind,
    ...(rationale != null ? { rationale } : {}),
    by: user,
    at: "2026-09-16T00:00:00Z",
    frozen: false,
  };
}

describe("triageOrder / buildTriageQueue (§5.7 — escalations pinned first)", () => {
  it("pins escalations first, then undecided (severity order), then decided — stable, nothing dropped", () => {
    const views = [
      view({ id: "f_accept", severity: "minor", disposition: disposed("accept") }),
      view({ id: "f_undecided_blocking", severity: "blocking" }),
      view({ id: "f_escalate", severity: "minor", disposition: disposed("escalate", "needs my call") }),
      view({ id: "f_undecided_note", severity: "note" }),
      view({ id: "f_rebut", severity: "blocking", disposition: disposed("rebut", "disagree") }),
    ];
    const q = buildTriageQueue(views);
    expect(q.rows.map((r) => r.id)).toEqual([
      "f_escalate", // pinned first — "decisions only you can make"
      "f_undecided_blocking",
      "f_undecided_note",
      "f_rebut",
      "f_accept",
    ]);
    expect(q).toMatchObject({ total: 5, decided: 3, undecided: 2, nextUndecidedId: "f_undecided_blocking" });
    expect(q.rows).toHaveLength(views.length); // count in === count out
  });

  it("nextUndecidedId is null when fully triaged; triageTier grades escalate<undecided<decided", () => {
    const q = buildTriageQueue([view({ id: "a", disposition: disposed("accept") })]);
    expect(q.nextUndecidedId).toBeNull();
    expect(triageTier(disposed("escalate"))).toBe(0);
    expect(triageTier(null)).toBe(1);
    expect(triageTier(disposed("accept"))).toBe(2);
  });

  it(`advertises the Drafter-proposed triage above ${TRIAGE_PROMO_THRESHOLD} findings`, () => {
    const many = Array.from({ length: TRIAGE_PROMO_THRESHOLD + 1 }, (_, i) => view({ id: `f_${i}` }));
    expect(buildTriageQueue(many).promoteAgentTriage).toBe(true);
    expect(buildTriageQueue(many.slice(0, TRIAGE_PROMO_THRESHOLD)).promoteAgentTriage).toBe(false);
  });
});

describe("pretriageSummary (REQ-IDE-28 — 'you pre-triaged N of M')", () => {
  it("counts decided rows", () => {
    const s = pretriageSummary([
      view({ id: "a", disposition: disposed("accept") }),
      view({ id: "b" }),
    ]);
    expect(s).toEqual({ triaged: 1, total: 2, allTriaged: false });
  });
});

describe("dispositionToLedgerEntry / buildPretriageLedger (REQ-SPEC-9 — actor: user)", () => {
  it("serializes a user disposition into a ledger row carrying actor: 'user'", () => {
    const e = dispositionToLedgerEntry(3, {
      kind: "rebut",
      rationale: "the stat is fine",
      reasonCode: "wrong",
      by: user,
      at: "2026-09-16T00:00:00Z",
      frozen: false,
    });
    expect(e).toEqual({
      findingOrdinal: 3,
      disposition: { kind: "rebut", status: "proposed", rationale: "the stat is fine", actor: "user" },
    });
  });

  it("buildPretriageLedger emits a valid response_ledger sidecar sorted by ordinal", () => {
    const sidecar = buildPretriageLedger([
      { findingOrdinal: 5, disposition: disposed("accept") },
      { findingOrdinal: 2, disposition: disposed("escalate", "call me") },
    ]);
    expect(sidecar.sidecar).toBe("response_ledger");
    expect(sidecar.entries.map((e) => e.findingOrdinal)).toEqual([2, 5]);
    expect(sidecar.entries.every((e) => e.disposition.actor === "user")).toBe(true);
  });
});

describe("mergeTriageProposals (REQ-WF-9 — a user row always wins)", () => {
  const agent = (ordinal: number, kind: "accept" | "adapt" | "rebut" | "defer" | "escalate"): ResponseLedgerEntry => ({
    findingOrdinal: ordinal,
    disposition: { kind, status: "proposed" },
  });
  const userEntry = (ordinal: number, kind: "accept" | "adapt" | "rebut" | "defer" | "escalate", rationale?: string): ResponseLedgerEntry => ({
    findingOrdinal: ordinal,
    disposition: { kind, status: "proposed", ...(rationale ? { rationale } : {}), actor: "user" },
  });

  it("a user row overrides the agent's proposal for the same finding, in place", () => {
    const merged = mergeTriageProposals([agent(1, "accept"), agent(2, "defer")], [userEntry(2, "rebut", "no")]);
    expect(merged).toHaveLength(2);
    expect(merged[0]!.disposition.kind).toBe("accept");
    expect(merged[1]!.disposition).toMatchObject({ kind: "rebut", rationale: "no", actor: "user" });
  });

  it("appends user rows the agent never proposed on, keeping agent rows untouched", () => {
    const merged = mergeTriageProposals([agent(1, "accept")], [userEntry(7, "escalate", "call")]);
    expect(merged.map((e) => e.findingOrdinal)).toEqual([1, 7]);
    expect(merged[1]!.disposition.actor).toBe("user");
  });

  it("is a no-op when the human wrote nothing (plain approve)", () => {
    const merged = mergeTriageProposals([agent(1, "accept"), agent(2, "adapt")], []);
    expect(merged).toHaveLength(2);
  });
});
