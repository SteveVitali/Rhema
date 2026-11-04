import { describe, expect, it } from "vitest";
import {
  boldBullets,
  headingSections,
  labelBullets,
  links,
  listItems,
  preamble,
  splitTableRow,
  tables,
} from "./sections.js";

// REQ-CONV-1 — the shared markdown readers carry the R2 §1 invariants: an H3 body stops at ANY
// H1/H2 (appendices never glue onto the last entry); the bullet/table/list readers cover the real
// corpus's mixed forms.

const LEDGERISH = [
  "# Claim ledger — X",
  "",
  "Claims inventoried: 3",
  "",
  "### C1 · Tier 1 · Verified",
  "",
  "> \"quoted\"",
  "",
  "- Source: https://a.example.org/1",
  "",
  "### C2 · Tier 2 · Contradicted",
  "",
  "> \"other\"",
  "",
  "## Reuse confirmations",
  "",
  "- **C9 · Tier 1** — reuse bullet that must not glue onto C2",
  "",
  "## Summary",
  "",
  "Verified 1 · Contradicted 1",
].join("\n");

describe("headingSections (R2 §5)", () => {
  it("splits H3s and stops each body at the next heading of any level ≤3", () => {
    const secs = headingSections(LEDGERISH, 3);
    expect(secs.map((s) => s.heading)).toEqual([
      "C1 · Tier 1 · Verified",
      "C2 · Tier 2 · Contradicted",
    ]);
    // The C2 body ends at `## Reuse confirmations` — the reuse bullet must not glue on.
    expect(secs[1]?.body).not.toContain("C9 · Tier 1");
    expect(secs[1]?.body).toContain('> "other"');
    expect(secs[0]?.line).toBe(5);
  });

  it("H2 sections capture the appendices and let H3s live inside a body", () => {
    const secs = headingSections(LEDGERISH, 2);
    expect(secs.map((s) => s.heading)).toEqual(["Reuse confirmations", "Summary"]);
    expect(secs[1]?.body).toContain("Verified 1");
  });

  it("preamble returns the header block before the first H3", () => {
    expect(preamble(LEDGERISH, 3)).toContain("Claims inventoried: 3");
    expect(preamble(LEDGERISH, 3)).not.toContain("### C1");
  });
});

describe("boldBullets / labelBullets", () => {
  it("reads `- **Label:** text` with continuation lines folded in", () => {
    const body = [
      "- **Finding:** the ledger line is wrong",
      "  across two lines",
      "- **Fix:** name the row",
      "",
      "- not a labelled bullet",
    ].join("\n");
    const bs = boldBullets(body);
    expect(bs).toHaveLength(2);
    expect(bs[0]).toMatchObject({ label: "Finding", text: "the ledger line is wrong across two lines" });
    expect(bs[1]).toMatchObject({ label: "Fix", text: "name the row" });
  });

  it("reads the fixture's plain `- Label: text` form and keeps unlabelled items", () => {
    const body = [
      "- Source: https://a.example.org/1 (checked 2026-08-02)",
      "- Fix: name the ceremonial row.",
      "- a free item",
      "- [1] not a label",
    ].join("\n");
    const bs = labelBullets(body);
    expect(bs).toHaveLength(4);
    expect(bs[0]).toMatchObject({ label: "Source", text: "https://a.example.org/1 (checked 2026-08-02)" });
    expect(bs[1]).toMatchObject({ label: "Fix" });
    expect(bs[2]).toMatchObject({ label: null, text: "a free item" });
  });
});

describe("tables / listItems / links", () => {
  it("splits table rows on unescaped pipes only and skips rule lines", () => {
    const body = [
      "| ID | Cell |",
      "|---|---|",
      "| F1 | a \\| b |",
      "| F2 | c |",
      "",
      "not a table",
    ].join("\n");
    const ts = tables(body);
    expect(ts).toHaveLength(1);
    expect(ts[0]).toEqual([
      ["ID", "Cell"],
      ["F1", "a | b"],
      ["F2", "c"],
    ]);
    expect(splitTableRow("| x | y |")).toEqual(["x", "y"]);
  });

  it("reads `- ` and `1. ` list items in order", () => {
    const items = listItems("- one\n- two\n1. three\n2. four\nnot an item\n");
    expect(items.map((i) => i.text)).toEqual(["one", "two", "three", "four"]);
    expect(items.map((i) => i.ordered)).toEqual([false, false, true, true]);
  });

  it("extracts markdown links and bare URLs once each, trailing punctuation stripped", () => {
    const ls = links("see [a page](https://a.example.org/x) and https://b.example.org/y. plus https://a.example.org/x again");
    expect(ls).toHaveLength(2);
    expect(ls[0]).toEqual({ label: "a page", url: "https://a.example.org/x" });
    expect(ls[1]).toEqual({ label: null, url: "https://b.example.org/y" });
  });
});
