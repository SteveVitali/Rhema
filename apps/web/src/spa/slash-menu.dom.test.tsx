// @vitest-environment happy-dom
//
// REQ-WRITE-3 (329_R7UX.6; BL-97) — the slash menu's DOM legs: `[data-slash-menu]` emitted ONLY
// while the `/`-match is open, `[data-slash-item]` rows in entry order, typed text filtering the
// rows, ArrowDown + Enter inserting the schema construct at the caret (the typed `/` consumed),
// Escape dismissing without touching the text, and the no-menu arms (read-only mount, inside a
// code block). State/filter legs live in packages/editor's slash-menu.test.ts.

import { afterEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { EditorView } from "prosemirror-view";
import { TextSelection } from "prosemirror-state";
import { createPageState, SLASH_ENTRIES } from "@rhema/editor";
import { installOriginDispatch, PageMount } from "./page-mount.js";
import { SlashMenuMount } from "./slash-menu.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/** A doc whose first block is an EMPTY paragraph — the block the `/`-typing legs open in. */
const EMPTY_FIRST = {
  type: "doc",
  content: [
    { type: "paragraph" },
    { type: "paragraph", content: [{ type: "text", text: "alpha" }] },
  ],
};

const CODE_DOC = {
  type: "doc",
  content: [
    { type: "code_block", content: [{ type: "text", text: "code line" }] },
    { type: "paragraph" },
  ],
};

interface Mounted {
  view: EditorView;
  menu: SlashMenuMount;
  host: HTMLElement;
}

/** The production wiring, verbatim: mount → installOriginDispatch → sync on every transaction. */
function mountEditor(docJson: unknown, editable = true): Mounted {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const view = new EditorView(host, {
    state: createPageState(docJson),
    editable: () => editable,
  });
  const menu = new SlashMenuMount(view);
  installOriginDispatch(view, {
    armed: () => false,
    onDocChanged: () => undefined,
    onTransaction: () => menu.sync(),
  });
  return { view, menu, host };
}

/** Select a position, then type text there (the real dispatchTransaction tap → menu.sync). */
function type(view: EditorView, pos: number, text: string): void {
  view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)).insertText(text));
}

function key(view: EditorView, k: string): void {
  view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
}

const menu = () => document.querySelector<HTMLElement>("[data-slash-menu]");
const items = () => [...document.querySelectorAll<HTMLElement>("[data-slash-item]")];

const mounted: Mounted[] = [];
afterEach(() => {
  while (mounted.length) {
    const m = mounted.pop()!;
    m.menu.destroy();
    m.view.destroy();
    m.host.remove();
  }
});

describe("slash menu — open/filter/insert/dismiss (REQ-WRITE-3)", () => {
  it("`/` at block start emits [data-slash-menu] with one row per schema entry", () => {
    const m = mountEditor(EMPTY_FIRST);
    mounted.push(m);
    expect(menu()).toBeNull();
    type(m.view, 1, "/");
    const box = menu();
    expect(box).not.toBeNull();
    expect(box!.hidden).toBe(false);
    expect(items().map((i) => i.getAttribute("data-slash-item"))).toEqual(
      SLASH_ENTRIES.map((e) => e.id),
    );
    // the first row is active by default
    expect(items()[0]!.hasAttribute("data-highlighted")).toBe(true);
    expect(items()[0]!.getAttribute("aria-selected")).toBe("true");
  });

  it("typed text filters the rows", () => {
    const m = mountEditor(EMPTY_FIRST);
    mounted.push(m);
    type(m.view, 1, "/head");
    expect(items().map((i) => i.getAttribute("data-slash-item"))).toEqual(["h2", "h3"]);
    // a query with no match keeps the menu open on its empty state — text never eaten
    type(m.view, m.view.state.selection.from, "zz");
    expect(items()).toHaveLength(0);
    expect(menu()).not.toBeNull();
    expect(menu()!.textContent).toContain("No matching block");
  });

  it("Enter inserts the active construct at the caret and consumes the `/`", () => {
    const m = mountEditor(EMPTY_FIRST);
    mounted.push(m);
    type(m.view, 1, "/head");
    key(m.view, "Enter");
    expect(menu()).toBeNull();
    expect(m.view.state.doc.firstChild?.type.name).toBe("heading");
    expect(m.view.state.doc.textContent).not.toContain("/");
    expect(m.view.state.doc.textContent).toContain("alpha");
    expect(m.view.dom.querySelector("h2")).not.toBeNull();
  });

  it("ArrowDown + Enter inserts the second filtered row", () => {
    const m = mountEditor(EMPTY_FIRST);
    mounted.push(m);
    type(m.view, 1, "/head");
    key(m.view, "ArrowDown");
    expect(items().map((i) => i.getAttribute("aria-selected"))).toEqual(["false", "true"]);
    key(m.view, "Enter");
    expect(m.view.state.doc.firstChild?.type.name).toBe("heading");
    expect(m.view.state.doc.firstChild?.attrs["level"]).toBe(3);
  });

  it("Escape dismisses — the typed `/`+query stays as text, and the match stays dismissed", () => {
    const m = mountEditor(EMPTY_FIRST);
    mounted.push(m);
    type(m.view, 1, "/he");
    key(m.view, "Escape");
    expect(menu()).toBeNull();
    expect(m.view.dom.textContent).toContain("/he");
    // typing more does not re-open it
    type(m.view, m.view.state.selection.from, "a");
    expect(menu()).toBeNull();
    expect(m.view.dom.textContent).toContain("/hea");
  });

  it("deleting the `/` removes the menu", () => {
    const m = mountEditor(EMPTY_FIRST);
    mounted.push(m);
    type(m.view, 1, "/");
    expect(menu()).not.toBeNull();
    m.view.dispatch(m.view.state.tr.delete(1, 2));
    expect(menu()).toBeNull();
  });
});

describe("slash menu — the no-menu arms", () => {
  it("never emits on a read-only mount (the lock/showcase posture)", () => {
    const m = mountEditor(EMPTY_FIRST, false);
    mounted.push(m);
    type(m.view, 1, "/");
    expect(menu()).toBeNull();
  });

  it("never emits inside a code block", () => {
    const m = mountEditor(CODE_DOC);
    mounted.push(m);
    type(m.view, 10, "/"); // inside the code block's text, at its end
    expect(m.view.state.selection.$from.parent.type.name).toBe("code_block");
    expect(menu()).toBeNull();
  });
});

describe("slash menu — the PageMount production seam", () => {
  it("PageMount mounts the menu path itself (the onTransaction tap is wired in-tree)", async () => {
    // the real component leg: PageMount's effect creates the EditorView AND the SlashMenuMount —
    // typing `/` through the view reaches the menu via installOriginDispatch's onTransaction.
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const viewRef: { current: EditorView | null } = { current: null };
    await act(async () => {
      root.render(
        <PageMount draftId="d_slash" docJson={EMPTY_FIRST} viewRef={viewRef} />,
      );
    });
    const view = viewRef.current!;
    expect(view).not.toBeNull();
    type(view, 1, "/");
    expect(menu()).not.toBeNull();
    await act(async () => {
      root.unmount();
    });
    expect(menu()).toBeNull();
    host.remove();
  });
});
