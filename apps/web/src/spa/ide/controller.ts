// SPA.9 — the IDE chrome controller (REQ-ISL-9/10/15, REQ-NAV-8, REQ-UX-7/8/16). The ide.ts
// island's non-document logic, ported to layout-owned React: ONE binding effect replays the
// island's listener set against the `<IdeShell>` DOM (the attribute-driven contract — panes live
// in `data-*` on `.ide`, never in React props), and the small cross-effect legs (?focus=1
// apply-then-strip, `#finding-` deep links, prop-change re-apply) are separate effects.
//
// Verbatim carried over (the mixed-mode coexistence contract — REQ-SEQ-11/12):
//   - localStorage keys + codecs: `paneStorageKey(userId, projectId)` (`rhema:panes:v1:u:p`),
//     `rhema:font:v1`, `rhema:reader-step:v1`, `rhema:authorship:v1:<projectId>`,
//     `rhema:theme:v1`, `rhema:paper:v1:<slug>` — unchanged keys, unchanged codecs.
//   - `rhema:authorship` / `rhema:restore-point` / `rhema:finding-action` CustomEvents.
//   - the same-origin write posts (`themeUrl`/`paperUrl` fire-and-forget) and the palette's
//     zero-POST posture — every activation is a navigation or the run sheet's GET.
//   - `dispatchIdeKey`'s focus zones: inputs + the Page keep typing; findings chords only in the
//     Margin/Desk list focus.
// The one deliberate delta: `window.location.assign` → the router's history (in-tree navigation;
// server-owned targets still resolve through SsrHandoff/not-found → document nav).

import { useCallback, useEffect, useRef, type RefObject } from "react";
import { parseCommand, resolveCommand } from "@rhema/commands";
import {
  DEFAULT_PANE_STATE,
  contextMenuItems,
  cyclePaperTheme,
  dispatchIdeKey,
  formatBubblePlacement,
  paneDrag,
  paneLayout,
  paneStorageKey,
  paneTabRemembered,
  parseAppTheme,
  parsePaperTheme,
  parsePaneState,
  resolveAppTheme,
  selectionMenuItems,
  serializePaneState,
  THEME_STORAGE_KEY,
  type CommandMenuItem,
  type FocusZone,
  type PaneLayout,
  type PaneState,
  type PaperTheme,
} from "@rhema/ide";
import { isDemo } from "../demo.js";

const FONT_KEY = "rhema:font:v1";
const STEP_KEY = "rhema:reader-step:v1";

/** The router side of the island's `window.location` reads — everything builds on history, never
 *  the address bar (memory-history tests have no real URL). */
export interface IdeChromeNav {
  readonly pathname: string;
  /** the raw `?…` search string (TanStack `location.searchStr`, leading `?` included or absent). */
  readonly searchStr: string;
  readonly hash: string;
  /** An in-router navigation (the island's `location.assign` — GET-only targets by contract).
   *  `resetScroll:false` preserves the committed scroll position — the island's in-place swaps
   *  (version stepping, `?triage`) never scrolled the page (REQ-NAVC-16). */
  push(href: string, opts?: { resetScroll?: boolean }): void;
  /** In-place history replace (the `?focus=1` strip — `replaceState` never scrolled either). */
  replace(href: string, opts?: { resetScroll?: boolean }): void;
}

export interface IdeChromeControllerOpts {
  /** Host element containing the rendered `<IdeShell>` — the `.ide` root is queried inside. */
  readonly hostRef: RefObject<HTMLElement | null>;
  readonly slug: string;
  readonly userId: string;
  readonly projectId: string;
  /** Mirrors the SSR margin decision (`hidden` unless findings exist) for `data-margin` writes. */
  readonly hasFindings: boolean;
  /**
   * True once the mounted leaf has published its chrome slice. The bind effect waits on it: the
   * pane-storage identity (`rhema:panes:v1:<user>:<project>`) must not be read under a slug-as-
   * projectId placeholder and rebound mid-mount — the leaf's publish supplies the real projectId.
   */
  readonly ready: boolean;
  /** R7SHELL.1c — the palette moved to the AppShell; ⌘K dispatches `rhema:palette-open`. */
  readonly nav: IdeChromeNav;
  /** REQ-TALK-1 — the tab the panel opens on when nothing is remembered: `"timeline"` when a run
   *  is active or unread, `"chat"` otherwise. A remembered tab always wins (the codec keeps it). */
  readonly defaultPanelTab?: "chat" | "timeline";
}

function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode — the pref degrades to session-only, exactly like the island */
  }
}

