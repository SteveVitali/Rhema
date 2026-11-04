import { describe, it, expect } from "vitest";
import {
  groupRounds,
  collapsedRoundParts,
  nextStepVerb,
  queuePosition,
  type TimelineDraft,
  type TimelineRun,
} from "./timeline.js";
import type { RunCardView } from "./run-card.js";

// P1.05 — the Timeline round log's pure grouping (§5.5): rounds keyed on the subject draft ordinal,
// newest-first, runs oldest→newest inside a round, an ungrouped tail for subject-less runs, the
// collapsed-summary PARTS (controlled tokens — counts join labels at render, never prose), the
// next-step verb mapping, and the 1-based queue position.

const card = (over: Partial<RunCardView> = {}): RunCardView => ({
  runId: "run_x",
  state: "completed",
  phases: [],
  done: 0,
  running: 0,
  total: 0,
  spentCredits: 0,
  capCredits: 0,
  creditFraction: 0,
  refundedCredits: 0,
  elapsedMs: null,
  etaBand: null,
  estimateCredits: null,
  queuePosition: null,
  paused: false,
  waitingGate: null,
  deliverables: [],
  delivered: null,
  failureCode: null,
  resumable: false,
  queuedNotes: 0,
  actions: [],
  ...over,
});

const run = (over: Partial<TimelineRun> & { runId: string }): TimelineRun => ({
  workflow: "review",
  state: "completed",
  createdAt: "2026-09-02T12:00:00Z",
  subjectN: null,
  producedN: null,
  card: card(),
  ...over,
});

const draft = (n: number): TimelineDraft => ({ draftId: `d_v${n}`, n, origin: "agent" });

describe("groupRounds (§5.5)", () => {
  it("groups runs by subject draft, rounds newest-first, runs oldest→newest inside a round", () => {
    const runs: TimelineRun[] = [
      run({ runId: "r_v2_late", subjectN: 2, createdAt: "2026-09-03T10:00:00Z" }),
      run({ runId: "r_v1", subjectN: 1, createdAt: "2026-09-01T09:00:00Z" }),
      run({
        runId: "r_v2_early",
        subjectN: 2,
        createdAt: "2026-09-03T08:00:00Z",
        workflow: "revise",
      }),
    ];
    const { rounds, ungrouped } = groupRounds([draft(1), draft(2)], runs);
    expect(rounds.map((r) => r.n)).toEqual([2, 1]);
    expect(rounds[0]!.runs.map((r) => r.runId)).toEqual(["r_v2_early", "r_v2_late"]);
    expect(rounds[1]!.runs.map((r) => r.runId)).toEqual(["r_v1"]);
    expect(rounds[0]!.anchor?.draftId).toBe("d_v2");
    expect(ungrouped).toHaveLength(0);
  });

  it("subject-less runs collect in the ungrouped tail", () => {
    const runs = [
      run({ runId: "r_grouped", subjectN: 1 }),
      run({ runId: "r_orphan", subjectN: null, workflow: "export" }),
    ];
    const { rounds, ungrouped } = groupRounds([draft(1)], runs);
    expect(rounds).toHaveLength(1);
    expect(ungrouped.map((r) => r.runId)).toEqual(["r_orphan"]);
  });

  it("a run whose subject draft row is missing still rounds (anchor is null)", () => {
    const { rounds } = groupRounds([], [run({ runId: "r1", subjectN: 5 })]);
    expect(rounds[0]!.n).toBe(5);
    expect(rounds[0]!.anchor).toBeNull();
  });

  it("producedN surfaces the version the round produced (the next round's anchor)", () => {
    const { rounds } = groupRounds(
      [draft(1)],
      [run({ runId: "r_revise", subjectN: 1, producedN: 2, workflow: "revise" })],
    );
    expect(rounds[0]!.producedN).toBe(2);
  });
});

describe("collapsedRoundParts (§5.5 'v1 → review (49 findings) → v2')", () => {
  it("emits version chip → run parts (with the findings/moves count chip) → produced version chip", () => {
    const round = groupRounds(
      [draft(1)],
      [
        run({
          runId: "r_review",
          subjectN: 1,
          card: card({ deliverables: [{ key: "findings", count: 49 }] }),
        }),
        run({
          runId: "r_revise",
          subjectN: 1,
          producedN: 2,
          createdAt: "2026-09-02T13:00:00Z",
          workflow: "revise",
          card: card({ deliverables: [{ key: "moves", count: 14 }] }),
        }),
      ],
    ).rounds[0]!;
    expect(collapsedRoundParts(round)).toEqual([
      { kind: "version", n: 1 },
      { kind: "run", workflow: "review", count: 49 },
      { kind: "run", workflow: "revise", count: 14 },
      { kind: "version", n: 2 },
    ]);
  });

  it("omits the count when the card carries no findings/moves chip", () => {
    const round = groupRounds([draft(1)], [run({ runId: "r1", subjectN: 1 })]).rounds[0]!;
    expect(collapsedRoundParts(round)).toEqual([
      { kind: "version", n: 1 },
      { kind: "run", workflow: "review" },
    ]);
  });
});

describe("nextStepVerb / queuePosition (§5.5 next-step card)", () => {
  it("maps the state function's suggestedNext keys verbatim; unknown keys yield 'none'", () => {
    for (const [key, verb] of [
      ["draft", "draft"],
      ["review", "review"],
      ["revise", "revise"],
      ["read_letter", "read_letter"],
      ["outline", "outline"],
      ["export", "export"],
      ["archive", "archive"],
      ["run", "run"],
      ["approval", "approval"],
      ["start", "start"],
      ["bogus", "none"],
    ] as const) {
      expect(nextStepVerb(key)).toBe(verb);
    }
  });

  it("queue position is 1 + live runs created earlier", () => {
    expect(queuePosition(0)).toBe(1);
    expect(queuePosition(3)).toBe(4);
  });
});
