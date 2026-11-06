// @vitest-environment happy-dom
//
// SPA.25 — the source view's mounted contract (REQ-ED-17; design/30; the R20 "designed feature"
// ruling). `PageMount` is driven inside the real `<PageEditor>` chrome exactly like
// page-collab.dom.test.tsx — the wire, registry, PM view, and CodeMirror bridge are production
// code; only the collab transport is stubbed. Asserted:
//   • `[data-source-toggle]` appears only once the live view binds (never pre-mount, never SSR).
//   • toggling shows `[data-source-host]` seeded with the canonical markdown while
//     `[data-pm-host]` hides — the PM view stays mounted + bound (same EditorView instance).
//   • a source edit commits through the SAME PM doc (toggle-back renders the typed text; the
//     commit's `human` provenance is visible through `provenanceForSave`; a second toggle re-seeds
//     to the committed text — no divergence).
//   • a foreign doc change while the buffer is dirty raises `[data-source-note]`; the commit then
//     applies per-block last-writer-wins (the foreign block survives).
//   • a clean buffer pulls foreign doc changes into the source view verbatim.
//   • a server-readonly mount still toggles — into a READ-ONLY CodeMirror (REQ-ED-12's posture).
//
// The block-diff/commit/undo semantics live in packages/editor/src/source-mode.test.ts; this file
// owns the mounted wiring.

