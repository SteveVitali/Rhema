import { describe, expect, it } from "vitest";
import { TextSelection, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { pageSchema } from "./schema.js";
import { createCollabPageState, createPageState } from "./plugins.js";
import { markdownToDoc } from "./md-to-pm.js";
import {
  applySlashEntry,
  filterSlashEntries,
  slashMatch,
  slashMenuKey,
  SLASH_ENTRIES,
  type SlashMenuState,
} from "./slash-menu.js";
import * as Y from "yjs";

// REQ-WRITE-3 (329_R7UX.6) — PM-state tests for the slash menu: the `/`-at-block-start match,
// the typed filter, arrow+Enter insertion (the typed `/` is consumed), Escape dismissal, and the
// no-menu arms (code block, heading, mid-text, atom-leading block). DOM/keyboard legs live in
// apps/web's slash-menu.dom.test.tsx.

const docFor = (md: string) => markdownToDoc(md).toJSON();

/** A doc whose first block is an EMPTY paragraph — the block the `/`-typing legs open in. */
const EMPTY_FIRST = {
  type: "doc",
  content: [
    { type: "paragraph" },
    { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
  ],
};

/** A list whose single item carries an empty paragraph — the nested-parent insert leg. */
const LIST_EMPTY = {
  type: "doc",
  content: [
    {
      type: "list",
      attrs: { ordered: false, start: 1 },
      content: [{ type: "list_item", content: [{ type: "paragraph" }] }],
    },
  ],
};

function slashState(st: EditorState): SlashMenuState {
  const s = slashMenuKey.getState(st);
  if (!s) throw new Error("slashMenuKey state missing — plugin not mounted");
  return s;
}

/** Type text at the caret (appends a tr, re-deriving the plugin state). */
function type(st: EditorState, text: string): EditorState {
  return st.apply(st.tr.insertText(text));
}

function sel(st: EditorState, pos: number): EditorState {
  return st.apply(st.tr.setSelection(TextSelection.create(st.doc, pos)));
}

/** `st` with the caret in the first paragraph, ready to type `/`. */
const armed = (docJson: unknown) => sel(createPageState(docJson), 1);

/** A minimal view shim — `applySlashEntry` only reads state/dispatch/focus. */
function viewFor(get: () => EditorState, set: (s: EditorState) => void): EditorView {
  return {
    get state() {
      return get();
    },
    dispatch: (tr: Parameters<EditorView["dispatch"]>[0]) => set(get().apply(tr)),
    focus: () => undefined,
  } as unknown as EditorView;
}

const entry = (id: string) => SLASH_ENTRIES.find((e) => e.id === id)!;

describe("slashMatch — the `/`-at-block-start trigger", () => {
  it("opens when `/` is the only text in a paragraph at the caret", () => {
    let st = armed(EMPTY_FIRST);
    st = type(st, "/");
    expect(slashMatch(st)).toEqual({ from: 1, query: "" });
    expect(slashState(st).from).toBe(1);
  });

  it("stays closed mid-text — `/` not at block start", () => {
    let st = sel(createPageState(docFor("Body text.")), 5);
    st = type(st, "/");
    expect(st.doc.textContent).toBe("Body/ text.");
    expect(slashMatch(st)).toBeNull();
    expect(slashState(st).from).toBeNull();
  });

  it("stays closed when the caret is not at the end of the `/`-block", () => {
    // "/ab" already typed; caret back before the last char — applying must never eat text
    // after the caret, so the match refuses.
    const st = sel(createPageState(docFor("/ab")), 2);
    expect(slashMatch(st)).toBeNull();
    expect(slashState(st).from).toBeNull();
  });

  it("never opens inside a code block", () => {
    let st = createPageState(docFor("```\ncode line\n```"));
    st = sel(st, st.doc.nodeAt(0)!.nodeSize - 1); // inside the code block's text, at its end
    st = type(st, "/");
    expect(st.selection.$from.parent.type.name).toBe("code_block");
    expect(slashMatch(st)).toBeNull();
    expect(slashState(st).from).toBeNull();
  });

  it("never opens inside a heading", () => {
    let st = createPageState(docFor("## Title"));
    st = sel(st, st.doc.nodeAt(0)!.nodeSize - 1); // end of the heading's text
    st = type(st, "/");
    expect(st.selection.$from.parent.type.name).toBe("heading");
    expect(slashMatch(st)).toBeNull();
  });

  it("a space after the query closes the menu (the text stays as written)", () => {
    let st = armed(EMPTY_FIRST);
    st = type(st, "/he ");
    expect(slashMatch(st)).toBeNull();
    expect(slashState(st).from).toBeNull();
  });

  it("stays closed when the first child of the block is not text (atom-leading block)", () => {
    const atomFirst = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "footnote_ref", attrs: { id: "x" } }] },
      ],
    };
    let st = armed(atomFirst);
    st = sel(st, st.doc.nodeAt(0)!.nodeSize - 1);
    st = type(st, "/");
    expect(slashMatch(st)).toBeNull();
  });
});

