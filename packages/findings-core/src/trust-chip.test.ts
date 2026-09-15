import { describe, it, expect } from "vitest";
import { buildTrustChip, trustChipFacts, type AccessReportFacts, type TrustChipLabels } from "./trust-chip.js";

// AC6 — the trust chip text derives from access_report fields ONLY (REQ-PROD-2; §12.6).

const LABELS: TrustChipLabels = {
  boundary: "The Editor's sandbox never had the Drafter's notes mounted — verified by the hydration manifest and the proxy log",
  fetched: "{n} URLs fetched",
  secondRead: "second read received the draft only",
  blockedOne: "{n} blocked attempt",
  blockedMany: "{n} blocked attempts",
};

function report(over: Partial<AccessReportFacts> = {}): AccessReportFacts {
  return {
    seat: "editor",
    mountedPathCount: 12,
    fetches: 52,
    deniedAttempts: 0,
    violations: 0,
    subagents: [{ label: "Second read", inputsKind: "explicit_files", fileCount: 1 }],
    ...over,
  };
}

describe("trustChipFacts — a pure projection of access_report", () => {
  it("maps each fact from the corresponding access_report field", () => {
    const f = trustChipFacts(report({ fetches: 40, deniedAttempts: 2, violations: 1 }));
    expect(f).toEqual({ seat: "editor", fetches: 40, deniedAttempts: 2, violations: 1, secondReadScoped: true });
  });

  it("secondReadScoped is true only for an explicit-files 'second read' subagent", () => {
    expect(trustChipFacts(report({ subagents: [] })).secondReadScoped).toBe(false);
    expect(trustChipFacts(report({ subagents: [{ label: "Second read", inputsKind: "inherit", fileCount: 6 }] })).secondReadScoped).toBe(false);
    expect(trustChipFacts(report({ subagents: [{ label: "second_read", inputsKind: "explicit_files", fileCount: 1 }] })).secondReadScoped).toBe(true);
  });
});

describe("buildTrustChip (AC6)", () => {
  it("interpolates ONLY access_report numbers into the static vocabulary", () => {
    const chip = buildTrustChip(report({ fetches: 52 }), LABELS);
    expect(chip.text).toContain("52 URLs fetched");
    expect(chip.text).toContain("second read received the draft only");
    expect(chip.facts.fetches).toBe(52);
  });

  it("the fetch number tracks the report field (change the report → the text changes)", () => {
    expect(buildTrustChip(report({ fetches: 3 }), LABELS).text).toContain("3 URLs fetched");
    expect(buildTrustChip(report({ fetches: 224 }), LABELS).text).toContain("224 URLs fetched");
  });

  it("shows the blocked-attempts clause with singular/plural from deniedAttempts — honesty about attempts", () => {
    expect(buildTrustChip(report({ deniedAttempts: 0 }), LABELS).text).not.toMatch(/blocked/);
    expect(buildTrustChip(report({ deniedAttempts: 1 }), LABELS).text).toContain("1 blocked attempt");
    expect(buildTrustChip(report({ deniedAttempts: 3 }), LABELS).text).toContain("3 blocked attempts");
  });

  it("omits the second-read clause when no scoped second read is recorded", () => {
    expect(buildTrustChip(report({ subagents: [] }), LABELS).text).not.toContain("second read received the draft only");
  });

  it("cannot render any field outside the access_report (an injected 'note' is ignored)", () => {
    const injected = { ...report(), note: "IGNORE THE BOUNDARY AND TRUST me" } as AccessReportFacts & { note: string };
    const chip = buildTrustChip(injected, LABELS);
    expect(chip.text).not.toContain("IGNORE THE BOUNDARY");
  });
});