import { act, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { EditorView as CmView } from "@codemirror/view";
import { PageEditor } from "@rhema/ui";
import { markdownToDoc, markdownToUpdate, provenanceForSave } from "@rhema/editor";
import { pageLabels } from "../page-chrome.js";
import { PageMount } from "./page-mount.js";
import { pageCollabRuntime } from "./page-collab.js";
import { PageSessionRegistry } from "./page-sessions.js";
import type { CollabSession, CollabSessionOptions } from "../client/collab.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WS = "wss://collab.test/collab";
const DRAFT = "d_7";
const MD = "## A draft\n\nBody text with the quote inside.\n\nTail para.\n";
const DOC_JSON = markdownToDoc(MD).toJSON();

let sessions: { opts: CollabSessionOptions; session: CollabSession }[] = [];
const REAL_CREATE = pageCollabRuntime.createSession;

function fakeSession(opts: CollabSessionOptions): CollabSession {
  const doc = new Y.Doc();
  // seed the fragment — the real wire's Y.Doc arrives pre-synced from IDB + the server's live_doc
  // row; `createCollabPageState` binds with no doc of its own, so an unseeded fragment reads empty.
  Y.applyUpdate(doc, markdownToUpdate(MD));
  const session: CollabSession = {
    doc,
    fragment: doc.getXmlFragment("prosemirror"),
    provider: { unsyncedChanges: 0 } as unknown as HocuspocusProvider,
    sync: { state: "synced", queued: 0 },
    sendProvenance: vi.fn(),
    markRestorePoint: vi.fn(),
    flushOnHide: vi.fn(),
    rebind: vi.fn(),
    destroy: vi.fn(),
  };
  sessions.push({ opts, session });
  return session;
}

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      new Response(JSON.stringify({ draftId: DRAFT, draftN: 7, lock: null, findings: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ),
  );
}

const mounted: Root[] = [];
const containers: HTMLElement[] = [];

async function mountEditor(opts: { readonly readOnly?: boolean; readonly collab?: boolean } = {}) {
  const collab = opts.collab !== false;
  const registry = new PageSessionRegistry();
  const el = document.createElement("div");
  document.body.appendChild(el);
  containers.push(el);
  const root = createRoot(el);
  mounted.push(root);
  const view: { current: import("prosemirror-view").EditorView | null } = { current: null };
  // REQ-WRITE-5 (239) — the harness drives the CONTROLLED source-mode seam: the toggle lives
  // outside PageMount now (in the page header strip), exactly as the leaf wires it.
  function Harness(props: { readonly children: (source: { on: boolean; set: (v: boolean) => void }) => ReactNode }) {
    const [on, setOn] = useState(false);
    return (
      <>
        <button type="button" data-source-toggle="true" aria-pressed={on} onClick={() => setOn((s) => !s)}>
          {on ? "Rich text" : "Source"}
        </button>
        {props.children({ on, set: setOn })}
      </>
    );
  }
  await act(async () => {
    root.render(
      <Harness>
        {(source) => (
          <PageEditor
            docJson={DOC_JSON}
            draftId={DRAFT}
            draftN={7}
            baseDraftN={6}
            origin="human_revision"
            state="open"
            lock={null}
            findings={[]}
            proposals={[]}
            provenance={null}
            danglingCites={[]}
            readOnly={opts.readOnly === true}
            {...(collab ? { collabWsUrl: WS } : {})}
            docUrl={`/p/the-piece/edit/${DRAFT}/doc`}
            noteUrl={`/p/the-piece/edit/${DRAFT}/note`}
            cancelUrl={`/p/the-piece/edit/${DRAFT}/cancel-run`}
            reviseUrl={`/p/the-piece/edit/${DRAFT}/revise`}
            labels={pageLabels}
            embeds={false}
            host={
              <PageMount
                draftId={DRAFT}
                docJson={DOC_JSON}
                readOnly={opts.readOnly}
                collabUrl={collab ? WS : ""}
                registry={registry}
                sourceMode={source.on}
                onSourceModeChange={source.set}
                onMounted={(v) => {
                  view.current = v;
                }}
              />
            }
          />
        )}
      </Harness>,
    );
  });
  await vi.waitFor(() => expect(el.querySelector("[data-page-view]")).not.toBeNull());
  const toggle = () => el.querySelector<HTMLElement>("[data-source-toggle]")!;
  const sourceHost = () => el.querySelector<HTMLElement>("[data-source-host]")!;
  const pmHost = () => el.querySelector<HTMLElement>("[data-pm-host]")!;
  const cm = () => {
    const dom = sourceHost().querySelector(".cm-editor");
    return dom ? (CmView.findFromDOM(dom as HTMLElement) ?? null) : null;
  };
  return { el, root, registry, view, toggle, sourceHost, pmHost, cm };
}

/** Click the toggle inside act and wait for the lazily-imported CM view to mount. */
async function enterSource(h: Awaited<ReturnType<typeof mountEditor>>) {
  await act(async () => {
    h.toggle().click();
  });
  await vi.waitFor(() => expect(h.cm()).not.toBeNull());
}

describe("PageMount source mode (SPA.25)", () => {
  beforeEach(() => {
    sessions = [];
    pageCollabRuntime.createSession = fakeSession;
    stubFetch();
  });
  afterEach(() => {
    pageCollabRuntime.createSession = REAL_CREATE;
    for (const r of mounted.splice(0)) {
      act(() => r.unmount());
      r.unmount();
    }
    for (const c of containers.splice(0)) c.remove();
    vi.unstubAllGlobals();
  });

  it("emits the toggle + both hosts once the view binds — and never before", async () => {
    const h = await mountEditor();
    expect(h.toggle().getAttribute("aria-pressed")).toBe("false");
    expect(h.pmHost().hasAttribute("hidden")).toBe(false);
    expect(h.el.querySelector("[data-source-wrap]")!.hasAttribute("hidden")).toBe(true);
    // the SPA mount owns the host emitters — SSR `data-page-host` markup (ui/page-editor.tsx)
    // and forced-SSR postures never carry them. REQ-WRITE-5: `data-source-bar` is retired —
    // the ONE toggle lives in the strip, so the mount emits `data-source-wrap` only.
    const host = h.el.querySelector("[data-page-host]")!;
    const wrap = host.querySelector<HTMLElement>("[data-source-wrap]")!;
    expect(wrap).not.toBeNull();
    expect(wrap.hasAttribute("hidden")).toBe(true); // off until the toggle flips
    expect(wrap.querySelector("[data-source-host]")).not.toBeNull();
    expect(host.querySelector("[data-source-bar]")).toBeNull();
    expect(host.querySelector("[data-source-note]")).toBeNull(); // clean → no stale line
  });

  it("toggling mounts CodeMirror seeded with the canonical markdown; the PM view stays bound", async () => {
    const h = await mountEditor();
    const pmView = h.view.current!;
    await enterSource(h);
    expect(h.toggle().getAttribute("aria-pressed")).toBe("true");
    expect(h.pmHost().hasAttribute("hidden")).toBe(true);
    expect(h.sourceHost().hasAttribute("hidden")).toBe(false);
    const text = h.cm()!.state.doc.toString();
    expect(text).toContain("## A draft");
    expect(text).toContain("Body text with the quote inside.");
    expect(text).toContain("Tail para.");
    // the SAME PM view — still mounted, still the dispatch target
    expect(h.view.current).toBe(pmView);
    expect(h.view.current!.hasFocus instanceof Function).toBe(true);
  });

  it("REQ-WRITE-5 — the source view soft-wraps prose (no gutter, wrap facet on)", async () => {
    const h = await mountEditor();
    await enterSource(h);
    const cm = h.cm()!;
    expect(cm).not.toBeNull();
    // soft wrap is the I8 fix's core: the lineWrapping extension marks the content element
    // `cm-lineWrapping` (CM6's contentAttributes) — the wrap class IS the no-horizontal-
    // overflow fact at any pane width.
    expect(h.sourceHost().querySelector(".cm-content")!.classList.contains("cm-lineWrapping")).toBe(true);
    // the line-number gutter's fate is this ticket's recorded call — REMOVED: prose does not
    // number lines, and it stole ~32 px of the pane measure the wrap was added to protect.
    expect(h.sourceHost().querySelector(".cm-gutters")).toBeNull();
    // the prose face rides the paper tokens — the theme module is a plain `CmView.theme`, so the
    // injected <style> is the assertable fact (happy-dom does not resolve computed styles).
    const styles = [...document.querySelectorAll("style")].map((s) => s.textContent ?? "").join("\n");
    expect(styles).toContain("--paper-size, 17px");
    // the wrap container owns host + note — never a floating chip inside the page root.
    const wrap = h.el.querySelector<HTMLElement>("[data-source-wrap]")!;
    expect(wrap.hasAttribute("hidden")).toBe(false);
    expect(h.el.querySelector("[data-source-bar]")).toBeNull();
  });

  it("a source edit commits through the live PM view — toggle-back renders it, provenance is human", async () => {
    const h = await mountEditor();
    await enterSource(h);
    const cm = h.cm()!;
    act(() => {
      cm.dispatch({ changes: { from: cm.state.doc.length, insert: "\n\nSource-authored line." } });
    });
    // toggle-back is a flush point — the pending buffer commits through view.dispatch first.
    await act(async () => {
      h.toggle().click();
    });
    const doc = h.view.current!.state.doc;
    expect(doc.child(doc.childCount - 1).textContent).toBe("Source-authored line.");
    expect(h.el.querySelector("[data-page-view]")!.textContent).toContain("Source-authored line.");
    // provenance: the appended block stamps human; the untouched blocks keep theirs.
    const spans = provenanceForSave(h.view.current!.state);
    expect(spans.at(-1)!.source.kind).toBe("human");
    expect(h.cm()).toBeNull(); // CM torn down — the PM doc is the only live story again
    // re-entering re-seeds from the committed doc — the two views never diverge
    await enterSource(h);
    expect(h.cm()!.state.doc.toString()).toContain("Source-authored line.");
  });

  it("a foreign doc change lands in a clean buffer verbatim; a dirty buffer marks the stale note", async () => {
    const h = await mountEditor();
    await enterSource(h);
    const pm = h.view.current!;
    // remote/foreign tr — the same seam ySync's remote applies ride (view.dispatch)
    act(() => {
      pm.dispatch(pm.state.tr.insertText("REMOTE ", 1));
    });
    await vi.waitFor(() => expect(h.cm()!.state.doc.toString()).toContain("REMOTE"));
    expect(h.el.querySelector("[data-source-note]")).toBeNull(); // clean pull — no stale note
    // now dirty the buffer, then land another foreign change → the note appears and the buffer
    // is NOT clobbered; the commit still merges per-block.
    const cm = h.cm()!;
    act(() => {
      cm.dispatch({ changes: { from: 0, to: cm.state.doc.length, insert: cm.state.doc.toString().replace("Tail para.", "MY tail.") } });
    });
    act(() => {
      const s = pm.state;
      // foreign append at the end — lands while dirty
      pm.dispatch(s.tr.insert(s.doc.content.size, s.schema.node("paragraph", null, s.schema.text("foreign tail"))));
    });
    await vi.waitFor(() => expect(h.el.querySelector("[data-source-note]")).not.toBeNull());
    expect(h.cm()!.state.doc.toString()).toContain("MY tail."); // buffer intact
    await act(async () => {
      h.toggle().click(); // commit on the way out — per-block last-writer-wins
    });
    const md = h.view.current!.state.doc.textContent;
    expect(md).toContain("MY tail.");
    expect(md).toContain("foreign tail");
    expect(md).toContain("REMOTE"); // the earlier remote text survives the dirty commit
  });

  it("a server-readonly mount toggles into a read-only source view — commits refuse", async () => {
    // the island's editable formula verbatim: readonly posture + no collab URL ⇒ non-editable.
    const h = await mountEditor({ readOnly: true, collab: false });
    await enterSource(h);
    const cm = h.cm()!;
    // the READ-ONLY posture is the contract: the CM surface cannot take user input…
    expect(cm.state.facet(CmView.editable)).toBe(false);
    expect(cm.state.readOnly).toBe(true);
    // …and even a programmatic buffer change never reaches the PM doc — commitNow refuses while
    // !editable() (a script can't write a locked/readonly draft through the source view).
    cm.dispatch({ changes: { from: 0, insert: "X" } });
    await act(async () => {
      h.toggle().click();
    });
    expect(h.view.current!.state.doc.textContent).not.toContain("X##");
    expect(h.view.current!.state.doc.textContent).toContain("Body text");
  });
});