describe("filterSlashEntries — typed-text filtering", () => {
  it("empty query returns the full menu", () => {
    expect(filterSlashEntries("")).toHaveLength(SLASH_ENTRIES.length);
    expect(filterSlashEntries(" ")).toHaveLength(SLASH_ENTRIES.length);
  });

  it("matches on label and keywords, case-insensitive (substring, like the format menus)", () => {
    // "he" also hits the keyword substrings "cHEcklist" (tasks) and "tHEmatic" (divider).
    expect(filterSlashEntries("he").map((e) => e.id)).toEqual(["h2", "h3", "tasks", "divider"]);
    expect(filterSlashEntries("head").map((e) => e.id)).toEqual(["h2", "h3"]);
    expect(filterSlashEntries("task").map((e) => e.id)).toEqual(["tasks"]);
    expect(filterSlashEntries("divider").map((e) => e.id)).toEqual(["divider"]);
    expect(filterSlashEntries("list").map((e) => e.id)).toEqual(["bullets", "numbered", "tasks"]);
    expect(filterSlashEntries("zzzz")).toEqual([]);
  });

  it("every entry constructs schema nodes and its lead node is a top-level block", () => {
    for (const e of SLASH_ENTRIES) {
      for (const name of e.nodes) {
        expect(pageSchema.nodes[name], `${e.id} → ${name}`).toBeDefined();
      }
      // the lead node is the inserted construct itself — it must be a `group:"block"` node
      // (children like list_item/table_row carry no group of their own, deliberately).
      expect(pageSchema.nodes[e.nodes[0]!]!.spec.group?.split(" ") ?? [], `${e.id} lead`).toContain("block");
    }
  });
});

describe("applySlashEntry — arrow+Enter insertion", () => {
  it("replaces the `/`-paragraph by the chosen node and consumes the typed text", () => {
    let st = armed(EMPTY_FIRST);
    st = type(st, "/he");
    const e = filterSlashEntries("he")[0]!;
    let out = st;
    expect(applySlashEntry(viewFor(() => out, (s) => (out = s)), e)).toBe(true);
    expect(out.doc.firstChild?.type.name).toBe("heading");
    expect(out.doc.firstChild?.attrs["level"]).toBe(2);
    // the typed `/` is consumed — no "/" text survives anywhere; the sibling text is intact
    expect(out.doc.textContent).not.toContain("/");
    expect(out.doc.textContent).toContain("alpha");
    // the caret sits inside the new heading, ready to type
    expect(out.selection.$from.parent.type.name).toBe("heading");
  });

  it("inserts a blockquote > paragraph", () => {
    let st = armed(EMPTY_FIRST);
    st = type(st, "/q");
    let out = st;
    applySlashEntry(viewFor(() => out, (s) => (out = s)), entry("quote"));
    expect(out.doc.firstChild?.type.name).toBe("blockquote");
    expect(out.doc.firstChild?.firstChild?.type.name).toBe("paragraph");
    expect(out.selection.$from.parent.type.name).toBe("paragraph");
    expect(out.doc.textContent).not.toContain("/");
  });

  it("inserts a task list item with checked:false", () => {
    let st = armed(EMPTY_FIRST);
    st = type(st, "/ta");
    let out = st;
    applySlashEntry(viewFor(() => out, (s) => (out = s)), entry("tasks"));
    const list = out.doc.firstChild!;
    expect(list.type.name).toBe("list");
    expect(list.firstChild?.type.name).toBe("list_item");
    expect(list.firstChild?.attrs["checked"]).toBe(false);
    expect(out.doc.textContent).not.toContain("/");
  });

  it("an atomic block lands with a trailing empty paragraph and the caret inside it", () => {
    let st = armed(EMPTY_FIRST);
    st = type(st, "/di");
    let out = st;
    applySlashEntry(viewFor(() => out, (s) => (out = s)), entry("divider"));
    expect(out.doc.firstChild?.type.name).toBe("thematic_break");
    expect(out.doc.child(1)?.type.name).toBe("paragraph");
    expect(out.selection.$from.parent.type.name).toBe("paragraph");
  });

  it("a table lands as 2×2 cells with the caret in the first cell", () => {
    let st = armed(EMPTY_FIRST);
    st = type(st, "/tab");
    let out = st;
    applySlashEntry(viewFor(() => out, (s) => (out = s)), entry("table"));
    const table = out.doc.firstChild!;
    expect(table.type.name).toBe("table");
    expect(table.childCount).toBe(2);
    expect(table.firstChild?.childCount).toBe(2);
    expect(out.selection.$from.parent.type.name).toBe("table_cell");
  });

  it("insert inside a nested paragraph (list_item > paragraph) stays schema-valid", () => {
    let st = createPageState(LIST_EMPTY);
    st = sel(st, 3); // inside the item's empty paragraph
    st = type(st, "/di");
    expect(slashState(st).from).not.toBeNull();
    let out = st;
    applySlashEntry(viewFor(() => out, (s) => (out = s)), entry("divider"));
    out.doc.check();
    const item = out.doc.nodeAt(0)!.firstChild!;
    expect(item.child(0).type.name).toBe("thematic_break");
    expect(item.child(1).type.name).toBe("paragraph");
  });
});

