// SPA.23 — `PageMount`: the hand-rolled `useRef`+`useEffect` ProseMirror binding (design/23 §3;
// REQ-ED-1/2/6/14). The `EditorView` is created exactly once per mount inside an effect over the
// `[data-page-host]` div, lives in effect/ref scope (never `useState`, never an effect
// dependency), and is destroyed on cleanup — React never re-renders the PM-managed subtree. The
// `EditorState` comes from `PageSessionRegistry`, so an unmount/remount keeps doc + undo + plugin
// state.
//
// SPA.24 — the collab half (REQ-ED-3/5/7/8/9/10/11, REQ-ISL-1..8): when the leaf's
// server-authorized `collabWsUrl` is present, `acquire`'s init builds the registry-held
// `CollabPageWire` (client/collab.ts verbatim — `draft:<id>` doc name, `rhema-page/draft:<id>`
// IDB, cookie-auth WSS, the `rhema.*` stateless vocabulary) and binds `createCollabPageState` to
// the session's `Y.XmlFragment` — the four-layer autosave (bound Y.Doc → IndexedDB → collab WS →
// the server's debounced materialization). The mount then owns the island's chrome legs, ported
// verbatim from `client/page.ts` and scoped to the mount's own `[data-page-root]`:
//
//   • `setPill` (+ `lockedOverride` precedence), `setLockBanner`, `showForkBanner` — imperative
//     writes into the verbatim `data-sync-pill`/`data-page-banner` DOM the PageEditor emits.
//   • `rebase` — the frozen-head fork/poll path: `registry.rekey` (the wire's `rebind` keeps the
//     SAME Y.Doc) + `data-doc-url`/`data-draft-id`/`data-draft-n` updates, in place.
//   • `applyLock` + the 10 s visible-only `/doc` poll (rebase, banner, editable flip, rail lost
//     resync, `data-status-venue`) — the view is NEVER rebuilt.
//   • `syncRail` — `data-lost`/`data-lost-note` resync + decoration-input `lost` flags.
//   • ⌘S → exactly ONE `markRestorePoint` (REQ-ED-7): the unconditional window keydown mints in
//     `input` focus or when no `[data-ide]` chrome is mounted; everywhere else the chrome's
//     `restore-point` IdeAction emits `rhema:restore-point`, which resolves to the SAME mint —
//     the same-tick guard makes double-delivery a no-op regardless of listener order.
//   • `pagehide`/`visibilitychange:hidden` → the pending provenance flush + `session.flushOnHide()`
//     (`rhema.restore{cause:"blur"}` + the provider's own flush); route-leave = refcount 0 runs
//     the same pair through the registry release. No `beforeunload`, no Save button, no markdown
//     POST — ever.

