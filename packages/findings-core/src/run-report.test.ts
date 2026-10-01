import { describe, it, expect } from "vitest";
import {
  buildRunReport,
  buildRunReportAdvanced,
  reportFlags,
  type BuildReportInput,
  type ReportUsageRow,
} from "./run-report.js";

// P1.05 — the run report read model (§5.5 D20; §14.5 Level 3–4; REQ-IDE-19): deterministic flags over
// server-side rows, the seat split, claims-verified × cost-per-claim, estimate-vs-actual, "What drove
// it", and the Advanced drill-down. REQ-IDE-12 — rigor-off phases report "off". Privacy: tokens and
// provider request ids exist ONLY on the Level-4 rows — the Level-3 view structurally cannot carry them.

const usage = (over: Partial<ReportUsageRow> = {}): ReportUsageRow => ({
  phase: "checking_claims",
  seat: "reviewer",
  subagentLabel: null,
  model: "claude-sonnet-4-6",
  modelTier: "balanced",
  credits: 100,
  durationMs: 60_000,
  searches: 0,
  fetches: 0,
  inputTokens: 1_000,
  outputTokens: 500,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  providerRequestIds: ["req_1"],
  ...over,
});

const input = (over: Partial<BuildReportInput> = {}): BuildReportInput => ({
  runId: "run_1",
  workflow: "review",
  state: "completed",
  estimateCredits: 840,
  spentCredits: 520,
  capCredits: 840,
  refundedCredits: 0,
  phases: [
    { key: "reading_the_piece", ordinal: 1, status: "done", seat: "reviewer" },
    { key: "checking_claims", ordinal: 2, status: "done", seat: "verifier" },
    { key: "mapping_the_field", ordinal: 3, status: "off", seat: "reviewer" }, // rigor-off (REQ-IDE-12)
    { key: "editors_letter", ordinal: 4, status: "done", seat: "editor" },
  ],
  steps: [
    { phase: "reading_the_piece", ordinal: 1, state: "done", credits: 120, durationMs: 90_000, attempt: 1 },
    { phase: "checking_claims", ordinal: 2, state: "done", credits: 300, durationMs: 200_000, attempt: 1 },
    { phase: "editors_letter", ordinal: 4, state: "done", credits: 100, durationMs: 60_000, attempt: 1 },
  ],
  usage: [
    usage({ phase: "reading_the_piece", seat: "reviewer", credits: 120 }),
    usage({ phase: "checking_claims", seat: "verifier", credits: 300, searches: 12, fetches: 40 }),
    usage({ phase: "editors_letter", seat: "editor", credits: 100 }),
  ],
  claims: { checked: 56, verified: 50 },
  modelTier: "balanced",
  ...over,
});

describe("buildRunReport — Level 3 (§14.5)", () => {
  it("assembles estimate-vs-actual, phase rows (with the off phase), seats, and claims", () => {
    const view = buildRunReport(input());
    expect(view.estimateRatio).toBeCloseTo(520 / 840, 2);
    expect(view.phases.map((p) => [p.key, p.status])).toEqual([
      ["reading_the_piece", "done"],
      ["checking_claims", "done"],
      ["mapping_the_field", "off"], // REQ-IDE-12: reports "off", zero credits
      ["editors_letter", "done"],
    ]);
    expect(view.phases.find((p) => p.key === "mapping_the_field")?.credits).toBe(0);
    // seat split, largest first, shares sum ≈ 1
    expect(view.seatSplit[0]).toMatchObject({ seat: "verifier", credits: 300 });
    expect(view.seatSplit.reduce((a, s) => a + s.share, 0)).toBeCloseTo(1, 1);
    // claims × cost-per-verified-claim
    expect(view.claims).toEqual({ checked: 56, verified: 50, creditsPerVerified: 10.4 });
  });

  it("claims is null when the run checked none", () => {
    expect(buildRunReport(input({ claims: { checked: 0, verified: 0 } })).claims).toBeNull();
    expect(buildRunReport(input({ claims: null })).claims).toBeNull();
  });

  it("'What drove it' lists the two largest phase shares then the fired flags", () => {
    const view = buildRunReport(input());
    expect(view.drivers[0]).toMatchObject({ key: "phase_share", phase: "checking_claims" });
    expect(view.drivers[1]).toMatchObject({ key: "phase_share", phase: "reading_the_piece" });
    expect(view.drivers.some((d) => d.key === "fact_check_dominated")).toBe(true);
    // every fired flag yields a controlled guidance key
    for (const f of view.flags) expect(view.suggestedGuidance).toContain(`guidance.${f}`);
  });

  it("the Level-3 view carries NO token or provider-id fields (privacy — those are Level-4 only)", () => {
    const json = JSON.stringify(buildRunReport(input()));
    expect(json).not.toContain("inputTokens");
    expect(json).not.toContain("providerRequestIds");
    expect(json).not.toContain("req_1");
  });
});

