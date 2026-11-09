// page-source-mode.ts — the CodeMirror half of the revived source view (REQ-ED-17; design/30).
// Loaded ONLY via dynamic import from page-mount.tsx so the whole CM package set ships as its own
// async chunk (the §9/R25 `codemirror` budget group covers it — REQ-SAFE-7). The component is a
// *projection*: it holds a text buffer derived from the live PM doc via `docToMarkdown`, and every
// commit is a block-diffed PM transaction dispatched through the SAME mounted `EditorView` — so
// ySync/yUndo/provenance observe source edits verbatim, and remote trs keep flowing through the
// hidden PM view underneath. No transport, no second document story: that was the retired
// editor.js island's defect, and it is deliberately not recreated.

import { Compartment, EditorState as CmState, Transaction as CmTransaction } from "@codemirror/state";
import {
  EditorView as CmView,
  drawSelection,
  highlightActiveLine,
  keymap,
} from "@codemirror/view";
import { defaultKeymap, history as cmHistory, historyKeymap, indentWithTab } from "@codemirror/commands";
import type { Node as PMNode } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { applySourceMarkdown, docToMarkdown, markdownToDoc, SOURCE_EDIT_META } from "@rhema/editor";

/** REQ-WRITE-5 — the prose face for the source buffer: the paper's own serif family + size +
 *  measure tokens, so a source edit reads like the same sheet it typesets (never monospace
 *  prose, and the gutter is gone). */
const SOURCE_PROSE_THEME = CmView.theme({
  "&": {
    fontFamily: "var(--paper-serif, var(--font-serif, Literata, Georgia, serif))",
    fontSize: "var(--paper-size, 17px)",
    lineHeight: "var(--paper-leading, 1.55)",
  },
  ".cm-content": {
    fontFamily: "inherit",
    caretColor: "var(--paper-fg)",
  },
  ".cm-line": { padding: "0 2px" },
});

export interface SourceModeOptions {
  /** Element the CM editor mounts into (`[data-source-host]`). */
  readonly parent: HTMLElement;
  /** The live, still-mounted PM view — commits dispatch through it. */
  readonly pm: EditorView;
  /** Current editability (lock + host read-only posture) — re-read on every tr + commit. */
  readonly editable: () => boolean;
  readonly ariaLabel: string;
  /** Flip the stale note on/off — set when a foreign doc change lands while the buffer is dirty. */
  readonly onStale: (stale: boolean) => void;
  /** Commit debounce; tests shrink it. Default 500 ms. */
  readonly debounceMs?: number;
}

export interface SourceModeHandle {
  /** The CodeMirror view — exposed for tests/inspection; callers should not mutate it. */
  readonly cm: CmView;
  /** True when the buffer holds text not yet committed to the PM doc. */
  isDirty(): boolean;
  /** Commit any pending text immediately (toggle-off, pagehide, route-leave, ⌘S mint). */
  commitNow(): void;
  /** Feed from the mount's transaction tap — handles remote pulls, stale marking, editable sync. */
  onTransaction(tr: Transaction): void;
  /** Commit, then tear down. Idempotent. */
  destroy(): void;
}

