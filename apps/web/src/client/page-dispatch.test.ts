// @vitest-environment happy-dom
// EDIT.1 — the island's dispatchTransaction regression: the hook must APPLY the tr, never re-enter
// view.dispatch (view.dispatch routes back through the hook → RangeError: Maximum call stack on the
// first keystroke — the N8 prod walk caught it; it was latent while the embed bug kept the island
// from ever mounting). This test drives the REAL installOriginDispatch over a real EditorView.
import { describe, expect, it } from "vitest";
import { EditorView } from "prosemirror-view";
import { createPageState, provenanceKey } from "@rhema/editor";
import { installOriginDispatch } from "./page.js";

const DOC = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "seed" }] }],
};

describe("installOriginDispatch — the island's per-keystroke hook (EDIT.1)", () => {
  it("a doc-changing keystroke applies exactly once and stamps human provenance", () => {
    const view = new EditorView(document.createElement("div"), {
      state: createPageState(DOC, new Map()),
    });
    let calls = 0;
    installOriginDispatch(view, { armed: () => false, onDocChanged: () => calls++ });

    // the re-entrant bug throws RangeError here — this dispatch IS the regression probe
    view.dispatch(view.state.tr.insertText("x", 1));

    expect(calls).toBe(1);
    expect(view.state.doc.textContent).toContain("x");
    const prov = provenanceKey.getState(view.state);
    expect([...prov.sources.values()].some((s) => s.kind === "human")).toBe(true);
    view.destroy();
  });

  it("the one-shot paste arm stamps 'pasted' instead of 'human'", () => {
    const view = new EditorView(document.createElement("div"), {
      state: createPageState(DOC, new Map()),
    });
    installOriginDispatch(view, { armed: () => true, onDocChanged: () => {} });
    view.dispatch(view.state.tr.insertText("y", 1));
    const prov = provenanceKey.getState(view.state);
    expect([...prov.sources.values()].some((s) => s.kind === "pasted")).toBe(true);
    view.destroy();
  });

  it("a meta-only transaction does not fire onDocChanged (the lock re-render tr)", () => {
    const view = new EditorView(document.createElement("div"), {
      state: createPageState(DOC, new Map()),
    });
    let calls = 0;
    installOriginDispatch(view, { armed: () => false, onDocChanged: () => calls++ });
    view.dispatch(view.state.tr); // view.dispatch(state.tr) — the applyLock/decorations refresh
    expect(calls).toBe(0);
    view.destroy();
  });
});
