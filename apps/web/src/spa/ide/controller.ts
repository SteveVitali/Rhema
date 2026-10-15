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
  paneDrag,
  paneStorageKey,
  paletteModel,
  parseAppTheme,
  parsePaperTheme,
  parsePaneState,
  resolveAppTheme,
  selectionMenuItems,
  serializePaneState,
  THEME_STORAGE_KEY,
  type CommandMenuItem,
  type FocusZone,
  type PaneState,
  type PaletteData,
  type PaletteRow,
  type PaperTheme,
} from "@rhema/ide";
import { COPY } from "../../copy.js";

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
  readonly palette?: PaletteData;
  readonly paletteSearchUrl?: string;
  readonly nav: IdeChromeNav;
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
  const authorshipRef = useRef(false);
  const readerStepRef = useRef(0);
  const suggestionNodesRef = useRef<HTMLElement[]>([]);
  const findingIxRef = useRef(-1);
  const paletteHitsRef = useRef<{ label: string; path: string }[]>([]);
  const sectionLabelsRef = useRef<Record<string, string>>({});
  // REQ-UX-7 — every overlay remembers its opener; closing returns focus to it (the trigger still
  // in the DOM). The island left focus stranded on hidden rows.
  const menuTriggerRef = useRef<HTMLElement | null>(null);
  const paletteTriggerRef = useRef<HTMLElement | null>(null);
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

  const apply = useCallback((): void => {
    const ide = ideEl();
    if (!ide) return;
    const state = stateRef.current;
    const ssrMargin = latest.current.hasFindings ? "auto" : "hidden";
    ide.dataset.files = state.filesOpen ? "open" : "strip";
    ide.dataset.timeline = state.timelineOpen ? "open" : "closed";
    ide.dataset.desk = state.deskOpen ? "open" : "closed";
    ide.dataset.deskTab = state.deskTab;
    ide.dataset.view = state.view;
    if (ssrMargin !== "hidden") ide.dataset.margin = state.findingCards ? "auto" : "ticks";
    ide.toggleAttribute("data-advanced", state.advanced);
    ide.style.setProperty("--files-w", `${state.filesWidth}px`);
    ide.style.setProperty("--timeline-w", `${state.timelineWidth}px`);
    ide.style.setProperty("--desk-h", `${state.deskHeight}px`);
    ide.querySelector(".ide-timeline")?.toggleAttribute("data-open", state.timelineOpen);
    for (const b of ide.querySelectorAll<HTMLElement>("[data-ide-view]")) {
      b.setAttribute("aria-checked", String(b.dataset["ideView"] === state.view));
    }
    for (const b of ide.querySelectorAll<HTMLElement>("[data-ide-toggle]")) {
      const id = b.dataset["ideToggle"] as keyof PaneState | undefined;
      if (id && typeof state[id] === "boolean") b.setAttribute("aria-checked", String(state[id]));
    }
    for (const b of ide.querySelectorAll<HTMLElement>("[data-ide-desk-tab]")) {
      b.setAttribute("aria-selected", String(b.dataset["ideDeskTab"] === state.deskTab));
    }
    applySuggestions(state.suggestionsInline === true);
  }, [ideEl, applySuggestions]);

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

  // ---------- the ⌘K palette (§5.12; zero-POST — rows navigate or open the sheet GET) ----------
  const paletteEl = useCallback(
    () => ideEl()?.querySelector<HTMLElement>("[data-ide-palette]") ?? null,
    [ideEl],
  );
  const paletteQRef = useRef("");
  const paletteActiveRef = useRef(0);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const paletteData = useCallback((): PaletteData => {
    const data = latest.current.palette;
    return data ? { ...data, projectSlug: latest.current.slug } : { projectSlug: latest.current.slug };
  }, []);

  const flatPaletteRows = useCallback((): PaletteRow[] => {
    const model = paletteModel(paletteData(), paletteQRef.current);
    const rows = model.sections.flatMap((s) => s.rows);
    return [
      ...rows,
      ...paletteHitsRef.current.map((h, i) => ({
        id: `hit:${i}`,
        label: h.label,
        action: { kind: "navigate", path: h.path } as const,
      })),
    ];
  }, [paletteData]);

  const renderPalette = useCallback((): void => {
    const el = paletteEl();
    const results = el?.querySelector<HTMLElement>("[data-palette-results]");
    const empty = el?.querySelector<HTMLElement>("[data-palette-empty]");
    if (!results) return;
    const model = paletteModel(paletteData(), paletteQRef.current);
    results.textContent = "";
    if (model.commandRow) {
      const c = model.commandRow;
      const box = document.createElement("div");
      box.className = `ide-pal-command${c.ok ? "" : " err"}`;
      const chips = document.createElement("div");
      chips.className = "ide-pal-chips";
      for (const text of c.chips) {
        const chip = document.createElement("span");
        chip.className = "ide-pal-chip";
        chip.textContent = text;
        chips.appendChild(chip);
      }
      if (c.ok && chips.childElementCount === 0) {
        const chip = document.createElement("span");
        chip.className = "ide-pal-chip";
        chip.textContent = c.raw;
        chips.appendChild(chip);
      }
      box.appendChild(chips);
      if (!c.ok) {
        const err = document.createElement("p");
        err.className = "ide-pal-error";
        err.textContent = c.suggestions?.length
          ? `${c.error ?? ""} Try: ${c.suggestions.join(", ")}`
          : (c.error ?? "");
        box.appendChild(err);
      } else if (c.resolution?.kind === "disabled") {
        const err = document.createElement("p");
        err.className = "ide-pal-error";
        err.textContent = c.resolution.reason;
        box.appendChild(err);
      }
      results.appendChild(box);
      empty?.setAttribute("hidden", "");
      return;
    }
    let i = 0;
    const activate = (index: number): void => {
      const row = flatPaletteRows()[index];
      if (!row) return;
      if (row.action.kind === "sheet" || row.action.kind === "navigate") {
        // every activation is a GET-side navigation — the palette never launches a run.
        closePalette();
        latest.current.nav.push(row.action.path);
      }
      // disabled rows sit inert — their reason is the row's hint
    };
    const renderRow = (row: PaletteRow, hostEl: HTMLElement): void => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ide-pal-row";
      b.toggleAttribute("data-active", i === paletteActiveRef.current);
      b.setAttribute("role", "option");
      const label = document.createElement("span");
      label.textContent = row.label;
      b.appendChild(label);
      if (row.pinned) {
        const pin = document.createElement("span");
        pin.className = "ide-pal-pinned";
        pin.textContent = COPY.ide.palette.nextStep;
        b.appendChild(pin);
      }
      if (row.action.kind === "disabled") {
        b.toggleAttribute("data-disabled", true);
        b.setAttribute("aria-disabled", "true");
        const hint = document.createElement("span");
        hint.className = "ide-pal-hint";
        hint.textContent = row.action.reason;
        b.appendChild(hint);
      } else if (row.hint) {
        const hint = document.createElement("span");
        hint.className = "ide-pal-hint";
        hint.textContent = row.hint;
        b.appendChild(hint);
      }
      const index = i;
      b.addEventListener("click", () => activate(index));
      hostEl.appendChild(b);
      i += 1;
    };
    for (const section of model.sections) {
      const sec = document.createElement("div");
      const cap = document.createElement("p");
      cap.className = "ide-pal-section";
      cap.textContent = sectionLabelsRef.current[section.key] ?? section.label;
      sec.appendChild(cap);
      for (const row of section.rows) renderRow(row, sec);
      results.appendChild(sec);
    }
    if (paletteHitsRef.current.length > 0) {
      const sec = document.createElement("div");
      const cap = document.createElement("p");
      cap.className = "ide-pal-section";
      cap.textContent = sectionLabelsRef.current["goto"] ?? "Go to";
      sec.appendChild(cap);
      for (const h of paletteHitsRef.current)
        renderRow({ id: "", label: h.label, action: { kind: "navigate", path: h.path } }, sec);
      results.appendChild(sec);
    }
    const total = flatPaletteRows().length;
    if (paletteActiveRef.current >= total) paletteActiveRef.current = Math.max(0, total - 1);
    if (empty) empty.hidden = total > 0;
    results.querySelector<HTMLElement>(".ide-pal-row[data-active]")?.scrollIntoView({ block: "nearest" });
  }, [paletteEl, paletteData, flatPaletteRows]);

  const closePalette = useCallback((): void => {
    const el = paletteEl();
    if (el) el.hidden = true;
    el?.querySelector<HTMLInputElement>("[data-palette-input]")?.blur();
    const trig = paletteTriggerRef.current;
    paletteTriggerRef.current = null;
    const active = document.activeElement;
    if (trig?.isConnected && (active === document.body || (el != null && el.contains(active)))) {
      trig.focus();
    }
  }, [paletteEl]);

  const openPalette = useCallback(
    (initial = ""): void => {
      const el = paletteEl();
      if (!el) return;
      paletteTriggerRef.current = document.activeElement as HTMLElement | null;
      paletteQRef.current = initial;
      paletteActiveRef.current = 0;
      paletteHitsRef.current = [];
      el.hidden = false;
      const input = el.querySelector<HTMLInputElement>("[data-palette-input]");
      if (input) {
        input.value = initial;
        input.focus();
        input.setSelectionRange(initial.length, initial.length);
      }
      renderPalette();
    },
    [paletteEl, renderPalette],
  );
  const paletteOpen = useCallback((): boolean => {
    const el = paletteEl();
    return el != null && !el.hidden;
  }, [paletteEl]);

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
    if (el.closest("[data-ide-palette]") || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return "input";
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
    try {
      stateRef.current = parsePaneState(localStorage.getItem(storageKey));
    } catch {
      stateRef.current = { ...DEFAULT_PANE_STATE };
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

    // section labels ride the IdeShell embed — the island read them the same way.
    const palette = ide.querySelector<HTMLElement>("[data-ide-palette]");
    try {
      sectionLabelsRef.current = JSON.parse(palette?.dataset["paletteSections"] ?? "{}") as Record<string, string>;
    } catch {
      sectionLabelsRef.current = {};
    }
    const paletteSearchUrl = latest.current.paletteSearchUrl ?? `/p/${slug}/palette-search`;

    // ---- delegated clicks (React owns the DOM — delegation survives inner re-renders) ----
    const onIdeClick = (e: MouseEvent): void => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      if (t.closest("[data-ide-files-toggle]")) {
        e.preventDefault();
        commit({ filesOpen: !stateRef.current.filesOpen });
        return;
      }
      if (t.closest("[data-ide-timeline-toggle]")) {
        e.preventDefault();
        commit({ timelineOpen: !stateRef.current.timelineOpen });
        return;
      }
      if (t.closest("[data-ide-desk-toggle]")) {
        e.preventDefault();
        commit({ deskOpen: !stateRef.current.deskOpen });
        return;
      }
      const deskTab = t.closest<HTMLElement>("[data-ide-desk-tab]");
      if (deskTab) {
        commit({ deskTab: deskTab.dataset["ideDeskTab"] as PaneState["deskTab"], deskOpen: true });
        return;
      }
      // a run card's "Live feed" action opens the Desk on the feed tab.
      if (t.closest("[data-ide-open-feed]")) {
        e.preventDefault();
        commit({ deskTab: "feed", deskOpen: true });
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
      const pane = handle.dataset["ideHandle"] as "files" | "timeline";
      handle.setPointerCapture(e.pointerId);
      const onMove = (ev: PointerEvent) => {
        const rect = ide.getBoundingClientRect();
        const px = pane === "files" ? ev.clientX - rect.left - 56 : rect.right - ev.clientX;
        ide.style.setProperty(pane === "files" ? "--files-w" : "--timeline-w", `${Math.max(0, px)}px`);
      };
      const onUp = (ev: PointerEvent) => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        const rect = ide.getBoundingClientRect();
        const px = pane === "files" ? ev.clientX - rect.left - 56 : rect.right - ev.clientX;
        commit(paneDrag(stateRef.current, pane, px, window.innerWidth));
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    };

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
              commit({ deskOpen: true, deskTab: "chat" });
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
    let selTimer: ReturnType<typeof setTimeout> | undefined;
    const selectionMenu = (): void => {
      if (selTimer) clearTimeout(selTimer);
      selTimer = setTimeout(() => {
        const sel = window.getSelection();
        if (!sel || sel.isCollapsed || sel.rangeCount === 0 || !pagePane) return;
        const range = sel.getRangeAt(0);
        if (!pagePane.contains(range.commonAncestorContainer)) return;
        const rect = range.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;
        openCmdMenu(selectionMenuItems(), rect.left + rect.width / 2, rect.bottom + 8, "selection");
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
      if (cmdMenu?.dataset["kind"] === "selection" && (!sel || sel.isCollapsed)) closeCmdMenu();
    };
    const onContextMenu = (e: MouseEvent): void => {
      const pane = (e.target as HTMLElement | null)?.closest('[data-pane="timeline"]');
      if (!pane) return;
      e.preventDefault();
      const round = (e.target as HTMLElement).closest<HTMLElement>("[data-round]");
      const n = round?.dataset["round"];
      openCmdMenu(contextMenuItems(n != null ? Number(n) : undefined), e.clientX, e.clientY, "context");
    };

    // ---- palette input listeners ----
    const paletteInput = palette?.querySelector<HTMLInputElement>("[data-palette-input]");
    const onPaletteInput = (): void => {
      if (!paletteInput) return;
      paletteQRef.current = paletteInput.value;
      paletteActiveRef.current = 0;
      renderPalette();
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      const q = paletteQRef.current.trim();
      if (q && !q.startsWith("/") && paletteSearchUrl) {
        searchTimerRef.current = setTimeout(() => {
          void fetch(`${paletteSearchUrl}?q=${encodeURIComponent(q)}`, { credentials: "same-origin" })
            .then((r) => (r.ok ? r.json() : { results: [] }))
            .then((body: { results?: { label: string; path: string }[] }) => {
              paletteHitsRef.current = body.results ?? [];
              renderPalette();
            })
            .catch(() => undefined);
        }, 180);
      } else if (paletteHitsRef.current.length > 0) {
        paletteHitsRef.current = [];
        renderPalette();
      }
    };
    const onPaletteKeydown = (e: KeyboardEvent): void => {
      const rows = flatPaletteRows();
      if (e.key === "ArrowDown") {
        e.preventDefault();
        paletteActiveRef.current = Math.min(rows.length - 1, paletteActiveRef.current + 1);
        renderPalette();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        paletteActiveRef.current = Math.max(0, paletteActiveRef.current - 1);
        renderPalette();
      } else if (e.key === "Enter") {
        e.preventDefault();
        const model = paletteModel(paletteData(), paletteQRef.current);
        if (model.mode === "command") {
          const r = model.commandRow?.resolution;
          if (r && (r.kind === "sheet" || r.kind === "navigate")) {
            closePalette();
            latest.current.nav.push(r.path);
          }
        } else {
          const row = flatPaletteRows()[paletteActiveRef.current];
          if (row && (row.action.kind === "sheet" || row.action.kind === "navigate")) {
            closePalette();
            latest.current.nav.push(row.action.path);
          }
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closePalette();
      }
    };
    const onPaletteBackdrop = (e: MouseEvent): void => {
      if (e.target === palette) closePalette();
    };
    const onCheatBackdrop = (e: MouseEvent): void => {
      const el = ide.querySelector<HTMLElement>("[data-ide-cheatsheet]");
      if (e.target === el) closeCheat();
    };

    // ---- outside-click closes the menus ----
    const onDocClick = (e: MouseEvent): void => {
      const t = e.target as HTMLElement | null;
      if (t && ide.contains(t) && (t.closest("[data-ide-menu]") || t.closest("[aria-haspopup='menu']"))) return;
      closeMenus();
    };

    // ---- the §5.12 keymap dispatcher ----
    const onKeydown = (e: KeyboardEvent): void => {
      if (paletteOpen()) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          closePalette();
        } else if (e.key === "Escape") {
          e.preventDefault();
          closePalette();
        }
        return;
      }
      const action = dispatchIdeKey(
        {
          key: e.key.length === 1 ? e.key.toLowerCase() : e.key,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
        },
        focusZone(),
      );
      if (!action) {
        if (e.key === "Escape") {
          closeMenus();
          closeCmdMenu();
          closeCheat();
        }
        return;
      }
      const { nav } = latest.current;
      switch (action.kind) {
        case "palette":
          e.preventDefault();
          openPalette(e.key === "/" ? "/" : "");
          break;
        case "pane":
          e.preventDefault();
          if (action.pane === "files") commit({ filesOpen: !stateRef.current.filesOpen });
          else if (action.pane === "timeline") commit({ timelineOpen: !stateRef.current.timelineOpen });
          else commit({ deskOpen: !stateRef.current.deskOpen });
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
          nav.push(`/p/${slug}/run?workflow=${action.workflow}`);
          break;
        case "run-next": {
          const href = ide.dataset["runNext"];
          if (href) {
            e.preventDefault();
            nav.push(href);
          }
          break;
        }
        case "goto-approval":
          e.preventDefault();
          nav.push(`/p/${slug}`);
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
          else openPalette("/compare ");
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
            if (!stateRef.current.deskOpen) commit({ deskOpen: true, deskTab: "findings" });
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

    ide.addEventListener("click", onIdeClick);
    ide.addEventListener("pointerdown", onPointerDown);
    ide.addEventListener("contextmenu", onContextMenu);
    ide.addEventListener("click", onCheatBackdrop);
    palette?.addEventListener("click", onPaletteBackdrop);
    paletteInput?.addEventListener("input", onPaletteInput);
    paletteInput?.addEventListener("keydown", onPaletteKeydown);
    document.addEventListener("click", onDocClick);
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("mouseup", onDocMouseUp);
    document.addEventListener("keyup", onDocKeyUp);
    document.addEventListener("selectionchange", onDocSelectionChange);
    window.addEventListener("keydown", onKeydown);

    return () => {
      ide.removeEventListener("click", onIdeClick);
      ide.removeEventListener("pointerdown", onPointerDown);
      ide.removeEventListener("contextmenu", onContextMenu);
      ide.removeEventListener("click", onCheatBackdrop);
      palette?.removeEventListener("click", onPaletteBackdrop);
      paletteInput?.removeEventListener("input", onPaletteInput);
      paletteInput?.removeEventListener("keydown", onPaletteKeydown);
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("mouseup", onDocMouseUp);
      document.removeEventListener("keyup", onDocKeyUp);
      document.removeEventListener("selectionchange", onDocSelectionChange);
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("hashchange", onHashChange);
      mq?.removeEventListener?.("change", onThemeChange);
      if (selTimer) clearTimeout(selTimer);
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
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