describe("dismiss + reopen semantics", () => {
  it("the dismiss meta closes the menu and keeps it closed while the match continues", () => {
    let st = armed(EMPTY_FIRST);
    st = type(st, "/he");
    st = st.apply(st.tr.setMeta(slashMenuKey, { kind: "dismiss" }));
    expect(slashState(st).from).toBeNull();
    expect(slashState(st).dismissedFrom).toBe(1);
    // typing more in the same `/`-block does NOT re-open it
    st = type(st, "a");
    expect(slashState(st).from).toBeNull();
    expect(st.doc.textContent).toContain("/hea");
  });

  it("the match ending re-arms the trigger", () => {
    let st = armed(EMPTY_FIRST);
    st = type(st, "/he");
    st = st.apply(st.tr.setMeta(slashMenuKey, { kind: "dismiss" }));
    expect(slashState(st).dismissedFrom).toBe(1);
    // delete the whole `/`-text — the match ends and the dismissal clears
    st = st.apply(st.tr.delete(1, 4));
    expect(slashState(st).dismissedFrom).toBeNull();
    // a fresh `/` match opens again
    st = sel(st, 1);
    st = type(st, "/");
    expect(slashState(st).from).not.toBeNull();
  });

  it("the move/set meta adjust the active index", () => {
    let st = armed(EMPTY_FIRST);
    st = type(st, "/");
    st = st.apply(st.tr.setMeta(slashMenuKey, { kind: "move", delta: 2 }));
    expect(slashState(st).active).toBe(2);
    st = st.apply(st.tr.setMeta(slashMenuKey, { kind: "set", active: 5 }));
    expect(slashState(st).active).toBe(5);
    // a query change in the same `/`-block keeps the index (clamped on use)
    st = type(st, "h");
    expect(slashState(st).active).toBe(5);
    expect(slashState(st).query).toBe("h");
  });
});

describe("plugin mounting", () => {
  it("the collab-bound state carries the same plugin", () => {
    const frag = new Y.Doc().getXmlFragment("prosemirror");
    let st = createCollabPageState(frag);
    st = st.apply(
      st.tr.insert(0, pageSchema.nodes["paragraph"]!.create()),
    );
    st = sel(st, 1);
    st = type(st, "/");
    expect(slashState(st).from).not.toBeNull();
  });

  it("deleting the `/` closes the menu (the derive re-runs on every tr)", () => {
    let st = armed(EMPTY_FIRST);
    st = type(st, "/");
    expect(slashState(st).from).not.toBeNull();
    st = st.apply(st.tr.delete(1, 2));
    expect(slashState(st).from).toBeNull();
  });
});