describe("reportFlags — the §14.5 flag predicates", () => {
  it("fact_check_dominated when verification phases carry >50% of spend", () => {
    expect(reportFlags(input())).toContain("fact_check_dominated"); // 300/520 = 58%
    const dominated = reportFlags(input({ usage: [usage({ credits: 60 })], steps: input().steps, spentCredits: 520 }));
    expect(dominated).not.toContain("fact_check_dominated");
  });

  it("long_draft when drafting phases carry >40% of spend", () => {
    const flags = reportFlags(
      input({
        spentCredits: 500,
        usage: [usage({ phase: "drafting", credits: 300 })],
        steps: [{ phase: "drafting", ordinal: 1, state: "done", credits: 300, durationMs: 1, attempt: 1 }],
        claims: null,
      }),
    );
    expect(flags).toContain("long_draft");
  });

  it("discourse_map fires only when the discourse phase committed done", () => {
    const flags = reportFlags(
      input({
        steps: [...input().steps, { phase: "mapping_the_field", ordinal: 3, state: "done", credits: 10, durationMs: 1, attempt: 1 }],
      }),
    );
    expect(flags).toContain("discourse_map");
    expect(reportFlags(input())).not.toContain("discourse_map"); // off phase — no done step
  });

  it("second_read_model when the second read metered on a different model tier", () => {
    const flags = reportFlags(
      input({
        modelTier: "balanced",
        steps: [...input().steps, { phase: "second_read", ordinal: 5, state: "done", credits: 50, durationMs: 1, attempt: 1 }],
        usage: [...input().usage, usage({ phase: "second_read", modelTier: "frontier", credits: 50 })],
      }),
    );
    expect(flags).toContain("second_read_model");
    // same tier → no flag
    const same = reportFlags(
      input({
        modelTier: "balanced",
        steps: [...input().steps, { phase: "second_read", ordinal: 5, state: "done", credits: 50, durationMs: 1, attempt: 1 }],
        usage: [...input().usage, usage({ phase: "second_read", modelTier: "balanced", credits: 50 })],
      }),
    );
    expect(same).not.toContain("second_read_model");
  });

  it("over_estimate / under_estimate on the actual÷estimate ratio; retries on any retried step", () => {
    expect(reportFlags(input({ estimateCredits: 1000, spentCredits: 500 }))).toContain("over_estimate"); // 0.5
    expect(reportFlags(input({ estimateCredits: 400, spentCredits: 520 }))).toContain("under_estimate"); // 1.3
    expect(reportFlags(input({ estimateCredits: 500, spentCredits: 520 }))).not.toContain("over_estimate");
    expect(reportFlags(input({ estimateCredits: 500, spentCredits: 520 }))).not.toContain("under_estimate");
    const retried = input({
      steps: [
        ...input().steps,
        { phase: "second_read", ordinal: 5, state: "done", credits: 50, durationMs: 1, attempt: 2 },
      ],
    });
    expect(reportFlags(retried)).toContain("retries");
    expect(reportFlags(input())).not.toContain("retries");
  });
});

describe("buildRunReportAdvanced — Level 4", () => {
  it("carries the phase × seat × model-tier rows WITH tokens + provider ids (Advanced only)", () => {
    const rows = [
      usage({ phase: "checking_claims", seat: "verifier", modelTier: "frontier", providerRequestIds: ["req_a", "req_b"] }),
      usage({ phase: null, seat: "system", credits: 5 }), // unattributed bucket
    ];
    const view = buildRunReportAdvanced("run_1", rows);
    expect(view.runId).toBe("run_1");
    expect(view.rows).toHaveLength(2);
    expect(view.rows[0]).toMatchObject({
      phase: "checking_claims",
      seat: "verifier",
      modelTier: "frontier",
      inputTokens: 1_000,
      providerRequestIds: ["req_a", "req_b"],
    });
    expect(view.rows[1]!.phase).toBeNull();
  });
});
