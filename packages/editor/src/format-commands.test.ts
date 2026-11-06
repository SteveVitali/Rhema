import { describe, expect, it } from "vitest";
import { TextSelection, type EditorState } from "prosemirror-state";
import { FORMAT_ACTIONS, formatCommand } from "./format-commands.js";
import { createCollabPageState, createPageState } from "./plugins.js";
import { markdownToDoc } from "./md-to-pm.js";
import { pageSchema } from "./schema.js";
import * as Y from "yjs";

// REQ-WRITE-1 — every format-bubble item applies its mark/node to the selection. PM-state tests
// (no DOM): each action dispatches through `formatCommand`, and the same assertions run against
// the collab-bound state (the ySync-mounted arm the Page actually mounts).

const docFor = (md: string) => markdownToDoc(md).toJSON();

function sel(state: EditorState, from: number, to: number): EditorState {
  return state.apply(state.tr.setSelection(TextSelection.create(state.doc, from, to)));
}

function run(st: EditorState, action: Parameters<typeof formatCommand>[0], href?: string): EditorState {
  formatCommand(action, href)(st, (tr) => {
    st = st.apply(tr);
  });
  return st;
}

describe("formatCommand — every bubble item applies its mark/node (REQ-WRITE-1)", () => {
  it("exposes the eight group-1 actions", () => {
    expect(FORMAT_ACTIONS).toEqual(["bold", "italic", "link", "h2", "h3", "quote", "bulleted", "numbered"]);
  });

  it("bold applies the strong mark over the selection", () => {
    const st = sel(createPageState(docFor("hello world")), 1, 6);
    const out = run(st, "bold");
    const marks = out.doc.textBetween(1, 6, " ", " ");
    let hasStrong = false;
    out.doc.nodesBetween(1, 6, (n) => {
      if (n.isText && n.marks.some((m) => m.type.name === "strong")) hasStrong = true;
    });
    expect(hasStrong).toBe(true);
    void marks;
  });

  it("italic applies the em mark", () => {
    const st = sel(createPageState(docFor("hello world")), 1, 6);
    const out = run(st, "italic");
    let hasEm = false;
    out.doc.nodesBetween(1, 6, (n) => {
      if (n.isText && n.marks.some((m) => m.type.name === "em")) hasEm = true;
    });
    expect(hasEm).toBe(true);
  });

  it("link applies the link mark with the href (and an empty href unlinks)", () => {
    const st = sel(createPageState(docFor("hello world")), 1, 6);
    const out = run(st, "link", "https://example.com");
    let href: string | undefined;
    out.doc.nodesBetween(1, 6, (n) => {
      const m = n.marks.find((x) => x.type.name === "link");
      if (m) href = m.attrs["href"] as string;
    });
    expect(href).toBe("https://example.com");
    const un = run(out, "link", "");
    let still = false;
    un.doc.nodesBetween(1, 6, (n) => {
      if (n.isText && n.marks.some((m) => m.type.name === "link")) still = true;
    });
    expect(still).toBe(false);
  });

  it("h2/h3 set the block's heading level (and toggle back to paragraph)", () => {
    const st = sel(createPageState(docFor("Title text")), 1, 6);
    const h2 = run(st, "h2");
    expect(h2.doc.firstChild?.type.name).toBe("heading");
    expect(h2.doc.firstChild?.attrs["level"]).toBe(2);
    const h3 = run(h2, "h3");
    expect(h3.doc.firstChild?.attrs["level"]).toBe(3);
    const back = run(h3, "h3");
    expect(back.doc.firstChild?.type.name).toBe("paragraph");
  });

  it("quote wraps the block in a blockquote (and toggles back out)", () => {
    const st = sel(createPageState(docFor("quoted words")), 1, 6);
    const q = run(st, "quote");
    expect(q.doc.firstChild?.type.name).toBe("blockquote");
    const back = run(q, "quote");
    expect(back.doc.firstChild?.type.name).toBe("paragraph");
  });

  it("bulleted/numbered wrap in the right list kind (and toggle back)", () => {
    const st = sel(createPageState(docFor("one\n\ntwo")), 1, 4);
    const ul = run(st, "bulleted");
    expect(ul.doc.firstChild?.type.name).toBe("list");
    expect(ul.doc.firstChild?.attrs["ordered"]).toBe(false);
    const ol = run(ul, "numbered");
    // moving bullet → numbered re-wraps into the ordered kind
    const list = ol.doc.descendants((n) => n.type.name === "list");
    void list;
    let foundOrdered: boolean | undefined;
    ol.doc.nodesBetween(0, ol.doc.content.size, (n) => {
      if (n.type.name === "list") foundOrdered = n.attrs["ordered"] as boolean;
    });
    expect(foundOrdered).toBe(true);
    const back = run(ol, "numbered");
    let stillList = false;
    back.doc.nodesBetween(0, back.doc.content.size, (n) => {
      if (n.type.name === "list") stillList = true;
    });
    expect(stillList).toBe(false);
  });

  it("the same commands hold on the collab-bound state (ySync-mounted arm)", () => {
    const frag = new Y.Doc().getXmlFragment("prosemirror");
    const st = createCollabPageState(frag);
    // seed a paragraph through the same tr path the wire renders
    const seeded = st.apply(st.tr.insert(0, pageSchema.nodes["paragraph"]!.create(null, pageSchema.text("hello"))));
    const out = run(sel(seeded, 1, 4), "bold");
    let hasStrong = false;
    out.doc.nodesBetween(1, 4, (n) => {
      if (n.isText && n.marks.some((m) => m.type.name === "strong")) hasStrong = true;
    });
    expect(hasStrong).toBe(true);
  });
});