export function mountSourceMode(opts: SourceModeOptions): SourceModeHandle {
  const debounceMs = opts.debounceMs ?? 500;
  const editableComp = new Compartment();
  let dirty = false;
  let pasteArmed = false;
  let applying = false;
  let stale = false;
  let destroyed = false;
  let timer: number | undefined;
  let lastEditable = opts.editable();
  // The 3-way merge's base (design/30): the parsed form of the buffer text as last committed or
  // seeded — NOT `pm.state.doc` (foreign writes live in the live doc, not in `base`).
  const seedText = docToMarkdown(opts.pm.state.doc);
  let baseDoc: PMNode = markdownToDoc(seedText);

  const editableExts = () => [CmView.editable.of(lastEditable), CmState.readOnly.of(!lastEditable)];
  const setStale = (v: boolean) => {
    if (v === stale) return;
    stale = v;
    opts.onStale(v);
  };
  const clearTimer = () => {
    if (timer !== undefined) {
      window.clearTimeout(timer);
      timer = undefined;
    }
  };
  const schedule = () => {
    clearTimer();
    timer = window.setTimeout(() => commitNow(), debounceMs);
  };

  const cm = new CmView({
    parent: opts.parent,
    state: CmState.create({
      doc: seedText,
      extensions: [
        // REQ-WRITE-5 (239; I8) — Source reads like PROSE: soft wrap at the pane measure and the
        // serif reading face, never monospace prose. The line-number gutter is REMOVED — a
        // decision this ticket records: prose does not number lines, and the gutter stole ~32 px
        // of the 360 px pane the wrap was added to protect.
        CmView.lineWrapping,
        SOURCE_PROSE_THEME,
        highlightActiveLine(),
        drawSelection(),
        cmHistory(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        // NOTE (REQ-SAFE-7 budget): no lang-markdown grammar/syntaxHighlighting — the lezer grammar
        // pushes the codemirror group past its 130 kB gzip ceiling. Plain-text CM editing only;
        // the rich view remains the rendered surface. design/30 records the trade.
        editableComp.of(editableExts()),
        CmView.contentAttributes.of({ "aria-label": opts.ariaLabel }),
        CmView.updateListener.of((u) => {
          if (applying || !u.docChanged) return;
          dirty = true;
          if (u.transactions.some((t) => t.isUserEvent("input.paste"))) pasteArmed = true;
          schedule();
        }),
      ],
    }),
  });

  const commitNow = () => {
    clearTimer();
    if (destroyed || !dirty) return;
    const text = cm.state.doc.toString();
    if (!opts.editable()) return; // locked mid-edit — keep the buffer dirty for a later flush
    const origin = pasteArmed ? "pasted" : "human";
    pasteArmed = false;
    const next = markdownToDoc(text);
    const tr = applySourceMarkdown(opts.pm.state, next, baseDoc, origin);
    dirty = false;
    setStale(false);
    if (tr) {
      opts.pm.dispatch(tr);
      baseDoc = next; // the merge's base follows the last committed buffer, not the live doc
    }
  };

  const handle: SourceModeHandle = {
    cm,
    isDirty: () => dirty,
    commitNow,
    onTransaction(tr: Transaction) {
      // Editable posture: applyLock/onReadOnly flip `editableRef` then re-dispatch an empty tr —
      // this tap is the only signal the bridge needs.
      const e = opts.editable();
      if (e !== lastEditable) {
        lastEditable = e;
        cm.dispatch({ effects: editableComp.reconfigure(editableExts()) });
      }
      if (!tr.docChanged || tr.getMeta(SOURCE_EDIT_META) === true) return;
      if (dirty) {
        // Foreign doc change (remote peer, agent proposal, restore) while the user has uncommitted
        // text — the commit's three-way merge keeps non-overlapping foreign writes (design/30), so
        // we keep the buffer and surface the stale note instead of clobbering.
        setStale(true);
        return;
      }
      // Clean buffer → re-seed to the latest canonical markdown AND rebase the merge base. The pull
      // is annotated out of CM's own history so in-mode ⌘Z never undoes a remote write.
      const md = docToMarkdown(opts.pm.state.doc);
      baseDoc = opts.pm.state.doc;
      if (cm.state.doc.toString() === md) return;
      applying = true;
      try {
        cm.dispatch({
          changes: { from: 0, to: cm.state.doc.length, insert: md },
          selection: { anchor: 0 },
          annotations: CmTransaction.addToHistory.of(false),
        });
      } finally {
        applying = false;
      }
    },
    destroy() {
      if (destroyed) return;
      commitNow();
      destroyed = true;
      cm.destroy();
    },
  };
  return handle;
}
