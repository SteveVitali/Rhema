// @vitest-environment happy-dom
//
// SPA.24 — the editor collab binding's mounted contract (design/23 §3/§6; REQ-ED-3/5/7/8/9/10/11,
// REQ-ISL-1..8). `PageMount` is driven inside the REAL `<PageEditor>` chrome (the verbatim
// `data-page-root` / `data-sync-pill` / `data-page-banner` / `data-findings-rail` DOM) with the
// collab session factory stubbed through `pageCollabRuntime.createSession` — the wire, the
// registry, the ProseMirror view, and every DOM effect are the production code.
//
// Asserted (the island's legs, verbatim):
//   • the wire binds at acquire — one `createSession`, `createCollabPageState` on its fragment.
//   • the sync pill follows the wire (synced/syncing/offline·n/readonly) with lock precedence.
//   • the 10 s visible-only `/doc` poll — lock flip + banner + rail lost resync + editable flip.
//   • the frozen-fork `rhema.fork` → `registry.rekey` (same Y.Doc/state, rebind first) + banner.
//   • ⌘S is ONE mint per chord — the mount's keydown and the chrome's `rhema:restore-point`
//     CustomEvent resolve to the same restore point (the same-tick guard).
//   • `pagehide`/`visibilitychange:hidden` flush provenance + the session; unmount releases.
//   • the collab-less (server-readonly/artifact) mount never touches the wire factory.
//
// This file is also the assertion-coverage owner for the editor-surface rail/banner hooks the
// retired source editor's tests used to pin (`data-writer-text`/`data-reader-text`/`data-lost`/
// `data-lost-note-text`/`data-findings-rail`).