export function useIdeChromeController(opts: IdeChromeControllerOpts): void {
  const latest = useRef(opts);
  latest.current = opts;
  const host = opts.hostRef;

  const stateRef = useRef<PaneState>({ ...DEFAULT_PANE_STATE });
  // R7PANE.1 (REQ-PANE-2, carried from REQ-PANE-0) — the overlay/sheet open intent is
  // SESSION-scoped: it lives here only, never in pane storage, so a persisted docked-mode
  // `panelOpen:true` can never auto-open an overlay (or the <1024 sheet/drawer) at a narrow
  // width.
  const overlayOpenRef = useRef<{ panel: boolean }>({ panel: false });
  // REQ-UX-7 — the control that opened an overlay gets focus back on dismiss.
  const overlayTriggerRef = useRef<{ panel: HTMLElement | null }>({ panel: null });
  const authorshipRef = useRef(false);
  const readerStepRef = useRef(0);
  const suggestionNodesRef = useRef<HTMLElement[]>([]);
  const findingIxRef = useRef(-1);
  // REQ-UX-7 — every overlay remembers its opener; closing returns focus to it (the trigger still
  // in the DOM). The island left focus stranded on hidden rows.
  const menuTriggerRef = useRef<HTMLElement | null>(null);
  const cheatTriggerRef = useRef<HTMLElement | null>(null);

  const ideEl = useCallback(
    () => host.current?.querySelector<HTMLElement>("[data-ide]") ?? null,
    [host],
  );

  // ---------- state → DOM (the island's apply(), verbatim) ----------
  const applySuggestions = useCallback((on: boolean): void => {
    const ide = ideEl();
    if (!ide) return;
    const nodes = suggestionNodesRef.current;
    for (const n of nodes) n.remove();
    nodes.length = 0;
    for (const span of ide.querySelectorAll<HTMLElement>(".rm-finding[data-suggestion-replacement]")) {
      span.classList.toggle("rm-suggestion-preview", on);
      if (on) {
        const ins = document.createElement("span");
        ins.className = "rm-suggestion-replacement";
        ins.setAttribute("aria-hidden", "true");
        ins.textContent = ` ${span.dataset["suggestionReplacement"] ?? ""}`;
        span.insertAdjacentElement("afterend", ins);
        nodes.push(ins);
      }
    }
  }, [ideEl]);

  // ---------- paneLayout() is the runtime geometry source (REQ-PANE-0) ----------
  // The presentation mode is computed with the panel treated as open, so `panel:"overlay"` vs
  // `"docked"` describes the MODE, not the open state;
  // the effective open state then picks session intent (overlay/sheet) or persisted intent.
  const presentationNow = useCallback((): PaneLayout => {
    const w = typeof window !== "undefined" ? window.innerWidth : 1600;
    const shell = host.current?.closest<HTMLElement>(".app-shell") ?? null;
    const base = {
      ...stateRef.current,
      hasFindings: latest.current.hasFindings,
      hosted: shell != null || ideEl()?.hasAttribute("data-ide-hosted") === true,
      sidebarOpen: shell?.dataset["sidebar"] !== "collapsed",
    };
    // Two cheap pure passes: the first resolves the MODE, the second feeds the session-scoped
    // overlay intent back in so paneLayout()'s effective open verdict is the real one.
    const pre = paneLayout(w, base);
    const intents = {
      panelOpen: overlayMode(pre.panel) ? overlayOpenRef.current.panel : stateRef.current.panelOpen,
    };
    return paneLayout(w, { ...base, ...intents });
  }, [host, ideEl]);
  const overlayMode = (m: string): boolean => m === "overlay" || m === "sheet";

  const apply = useCallback((): void => {
    const ide = ideEl();
    if (!ide) return;
    const state = stateRef.current;
    const presentation = presentationNow();
    const ssrMargin = latest.current.hasFindings ? "auto" : "hidden";
    ide.dataset.paneMode = presentation.mode;
    ide.dataset.panelMode = presentation.panel;
    const panelOpen = presentation.panelOpen;
    ide.dataset.panel = panelOpen ? "open" : "closed";
    ide.dataset.panelTab = state.panelTab;
    // R7a hook aliases (the dom-contract migration ships them in this change): the R7a legs
    // resolve on this markup AND on prod's R7a markup.
    ide.dataset.timeline = panelOpen ? "open" : "closed";
    ide.dataset.timelineMode = presentation.panel === "docked" ? "pane" : presentation.panel;
    ide.dataset.desk = panelOpen ? "open" : "closed";
    ide.dataset.deskTab = state.panelTab;
    ide.dataset.view = state.view;
    if (ssrMargin !== "hidden") ide.dataset.margin = state.findingCards ? "auto" : "ticks";
    ide.toggleAttribute("data-advanced", state.advanced);
    ide.style.setProperty("--panel-w", `${state.panelWidth}px`);
    ide.querySelector(".ide-panel")?.toggleAttribute("data-open", panelOpen);
    // REQ-PANE-2 — the sidebar advisory goes on the shell frame (its CSS enforces rail/drawer).
    const shell = ide.closest<HTMLElement>(".app-shell");
    if (shell) shell.dataset["ideSidebar"] = presentation.sidebar;
    for (const b of ide.querySelectorAll<HTMLElement>("[data-ide-panel-toggle], [data-ide-timeline-toggle]")) {
      if (b.getAttribute("role") === "menuitemcheckbox") b.setAttribute("aria-checked", String(panelOpen));
    }
    // UXC-26 — the separator's ARIA value tracks the committed width.
    for (const h of ide.querySelectorAll<HTMLElement>("[data-ide-handle]")) {
      h.setAttribute("aria-valuenow", String(Math.round(state.panelWidth)));
    }
    for (const b of ide.querySelectorAll<HTMLElement>("[data-ide-view]")) {
      b.setAttribute("aria-checked", String(b.dataset["ideView"] === state.view));
    }
    for (const b of ide.querySelectorAll<HTMLElement>("[data-ide-toggle]")) {
      const id = b.dataset["ideToggle"] as keyof PaneState | undefined;
      if (id && typeof state[id] === "boolean") b.setAttribute("aria-checked", String(state[id]));
    }
    for (const b of ide.querySelectorAll<HTMLElement>("[data-ide-panel-tab], [data-ide-desk-tab]")) {
      b.setAttribute("aria-selected", String((b.dataset["idePanelTab"] ?? b.dataset["ideDeskTab"]) === state.panelTab));
    }
    applySuggestions(state.suggestionsInline === true);
  }, [ideEl, applySuggestions, presentationNow]);

  const commit = useCallback(
    (patch: Partial<PaneState>): void => {
      stateRef.current = { ...stateRef.current, ...patch };
      apply();
      safeSet(
        paneStorageKey(latest.current.userId, latest.current.projectId),
        serializePaneState(stateRef.current),
      );
    },
    [apply],
  );

  // ---------- REQ-PANE-0 — overlay/sheet intent + dismiss ----------
  // A pane toggle in an overlay/sheet mode flips SESSION state only (apply(), never commit()):
  // nothing written to `rhema:panes` can resurrect an overlay at a narrow width.
  const togglePane = useCallback(
    (pane: "panel"): void => {
      const presentation = presentationNow();
      const mode = presentation.panel;
      if (overlayMode(mode)) {
        const opening = !overlayOpenRef.current[pane];
        overlayOpenRef.current = { ...overlayOpenRef.current, [pane]: opening };
        if (opening) overlayTriggerRef.current[pane] = document.activeElement as HTMLElement | null;
        apply();
        return;
      }
      // Docked: the explicit toggle writes the intent (no more derived default).
      commit({ panelOpen: !presentation.panelOpen });
    },
    [apply, commit, presentationNow],
  );

  /** Close any open overlay/sheet; returns whether anything closed (the Esc layer check). */
  const dismissOverlays = useCallback((): boolean => {
    const o = overlayOpenRef.current;
    if (!o.panel) return false;
    const focusInside = (document.activeElement as HTMLElement | null)?.closest?.(
      ".ide-panel",
    );
    overlayOpenRef.current = { panel: false };
    apply();
    // REQ-UX-7 — focus returns to the opener only when it was inside the dismissed pane.
    if (focusInside) {
      const trig = overlayTriggerRef.current.panel;
      if (trig?.isConnected) trig.focus();
    }
    return true;
  }, [apply]);

  // ---------- overlays: menus / palette / cheat sheet (with REQ-UX-7 focus return) ----------
  const closeMenus = useCallback((): void => {
    const ide = ideEl();
    if (!ide) return;
    const focusInside = Array.from(ide.querySelectorAll<HTMLElement>("[data-ide-menu]")).some((m) =>
      m.contains(document.activeElement),
    );
    for (const m of ide.querySelectorAll<HTMLElement>("[data-ide-menu]")) m.hidden = true;
    for (const t of ide.querySelectorAll<HTMLElement>("[aria-haspopup='menu']")) {
      t.setAttribute("aria-expanded", "false");
    }
    const trig = menuTriggerRef.current;
    menuTriggerRef.current = null;
    if (focusInside && trig?.isConnected) trig.focus();
  }, [ideEl]);

  const openMenu = useCallback(
    (name: string, anchor: HTMLElement): void => {
      const ide = ideEl();
      if (!ide) return;
      const m = ide.querySelector<HTMLElement>(`[data-ide-menu="${name}"]`);
      if (!m) return;
      const wasOpen = !m.hidden;
      closeMenus();
      if (wasOpen) {
        menuTriggerRef.current = null;
        anchor.focus(); // toggling the same trigger closed — focus stays on it
        return;
      }
      menuTriggerRef.current = anchor;
      m.hidden = false;
      anchor.setAttribute("aria-expanded", "true");
      const r = anchor.getBoundingClientRect();
      m.style.left = `${Math.min(r.left, window.innerWidth - 240)}px`;
      m.style.bottom = `${Math.max(8, window.innerHeight - r.top + 6)}px`;
      m.style.top = "auto";
      m.querySelector<HTMLElement>("[role='menuitemradio'], .ide-menu-row")?.focus();
    },
    [ideEl, closeMenus],
  );

  const closeCheat = useCallback((): void => {
    const el = ideEl()?.querySelector<HTMLElement>("[data-ide-cheatsheet]");
    if (el && !el.hidden) {
      el.hidden = true;
      const trig = cheatTriggerRef.current;
      cheatTriggerRef.current = null;
      if (trig?.isConnected && el.contains(document.activeElement)) trig.focus();
    }
  }, [ideEl]);
  const toggleCheat = useCallback((): void => {
    const el = ideEl()?.querySelector<HTMLElement>("[data-ide-cheatsheet]");
    if (!el) return;
    if (el.hidden) {
      cheatTriggerRef.current = document.activeElement as HTMLElement | null;
      el.hidden = false;
      el.querySelector<HTMLElement>("[data-ide-cheatsheet-close]")?.focus();
    } else {
      closeCheat();
    }
  }, [ideEl, closeCheat]);
  const cheatOpen = useCallback(
    (): boolean =>
      ideEl()?.querySelector<HTMLElement>("[data-ide-cheatsheet]")?.hidden === false,
    [ideEl],
  );

  // ---------- findings focus machinery (§5.7 linked selection + §5.12 scoped chords) ----------
  const findingEls = useCallback((): { id: string; el: HTMLElement }[] => {
    const ide = ideEl();
    if (!ide) return [];
    const seen = new Set<string>();
    const out: { id: string; el: HTMLElement }[] = [];
    for (const el of ide.querySelectorAll<HTMLElement>("[data-margin-card], [data-desk-row], .ide-fcard")) {
      const id = el.dataset["findingId"] ?? el.dataset["deskRow"] ?? "";
      if (id === "" || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, el });
    }
    return out;
  }, [ideEl]);

  const selectFinding = useCallback(
    (id: string): void => {
      const ide = ideEl();
      if (!ide) return;
      for (const other of ide.querySelectorAll<HTMLElement>("[data-selected='true']")) {
        other.removeAttribute("data-selected");
      }
      if (id === "") return;
      const esc = typeof CSS !== "undefined" && CSS.escape ? CSS.escape(id) : id.replace(/"/g, "");
      for (const sel of ide.querySelectorAll<HTMLElement>(`[data-finding-id="${esc}"], [data-desk-row="${esc}"]`)) {
        sel.setAttribute("data-selected", "true");
      }
      ide
        .querySelector<HTMLElement>(`.ide-page [data-finding-id="${esc}"], .rm-page-host [data-finding-id="${esc}"]`)
        ?.scrollIntoView({ block: "center" });
    },
    [ideEl],
  );

  const focusFinding = useCallback(
    (ix: number): void => {
      const items = findingEls();
      if (items.length === 0) return;
      findingIxRef.current = Math.max(0, Math.min(items.length - 1, ix));
      const item = items[findingIxRef.current];
      if (!item) return;
      const det = item.el.closest("details");
      if (det instanceof HTMLDetailsElement) det.open = true;
      selectFinding(item.id);
      item.el.tabIndex = -1;
      item.el.focus();
    },
    [findingEls, selectFinding],
  );

  const findingAction = useCallback(
    (action: string): void => {
      const item = findingEls()[findingIxRef.current];
      if (!item) return;
      const card = item.el;
      card.dispatchEvent(
        new CustomEvent("rhema:finding-action", { bubbles: true, detail: { action, findingId: item.id } }),
      );
      if (action === "apply") {
        card.querySelector<HTMLElement>("[data-apply]")?.click();
        return;
      }
      if (action === "rebut" || action === "escalate") {
        card.querySelector<HTMLElement>("textarea, input[type='text']")?.focus();
        card.querySelector<HTMLElement>(`[data-verb="${action}"]`)?.setAttribute("data-armed", "true");
        return;
      }
      card.querySelector<HTMLElement>(`[data-verb="${action}"]`)?.click();
    },
    [findingEls],
  );

  // The ONE `#finding-<id>` consumer — fed by the router's committed hash (`nav.hash`, no "#")
  // AND by the native `hashchange` path below (`window.location.hash`, "#" included), so a
  // fragment hop selects the same card whichever stack observed it (REQ-NAVC-16).
  const consumeFindingHash = useCallback(
    (hash: string): void => {
      const id = /^finding-(.+)$/.exec(hash.replace(/^#/, ""))?.[1];
      if (id) selectFinding(id);
    },
    [selectFinding],
  );

  const focusZone = useCallback((): FocusZone => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return "none";
    if (el.closest("[data-app-palette]") || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return "input";
    // REQ-KEYS-1 Rule 5 (239) — the Source host's zone comes FIRST: CodeMirror's own bindings
    // win while it has focus, so the dispatcher only sees ⌘S there.
    if (el.closest("[data-source-host]") || el.closest(".cm-editor")) return "source";
    if (el.isContentEditable || el.closest(".ProseMirror") || el.closest("[data-page-host]")) return "page";
    if (el.closest("[data-margin-card]") || el.closest(".ide-fcard") || el.closest(".ide-margin")) return "margin";
    if (el.closest("[data-desk-row]") || el.closest("[data-findings-desk]")) return "findings";
    return "none";
  }, []);

  // ---------- typography + themes (the same localStorage keys + same-origin posts) ----------
  const applyFont = useCallback((): void => {
    const doc = document.documentElement;
    const sans = doc.getAttribute("data-font") === "sans";
    doc.style.setProperty("--paper-size", `${(sans ? 16 : 17) + 2 * readerStepRef.current}px`);
    for (const b of ideEl()?.querySelectorAll<HTMLElement>("[data-ide-font]") ?? []) {
      b.setAttribute("aria-checked", String((b.dataset["ideFont"] === "sans") === sans));
    }
  }, [ideEl]);

  const applyAuthorship = useCallback((): void => {
    const ide = ideEl();
    if (!ide) return;
    const on = authorshipRef.current;
    ide.toggleAttribute("data-authorship", on);
    for (const b of ide.querySelectorAll<HTMLElement>('[data-ide-toggle="authorship"]')) {
      b.setAttribute("aria-checked", String(on));
    }
    window.dispatchEvent(new CustomEvent("rhema:authorship", { detail: { on } }));
  }, [ideEl]);

  const applyAppTheme = useCallback((pref: string): void => {
    const doc = document.documentElement;
    const resolved = resolveAppTheme(
      parseAppTheme(pref),
      window.matchMedia?.("(prefers-color-scheme: light)").matches ?? false,
    );
    doc.setAttribute("data-app-theme", pref);
    doc.setAttribute("data-theme", resolved);
    safeSet(THEME_STORAGE_KEY, pref);
  }, []);

  const applyPaper = useCallback(
    (policy: PaperTheme): void => {
      const doc = document.documentElement;
      doc.setAttribute("data-paper", policy);
      safeSet(`rhema:paper:v1:${latest.current.slug}`, policy);
      for (const b of ideEl()?.querySelectorAll<HTMLElement>("[data-ide-paper]") ?? []) {
        b.setAttribute("aria-checked", String(b.dataset["idePaper"] === policy));
      }
    },
    [ideEl],
  );

  const post = useCallback((url: string | undefined, body: Record<string, string>): void => {
    if (!url) return;
    // R7DEM.5 (REQ-DWEB-7; R3 §4 row 3) — theme/paper POSTs never fire in the demo: the
    // localStorage apply still runs (the visitor's view preference is local state), but the
    // same-origin write is skipped outright rather than round-tripping the server's 405.
    if (isDemo()) return;
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    }).catch(() => undefined);
  }, []);

  // ---------- the binding effect: the island's listener set, verbatim ----------
  // Bound only after the leaf's first publish (`ready`) — the pane-storage identity arrives via
  // `data.projectId`, and binding under the slug placeholder would persist a stray wrong key.
  const storageKey = paneStorageKey(opts.userId, opts.projectId);
  const ready = opts.ready;
  useEffect(() => {
    if (!latest.current.ready) return;
    const ide = ideEl();
    if (!ide) return;
    const { slug } = latest.current;

    // stored arrangement wins; the leaf's focus stamp (a published `initialView`) seeds it once.
    let storedBlob: string | null = null;
    try {
      storedBlob = localStorage.getItem(storageKey);
      stateRef.current = parsePaneState(storedBlob);
    } catch {
      stateRef.current = { ...DEFAULT_PANE_STATE };
    }
    // REQ-TALK-1 — the default tab applies only when the blob remembers none: Timeline when a
    // run is active or unread (the leaf's publish carries the fact), Chat otherwise.
    if (!paneTabRemembered(storedBlob)) {
      stateRef.current = {
        ...stateRef.current,
        panelTab: latest.current.defaultPanelTab ?? "chat",
      };
    }
    try {
      authorshipRef.current = safeGet(`rhema:authorship:v1:${latest.current.projectId}`) === "1";
      readerStepRef.current = Math.min(3, Math.max(0, parseInt(safeGet(STEP_KEY) ?? "0", 10) || 0));
    } catch {
      /* private mode */
    }
    // `?focus=1` is a deep-link, not a URL mode: applied once into the stored arrangement, then
    // stripped (the island's `history.replaceState` → the router's `history.replace`).
    {
      const { nav } = latest.current;
      const params = new URLSearchParams(nav.searchStr.startsWith("?") ? nav.searchStr.slice(1) : nav.searchStr);
      if (params.get("focus") === "1") {
        params.delete("focus");
        commit({ view: "focus" });
        const s = params.toString();
        // replaceState never scrolled — keep the committed position (REQ-NAVC-16).
        nav.replace(nav.pathname + (s ? `?${s}` : "") + (nav.hash ? `#${nav.hash}` : ""), {
          resetScroll: false,
        });
      }
    }
    apply();
    applyAuthorship();
    applyFont();

    // ---- delegated clicks (React owns the DOM — delegation survives inner re-renders) ----
    const onIdeClick = (e: MouseEvent): void => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-ide-timeline-toggle]")) {
        e.preventDefault();
        togglePane("panel");
        closeMenus(); // the View-menu row acts like the other rows — one activation, menu done
        return;
      }
      if (t.closest("[data-ide-focus-exit]")) {
        e.preventDefault();
        commit({ view: "write" });
        return;
      }
      if (t.closest("[data-ide-panel-toggle]") || t.closest("[data-ide-desk-toggle]")) {
        e.preventDefault();
        togglePane("panel");
        return;
      }
      const panelTab = t.closest<HTMLElement>("[data-ide-panel-tab], [data-ide-desk-tab]");
      if (panelTab) {
        const tab = (panelTab.dataset["idePanelTab"] ?? panelTab.dataset["ideDeskTab"]) as PaneState["panelTab"];
        // a demo boot hides the Chat trigger (its body would read workspace data).
        if (panelTab.hasAttribute("hidden") || panelTab.hasAttribute("disabled")) return;
        const presentation = presentationNow();
        if (overlayMode(presentation.panel)) {
          overlayOpenRef.current = { ...overlayOpenRef.current, panel: true };
          stateRef.current = { ...stateRef.current, panelTab: tab };
          apply();
        } else {
          commit({ panelTab: tab, panelOpen: true });
        }
        return;
      }
      // a run card's "Live feed" action opens the panel on the feed tab.
      if (t.closest("[data-ide-open-feed]")) {
        e.preventDefault();
        const presentation = presentationNow();
        if (overlayMode(presentation.panel)) {
          overlayOpenRef.current = { ...overlayOpenRef.current, panel: true };
          stateRef.current = { ...stateRef.current, panelTab: "feed" };
          apply();
        } else {
          commit({ panelTab: "feed", panelOpen: true });
        }
        return;
      }
      const viewMenuBtn = t.closest<HTMLElement>("[data-ide-view-menu]");
      if (viewMenuBtn) {
        e.preventDefault();
        openMenu("view", viewMenuBtn);
        return;
      }
      const themeMenuBtn = t.closest<HTMLElement>("[data-ide-theme-menu]");
      if (themeMenuBtn) {
        e.preventDefault();
        openMenu("theme", themeMenuBtn);
        return;
      }
      const view = t.closest<HTMLElement>("[data-ide-view]");
      if (view) {
        commit({ view: view.dataset["ideView"] as PaneState["view"] });
        closeMenus();
        return;
      }
      const toggle = t.closest<HTMLElement>("[data-ide-toggle]");
      if (toggle) {
        const id = toggle.dataset["ideToggle"] as keyof PaneState | "authorship";
        if (id === "findingCards" || id === "suggestionsInline" || id === "advanced") {
          commit({ [id]: !stateRef.current[id] } as Partial<PaneState>);
        } else if (id === "authorship") {
          authorshipRef.current = !authorshipRef.current;
          safeSet(`rhema:authorship:v1:${latest.current.projectId}`, authorshipRef.current ? "1" : "0");
          applyAuthorship();
        }
        closeMenus();
        return;
      }
      const font = t.closest<HTMLElement>("[data-ide-font]");
      if (font) {
        const sans = font.dataset["ideFont"] === "sans";
        const doc = document.documentElement;
        if (sans) doc.setAttribute("data-font", "sans");
        else doc.removeAttribute("data-font");
        safeSet(FONT_KEY, sans ? "sans" : "serif");
        applyFont();
        closeMenus();
        return;
      }
      const reader = t.closest<HTMLElement>("[data-ide-reader]");
      if (reader) {
        readerStepRef.current = Math.min(3, Math.max(0, readerStepRef.current + (reader.dataset["ideReader"] === "up" ? 1 : -1)));
        safeSet(STEP_KEY, String(readerStepRef.current));
        applyFont();
        return;
      }
      const theme = t.closest<HTMLElement>("[data-ide-theme]");
      if (theme) {
        const pref = theme.dataset["ideTheme"] ?? "dark";
        applyAppTheme(pref);
        post(ide.dataset["themeUrl"], { appTheme: pref });
        closeMenus();
        return;
      }
      const paper = t.closest<HTMLElement>("[data-ide-paper]");
      if (paper) {
        const p = parsePaperTheme(paper.dataset["idePaper"]);
        applyPaper(p);
        post(ide.dataset["paperUrl"], { paperTheme: p });
        closeMenus();
        return;
      }
      if (t.closest("[data-ide-cheatsheet-close]")) {
        closeCheat();
        return;
      }
      // clicking a finding on ANY surface joins the selection (§5.7) + syncs the J/K cursor.
      const card = t.closest<HTMLElement>("[data-margin-card], [data-desk-row], .ide-fcard");
      if (card) {
        const id = card.dataset["findingId"] ?? card.dataset["deskRow"] ?? "";
        if (id === "") return;
        const ix = findingEls().findIndex((it) => it.id === id);
        if (ix >= 0) findingIxRef.current = ix;
        selectFinding(id);
      }
    };

    // ---- pane drags: live width preview + the collapse-on-violate commit (REQ-IDE-9) ----
    const onPointerDown = (e: PointerEvent): void => {
      const handle = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-ide-handle]");
      if (!handle) return;
      e.preventDefault();
      const pane = "panel" as const;
      handle.setPointerCapture(e.pointerId);
      const onMove = (ev: PointerEvent) => {
        const rect = ide.getBoundingClientRect();
        const px = rect.right - ev.clientX;
        ide.style.setProperty("--panel-w", `${Math.max(0, px)}px`);
      };
      const onUp = (ev: PointerEvent) => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        const rect = ide.getBoundingClientRect();
        const px = rect.right - ev.clientX;
        const next = paneDrag(stateRef.current, pane, px, window.innerWidth);
        const mode = presentationNow().panel;
        if (overlayMode(mode)) {
          // REQ-PANE-2 — an overlay resize/close stays session-scoped (never persisted).
          overlayOpenRef.current = {
            ...overlayOpenRef.current,
            panel: next.panelOpen === true,
          };
          stateRef.current = {
            ...stateRef.current,
            panelWidth: next.panelWidth,
          };
          apply();
          return;
        }
        commit(next);
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    };

    // UXC-26 — arrow-key resize on the separators (role="separator"): ←/→ step the width,
    // clamped to the ARIA min/max and guarded by the same 45-ch floor as the drag commit.
    const onHandleKey = (e: KeyboardEvent): void => {
      const handle = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-ide-handle]");
      if (!handle) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const pane = "panel" as const;
      const st = stateRef.current;
      // the panel's positive direction is "wider" — left shrinks it (mirroring the drag math).
      const dir = -1 * (e.key === "ArrowRight" ? 1 : -1);
      const cur = st.panelWidth;
      const px = Math.min(480, Math.max(160, cur + dir * 16));
      if (px === cur) return;
      e.preventDefault();
      commit(paneDrag(st, pane, px, window.innerWidth));
    };
    ide.addEventListener("keydown", onHandleKey);

    // ---- the §7.2/§7.4 cmdmenu (selection popover + timeline context menu) ----
    let cmdMenu: HTMLElement | null = null;
    const closeCmdMenu = (): void => {
      cmdMenu?.remove();
      cmdMenu = null;
    };
    const openCmdMenu = (items: readonly CommandMenuItem[], x: number, y: number, kind: string): void => {
      closeCmdMenu();
      const menu = document.createElement("div");
      menu.className = "ide-cmdmenu";
      menu.dataset["kind"] = kind;
      menu.setAttribute("role", "menu");
      for (const item of items) {
        if (item.separator) {
          const sep = document.createElement("div");
          sep.className = "ide-cmdmenu-sep";
          menu.appendChild(sep);
          continue;
        }
        const parsed = item.command ? parseCommand(item.command) : null;
        const resolution = parsed?.ok ? resolveCommand(parsed.command, { projectSlug: slug }) : null;
        const disabledReason =
          resolution?.kind === "disabled"
            ? resolution.reason
            : parsed && !parsed.ok
              ? (parsed.error ?? "Unparsable command.")
              : null;
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ide-pal-row";
        b.setAttribute("role", "menuitem");
        const label = document.createElement("span");
        label.textContent = item.label;
        b.appendChild(label);
        if (disabledReason) {
          b.toggleAttribute("data-disabled", true);
          b.setAttribute("aria-disabled", "true");
          const hint = document.createElement("span");
          hint.className = "ide-pal-hint";
          hint.textContent = disabledReason;
          b.appendChild(hint);
        } else {
          if (item.hint) {
            const hint = document.createElement("span");
            hint.className = "ide-pal-hint";
            hint.textContent = item.hint;
            b.appendChild(hint);
          }
          b.addEventListener("click", () => {
            closeCmdMenu();
            if (item.action === "ask") {
              commit({ panelOpen: true, panelTab: "chat" });
            } else if (resolution && (resolution.kind === "sheet" || resolution.kind === "navigate")) {
              latest.current.nav.push(resolution.path); // GET only — the sheet owns the launch POST
            }
          });
        }
        menu.appendChild(b);
      }
      document.body.appendChild(menu);
      cmdMenu = menu;
      const w = menu.offsetWidth;
      const h = menu.offsetHeight;
      menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - h - 8))}px`;
    };
    const onDocMouseDown = (e: MouseEvent): void => {
      if (cmdMenu && !cmdMenu.contains(e.target as Node)) closeCmdMenu();
    };
    const pagePane = ide.querySelector<HTMLElement>('[data-pane="page"]');

    // ---- R7WRITE.1a (REQ-WRITE-1; UXC-22, I6) — the FORMAT BUBBLE above the selection --------
    // Replaces the agent-only popover that opened below and covered the selected lines (I6).
    // Group 1 = local PM format actions (dispatched as `rhema:format-command` — PageMount's live
    // view applies them); group 2 = the agent verbs routing to the run sheet (never a POST). The
    // "not available yet" items are REMOVED from the item model, not disabled.
    const selectionReadOnly = (): boolean => {
      if (isDemo()) return true;
      const root = ide.querySelector<HTMLElement>("[data-page-root]");
      return root?.dataset["readonly"] === "1" || root?.dataset["locked"] === "1";
    };
    const focusPageSelection = (): void => {
      // Esc's focus return: PM holds the DOM selection inside the view — focusing the view
      // element puts the caret back on the selected text.
      pagePane?.querySelector<HTMLElement>("[data-page-view]")?.focus();
    };
    /** Above-placement geometry: the bubble sits over the selection's TOP edge and flips under
     *  it only when there is no room above — it never intersects the selection's client rects
     *  (they live inside the bounding rect, so bounding-rect placement guarantees it). */
    const openFormatBubble = (rect: DOMRect, linkMode = false): void => {
      closeCmdMenu();
      const model = selectionMenuItems();
      const menu = document.createElement("div");
      menu.className = "ide-fmt-bubble";
      menu.dataset["kind"] = "format-bubble";
      menu.setAttribute("data-format-bubble", "true");
      menu.setAttribute("role", "menu");
      const addBtn = (item: CommandMenuItem): void => {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "ide-fmt-item";
        b.setAttribute("role", "menuitem");
        b.setAttribute("data-format-item", item.format ?? item.action ?? item.command ?? item.label);
        b.textContent = item.label;
        if (item.hint) {
          const hint = document.createElement("span");
          hint.className = "ide-fmt-hint";
          hint.textContent = item.hint;
          b.appendChild(hint);
        }
        b.addEventListener("click", () => {
          if (item.format === "link") {
            openLinkForm(rect);
            return;
          }
          if (item.action === "comment") {
            openCommentForm(rect);
            return;
          }
          if (item.format) {
            closeCmdMenu();
            window.dispatchEvent(
              new CustomEvent("rhema:format-command", { detail: { action: item.format } }),
            );
            focusPageSelection();
            return;
          }
          if (item.action === "ask") {
            closeCmdMenu();
            commit({ panelOpen: true, panelTab: "chat" });
            return;
          }
          if (item.action === "comment") {
            openCommentForm(rect);
            return;
          }
          const parsed = item.command ? parseCommand(item.command) : null;
          const resolution = parsed?.ok ? resolveCommand(parsed.command, { projectSlug: slug }) : null;
          if (resolution && (resolution.kind === "sheet" || resolution.kind === "navigate")) {
            closeCmdMenu();
            latest.current.nav.push(resolution.path); // GET only — the sheet owns the launch POST
          }
        });
        menu.appendChild(b);
      };
      const sep = (): void => {
        const s = document.createElement("div");
        s.className = "ide-fmt-sep";
        menu.appendChild(s);
      };
      let first = true;
      for (const item of model) {
        if (item.separator) sep();
        else {
          if (!first) sep();
          addBtn(item);
        }
        first = false;
      }
      document.body.appendChild(menu);
      cmdMenu = menu;
      // ABOVE the selection; flip below only when there is no room above (the pure rule is
      // pinned by packages/ide's placement test — REQ-WRITE-1).
      const place = formatBubblePlacement(
        rect,
        { width: menu.offsetWidth, height: menu.offsetHeight },
        { w: window.innerWidth, h: window.innerHeight },
      );
      menu.style.left = `${place.left}px`;
      menu.style.top = `${place.top}px`;
      menu.setAttribute("data-placed", place.placed);
      if (linkMode) openLinkForm(rect);
    };
    /** The Link affordance (bubble item + contextual ⌘K): an inline URL field inside the bubble —
     *  a real control, never window.prompt. Enter applies the `link` mark over the selection. */
    const openLinkForm = (rect: DOMRect): void => {
      closeCmdMenu();
      const menu = document.createElement("div");
      menu.className = "ide-fmt-bubble";
      menu.dataset["kind"] = "format-bubble";
      menu.setAttribute("data-format-bubble", "true");
      const input = document.createElement("input");
      input.type = "url";
      input.className = "ide-fmt-link-input";
      input.setAttribute("data-format-link-input", "true");
      input.placeholder = "https://…";
      input.setAttribute("aria-label", "Link URL");
      const apply = document.createElement("button");
      apply.type = "button";
      apply.className = "ide-fmt-item";
      apply.setAttribute("data-format-link-apply", "true");
      apply.textContent = "Apply";
      const commitLink = (): void => {
        window.dispatchEvent(
          new CustomEvent("rhema:format-command", { detail: { action: "link", href: input.value } }),
        );
        closeCmdMenu();
        focusPageSelection();
      };
      apply.addEventListener("click", commitLink);
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") commitLink();
        if (ev.key === "Escape") {
          closeCmdMenu();
          focusPageSelection();
        }
      });
      menu.appendChild(input);
      menu.appendChild(apply);
      document.body.appendChild(menu);
      cmdMenu = menu;
      const place = formatBubblePlacement(
        rect,
        { width: menu.offsetWidth, height: menu.offsetHeight },
        { w: window.innerWidth, h: window.innerHeight },
      );
      menu.style.left = `${place.left}px`;
      menu.style.top = `${place.top}px`;
      menu.setAttribute("data-placed", place.placed);
      input.focus();
    };
    /** R7WRITE.1b (REQ-WRITE-2) — the Comment composer's inline form: a textarea + Post inside the
     *  bubble's own box. The submit is a JSON mutation — `rhema:comment-submit` hands the text to
     *  PageMount, which derives the selection's anchor from the live view and POSTs the note
     *  (anchored Guidance) with no reload. Esc dismisses with focus back on the selection. */
    const openCommentForm = (rect: DOMRect): void => {
      closeCmdMenu();
      const menu = document.createElement("div");
      menu.className = "ide-fmt-bubble";
      menu.dataset["kind"] = "format-bubble";
      menu.setAttribute("data-format-bubble", "true");
      const input = document.createElement("textarea");
      input.className = "ide-fmt-comment-input";
      input.setAttribute("data-comment-input", "true");
      input.setAttribute("data-comment-composer", "true");
      input.setAttribute("aria-label", "Comment");
      input.placeholder = "Comment…";
      input.rows = 2;
      const apply = document.createElement("button");
      apply.type = "button";
      apply.className = "ide-fmt-item";
      apply.setAttribute("data-comment-submit", "true");
      apply.textContent = "Post";
      const commitComment = (): void => {
        const text = input.value.trim();
        if (text === "") return;
        window.dispatchEvent(new CustomEvent("rhema:comment-submit", { detail: { text } }));
        closeCmdMenu();
        focusPageSelection();
      };
      apply.addEventListener("click", commitComment);
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) commitComment();
        if (ev.key === "Escape") {
          closeCmdMenu();
          focusPageSelection();
        }
      });
      menu.appendChild(input);
      menu.appendChild(apply);
      document.body.appendChild(menu);
      cmdMenu = menu;
      const place = formatBubblePlacement(
        rect,
        { width: menu.offsetWidth, height: menu.offsetHeight },
        { w: window.innerWidth, h: window.innerHeight },
      );
      menu.style.left = `${place.left}px`;
      menu.style.top = `${place.top}px`;
      menu.setAttribute("data-placed", place.placed);
      input.focus();
    };
    const pageSelectionRect = (): DOMRect | null => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !pagePane) return null;
      const range = sel.getRangeAt(0);
      if (!pagePane.contains(range.commonAncestorContainer)) return null;
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) return null;
      return rect;
    };
    let selTimer: ReturnType<typeof setTimeout> | undefined;
    const selectionMenu = (): void => {
      if (selTimer) clearTimeout(selTimer);
      selTimer = setTimeout(() => {
        const rect = pageSelectionRect();
        if (!rect || selectionReadOnly()) return;
        openFormatBubble(rect);
      }, 120);
    };
    const onDocMouseUp = (e: MouseEvent): void => {
      if (cmdMenu?.contains(e.target as Node)) return;
      if (pagePane?.contains(e.target as Node)) selectionMenu();
      else closeCmdMenu();
    };
    const onDocKeyUp = (e: KeyboardEvent): void => {
      if (e.shiftKey || e.key === "Shift") selectionMenu();
    };
    const onDocSelectionChange = (): void => {
      const sel = window.getSelection();
      const kind = cmdMenu?.dataset["kind"];
      // F-R7DEP.2-3ev (250e R7FIX.5) — the collapse close dismisses the bubble when the
      // selection is lost ELSEWHERE. A composer inside the menu (the Comment/Link input)
      // legitimately collapses the document selection by taking focus itself — the menu
      // in use is never a lost selection, so it must not close. Without the guard the
      // composer's own focus() fired this handler on open and removed the whole form —
      // T1d's missing data-comment-submit (a real REQ-WRITE-2 write-path defect, proven
      // in a live-browser repro).
      if (
        (kind === "selection" || kind === "format-bubble") &&
        (!sel || sel.isCollapsed) &&
        !(document.activeElement != null && (cmdMenu?.contains(document.activeElement) ?? false))
      )
        closeCmdMenu();
    };
    const onContextMenu = (e: MouseEvent): void => {
      const pane = (e.target as HTMLElement | null)?.closest('[data-panel-body="timeline"], [data-pane="timeline"]');
      if (!pane) return;
      e.preventDefault();
      const round = (e.target as HTMLElement).closest<HTMLElement>("[data-round]");
      const n = round?.dataset["round"];
      openCmdMenu(contextMenuItems(n != null ? Number(n) : undefined), e.clientX, e.clientY, "context");
    };

    const onCheatBackdrop = (e: MouseEvent): void => {
      const el = ide.querySelector<HTMLElement>("[data-ide-cheatsheet]");
      if (e.target === el) closeCheat();
    };

    // ---- outside-click closes the menus + any open overlay/sheet (REQ-PANE-0) ----
    const onDocClick = (e: MouseEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && ide.contains(t) && (t.closest("[data-ide-menu]") || t.closest("[aria-haspopup='menu']"))) return;
      closeMenus();
      if (!overlayOpenRef.current.panel) return;
      if (
        t &&
        (t.closest(".ide-panel") ||
          t.closest("[data-ide-panel-toggle]") ||
          t.closest("[data-ide-timeline-toggle]"))
      )
        return;
      dismissOverlays();
    };

    // ---- the §5.12 keymap dispatcher (239: g/r two-key sequences + the Rule-5 source zone) ----
    let pendingPrefix: "g" | "r" | null = null;
    let prefixTimer: ReturnType<typeof setTimeout> | undefined;
    const onKeydown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented) return;
      const action = dispatchIdeKey(
        {
          key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
        },
        focusZone(),
        pendingPrefix,
      );
      if (action?.kind === "prefix") {
        e.preventDefault();
        pendingPrefix = action.prefix;
        if (prefixTimer) clearTimeout(prefixTimer);
        prefixTimer = setTimeout(() => {
          pendingPrefix = null;
        }, 1200); // the prefix lapses — the Linear/GitHub sequence timeout
        return;
      }
      pendingPrefix = null;
      if (!action) {
        if (e.key === "Escape") {
          // REQ-PANE-0 / REQ-WRITE-4 — one Esc dismisses one layer: menus/cmdmenu/cheat first,
          // then an open overlay/sheet, then focus view itself.
          const wasBubble = cmdMenu?.dataset["kind"] === "format-bubble";
          const layeredOpen =
            cmdMenu != null ||
            cheatOpen() ||
            Array.from(ide.querySelectorAll<HTMLElement>("[data-ide-menu]")).some((m) => !m.hidden);
          closeMenus();
          closeCmdMenu();
          closeCheat();
          // REQ-WRITE-1 — Esc dismisses the format bubble and returns focus to the selection.
          if (wasBubble) focusPageSelection();
          if (layeredOpen) return;
          if (dismissOverlays()) {
            e.preventDefault();
            return;
          }
          if (stateRef.current.view === "focus") {
            e.preventDefault();
            commit({ view: "write" });
          }
        }
        return;
      }
      const { nav } = latest.current;
      switch (action.kind) {
        case "palette": {
          // REQ-KEYS-1 Rule 4 (REQ-WRITE-1) — contextual ⌘K = Link: inside the Page zone with a
          // non-collapsed selection the chord opens the link affordance, never the palette.
          // Everywhere else (and with no selection) it stays the global palette (R7SHELL.1c).
          e.preventDefault();
          if (e.key === "k" && (e.metaKey || e.ctrlKey) && focusZone() === "page" && !selectionReadOnly()) {
            const rect = pageSelectionRect();
            if (rect) {
              openFormatBubble(rect, true);
              break;
            }
          }
          window.dispatchEvent(new CustomEvent("rhema:palette-open", {
            detail: { toggle: true, ...(e.key === "/" ? { initial: "/" } : {}) },
          }));
          break;
        }
        case "pane":
          e.preventDefault();
          togglePane("panel");
          break;
        case "sidebar":
          // R7SHELL.1a (REQ-KEYS-1) — `[` toggles the AppShell sidebar; the shell listens for
          // this event (the IDE controller owns the chord while `.ide` is mounted).
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("rhema:sidebar-toggle"));
          break;
        case "focus-mode":
          e.preventDefault();
          commit({ view: stateRef.current.view === "focus" ? "write" : "focus" });
          break;
        case "paper-theme": {
          e.preventDefault();
          const next = cyclePaperTheme(
            parsePaperTheme(document.documentElement.getAttribute("data-paper") ?? "light"),
          );
          applyPaper(next);
          post(ide.dataset["paperUrl"], { paperTheme: next });
          break;
        }
        case "view-menu": {
          e.preventDefault();
          const anchor = ide.querySelector<HTMLElement>("[data-ide-view-menu]");
          if (anchor) openMenu("view", anchor);
          break;
        }
        case "sheet":
          e.preventDefault();
          // R7DEM.5 (R3 §4 row 4) — the run sheet is outside the demo allowlist; the chord is
          // inert rather than navigating to the terminal 404.
          if (isDemo()) break;
          nav.push(`/p/${slug}/run?workflow=${action.workflow}`);
          break;
        case "run-next": {
          const href = ide.dataset["runNext"];
          if (href && !isDemo()) {
            e.preventDefault();
            nav.push(href);
          }
          break;
        }
        case "goto-projects":
          e.preventDefault();
          nav.push("/app");
          break;
        case "goto-voices":
          e.preventDefault();
          nav.push("/voices");
          break;
        case "run-sheet":
          e.preventDefault();
          if (isDemo()) break;
          nav.push(`/p/${slug}/run`);
          break;
        case "inbox":
          e.preventDefault();
          nav.push("/app/inbox");
          break;
        case "settings":
          e.preventDefault();
          nav.push("/app/settings/account");
          break;
        case "version-next":
        case "version-prev": {
          e.preventDefault();
          const m = /\/v\/(\d+)/.exec(nav.pathname);
          if (m) {
            const n = Number.parseInt(m[1] ?? "1", 10) + (action.kind === "version-next" ? 1 : -1);
            // in-place version step — the island swapped the pane, never scrolled (REQ-NAVC-16).
            if (n >= 1) nav.push(nav.pathname.replace(/\/v\/\d+/, `/v/${n}`), { resetScroll: false });
          }
          break;
        }
        case "compare-previous": {
          e.preventDefault();
          const link = document.querySelector<HTMLAnchorElement>("[data-compare-previous]");
          const href = link?.getAttribute("href");
          if (href) nav.push(href);
          else
            window.dispatchEvent(new CustomEvent("rhema:palette-open", {
              detail: { initial: "/compare " },
            }));
          break;
        }
        case "triage": {
          e.preventDefault();
          if (/\/p\/[^/]+\/review\/[^/]+/.test(nav.pathname)) {
            const params = new URLSearchParams(
              nav.searchStr.startsWith("?") ? nav.searchStr.slice(1) : nav.searchStr,
            );
            if (params.get("triage") === "1") params.delete("triage");
            else params.set("triage", "1");
            const s = params.toString();
            // same-leaf search swap — the island never scrolled on a triage toggle (REQ-NAVC-16).
            nav.push(nav.pathname + (s ? `?${s}` : ""), { resetScroll: false });
          } else {
            const presentation = presentationNow();
            if (overlayMode(presentation.panel)) {
              overlayOpenRef.current = { ...overlayOpenRef.current, panel: true };
            }
            commit({ panelOpen: overlayMode(presentation.panel) ? stateRef.current.panelOpen : true, panelTab: "findings" });
            focusFinding(0);
          }
          break;
        }
        case "finding-next":
          e.preventDefault();
          focusFinding(findingIxRef.current + 1);
          break;
        case "finding-prev":
          e.preventDefault();
          focusFinding(findingIxRef.current - 1);
          break;
        case "finding-anchor-next":
        case "finding-anchor-prev": {
          e.preventDefault();
          const items = findingEls();
          const severe = items.filter((it) => {
            const sev = it.el.dataset["severity"];
            return sev === "blocking" || sev === "major";
          });
          if (severe.length === 0) break;
          const curId = items[findingIxRef.current]?.id;
          const cur = severe.findIndex((it) => it.id === curId);
          const step = action.kind === "finding-anchor-next" ? 1 : -1;
          const next = severe[(cur + step + severe.length) % severe.length];
          focusFinding(items.findIndex((it) => it.id === next!.id));
          break;
        }
        case "finding-open": {
          e.preventDefault();
          const card = findingEls()[findingIxRef.current]?.el;
          card?.querySelector<HTMLElement>("a, button")?.click();
          break;
        }
        case "finding-escape":
          e.preventDefault();
          findingIxRef.current = -1;
          (document.activeElement as HTMLElement | null)?.blur();
          closeMenus();
          break;
        case "finding-apply":
        case "finding-disposition":
          e.preventDefault();
          findingAction(action.kind === "finding-disposition" ? action.disposition : "apply");
          break;
        case "restore-point":
          e.preventDefault();
          ide.dispatchEvent(new CustomEvent("rhema:restore-point", { bubbles: true }));
          break;
        case "cheatsheet":
          e.preventDefault();
          toggleCheat();
          break;
        case "undo":
        case "redo":
          break;
        default:
          break;
      }
      if (cheatOpen() && action.kind !== "cheatsheet") closeCheat();
    };

    // ---- the app-theme "auto" live OS-change listener ----
    const mq = window.matchMedia?.("(prefers-color-scheme: light)");
    const onThemeChange = (ev: MediaQueryListEvent): void => {
      if (document.documentElement.getAttribute("data-app-theme") === "auto") {
        document.documentElement.setAttribute("data-theme", ev.matches ? "light" : "dark");
      }
    };
    mq?.addEventListener?.("change", onThemeChange);

    // ---- native hash hops (NAVC.4/REQ-NAVC-16) ----
    // A fragment click the delegated interceptor deliberately skips (`href` equal to `#…`,
    // or path+search identical to the committed location) is a NATIVE navigation: the browser
    // commits the hash and fires `hashchange`, but TanStack's location state never moves, so
    // `opts.nav.hash` stays put and the consume effect never sees it. Run the same consumer
    // here — router-committed hash hops fire `hashchange` too, and `consumeFindingHash` is
    // idempotent (re-selecting the same card re-stamps it), so the two feeds don't double-act.
    const onHashChange = (): void => {
      consumeFindingHash(window.location.hash);
    };
    window.addEventListener("hashchange", onHashChange);

    // REQ-PANE-0 — the geometry source re-derives on every resize: crossing a breakpoint
    // re-presents the panes (a docked pane becomes an overlay — still session-scoped — and an
    // overlay re-docks when the viewport allows).
    const onResize = (): void => {
      apply();
    };
    window.addEventListener("resize", onResize);

    ide.addEventListener("click", onIdeClick);
    ide.addEventListener("pointerdown", onPointerDown);
    ide.addEventListener("contextmenu", onContextMenu);
    ide.addEventListener("click", onCheatBackdrop);
    document.addEventListener("click", onDocClick);
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("mouseup", onDocMouseUp);
    document.addEventListener("keyup", onDocKeyUp);
    document.addEventListener("selectionchange", onDocSelectionChange);
    window.addEventListener("keydown", onKeydown);

    return () => {
      ide.removeEventListener("keydown", onHandleKey);
      ide.removeEventListener("click", onIdeClick);
      ide.removeEventListener("pointerdown", onPointerDown);
      ide.removeEventListener("contextmenu", onContextMenu);
      ide.removeEventListener("click", onCheatBackdrop);
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("mouseup", onDocMouseUp);
      document.removeEventListener("keyup", onDocKeyUp);
      document.removeEventListener("selectionchange", onDocSelectionChange);
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("hashchange", onHashChange);
      window.removeEventListener("resize", onResize);
      delete ide.closest<HTMLElement>(".app-shell")?.dataset["ideSidebar"];
      mq?.removeEventListener?.("change", onThemeChange);
      if (selTimer) clearTimeout(selTimer);
      closeCmdMenu();
    };
  }, [ideEl, storageKey, ready, opts.slug]);

  // ---------- the `?focus=1` deep link — applied, then stripped (never a URL mode) ----------
  // The bind effect handles the mount-time case; this effect covers a mid-life navigation that
  // lands on `?focus=1` without remounting the chrome.
  useEffect(() => {
    if (!latest.current.ready) return;
    const { nav } = latest.current;
    const params = new URLSearchParams(nav.searchStr.startsWith("?") ? nav.searchStr.slice(1) : nav.searchStr);
    if (params.get("focus") !== "1") return;
    params.delete("focus");
    commit({ view: "focus" });
    const s = params.toString();
    // `nav.hash` excludes the "#" (TanStack ParsedLocation); the strip is a `replaceState`
    // — it never scrolled on the island (REQ-NAVC-16).
    nav.replace(nav.pathname + (s ? `?${s}` : "") + (nav.hash ? `#${nav.hash}` : ""), {
      resetScroll: false,
    });
  }, [commit, opts.nav.pathname, opts.nav.searchStr, opts.nav.hash]);

  // ---------- a `#finding-<id>` deep link lights the linked selection on every surface ----------
  // (`nav.hash` excludes the "#" — the island's `window.location.hash` carried it.) The native
  // `hashchange` listener in the bind effect covers the hops that never reach this state.
  useEffect(() => {
    consumeFindingHash(opts.nav.hash);
  }, [consumeFindingHash, opts.nav.hash]);

  // ---------- re-apply when surface-published props change the SSR-side stamps ----------
  const hasFindings = opts.hasFindings;
  useEffect(() => {
    apply();
  }, [apply, hasFindings]);
}
