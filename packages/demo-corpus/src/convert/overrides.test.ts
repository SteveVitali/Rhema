import { describe, expect, it } from "vitest";
import { OverrideBook, readConvertOverrides } from "./overrides.js";

// REQ-CONV-6 — the typed `convert-overrides.json` reader: each row cites its source line
// (`<file>:<line>`), unknown kinds and malformed rows are rejected, and per-row consumption is
// tracked so a stale row fails.

describe("readConvertOverrides", () => {
  it("accepts a well-formed verdict-rescore file", () => {
    const r = readConvertOverrides({
      version: 1,
      overrides: [
        {
          kind: "verdict-rescore",
          claim: "C15",
          verdict: "misleading_in_context",
          cite: "correspondence/v1-review/01-claim-ledger.md:7",
          note: "re-scored by the editor after Phase 2",
        },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.overrides).toHaveLength(1);
      expect(r.value.overrides[0]).toMatchObject({ kind: "verdict-rescore", claim: "C15" });
    }
  });

  it("accepts an empty overrides array (the common case)", () => {
    const r = readConvertOverrides({ version: 1, overrides: [] });
    expect(r.ok).toBe(true);
  });

  it("accepts a reconciliation row (216 — REQ-CONV-8)", () => {
    const r = readConvertOverrides({
      version: 1,
      overrides: [
        { kind: "reconciliation", objection: "2.4", outcome: "merged", major: 3, cite: "x.md:12" },
        { kind: "reconciliation", objection: "1", outcome: "rejected", cite: "x.md:31" },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.overrides[0]).toMatchObject({ kind: "reconciliation", major: 3 });
      expect(r.value.overrides[1]).toMatchObject({ kind: "reconciliation", outcome: "rejected" });
    }
  });

  it.each([
    [{ version: 2, overrides: [] }, "version"],
    [{ version: 1 }, "overrides must be an array"],
    [
      {
        version: 1,
        overrides: [{ kind: "move-map", claim: "F1", cite: "x.md:1" }],
      },
      "unknown kind",
    ],
    [
      {
        version: 1,
        overrides: [{ kind: "verdict-rescore", claim: "C15", verdict: "contradicted" }],
      },
      "cite",
    ],
    [
      {
        version: 1,
        overrides: [
          { kind: "verdict-rescore", claim: "C15", verdict: "Misleading", cite: "x.md:1" },
        ],
      },
      "canonical claim verdict",
    ],
    [
      {
        version: 1,
        overrides: [
          { kind: "verdict-rescore", verdict: "contradicted", cite: "x.md:1" },
        ],
      },
      "claim",
    ],
    [
      {
        version: 1,
        overrides: [{ kind: "reconciliation", objection: "1", outcome: "merged", cite: "x.md:1" }],
      },
      "major",
    ],
    [
      {
        version: 1,
        overrides: [
          { kind: "reconciliation", objection: "1", outcome: "folded", major: 1, cite: "x.md:1" },
        ],
      },
      "outcome",
    ],
    [
      {
        version: 1,
        overrides: [{ kind: "reconciliation", outcome: "kept", cite: "x.md:1" }],
      },
      "objection",
    ],
  ])("rejects malformed input %#", (json, needle) => {
    const r = readConvertOverrides(json);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join("\n")).toContain(needle);
  });
});

describe("OverrideBook consumption", () => {
  const file = {
    version: 1 as const,
    overrides: [
      {
        kind: "verdict-rescore" as const,
        claim: "C15",
        verdict: "misleading_in_context" as const,
        cite: "x.md:7",
      },
      {
        kind: "verdict-rescore" as const,
        claim: "C16",
        verdict: "contradicted" as const,
        cite: "x.md:9",
      },
    ],
  };

  it("take consumes the first matching row; unconsumed() lists the rest", () => {
    const book = OverrideBook.from(file);
    const hit = book.take(
      "verdict-rescore",
      (r) => r.kind === "verdict-rescore" && r.claim === "C15",
    );
    expect(hit?.verdict).toBe("misleading_in_context");
    expect(
      book.unconsumed().map((r) => (r.kind === "verdict-rescore" ? r.claim : r.kind)),
    ).toEqual(["C16"]);
    expect(
      book.take("verdict-rescore", (r) => r.kind === "verdict-rescore" && r.claim === "C15"),
    ).toBeUndefined();
  });

  it("an empty book has no unconsumed rows", () => {
    expect(OverrideBook.empty().unconsumed()).toEqual([]);
  });
});