import { StrictMode, act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as Y from "yjs";
import type { HocuspocusProvider } from "@hocuspocus/provider";
import { PageEditor, PageStrip } from "@rhema/ui";
import { markdownToDoc } from "@rhema/editor";
import { undo as yUndo, undoCommand, yUndoPluginKey } from "y-prosemirror";
import { pageLabels } from "../page-chrome.js";
import { PageMount } from "./page-mount.js";
import { pageCollabRuntime, isCollabWire } from "./page-collab.js";
import { PageSessionRegistry } from "./page-sessions.js";
import type { CollabSession, CollabSessionOptions } from "../client/collab.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const WS = "wss://collab.test/collab";
const DRAFT = "d_7";
const DOC_JSON = markdownToDoc("## A draft\n\nBody text with the quote inside.\n").toJSON();
const FINDING = {
  findingId: "f_1",
  title: "The quote drifted.",
  severity: "major",
  sourceLabel: "from Review of v1",
  quote: "the quote",
  anchor: { blockId: "b1", quote: "the quote", startOffset: 20, endOffset: 29, confidence: 1 },
  lost: false,
};

// ---- the stubbed wire (the CollabSession the mount wraps; callbacks captured for firing) ------

let sessions: { opts: CollabSessionOptions; session: CollabSession }[] = [];
const REAL_CREATE = pageCollabRuntime.createSession;

function fakeSession(opts: CollabSessionOptions): CollabSession {
  const doc = new Y.Doc();
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

const fetches: { url: string; init?: RequestInit }[] = [];
let docResponse: unknown = { draftId: DRAFT, draftN: 7, lock: null, findings: [] };

function stubFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      fetches.push({ url, ...(init ? { init } : {}) });
      return new Response(JSON.stringify(docResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

// ---- the mount harness — the verbatim PageEditor chrome around the real PageMount -------------

const mounted: Root[] = [];
const containers: HTMLElement[] = [];
const registries: PageSessionRegistry[] = [];

async function mountEditor(opts: {
  readonly collab?: boolean;
  readonly readOnly?: boolean;
  readonly locked?: boolean;
  readonly findings?: readonly (typeof FINDING)[];
  readonly registry?: PageSessionRegistry;
} = {}) {
  const collab = opts.collab !== false;
  const readOnly = opts.readOnly === true;
  const registry = opts.registry ?? new PageSessionRegistry();
  registries.push(registry);
  const el = document.createElement("div");
  document.body.appendChild(el);
  containers.push(el);
  const root = createRoot(el);
  mounted.push(root);
  const findings = (opts.findings ?? []) as never[];
  const view: { current: import("prosemirror-view").EditorView | null } = { current: null };
  await act(async () => {
    root.render(
      // R7WRITE.1a — the pill/banners moved out of `.paper` into the `data-page-strip` header;
      // the mount scopes to `[data-pane='page']`. The harness renders the same strip+paper pair.
      <div data-pane="page">
        <PageStrip
          crumbs={[{ label: "The Piece", href: "/p/the-piece" }, { label: "Page" }]}
          draftN={7}
          baseDraftN={6}
          origin="human_revision"
          state="open"
          lock={opts.locked ? { runId: "r_1", kind: "writer", workflow: "Review" } : null}
          proposals={[]}
          reviseUrl={`/p/the-piece/edit/${DRAFT}/revise`}
          cancelUrl={`/p/the-piece/edit/${DRAFT}/cancel-run`}
          labels={pageLabels}
          stripLabels={{
            breadcrumbAria: "Breadcrumb",
            separator: "›",
            workingBadge: "working",
            frozenBadge: "frozen",
            runLabel: "Run",
            moreLabel: "More actions",
          }}
          {...(readOnly ? { readOnly: true } : {})}
        />
        <PageEditor
          docJson={DOC_JSON}
          draftId={DRAFT}
          draftN={7}
          baseDraftN={6}
          origin="human_revision"
          state="open"
          lock={opts.locked ? { runId: "r_1", kind: "writer", workflow: "Review" } : null}
          findings={findings}
          proposals={[]}
          provenance={null}
          danglingCites={[]}
          readOnly={readOnly}
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
              findings={findings as never}
              locked={opts.locked}
              readOnly={readOnly}
              collabUrl={collab ? WS : ""}
              registry={registry}
              onMounted={(v) => {
                view.current = v;
              }}
            />
          }
        />
      </div>,
    );
  });
  const pageRoot = () => el.querySelector<HTMLElement>("[data-page-root]")!;
  const pill = () => el.querySelector<HTMLElement>("[data-sync-pill]")!;
  const lockBanner = () => el.querySelector<HTMLElement>('[data-page-banner="lock"]')!;
  return { el, root, registry, pageRoot, pill, lockBanner, view };
}

beforeEach(() => {
  sessions = [];
  fetches.length = 0;
  docResponse = { draftId: DRAFT, draftN: 7, lock: null, findings: [] };
  pageCollabRuntime.createSession = fakeSession;
  stubFetch();
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});

afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  for (const reg of registries.splice(0)) reg.destroyAll();
  for (const el of containers.splice(0)) el.remove();
  pageCollabRuntime.createSession = REAL_CREATE;
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

// ---- the wire bind ----------------------------------------------------------------------------

describe("SPA.24 — the collab wire binds through the registry", () => {
  it("a collabUrl mount opens exactly one session and binds the shared fragment's state", async () => {
    const { registry, pageRoot } = await mountEditor();
    expect(sessions.length).toBe(1);
    expect(sessions[0]!.opts.wsUrl).toBe(WS);
    expect(sessions[0]!.opts.draftId).toBe(DRAFT);
    // the registry entry holds the wire — a remount reuses it (createSession runs once/entry).
    const entry = registry.entry(DRAFT);
    expect(entry?.session).not.toBeNull();
    expect(pageRoot().querySelector("[data-page-view]")).not.toBeNull();
    // the collab contract attrs the mount reads are the verbatim SSR hooks.
    expect(pageRoot().dataset["collabUrl"]).toBe(WS);
    expect(pageRoot().dataset["docUrl"]).toBe(`/p/the-piece/edit/${DRAFT}/doc`);
    expect(pageRoot().dataset["draftId"]).toBe(DRAFT);
  });

  it("StrictMode's double-mount keeps ONE session + the same EditorState (registry custody)", async () => {
    const registry = new PageSessionRegistry();
    registries.push(registry);
    const el = document.createElement("div");
    document.body.appendChild(el);
    containers.push(el);
    const root = createRoot(el);
    mounted.push(root);
    await act(async () => {
      root.render(
        <StrictMode>
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
            collabWsUrl={WS}
            docUrl={`/p/the-piece/edit/${DRAFT}/doc`}
            noteUrl={`/p/the-piece/edit/${DRAFT}/note`}
            cancelUrl={`/p/the-piece/edit/${DRAFT}/cancel-run`}
            reviseUrl={`/p/the-piece/edit/${DRAFT}/revise`}
            labels={pageLabels}
            embeds={false}
            host={
              <PageMount draftId={DRAFT} docJson={DOC_JSON} collabUrl={WS} registry={registry} />
            }
          />
        </StrictMode>,
      );
    });
    expect(sessions.length).toBe(1); // the remount re-acquired the same entry — no second wire
    expect(el.querySelector("[data-page-view]")).not.toBeNull();
  });

  it("a collab-less (server-readonly) mount never opens the wire — the static state mounts", async () => {
    await mountEditor({ collab: false, readOnly: true });
    expect(sessions.length).toBe(0);
    // the read-only floor still mounts a view (the artifact read) — just never editable + never wired.
    expect(document.querySelector("[data-page-view]")).not.toBeNull();
    const host = document.querySelector<HTMLElement>("[data-page-host]")!;
    expect(host.dataset["readonly"]).toBe("1");
  });
});

// ---- the sync pill ----------------------------------------------------------------------------

describe("SPA.24 — the sync pill (§5.10 verbatim)", () => {
  it("follows the wire's sync events through the data-label map", async () => {
    const { pill } = await mountEditor();
    const ev = sessions[0]!.opts;
    await act(async () => {
      ev.onSync?.({ state: "syncing", queued: 2 });
    });
    expect(pill().dataset["syncState"]).toBe("syncing");
    expect(pill().textContent).toBe(pageLabels.sync.syncing);
    await act(async () => {
      ev.onSync?.({ state: "offline", queued: 3 });
    });
    expect(pill().dataset["syncState"]).toBe("offline");
    expect(pill().textContent).toBe("offline · 3 changes queued");
    await act(async () => {
      ev.onSync?.({ state: "readonly", queued: 0 });
    });
    expect(pill().dataset["syncState"]).toBe("readonly");
    expect(pill().textContent).toBe(pageLabels.sync.readOnly);
    await act(async () => {
      ev.onSync?.({ state: "synced", queued: 0 });
    });
    expect(pill().dataset["syncState"]).toBe("synced");
    expect(pill().textContent).toBe(pageLabels.sync.synced);
  });

  it("the poll's lock read beats the optimistic pill (lockedOverride precedence)", async () => {
    const { pill, pageRoot } = await mountEditor();
    docResponse = {
      draftId: DRAFT,
      draftN: 7,
      lock: { runId: "r_1", kind: "writer", workflow: "Review" },
      findings: [],
    };
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => document.dispatchEvent(new Event("visibilitychange"))); // hidden arm
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => document.dispatchEvent(new Event("visibilitychange"))); // visible → poll now
    expect(fetches.some((f) => f.url === `/p/the-piece/edit/${DRAFT}/doc`)).toBe(true);
    expect(pageRoot().dataset["locked"]).toBe("1");
    // the wire can report `synced` — the lock still reads read-only.
    await act(async () => {
      sessions[0]!.opts.onSync?.({ state: "synced", queued: 0 });
    });
    expect(pill().dataset["syncState"]).toBe("readonly");
    expect(pill().textContent).toBe(pageLabels.sync.readOnly);
  });
});

// ---- the §6.3 lock poll ------------------------------------------------------------------------

describe("SPA.24 — the 10 s visible-only lock poll", () => {
  it("a mid-session lock lands the banner + freezes the editor; release restores it", async () => {
    const { pageRoot, lockBanner } = await mountEditor();
    // the banner node emits unconditionally now (hidden when unlocked) — the poll can fill it.
    expect(lockBanner().style.display).toBe("none");
    // the §6.3 templates emit verbatim — the mount's setLockBanner reads them mid-session.
    expect(lockBanner().getAttribute("data-writer-text")).toContain("{workflow}");
    expect(lockBanner().getAttribute("data-reader-text")).toContain("{workflow}");
    docResponse = {
      draftId: DRAFT,
      draftN: 7,
      lock: { runId: "r_1", kind: "writer", workflow: "Review" },
      findings: [],
    };
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(lockBanner().style.display).toBe("flex");
    expect(
      lockBanner().querySelector("[data-page-banner-text]")!.textContent,
    ).toBe("A Review run is writing this draft — editing is locked until it finishes.");
    // release — the next poll clears banner + lock.
    docResponse = { draftId: DRAFT, draftN: 7, lock: null, findings: [] };
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(lockBanner().style.display).toBe("none");
    expect(pageRoot().dataset["locked"]).toBe("0");
  });

  it("resyncs the rail's lost flags + notes (and keeps decoration inputs in step)", async () => {
    const { pageRoot } = await mountEditor({ findings: [FINDING] });
    // the RAIL row — the live view's finding decorations carry data-finding-id too, so the
    // query is scoped to `[data-findings-rail]` exactly like the mount's syncRail is.
    const rail = pageRoot().querySelector<HTMLElement>("[data-findings-rail]")!;
    // the rail carries the note copy the poll's live-added [data-lost-note] nodes read.
    expect(rail.getAttribute("data-lost-note-text")).toBe("passage changed — still applies?");
    const row = rail.querySelector<HTMLElement>(`[data-finding-id="${FINDING.findingId}"]`)!;
    expect(row).not.toBeNull();
    expect(row.hasAttribute("data-lost")).toBe(false);
    expect(row.querySelector("[data-lost-note]")).toBeNull();
    docResponse = {
      draftId: DRAFT,
      draftN: 7,
      lock: null,
      findings: [{ findingId: FINDING.findingId, severity: "major", anchor: null, lost: true }],
    };
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(row.getAttribute("data-lost")).toBe("true");
    const note = row.querySelector<HTMLElement>("[data-lost-note]");
    expect(note?.textContent).toBe("passage changed — still applies?");
    // … and the un-lost pass removes both markers.
    docResponse = {
      draftId: DRAFT,
      draftN: 7,
      lock: null,
      findings: [{ findingId: FINDING.findingId, severity: "major", anchor: null, lost: false }],
    };
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(row.hasAttribute("data-lost")).toBe(false);
    expect(row.querySelector("[data-lost-note]")).toBeNull();
  });

  it("polls on the 10 s interval only while visible — hidden pages never fetch", async () => {
    vi.useFakeTimers();
    try {
      await mountEditor();
      fetches.length = 0;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10_000);
      });
      expect(fetches.map((f) => f.url)).toContain(`/p/the-piece/edit/${DRAFT}/doc`);
      fetches.length = 0;
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(fetches.length).toBe(0); // visible-only — the hidden page is silent
      Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---- the frozen-fork rebase ---------------------------------------------------------------------

describe("SPA.24 — the frozen-head fork rebase", () => {
  it("rhema.fork rekeys the SAME entry/state to the child draft and lands the §5.4 banner", async () => {
    const { registry, pageRoot } = await mountEditor();
    const before = registry.entry(DRAFT);
    const state = before!.state;
    await act(async () => {
      sessions[0]!.opts.onFork?.({ draftId: "d_8", draftN: 8 });
    });
    // rekey owns the rebind — same session, same EditorState, new key.
    expect(sessions[0]!.session.rebind).toHaveBeenCalledWith("d_8");
    expect(registry.entry(DRAFT)).toBeNull();
    const after = registry.entry("d_8");
    expect(after).toBe(before);
    expect(after!.state).toBe(state);
    // the DOM follows the child — poll URL + ids rebase in place (no remount).
    expect(pageRoot().dataset["draftId"]).toBe("d_8");
    expect(pageRoot().dataset["draftN"]).toBe("8");
    const banner = document.querySelector<HTMLElement>('[data-page-banner="version"]');
    expect(banner?.style.display).toBe("flex");
    expect(banner?.textContent).toContain("Editing v8 · findings from v7 follow your text");
    // the poll now targets the child's doc URL.
    fetches.length = 0;
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(fetches.map((f) => f.url)).toContain("/p/the-piece/edit/d_8/doc");
  });
});

// ---- ⌘S — one restore point per chord -----------------------------------------------------------

describe("SPA.24 — ⌘S mints exactly one restore point", () => {
  it("the keydown mints when no IDE chrome is mounted; a same-tick CustomEvent is a no-op", async () => {
    await mountEditor();
    const mint = sessions[0]!.session.markRestorePoint;
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", metaKey: true, cancelable: true }));
    });
    expect(mint).toHaveBeenCalledTimes(1);
    // the dedupe guard — a CustomEvent arriving in the same tick (both listeners delivered) is dropped.
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", metaKey: true, cancelable: true }));
      window.dispatchEvent(new CustomEvent("rhema:restore-point"));
    });
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("with [data-ide] mounted the chrome owns the chord — the CustomEvent mints once", async () => {
    const ide = document.createElement("div");
    ide.setAttribute("data-ide", "1");
    document.body.appendChild(ide);
    try {
      await mountEditor();
      const mint = sessions[0]!.session.markRestorePoint;
      const ev = new KeyboardEvent("keydown", { key: "s", metaKey: true, cancelable: true });
      await act(async () => {
        window.dispatchEvent(ev); // the mount yields — the chrome's dispatcher claims the chord
        ide.dispatchEvent(new CustomEvent("rhema:restore-point", { bubbles: true }));
      });
      expect(mint).toHaveBeenCalledTimes(1);
      expect(ev.defaultPrevented).toBe(false); // the mount never stole the chord from the chrome
    } finally {
      ide.remove();
    }
  });
});

// ---- flush + teardown ----------------------------------------------------------------------------

describe("SPA.24 — flush + teardown", () => {
  it("pagehide flushes provenance + the session's blur restore; a pending capture lands first", async () => {
    vi.useFakeTimers();
    try {
      const { view } = await mountEditor();
      const session = sessions[0]!.session;
      // a doc-changing transaction arms the provenance piggyback (the 600 ms cadence).
      await act(async () => {
        view.current!.dispatch(view.current!.state.tr.insertText("x", 1));
      });
      await act(async () => {
        window.dispatchEvent(new Event("pagehide"));
      });
      // the pending capture flushed on the hide — before the blur restore's ordering guarantee.
      expect(session.sendProvenance).toHaveBeenCalledTimes(1);
      expect(session.flushOnHide).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("visibilitychange:hidden flushes; :visible resumes the poll immediately", async () => {
    await mountEditor();
    const session = sessions[0]!.session;
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(session.flushOnHide).toHaveBeenCalledTimes(1);
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    fetches.length = 0;
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(fetches.map((f) => f.url)).toContain(`/p/the-piece/edit/${DRAFT}/doc`);
  });

  it("unmount releases the session (the route-leave pagehide-equivalent); destroy lands on TTL", async () => {
    const { root, registry } = await mountEditor();
    const session = sessions[0]!.session;
    const entry = registry.entry(DRAFT)!;
    await act(async () => root.unmount());
    expect(session.flushOnHide).toHaveBeenCalledTimes(1); // refs 0 → the blur restore
    expect(entry.refs).toBe(0);
    // and a re-mount within the TTL reuses the SAME session (no re-create).
    mounted.splice(mounted.indexOf(root), 1); // already unmounted
    await mountEditor({ registry });
    expect(sessions.length).toBe(1);
  });

  it("the collab-less mount still polls + mints no wire calls (the island's null-session legs)", async () => {
    await mountEditor({ collab: false });
    expect(sessions.length).toBe(0);
    fetches.length = 0;
    await act(async () => document.dispatchEvent(new Event("visibilitychange")));
    expect(fetches.map((f) => f.url)).toContain(`/p/the-piece/edit/${DRAFT}/doc`);
  });
});

// ---- the keep-alive undo stack (R6FIX.1 / F-R6POST.2-2; REQ-NAVC-22/23) -------------------------
//
// The stock `yUndoPlugin` view's `destroy()` kills the UndoManager on every `EditorView` teardown —
// on a keep-alive remount the registry session (Y.Doc + EditorState + session id) survives but the
// manager's capture is dead forever (pre-leave items pop once, nothing new is ever recorded — the
// live "⌘Z does nothing" symptom). The wire owns the manager; the view only detaches its listeners.

describe("R6FIX.1 — the undo stack survives the keep-alive remount (F-R6POST.2-2)", () => {
  it("mount → type → unmount → remount: ⌘Z still removes the marker AND new edits are captured", async () => {
    const registry = new PageSessionRegistry();
    registries.push(registry);
    const first = await mountEditor({ registry });
    const firstSessionId = first.pageRoot().dataset["pageSession"];
    const wire = first.registry.entry(DRAFT)!.session!;
    expect(isCollabWire(wire)).toBe(true);
    const um = isCollabWire(wire) ? wire.undoManager : null;
    expect(um).not.toBeNull();
    // the plugin state's manager IS the wire's (the session owns the lifecycle).
    expect(yUndoPluginKey.getState(first.view.current!.state)?.undoManager).toBe(um);

    // type the marker before leaving.
    await act(async () => {
      first.view.current!.dispatch(first.view.current!.state.tr.insertText("MARKER", 1));
    });
    expect(first.view.current!.state.doc.textContent).toContain("MARKER");
    expect(um!.undoStack.length).toBeGreaterThan(0);

    // the keep-alive unmount: the view dies, the session idles inside the TTL.
    await act(async () => first.root.unmount());
    mounted.splice(mounted.indexOf(first.root), 1); // already unmounted
    expect(um!.canUndo()).toBe(true); // the stack survived the view teardown

    // remount — same registry, same entry/session identity.
    const second = await mountEditor({ registry });
    expect(second.pageRoot().dataset["pageSession"]).toBe(firstSessionId);
    expect(undoCommand(second.view.current!.state)).toBe(true);

    // and a POST-remount edit is still captured — the F-R6POST.2-2 regression: a destroyed
    // manager's capture never resumes, so this edit would be un-undoable forever.
    await act(async () => {
      second.view.current!.dispatch(second.view.current!.state.tr.insertText("SECOND", 1));
    });
    expect(second.view.current!.state.doc.textContent).toContain("SECOND");

    // ⌘Z until the stack drains removes BOTH edits — capture post-remount + the pre-leave item.
    await act(async () => {
      while (yUndo(second.view.current!.state)) {
        /* drain */
      }
    });
    expect(second.view.current!.state.doc.textContent).not.toContain("SECOND");
    expect(second.view.current!.state.doc.textContent).not.toContain("MARKER");
    expect(um!.canUndo()).toBe(false);
  });

  it("a true teardown destroys the session-owned manager (no orphaned capture)", async () => {
    const { registry } = await mountEditor();
    const session = sessions[0]!.session;
    const wire = registry.entry(DRAFT)!.session!;
    expect(isCollabWire(wire)).toBe(true);
    const um = isCollabWire(wire) ? wire.undoManager : null;
    const umDestroy = vi.spyOn(um!, "destroy");
    registry.destroyAll();
    expect(umDestroy).toHaveBeenCalledTimes(1);
    expect(session.destroy).toHaveBeenCalledTimes(1);
    expect(registry.entry(DRAFT)).toBeNull();
  });
});
