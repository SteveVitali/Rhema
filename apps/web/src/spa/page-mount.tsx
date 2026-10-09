// SPA.23 — `PageMount`: the hand-rolled `useRef`+`useEffect` ProseMirror binding (design/23 §3;
// REQ-ED-1/2/6/14). The `EditorView` is created exactly once per mount inside an effect over the
// `[data-page-host]` div, lives in effect/ref scope (never `useState`, never an effect
// dependency), and is destroyed on cleanup — React never re-renders the PM-managed subtree. The
// `EditorState` comes from `PageSessionRegistry`, so an unmount/remount keeps doc + undo + plugin
// state; the collab session lands in the same entry with SPA.24 (this ticket's wire is absent —
// `session` is null and every seam degrades exactly like today's collab-less island).
//
// Mount-era contract ported from `client/page.ts` verbatim:
//   • `preview?.remove()` — the SSR `<PmPreview>` paints first (no-JS floor + SPA pending paint),
//     then yields to the live PM surface (`data-page-preview` unmounts; `data-page-view="1"` +
//     `.rm-page` stamp on `view.dom`).
//   • `installOriginDispatch` — the NON-re-entrant transaction hook (applies the tr via
//     `updateState`, never `view.dispatch` inside `dispatchTransaction`; the EDIT.1/N8 fix kept).
//   • provenance initialization (`initSources` seeds the plugin's block-source map), the
//     ORIGIN_META human/pasted stamping, the 600 ms piggyback (gated on `entry.session`), the
//     findings-span + Authorship-overlay decorations (`rhema:authorship` broadcast honored),
//     the per-keystroke `[data-status-words]`/`[data-status-readmin]` meter rewrites, and the
//     deep-link `data-finding-id` focus scroll.
//   • `editable: () => !locked && !readonly` with `readonly = hostReadOnly && !collabUrl` — the
//     island's formula verbatim, so the server-decided posture is honored bit-for-bit.
//
// Out of scope (SPA.24): `createCollabSession`, the sync-pill states, the 10 s lock poll, ⌘S
// restore points, the fork rebase → `registry.rekey`, pagehide/visibility flushes, the rail's
// lost-badge resync.

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { EditorView } from "prosemirror-view";
import {
  createPageState,
  setDecorationInputs,
  provenanceKey,
  provenanceForSave,
  authorshipClasses,
  statusMeters,
  ORIGIN_META,
  type BlockSource,
  type FindingForDecoration,
} from "@rhema/editor";
import { PmPreview, type PmPreviewContext } from "@rhema/ui";
import { pageSessionRegistry, type PageSessionRegistry } from "./page-sessions.js";

const PROV_FLUSH_MS = 600; // the provenance capture's piggyback cadence (island verbatim)

/** A provenance row from `provenance_maps` → the plugin's BlockSource (island verbatim). */
function toBlockSource(v: unknown): BlockSource {
  const kind = (v as { kind?: string } | null)?.kind;
  switch (kind) {
    case "agent":
    case "chat":
    case "suggestion_applied":
    case "mixed":
    case "human_mobile":
    case "pasted":
      return v as BlockSource;
    default:
      return { kind: "human" };
  }
}

export function initSourcesFor(provenance: Readonly<Record<string, unknown>> | null | undefined) {
  const initSources = new Map<string, BlockSource>();
  for (const [blockId, src] of Object.entries(provenance ?? {})) initSources.set(blockId, toBlockSource(src));
  return initSources;
}

/**
 * Provenance origins (REQ-POS-8; EDIT.1's non-re-entrant fix, island verbatim): stamp every
 * doc-changing transaction that carries no explicit ORIGIN_META with "pasted" (armed by the
 * one-shot paste flag) or "human" — and apply it through `updateState`, NOT `view.dispatch`
 * (a dispatch inside `dispatchTransaction` routes back through the hook and blew the stack on
 * the first keystroke — the N8 prod walk). Exported for the dom test's re-entrancy leg.
 */
