import { describe, it, expect } from "vitest";
import { splitMarkdownBlocks } from "@rhema/findings-core";
import { markdownToDoc } from "./md-to-pm.js";
import { docToMarkdown } from "./pm-to-md.js";
import { buildDocMap } from "./docmap.js";

// The block↔PM map (P1.02; §5.4): every decoration pass lands sidecar spans on PM positions through
// this map — wrong-position decorations are worse than none, so `ok` must be true on every profile
// construct and every lookup must hit the right node.

const MD = `---
rhema: 1
title: T
---

## Head one

A paragraph with *emphasis* and a \\[@key] cite plus $x+y$ math.

> quoted text

- item one
- item two

| A | B |
| :- | :- |
| 1 | 2 |

\`\`\`ts
code here
\`\`\`

A tail para.`;

const doc = () => markdownToDoc(MD);
const map = () => buildDocMap(doc(), MD);

describe("buildDocMap", () => {
  it("maps every canonical block to top-level nodes 1:1", () => {
    const m = map();
    expect(m.ok).toBe(true);
    const blocks = splitMarkdownBlocks(MD);
    expect(m.entries.length).toBe(blocks.length);
    for (const b of blocks) expect(m.byBlockId.has(b.blockId)).toBe(true);
  });

  it("pm positions point at the right nodes", () => {
    const m = map();
    const d = doc();
    const heading = m.byBlockId.get("b2")!; // "## Head one"
    const node = d.nodeAt(heading.pmFrom);
    expect(node?.type.name).toBe("heading");
    const code = m.byBlockId.get("b7")!;
    expect(d.nodeAt(code.pmFrom)?.type.name).toBe("code_block");
  });

  it("blockForPos answers the owning block", () => {
    const m = map();
    const para = m.byBlockId.get("b3")!;
    expect(m.blockForPos(para.pmFrom + 2)?.blockId).toBe("b3");
    expect(m.blockForPos(m.byBlockId.get("b8")!.pmFrom)?.blockId).toBe("b8");
  });

  it("pmPosForOffset lands inside the right text (inline span granularity)", () => {
    const m = map();
    const d = doc();
    const b3 = m.byBlockId.get("b3")!;
    const text = MD.slice(b3.mdStart, b3.mdEnd);
    // offset of "emphasis" within the block text → a pm position inside the emphasized run
    const off = text.indexOf("emphasis");
    const pos = m.pmPosForOffset("b3", off)!;
    // the position should sit inside (or at the left edge of) the emphasized run — check the marks
    // of the text node the offset lands in (boundary positions carry no marks on the resolved pos).
    const marks: string[] = [];
    d.nodesBetween(pos, Math.min(pos + "emphasis".length, d.content.size), (n) => {
      for (const mk of n.marks) marks.push(mk.type.name);
      return true;
    });
    expect(marks).toContain("em");
  });

  it("a block-internal md offset never escapes its own block's pm range", () => {
    const m = map();
    for (const e of m.entries) {
      const pos = m.pmPosForOffset(e.blockId, Math.floor((e.mdEnd - e.mdStart) / 2));
      if (pos == null) continue;
      expect(pos).toBeGreaterThanOrEqual(e.pmFrom);
      expect(pos).toBeLessThanOrEqual(e.pmTo);
    }
  });

  it("unknown blockId → null, never a wrong position", () => {
    const m = map();
    expect(m.rangeForBlock("b999")).toBeNull();
    expect(m.pmPosForOffset("b999", 0)).toBeNull();
  });

  it("the map rebuilds identically after a serialize→parse round", () => {
    const d1 = doc();
    const md2 = docToMarkdown(d1);
    const d2 = markdownToDoc(md2);
    const m2 = buildDocMap(d2, md2);
    expect(m2.ok).toBe(true);
    expect(m2.entries.map((e) => e.blockId)).toEqual(map().entries.map((e) => e.blockId));
  });
});