import { useEffect, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { EditorView } from "prosemirror-view";
import type { Transaction } from "prosemirror-state";
import {
  createCollabPageState,
  createPageState,
  formatCommand,
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
import {
  createCollabWire,
  isCollabWire,
} from "./page-collab.js";
import { pageSessionRegistry, type PageSessionRegistry } from "./page-sessions.js";
import type { SourceModeHandle } from "./page-source-mode.js";
import { isDemo } from "./demo.js";
import { COPY } from "../copy.js";

const PROV_FLUSH_MS = 600; // the provenance capture's piggyback cadence (island verbatim)
const LOCK_POLL_MS = 10_000; // the §6.3 lock poll cadence (island verbatim)
const RESTORE_DEDUPE_MS = 250; // the same-⌘S guard: keydown + the chrome's CustomEvent can both deliver

/** The §6.3 poll payload (the island's `PageDocResponse` verbatim — the live `/doc` DTO subset). */
interface PageDocResponse {
  draftId?: string;
  draftN?: number;
  state?: string;
  lock?: { runId: string; kind: "writer" | "reader"; workflow: string } | null;
  findings?: { findingId: string; severity: string; anchor: unknown; lost: boolean }[];
  provenance?: Record<string, unknown> | null;
  venueCap?: string | null;
}

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
  opts: {
    readonly armed: () => boolean;
    readonly onDocChanged: (tr: Transaction) => void;
    /** every transaction — local AND remote (ySync routes through `view.dispatch`). SPA.25's
     *  source bridge rides this tap (design/30): remote pulls, stale marking, editable sync. */
    readonly onTransaction?: (tr: Transaction) => void;
  },
): void {
  view.setProps({
    dispatchTransaction(tr) {
      if (tr.docChanged && tr.getMeta(ORIGIN_META) == null) {
        tr.setMeta(ORIGIN_META, opts.armed() ? "pasted" : "human");
      }
      view.updateState(view.state.apply(tr));
      if (tr.docChanged) opts.onDocChanged(tr);
      opts.onTransaction?.(tr);
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
  /** `data-collab-url` verbatim — server-authorized only; present ⇒ the collab wire binds. */
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
  const pmHostRef = useRef<HTMLDivElement | null>(null);
  const sourceHostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const entryRef = useRef<ReturnType<PageSessionRegistry["entry"]>>(null);
  const findingsRef = useRef<readonly FindingForDecoration[]>(props.findings ?? []);
  const [mounted, setMounted] = useState(false);
  // SPA.25 — the source view (REQ-ED-17; design/30): the CodeMirror half lazily mounts inside
  // `[data-source-host]` while the PM view stays mounted+bound under `[data-pm-host]` (hidden).
  // `sourceStale` drives `data-source-note` when a foreign doc change lands mid-edit.
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceStale, setSourceStale] = useState(false);
  const sourceRef = useRef<SourceModeHandle | null>(null);

  const locked = props.locked === true;
  const hostReadOnly = props.readOnly === true || locked;
  const collabUrl = props.collabUrl ?? "";
  // The island's mutable `locked` — the §6.3 poll + the wire's read-only attach re-write it while
  // the mount lives (page.ts's `locked` local verbatim — the poll is the live authority; a prop
  // never re-asserts over it). `editable` re-reads it per transaction.
  const lockedRef = useRef(locked);
  // the island's editable formula verbatim: `readonly = data.readonly==="1" && !collabUrl`.
  const editableRef = useRef(true);
  editableRef.current = !lockedRef.current && !(hostReadOnly && collabUrl === "");
  /** the pending provenance piggyback — populated by the view effect so the release cleanup can
   *  land the flush BEFORE the registry's `rhema.restore{cause:"blur"}` (REQ-ED-5 ordering). */
  const provFlushRef = useRef<(() => void) | null>(null);

  findingsRef.current = props.findings ?? [];

  // latest-prop refs for the acquire init — it runs ONCE per entry, so deps stay on identity.
  const initRef = useRef<{
    docJson: unknown;
    provenance: Readonly<Record<string, unknown>> | null | undefined;
    collabUrl: string;
  }>({
    docJson: props.docJson,
    provenance: props.provenance,
    collabUrl: props.collabUrl ?? "",
  });
  initRef.current = { docJson: props.docJson, provenance: props.provenance, collabUrl: props.collabUrl ?? "" };

  const viewSink = props.viewRef;

  const applyDecorations = (view: EditorView): void => {
    const prov = provenanceKey.getState(view.state);
    const on = document.querySelector<HTMLElement>("[data-ide]")?.dataset["authorship"] === "1";
    setDecorationInputs(view, {
      findings: findingsRef.current,
      authorship: on && prov ? authorshipClasses(prov) : null,
    });
  };

  // ---- the session hold (acquire/release; the registry owns the EditorState + the wire) -------
  useEffect(() => {
    const entry = registry.acquire(props.draftId, () => {
      const wsUrl = initRef.current.collabUrl;
      if (wsUrl !== "") {
        // SPA.24 — the four-layer autosave: `createCollabSession` (Y.Doc → y-indexeddb → the
        // cookie-auth WS → server materialization) + `createCollabPageState` binds the view to
        // the shared `Y.XmlFragment` (ySyncPlugin + the keep-alive undo plugin — a peer's edits
        // never enter the local undo stack, REQ-ED-10). The session outlives the mount inside the
        // registry entry — and R6FIX.1 hands it the session-owned UndoManager so ⌘Z survives the
        // same keep-alive cycle the session does (REQ-NAVC-22/23, F-R6POST.2-2).
        const wire = createCollabWire({ wsUrl, draftId: props.draftId });
        return {
          state: createCollabPageState(
            wire.fragment,
            initSourcesFor(initRef.current.provenance),
            wire.undoManager,
          ),
          session: wire,
        };
      }
      return {
        state: createPageState(initRef.current.docJson, initSourcesFor(initRef.current.provenance)),
        session: null,
      };
    });
    entryRef.current = entry;
    return () => {
      const held = entryRef.current;
      entryRef.current = null;
      // REQ-ED-5 — route-leave IS the pagehide-equivalent: the pending provenance piggyback lands
      // BEFORE the release's `flushOnHide` (the `blur` restore trigger + the provider's flush).
      // SPA.25 — and the pending source buffer commits BEFORE both (the cleanup order releases the
      // session before the view dies, so the source flush rides the live wire's last send).
      sourceRef.current?.commitNow();
      provFlushRef.current?.();
      // release by the entry's CURRENT draftId — a frozen-fork rekey moves it mid-mount, and the
      // child id is the live key (releasing the stale parent id would strand the refcount). The
      // held entry itself is the identity check (REQ-NAVC-17): if the map slot it names now
      // holds a different entry the release is a no-op rather than the new occupant's decrement.
      registry.release(held?.draftId ?? props.draftId, held ?? undefined);
    };
  }, [registry, props.draftId]);

  // ---- the view mount (exactly once per entry per mount; cleanup destroys it) ---------------
  useEffect(() => {
    const host = hostRef.current;
    const pmHost = pmHostRef.current;
    const entry = entryRef.current;
    if (!host || !pmHost || !entry) return;

    const view = new EditorView(pmHost, {
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

    // the live provenance capture piggybacks the stateless channel (the collab wire's 600 ms
    // cadence; a collab-less mount is a no-op exactly like the island's non-wired arm).
    let provTimer: number | null = null;
    const flushProvenance = () => {
      provTimer = null;
      const agentSpans = provenanceKey.getState(view.state)?.agentSpans ?? [];
      entry.session?.sendProvenance?.({
        spans: provenanceForSave(view.state),
        agentSpans: agentSpans.map((s) => ({ blockId: "", from: s.from, to: s.to })),
      });
    };
    provFlushRef.current = () => {
      if (provTimer != null) flushProvenance();
    };

    installOriginDispatch(view, {
      armed: () => pasteArmed,
      onDocChanged: () => {
        updateMeters();
        if (provTimer == null && entry.session?.sendProvenance != null) {
          provTimer = window.setTimeout(flushProvenance, PROV_FLUSH_MS);
        }
      },
      // SPA.25 — the source bridge's transaction tap: every tr (local commits, remote ySync applies,
      // the applyLock/onReadOnly empty re-dispatch) reaches the CodeMirror handle.
      onTransaction: (tr) => sourceRef.current?.onTransaction(tr),
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

    // ======================================================================================
    // SPA.24 — the collab half (client/page.ts verbatim, scoped to this mount's page root).
    // ======================================================================================
    const root = host.closest<HTMLElement>("[data-page-root]");
    // NAVC.3 / REQ-NAVT-5 — stamp the registry entry's `<bootNonce>.<seq>` identity on the page
    // root. It tracks the ENTRY (not the React mount): a StrictMode remount or a keep-alive
    // remount rewrites the same value verbatim; only a destroy+recreate or a new document boot
    // mints a different token.
    root?.setAttribute("data-page-session", entry.sessionId);
    const wire = isCollabWire(entry.session) ? entry.session : null;
    let chromeCleanup: (() => void) | null = null;

    // The island installs this whole block regardless of the session (client/page.ts verbatim):
    // a collab-less mount (artifact read, a deploy without COLLAB_WS_URL) still polls `/doc`,
    // flips the banner/lock, resyncs the rail, and honours ⌘S as a no-op mint. Every session
    // call below is `wire?.`-seamed.
    if (root) {
      // R7WRITE.1a (REQ-WRITE-6) — the pill + banners moved OUT of [data-page-root] into the
      // `.ide-page` header strip: scope the writes to the page region; when the host isn't under
      // the IDE page pane (the demo mount) fall back to the document — the pill is unique.
      const pageScope: ParentNode = host.closest("[data-pane='page']") ?? host.ownerDocument ?? document;
      // R7WRITE.1a — the strip mounts via the leaf's chrome publish, which can land AFTER this
      // effect runs (a publish→re-render beat). The element refs therefore resolve LAZILY at
      // write time — a late-mounted strip still receives the pill/banner writes verbatim.
      const find = (sel: string): HTMLElement | null => pageScope.querySelector(sel) as HTMLElement | null;
      const pill = () => find("[data-sync-pill]");
      const lockBanner = () => find('[data-page-banner="lock"]');
      const lockBannerText = () => {
        const b = lockBanner();
        return b?.querySelector("[data-page-banner-text]") as HTMLElement | null ?? null;
      };
      const versionBanner = () => find('[data-page-banner="version"]');
      const versionBannerText = () => {
        const b = versionBanner();
        return b?.querySelector("span") as HTMLElement | null ?? null;
      };

      // the island's mount-time locals verbatim — the poll's draft target (`docUrl` follows the
      // fork rebase), the displayed `draftN`, and `lockedOverride` (the poll's §6.3 read — beats
      // the session's optimistic pill).
      let lockedOverride = lockedRef.current;
      let draftId = entry.draftId;
      let draftN = Number(root.dataset["draftN"] ?? 0);
      let docUrl = root.dataset["docUrl"] ?? "";

      const setPill = (ev: { readonly state: "synced" | "syncing" | "offline" | "readonly"; readonly queued: number }): void => {
        const el = pill();
        if (!el) return;
        const state = lockedOverride ? "readonly" : ev.state;
        const label =
          state === "synced"
            ? el.dataset["labelSynced"]
            : state === "syncing"
              ? el.dataset["labelSyncing"]
              : state === "readonly"
                ? el.dataset["labelReadonly"] ?? el.dataset["labelLocked"]
                : (el.dataset["labelOffline"] ?? el.dataset["labelQueued"] ?? "").replace(
                    "{n}",
                    String(ev.queued),
                  );
        el.textContent = label || state;
        el.dataset.syncState = state;
      };

      const setLockBanner = (lock: { kind: "writer" | "reader"; workflow: string } | null): void => {
        const banner = lockBanner();
        if (!banner) return;
        banner.style.display = lock == null ? "none" : "flex";
        const template =
          lock == null ? "" : (banner.dataset[lock.kind === "writer" ? "writerText" : "readerText"] ?? "");
        const text = lockBannerText();
        if (text) text.textContent = template.replace("{workflow}", lock?.workflow ?? "");
      };

      /** §5.4's post-fork banner — "Editing vN · findings from vM follow your text". */
      const showForkBanner = (nextN: number, baseN: number): void => {
        const banner = versionBanner();
        const text = versionBannerText();
        if (!banner || !text) return;
        const fmt = root.dataset["forkFmt"] ?? "Editing v{n} · findings from v{base} follow your text";
        text.textContent = fmt.replace("{n}", String(nextN)).replace("{base}", String(baseN));
        banner.style.display = "flex";
      };

      /** The head-switch every fork/poll path shares: `registry.rekey` runs the wire's `rebind`
       *  FIRST (a throw leaves the map + the local reads untouched), then the DOM/dataset reads
       *  follow the child — the SAME Y.Doc + EditorState, never a rebuilt view. */
      const rebase = (newDraftId: string | undefined) => {
        if (!newDraftId || newDraftId === draftId) return;
        const prev = draftId;
        if (!registry.rekey(prev, newDraftId)) return;
        draftId = newDraftId;
        docUrl = docUrl.replace(`/${prev}/`, `/${newDraftId}/`);
        root.dataset["draftId"] = newDraftId;
      };

      const applyLock = (isLocked: boolean) => {
        lockedRef.current = isLocked;
        editableRef.current = !isLocked && !(hostReadOnly && collabUrl === "");
        lockedOverride = isLocked;
        root.dataset["locked"] = isLocked ? "1" : "0";
        view.dispatch(view.state.tr); // re-reads `editable` + remaps decorations
        if (wire) setPill(wire.sync);
      };

      const syncRail = (fs: { findingId: string; lost: boolean }[] | undefined) => {
        if (!fs) return;
        // SPA.24 — the rail rows are queried INSIDE `[data-findings-rail]`: the decoration layer
        // stamps `data-finding-id` on the resolved span's PM node too, and the host sits before
        // the rail in document order, so an unscoped query would write the lost markers onto the
        // decorated block instead (the island's document-wide query had that same latent skew —
        // the rail row is the intended target; the span's own lost flag lands via the decoration
        // inputs below).
        const rail = root.querySelector<HTMLElement>("[data-findings-rail]");
        const lostText = rail?.dataset["lostNoteText"] ?? "";
        for (const f of fs) {
          const row = rail?.querySelector<HTMLElement>(`[data-finding-id="${f.findingId}"]`);
          if (!row) continue;
          if (f.lost) row.setAttribute("data-lost", "true");
          else row.removeAttribute("data-lost");
          let note = row.querySelector<HTMLElement>("[data-lost-note]");
          if (f.lost && !note) {
            note = document.createElement("div");
            note.setAttribute("data-lost-note", "true");
            note.style.fontSize = "12px";
            note.style.marginTop = "4px";
            note.style.color = "var(--sev-major)";
            note.textContent = lostText;
            row.appendChild(note);
          } else if (!f.lost && note) {
            note.remove();
          }
        }
        // keep the decoration inputs' lost flags in step (the island's findings-array mutation).
        for (const f of fs) {
          const d = findingsRef.current.find((x) => x.findingId === f.findingId);
          if (d) (d as { lost: boolean }).lost = f.lost;
        }
        applyDecorations(view);
      };

      // §6.3 lock poll — a run grabbing/releasing the draft while the page sits open. Visible-only,
      // same-origin, unchanged route (REQ-ED-11): the poll's answer can rebase the draft (a frozen
      // head's working child), flip the lock, resync the rail, and refresh the venue meter.
      // R7DEM.5 (REQ-DWEB-7; R3 §4 row 5) — the demo mounts this whole chrome block collab-less,
      // and `/p/demo~*/edit/:d/doc` is NOT on the demo allowlist: the poll would 404-poll a
      // read-only record forever. `isDemo()` skips the interval, the visibility re-poll and
      // the fetch itself — a demo draft's lock state can never change mid-visit anyway.
      const demoMount = isDemo();
      const poll = async () => {
        if (demoMount) return;
        if (document.visibilityState !== "visible") return;
        try {
          const res = await fetch(docUrl, { credentials: "same-origin", headers: { accept: "application/json" } });
          if (!res.ok) return;
          const doc = (await res.json()) as PageDocResponse;
          rebase(doc.draftId);
          const nowLocked = doc.lock != null;
          setLockBanner(doc.lock ?? null);
          if (nowLocked !== lockedRef.current) applyLock(nowLocked);
          syncRail(doc.findings);
          const venueEl = document.querySelector<HTMLElement>("[data-status-venue]");
          if (venueEl && doc.venueCap != null) venueEl.textContent = doc.venueCap;
        } catch {
          /* offline — the queued pill state already tells the story */
        }
      };

      wire?.setChrome({
        onSync: (ev) => setPill(ev),
        onFork: (fork) => {
          const baseN = draftN;
          rebase(fork.draftId); // rekey owns the session rebind (URL + dataset + provider)
          draftN = fork.draftN;
          root.dataset["draftN"] = String(draftN);
          showForkBanner(draftN, baseN);
          // R7WRITE.1b (REQ-WRITE-7; B18) — the frozen-fork toast: "You're editing a reviewed
          // version, so this starts v(N+1) · Undo". The toast queue lives in React (the leaf's
          // ForkToastBridge renders + Undo-wires it); the mount emits the fact.
          window.dispatchEvent(
            new CustomEvent("rhema:fork-toast", {
              detail: { draftId: fork.draftId, draftN: fork.draftN, baseN },
            }),
          );
        },
        onReadOnly: () => {
          // the server attached us read-only (a run lock or a non-editable head) — no local edits.
          lockedRef.current = true;
          editableRef.current = false;
          root.dataset["locked"] = "1";
          view.dispatch(view.state.tr);
        },
        onRestorePoint: () => setPill({ state: "synced", queued: 0 }),
      });
      if (wire) setPill(wire.sync);

      // R7WRITE.1a (REQ-WRITE-1) — the format bubble's items dispatch `rhema:format-command`;
      // this mount's live view applies the PM command on the current selection. A read-only
      // mount never dispatches (the bubble withholds its items, and this stays a backstop).
      const onFormatCommand = (ev: Event): void => {
        if (!editableRef.current) return;
        const detail = (ev as CustomEvent<{ action?: string; href?: string }>).detail;
        const action = detail?.action;
        if (
          action === "bold" ||
          action === "italic" ||
          action === "link" ||
          action === "h2" ||
          action === "h3" ||
          action === "quote" ||
          action === "bulleted" ||
          action === "numbered"
        ) {
          formatCommand(action, detail?.href)(view.state, view.dispatch, view);
        }
      };
      window.addEventListener("rhema:format-command", onFormatCommand);

      // R7WRITE.1b (REQ-WRITE-2) — the bubble's Comment composer hands its text here: the mount
      // derives the selection's §11.3 anchor from the live view (blockId/quote/offsets) and POSTs
      // the anchored note through the same-origin JSON mutation — the margin card lands on the
      // twin's refetch (the leaf invalidates ["bff"]). Read-only/locked mounts never submit.
      const onCommentSubmit = (ev: Event): void => {
        if (!editableRef.current) return;
        const text = (ev as CustomEvent<{ text?: string }>).detail?.text?.trim();
        if (!text) return;
        const { from, to } = view.state.selection;
        const $from = view.state.doc.resolve(from);
        const blockNode = $from.node($from.depth > 0 ? 1 : 0);
        const blockId =
          String(
            (blockNode.attrs as Record<string, unknown> | undefined)?.["blockId"] ??
              $from.node($from.depth)?.attrs?.["blockId"] ??
              `block-${$from.index(0)}`,
          ) || `block-0`;
        const anchor = {
          blockId,
          quote: view.state.doc.textBetween(from, to, " "),
          startOffset: from,
          endOffset: to,
          confidence: 1,
        };
        const noteUrl = docUrl.replace(/\/doc$/, "/note");
        void fetch(noteUrl, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ text, anchors: [anchor] }),
        })
          .then(async (res) => {
            if (!res.ok) return;
            window.dispatchEvent(
              new CustomEvent("rhema:comment-added", { detail: { anchor } }),
            );
          })
          .catch(() => undefined);
      };
      window.addEventListener("rhema:comment-submit", onCommentSubmit);

      // ⌘S — the named restore point (the ONLY manual save verb; REQ-ED-7's exactly-one path):
      // the window keydown mints in `input` focus or with no IDE chrome mounted; every other zone
      // is claimed by the chrome's dispatcher, whose `restore-point` action emits the
      // `rhema:restore-point` CustomEvent — the SAME mint below. The same-tick guard collapses the
      // two deliveries regardless of listener registration order.
      let lastMintAt = 0;
      const mintRestorePoint = () => {
        const now = Date.now();
        if (now - lastMintAt < RESTORE_DEDUPE_MS) return;
        lastMintAt = now;
        // R7RO.1 — a read-only mount has NO collab wire: minting would paint the syncing lie
        // with no transport beneath it. The chord is a no-op before any request is made.
        // R7DEM.5 (R3 §4 row 6) — in the demo the chord is a no-op PLUS the honest read-only
        // pill (`data-label-readonly` — never the "syncing" lie the unwired setPill would paint).
        // A demo mount is collab-less, so `wire` is always null beneath this pill.
        if (demoMount) setPill({ state: "readonly", queued: 0 });
        if (wire == null) return;
        // SPA.25 — a restore point must cover the pending source buffer (design/30).
        sourceRef.current?.commitNow();
        wire.markRestorePoint?.();
        setPill({ state: "syncing", queued: wire.provider.unsyncedChanges });
      };
      const chromeClaimsChord = (): boolean => {
        if (document.querySelector("[data-ide]") == null) return false;
        const el = document.activeElement as HTMLElement | null;
        const inInput =
          el != null &&
          (el.closest("[data-app-palette]") != null ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
        // the dispatcher's mod-chord table: ⌘S ⇒ restore-point in every non-input zone.
        return !inInput;
      };
      const onKeydown = (e: KeyboardEvent) => {
        if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "s") return;
        if (chromeClaimsChord()) return; // the CustomEvent below mints — never twice per chord
        e.preventDefault();
        mintRestorePoint();
      };
      window.addEventListener("keydown", onKeydown);
      window.addEventListener("rhema:restore-point", mintRestorePoint);

      const pollTimer = demoMount ? -1 : window.setInterval(() => void poll(), LOCK_POLL_MS);
      const onVisibility = () => {
        if (document.visibilityState === "hidden") {
          // REQ-ED-5 — the pending provenance flush lands with the `blur` trigger + provider flush.
          // SPA.25 — the pending source buffer commits into the doc first (design/30 flush points).
          sourceRef.current?.commitNow();
          if (provTimer != null) flushProvenance();
          wire?.flushOnHide?.();
        } else {
          void poll();
        }
      };
      document.addEventListener("visibilitychange", onVisibility);

      // No Save button, no unsaved-changes dialog, NO beforeunload — pagehide flushes the `blur`
      // restore point + the provider's pending updates; y-indexeddb holds whatever never left.
      const onPageHide = () => {
        sourceRef.current?.commitNow();
        if (provTimer != null) flushProvenance();
        wire?.flushOnHide?.();
        window.clearInterval(pollTimer);
      };
      window.addEventListener("pagehide", onPageHide);

      chromeCleanup = () => {
        wire?.setChrome(null);
        window.removeEventListener("keydown", onKeydown);
        window.removeEventListener("rhema:format-command", onFormatCommand);
        window.removeEventListener("rhema:comment-submit", onCommentSubmit);
        window.removeEventListener("rhema:restore-point", mintRestorePoint);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("pagehide", onPageHide);
        window.clearInterval(pollTimer);
      };
    }

    return () => {
      chromeCleanup?.();
      window.removeEventListener("rhema:authorship", onAuthorship);
      root?.removeAttribute("data-page-session");
      view.dom.removeEventListener("paste", onPaste);
      if (provTimer != null) {
        window.clearTimeout(provTimer);
        provTimer = null;
      }
      provFlushRef.current = null;
      // SPA.25 — the source handle's destroy commits any pending buffer BEFORE the view dies.
      sourceRef.current?.destroy();
      sourceRef.current = null;
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

  // ---- the source view (SPA.25; REQ-ED-17; design/30) — a lazy CodeMirror projection over the
  // SAME mounted PM view. The dynamic import keeps every @codemirror byte in its own async chunk
  // (REQ-SAFE-7 — the §9/R25 `codemirror` group ceiling names the emitted file). Toggling back is
  // a flush point: destroy() commits the pending buffer before the CM view leaves.
  useEffect(() => {
    if (!sourceMode) return;
    let cancelled = false;
    let handle: SourceModeHandle | null = null;
    void import("./page-source-mode.js").then((m) => {
      if (cancelled) return;
      const sourceHost = sourceHostRef.current;
      const view = viewRef.current;
      if (!sourceHost || !view) return;
      handle = m.mountSourceMode({
        parent: sourceHost,
        pm: view,
        editable: () => editableRef.current,
        ariaLabel: COPY.editor.sourceAriaLabel,
        onStale: setSourceStale,
      });
      sourceRef.current = handle;
    });
    return () => {
      cancelled = true;
      sourceRef.current = null;
      handle?.destroy();
      setSourceStale(false);
    };
  }, [sourceMode]);

  const hostReadOnlyAttr = hostReadOnly ? "1" : "0";
  return (
    <div data-page-host className="rm-page-host" data-readonly={hostReadOnlyAttr} ref={hostRef}>
      {mounted ? null : (
        <div data-page-preview className="rm-page-preview">
          <PmPreview docJson={props.docJson} {...(props.previewCtx ? { ctx: props.previewCtx } : {})} />
        </div>
      )}
      {/* SPA.25 (REQ-ED-17) — the source/rich toggle lives inside the SPA mount only: the SSR host
          never emits it, and forced-SSR postures (phone/showcase, REQ-ED-12) never reach this code. */}
      {mounted ? (
        <div data-source-bar className="rm-source-bar">
          <button
            type="button"
            data-source-toggle
            className="rm-source-toggle"
            aria-pressed={sourceMode}
            onClick={() => setSourceMode((s) => !s)}
          >
            {COPY.editor.sourceToggle}
          </button>
          {sourceStale ? (
            <span data-source-note className="rm-source-note">
              {COPY.editor.sourceStaleNote}
            </span>
          ) : null}
        </div>
      ) : null}
      <div data-source-host className="rm-source-host" ref={sourceHostRef} hidden={!sourceMode} />
      <div data-pm-host ref={pmHostRef} hidden={sourceMode} />
    </div>
  );
}