export function installOriginDispatch(
  view: EditorView,
  opts: { readonly armed: () => boolean; readonly onDocChanged: () => void },
): void {
  view.setProps({
    dispatchTransaction(tr) {
      if (tr.docChanged && tr.getMeta(ORIGIN_META) == null) {
        tr.setMeta(ORIGIN_META, opts.armed() ? "pasted" : "human");
      }
      view.updateState(view.state.apply(tr));
      if (tr.docChanged) opts.onDocChanged();
    },
  });
}

export interface PageMountProps {
  /** the registry key's id half (`draft:<draftId>`); a rebind changes it → acquire/release pair. */
  readonly draftId: string;
  /** the PM doc JSON — `markdownToDoc(markdown).toJSON()` derived leaf-side (REQ-ED-14). */
  readonly docJson: unknown;
  /** the displayed version's stored block-source map — seeds the provenance plugin on INIT only. */
  readonly provenance?: Readonly<Record<string, unknown>> | null;
  /** the projected findings (anchor blobs verbatim) — the span-decoration inputs. */
  readonly findings?: readonly FindingForDecoration[];
  /** `data-locked` posture — a held run lock mounts non-editable. */
  readonly locked?: boolean;
  /** the host-level readonly posture (`props.readOnly === true || locked` on the SSR chrome). */
  readonly readOnly?: boolean;
  /** `data-collab-url` verbatim — server-authorized only; the wire itself lands in SPA.24. */
  readonly collabUrl?: string;
  /** `/f/:findingId` deep link — scrolls the rail card into view on mount. */
  readonly focusFindingId?: string;
  /** the PmPreview figure affordances (the Edit-figure href builder + label). */
  readonly previewCtx?: PmPreviewContext;
  /** injectable for tests; defaults to the boot-session singleton. */
  readonly registry?: PageSessionRegistry;
  /** the live view — proposal accepts dispatch through it (leaf-owned). */
  readonly viewRef?: MutableRefObject<EditorView | null>;
  /** post-mount callback (tests + the leaf's first-meter paint). */
  readonly onMounted?: (view: EditorView) => void;
}

