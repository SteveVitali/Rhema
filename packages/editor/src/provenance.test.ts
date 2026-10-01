import { describe, it, expect } from "vitest";
import { EditorState } from "prosemirror-state";
import { markdownToDoc } from "./md-to-pm.js";
import { docToMarkdown } from "./pm-to-md.js";
import {
  provenancePlugin, provenanceKey, provenanceForSave, authorshipClasses,
  ORIGIN_META, topBlocks,
} from "./provenance.js";
import { createPageState } from "./plugins.js";

// Block-level provenance + agent-span capture (P1.02; §5.4, REQ-DATA-29 amended, REQ-POS-8/9):
// transaction origins stamp touched blocks; agent transactions record their span sets write-only;
// a human edit inside a recorded span degrades that block to `mixed`.

const MD = `Para one.

Para two.

Para three.`;

const state = () => EditorState.create({ doc: markdownToDoc(MD), plugins: [provenancePlugin()] });

const blockRange = (s: EditorState, i: number) => topBlocks(s.doc)[i]!;

describe("provenance capture", () => {
  it("a human-origin transaction stamps its touched block human", () => {
    const s = state();
    const r = blockRange(s, 1);
    const tr = s.tr.insertText("EDITED ", r.from + 1).setMeta(ORIGIN_META, "human");
    const s2 = s.apply(tr);
    const spans = provenanceForSave(s2);
    expect(spans.find((x) => x.blockId === "b2")!.source.kind).toBe("human");
  });

  it("an agent-origin transaction stamps agent + captures its span", () => {
    const s = state();
    const r = blockRange(s, 1);
    const tr = s.tr.insertText("AGENT ", r.from + 1).setMeta(ORIGIN_META, "agent:drafter:run_1");
    const s2 = s.apply(tr);
    const p = provenanceKey.getState(s2)!;
    expect(p.sources.get("b2")?.kind).toBe("agent");
    expect(p.agentSpans.length).toBe(1); // the write-only span capture (REQ-POS-9)
  });

  it("a human edit inside a captured agent span degrades the block to mixed", () => {
    const s = state();
    const r = blockRange(s, 1);
    const s1 = s.apply(s.tr.insertText("AGENT ", r.from + 1).setMeta(ORIGIN_META, "agent:drafter:run_1"));
    // now the human types inside that same block — inside the captured span's mapped range
    const r2 = blockRange(s1, 1);
    const s2 = s1.apply(s1.tr.insertText("HUMAN ", r2.from + 1).setMeta(ORIGIN_META, "human"));
    const p = provenanceKey.getState(s2)!;
    expect(p.sources.get("b2")?.kind).toBe("mixed");
    // other blocks untouched by the human keep their provenance
    expect(p.sources.get("b1")?.kind).toBe("human");
    expect(p.sources.get("b3")?.kind).toBe("human");
  });

  it("a human edit OUTSIDE a captured span stamps human, not mixed", () => {
    const s = state();
    const r = blockRange(s, 1);
    const s1 = s.apply(s.tr.insertText("AGENT ", r.from + 1).setMeta(ORIGIN_META, "agent:drafter:run_1"));
    const r3 = blockRange(s1, 2);
    const s2 = s1.apply(s1.tr.insertText("HUMAN ", r3.from + 1).setMeta(ORIGIN_META, "human"));
    const p = provenanceKey.getState(s2)!;
    expect(p.sources.get("b3")?.kind).toBe("human");
    expect(p.sources.get("b2")?.kind).toBe("agent"); // the agent block stays agent
  });

  it("unattributed transactions (no ORIGIN_META) leave sources alone", () => {
    const s = state();
    const r = blockRange(s, 0);
    const s2 = s.apply(s.tr.insertText("X", r.from + 1)); // no origin meta
    const p = provenanceKey.getState(s2)!;
    expect(p.sources.get("b1")?.kind).toBe("human"); // init default
  });

  it("init sources from a stored map carry through", () => {
    const init = new Map<string, import("./provenance.js").BlockSource>([
      ["b1", { kind: "agent", runId: "run_9", draftN: 3 }],
      ["b2", { kind: "human" }],
      ["b3", { kind: "human" }],
    ]);
    const s = EditorState.create({ doc: markdownToDoc(MD), plugins: [provenancePlugin(init)] });
    expect(provenanceKey.getState(s)!.sources.get("b1")!.kind).toBe("agent");
  });
});

describe("authorshipClasses (the Authorship overlay's blockId→class feed)", () => {
  it("maps sources to overlay classes and stays sidecar-only", () => {
    const s = state();
    const r = blockRange(s, 0);
    const s1 = s.apply(s.tr.insertText("AGENT ", r.from + 1).setMeta(ORIGIN_META, "agent:drafter:run_1"));
    const classes = authorshipClasses(provenanceKey.getState(s1)!);
    expect(classes.get("b1")).toBe("agent");
    expect(classes.get("b2")).toBe("human");
    // the overlay is a decoration feed — the provenance metadata never enters the serialized bytes
    const md = docToMarkdown(s1.doc);
    expect(md).not.toMatch(/\b(?:source|provenance|blockId)\b/);
    expect(md).toContain("AGENT Para one.");
  });
});

describe("pagePlugins wiring", () => {
  it("createPageState carries the provenance plugin", () => {
    const s = createPageState(markdownToDoc(MD).toJSON());
    expect(provenanceKey.getState(s)).toBeTruthy();
  });
});