export function PageMount(props: PageMountProps): ReactNode {
  const registry = props.registry ?? pageSessionRegistry;
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const entryRef = useRef<ReturnType<PageSessionRegistry["entry"]>>(null);
  const findingsRef = useRef(props.findings ?? []);
  const [mounted, setMounted] = useState(false);

  const locked = props.locked === true;
  const hostReadOnly = props.readOnly === true || locked;
  const collabUrl = props.collabUrl ?? "";
  // the island's editable formula verbatim: `readonly = data.readonly==="1" && !collabUrl`.
  const editableRef = useRef(true);
  editableRef.current = !locked && !(hostReadOnly && collabUrl === "");

  findingsRef.current = props.findings ?? [];

  // latest-prop refs for the acquire init — it runs ONCE per entry, so deps stay on identity.
  const initRef = useRef<{ docJson: unknown; provenance: Readonly<Record<string, unknown>> | null | undefined }>({
    docJson: props.docJson,
    provenance: props.provenance,
  });
  initRef.current = { docJson: props.docJson, provenance: props.provenance };

  const viewSink = props.viewRef;

  const applyDecorations = (view: EditorView): void => {
    const prov = provenanceKey.getState(view.state);
    const on = document.querySelector<HTMLElement>("[data-ide]")?.dataset["authorship"] === "1";
    setDecorationInputs(view, {
      findings: findingsRef.current,
      authorship: on && prov ? authorshipClasses(prov) : null,
    });
  };

  // ---- the session hold (acquire/release; the registry owns the EditorState) ----------------
  useEffect(() => {
    const entry = registry.acquire(props.draftId, () => ({
      state: createPageState(initRef.current.docJson, initSourcesFor(initRef.current.provenance)),
      // SPA.24: `session: createCollabSession(...)` lands here — the entry already carries it
      // across remounts untouched.
      session: null,
    }));
    entryRef.current = entry;
    return () => {
      entryRef.current = null;
      registry.release(props.draftId);
    };
  }, [registry, props.draftId]);

  // ---- the view mount (exactly once per entry per mount; cleanup destroys it) ---------------
  useEffect(() => {
    const host = hostRef.current;
    const entry = entryRef.current;
    if (!host || !entry) return;

    const view = new EditorView(host, {
      state: entry.state,
      editable: () => editableRef.current,
    });
    view.dom.classList.add("rm-page");
    view.dom.setAttribute("data-page-view", "1");
    viewRef.current = view;
    if (viewSink) viewSink.current = view;

    // a paste arms a one-shot flag so the paste transaction stamps `pasted` (island verbatim).
    let pasteArmed = false;
    const onPaste = () => {
      pasteArmed = true;
      setTimeout(() => (pasteArmed = false), 0);
    };
    view.dom.addEventListener("paste", onPaste);

    // the per-keystroke meters — the IDE status bar's `[data-status-*]` slots (island verbatim;
    // imperative writes into DOM slots are the same contract the island honored).
    const updateMeters = () => {
      const m = statusMeters(view.state.doc);
      const wordsEl = document.querySelector<HTMLElement>("[data-status-words]");
      const readMinEl = document.querySelector<HTMLElement>("[data-status-readmin]");
      if (wordsEl) wordsEl.textContent = (wordsEl.dataset["fmt"] ?? "{n}").replace("{n}", String(m.words));
      if (readMinEl) readMinEl.textContent = (readMinEl.dataset["fmt"] ?? "{n}").replace("{n}", String(m.readMin));
    };

    // the live provenance capture piggybacks the stateless channel (SPA.24's session — the
    // guard makes the collab-less mount a no-op exactly like today's non-wired island).
    let provTimer: number | null = null;
    const flushProvenance = () => {
      provTimer = null;
      const agentSpans = provenanceKey.getState(view.state)?.agentSpans ?? [];
      entry.session?.sendProvenance?.({
        spans: provenanceForSave(view.state),
        agentSpans: agentSpans.map((s) => ({ blockId: "", from: s.from, to: s.to })),
      });
    };

    installOriginDispatch(view, {
      armed: () => pasteArmed,
      onDocChanged: () => {
        updateMeters();
        if (provTimer == null && entry.session?.sendProvenance != null) {
          provTimer = window.setTimeout(flushProvenance, PROV_FLUSH_MS);
        }
      },
    });

    // decorations + the authorship overlay — refreshed on mount and on the chrome's broadcast.
    const onAuthorship = () => applyDecorations(view);
    window.addEventListener("rhema:authorship", onAuthorship);
    applyDecorations(view);
    updateMeters();

    // the deep-linked finding scrolls to its rail card (the island's focus leg — scoped to this
    // page root so a sibling mount never steals it).
    const focusId = props.focusFindingId;
    if (focusId) {
      host
        .closest("[data-page-root]")
        ?.querySelector<HTMLElement>(`[data-finding-id="${focusId}"]`)
        ?.scrollIntoView({ block: "center" });
    }

    setMounted(true); // `data-page-preview` yields — the declarative `preview?.remove()` twin.
    props.onMounted?.(view);

    return () => {
      window.removeEventListener("rhema:authorship", onAuthorship);
      view.dom.removeEventListener("paste", onPaste);
      if (provTimer != null) {
        window.clearTimeout(provTimer);
        provTimer = null;
      }
      if (viewSink) viewSink.current = null;
      viewRef.current = null;
      setMounted(false);
      view.destroy(); // the PM subtree leaves with the view — React never touched it.
    };
    // Mount-only contract (REQ-ED-1): the view binds once per entry per mount; prop deltas
    // route through refs or the findings effect below, never a view rebuild.
  }, [registry, props.draftId]);

  // ---- the findings inputs refresh (lost badges / new rows re-resolve spans on the live view) --
  useEffect(() => {
    findingsRef.current = props.findings ?? [];
    const view = viewRef.current;
    if (view) applyDecorations(view);
    // `applyDecorations` reads the latest refs — no dep churn needed beyond `props.findings`.
  }, [props.findings]);

  const hostReadOnlyAttr = hostReadOnly ? "1" : "0";
  return (
    <div data-page-host className="rm-page-host" data-readonly={hostReadOnlyAttr} ref={hostRef}>
      {mounted ? null : (
        <div data-page-preview className="rm-page-preview">
          <PmPreview docJson={props.docJson} {...(props.previewCtx ? { ctx: props.previewCtx } : {})} />
        </div>
      )}
    </div>
  );
}
