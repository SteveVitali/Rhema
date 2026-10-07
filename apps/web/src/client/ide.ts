// The IDE client island (P1.01; REQ-IDE-8/9/38/39). Same convention as the landed editor island
// (editor.ts): the SSR document renders the full §5.1 shell markup with data-* state; this bundle
// enhances it — pane toggles + drags persist to localStorage (per user × project, NEVER the URL), the
// View/theme menus are attribute-driven, ⌘1/⌘2/⌘J/⌘⇧F/⌘⇧M/⌘⇧L bind globally, and theme writes POST to
// the same-origin web routes (the web server forwards the session to the api — the bundle never sees a
// credential, and no protocol/eval text may reach it, REQ-ARCH-33). `?focus=1` is the ONE shareable pane
// URL flag: applied, then stripped from the address bar.

import { parseCommand, resolveCommand } from "@rhema/commands";
import {
  DEFAULT_PANE_STATE,
  contextMenuItems,
  cyclePaperTheme,
  feedRowVisible,
  formatFeedRow,
  paneDrag,
  paneStorageKey,
  parseAppTheme,
  parsePaperTheme,
  parsePaneState,
  resolveAppTheme,
  selectionMenuItems,
  serializePaneState,
  THEME_STORAGE_KEY,
  dispatchIdeKey,
  paletteModel,
  type CommandMenuItem,
  type FeedDensityTab,
  type FeedLabelMaps,
  type FocusZone,
  type PaneState,
  type PaletteData,
  type PaletteRow,
  type PaperTheme,
} from "@rhema/ide";

const FONT_KEY = "rhema:font:v1";
const STEP_KEY = "rhema:reader-step:v1";

function main(): void {
  const ide = document.querySelector<HTMLElement>("[data-ide]");
  if (!ide) return;
  const doc = document.documentElement;
  const slug = ide.dataset["project"] ?? "";
  const userId = ide.dataset["user"] ?? "local";
  const projectId = ide.dataset["projectId"] ?? slug;
  const storageKey = paneStorageKey(userId, projectId);

  // ---- state: stored arrangement wins; ?focus=1 overrides it ONCE and is stripped (never a URL mode). ----
  let state: PaneState;
  try {
    state = parsePaneState(localStorage.getItem(storageKey));
  } catch {
    state = { ...DEFAULT_PANE_STATE };
  }
  const ssrMargin = ide.dataset["margin"] ?? "auto";
  const initialView = ide.dataset["view"];
  if (initialView === "focus") state = { ...state, view: "focus" };
  try {
    const url = new URL(window.location.href);
    if (url.searchParams.get("focus") === "1") {
      state = { ...state, view: "focus" };
      url.searchParams.delete("focus");
      window.history.replaceState(null, "", url.toString());
    }
  } catch {
    /* non-navigable context (tests) */
  }

  function apply(): void {
    if (!ide) return;
    ide.dataset["files"] = state.filesOpen ? "open" : "strip";
    ide.dataset["timeline"] = state.timelineOpen ? "open" : "closed";
    ide.dataset["desk"] = state.deskOpen ? "open" : "closed";
    ide.dataset["deskTab"] = state.deskTab;
    ide.dataset["view"] = state.view;
    if (ssrMargin !== "hidden") {
      ide.dataset["margin"] = state.findingCards ? "auto" : "ticks";
    }
    if (state.advanced) ide.dataset["advanced"] = "1";
    else delete ide.dataset["advanced"];
    ide.style.setProperty("--files-w", `${state.filesWidth}px`);
    ide.style.setProperty("--timeline-w", `${state.timelineWidth}px`);
    ide.style.setProperty("--desk-h", `${state.deskHeight}px`);
    // timeline element mirrors the open intent for the overlay/sheet selectors
    ide.querySelector(".ide-timeline")?.toggleAttribute("data-open", state.timelineOpen);
    // aria-checked mirrors on the menu radios/checkboxes
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
  }

  // ---- P1.07 — View › Show suggestions inline (§5.7): a suggestion-bearing finding's replacement
  // renders as a read-only preview beside the passage. The Page's finding spans carry
  // `data-suggestion-replacement`; the preview is a DOM-only insert — the document bytes never change
  // (Apply owns the write). ----
  const suggestionNodes: HTMLElement[] = [];
  function applySuggestions(on: boolean): void {
    if (!ide) return;
    for (const n of suggestionNodes) n.remove();
    suggestionNodes.length = 0;
    for (const span of ide.querySelectorAll<HTMLElement>(".rm-finding[data-suggestion-replacement]")) {
      span.classList.toggle("rm-suggestion-preview", on);
      if (on) {
        const ins = document.createElement("span");
        ins.className = "rm-suggestion-replacement";
        ins.setAttribute("aria-hidden", "true");
        ins.textContent = ` ${span.dataset["suggestionReplacement"] ?? ""}`;
        span.insertAdjacentElement("afterend", ins);
        suggestionNodes.push(ins);
      }
    }
  }

  function setState(next: Partial<PaneState>): void {
    state = { ...state, ...next };
    apply();
    try {
      localStorage.setItem(storageKey, serializePaneState(state));
    } catch {
      /* private mode — arrangement falls back to session-only */
    }
  }

  // ---- pane toggles ------------------------------------------------
  const on = (sel: string, fn: () => void) => {
    ide.querySelectorAll<HTMLElement>(sel).forEach((el) =>
      el.addEventListener("click", (e) => {
        e.preventDefault();
        fn();
      }),
    );
  };
  on("[data-ide-files-toggle]", () => setState({ filesOpen: !state.filesOpen }));
  on("[data-ide-timeline-toggle]", () => setState({ timelineOpen: !state.timelineOpen }));
  on("[data-ide-desk-toggle]", () => setState({ deskOpen: !state.deskOpen }));
  ide.querySelectorAll<HTMLElement>("[data-ide-desk-tab]").forEach((el) =>
    el.addEventListener("click", () => {
      const tab = el.dataset["ideDeskTab"] as PaneState["deskTab"];
      setState({ deskTab: tab, deskOpen: true });
    }),
  );

  // P1.05 — a run card's "Live feed" action opens the Desk on the feed tab (the same affordance the
  // desk's own tab buttons use).
  ide.querySelectorAll<HTMLElement>("[data-ide-open-feed]").forEach((el) =>
    el.addEventListener("click", (e) => {
      e.preventDefault();
      setState({ deskTab: "feed", deskOpen: true });
    }),
  );

  // ---- menus (View + Theme) ------------------------------------------
  const menus = new Map<string, HTMLElement>();
  for (const m of ide.querySelectorAll<HTMLElement>("[data-ide-menu]")) {
    menus.set(m.dataset["ideMenu"] ?? "", m);
  }
  function closeMenus(): void {
    for (const m of menus.values()) m.hidden = true;
    for (const t of ide?.querySelectorAll<HTMLElement>("[aria-haspopup='menu']") ?? []) {
      t.setAttribute("aria-expanded", "false");
    }
  }
  function openMenu(name: string, anchor: HTMLElement): void {
    const m = menus.get(name);
    if (!m) return;
    const wasOpen = !m.hidden;
    closeMenus();
    if (wasOpen) return;
    m.hidden = false;
    anchor.setAttribute("aria-expanded", "true");
    // position beside the anchor (rail bottom / status bar right)
    const r = anchor.getBoundingClientRect();
    m.style.left = `${Math.min(r.left, window.innerWidth - 240)}px`;
    m.style.bottom = `${Math.max(8, window.innerHeight - r.top + 6)}px`;
    m.style.top = "auto";
    m.querySelector<HTMLElement>("[role='menuitemradio'], .ide-menu-row")?.focus();
  }
  ide.querySelector<HTMLElement>("[data-ide-view-menu]")?.addEventListener("click", (e) => {
    e.preventDefault();
    openMenu("view", e.currentTarget as HTMLElement);
  });
  ide.querySelector<HTMLElement>("[data-ide-theme-menu]")?.addEventListener("click", (e) => {
    e.preventDefault();
    openMenu("theme", e.currentTarget as HTMLElement);
  });
  document.addEventListener("click", (e) => {
    const t = e.target as HTMLElement | null;
    if (t && ide.contains(t) && (t.closest("[data-ide-menu]") || t.closest("[aria-haspopup='menu']"))) return;
    closeMenus();
  });

  // ---- view modes + toggles -------------------------------------------
  ide.querySelectorAll<HTMLElement>("[data-ide-view]").forEach((el) =>
    el.addEventListener("click", () => {
      setState({ view: el.dataset["ideView"] as PaneState["view"] });
      closeMenus();
    }),
  );

  // P1.02 — the Authorship overlay toggle: read-only decorations over the Page's blocks (NOT pane
  // state — it persists on its own key and the page.js island listens for the change event).
  const AUTHORSHIP_KEY = `rhema:authorship:v1:${projectId}`;
  let authorship = false;
  try {
    authorship = localStorage.getItem(AUTHORSHIP_KEY) === "1";
  } catch {
    /* private mode — session-only */
  }
  const applyAuthorship = (): void => {
    if (authorship) ide.dataset["authorship"] = "1";
    else delete ide.dataset["authorship"];
    for (const b of ide.querySelectorAll<HTMLElement>('[data-ide-toggle="authorship"]')) {
      b.setAttribute("aria-checked", String(authorship));
    }
    window.dispatchEvent(new CustomEvent("rhema:authorship", { detail: { on: authorship } }));
  };
  ide.querySelectorAll<HTMLElement>("[data-ide-toggle]").forEach((el) =>
    el.addEventListener("click", () => {
      const id = el.dataset["ideToggle"] as keyof PaneState | "authorship";
      if (id === "findingCards" || id === "suggestionsInline" || id === "advanced") {
        setState({ [id]: !state[id] } as Partial<PaneState>);
      } else if (id === "authorship") {
        authorship = !authorship;
        try {
          localStorage.setItem(AUTHORSHIP_KEY, authorship ? "1" : "0");
        } catch {
          /* ignore */
        }
        applyAuthorship();
      }
      closeMenus();
    }),
  );
  applyAuthorship();

  // ---- typography: font preset + reader stepper (localStorage-backed) --
  let readerStep = 0;
  try {
    readerStep = Math.min(3, Math.max(0, parseInt(localStorage.getItem(STEP_KEY) ?? "0", 10) || 0));
  } catch {
    /* ignore */
  }
  function applyFont(): void {
    const sans = doc.getAttribute("data-font") === "sans";
    const base = sans ? 16 : 17;
    doc.style.setProperty("--paper-size", `${base + 2 * readerStep}px`);
    for (const b of ide?.querySelectorAll<HTMLElement>("[data-ide-font]") ?? []) {
      b.setAttribute("aria-checked", String((b.dataset["ideFont"] === "sans") === sans));
    }
  }
  ide.querySelectorAll<HTMLElement>("[data-ide-font]").forEach((el) =>
    el.addEventListener("click", () => {
      const sans = el.dataset["ideFont"] === "sans";
      if (sans) doc.setAttribute("data-font", "sans");
      else doc.removeAttribute("data-font");
      try {
        localStorage.setItem(FONT_KEY, sans ? "sans" : "serif");
      } catch {
        /* ignore */
      }
      applyFont();
      closeMenus();
    }),
  );
  ide.querySelectorAll<HTMLElement>("[data-ide-reader]").forEach((el) =>
    el.addEventListener("click", () => {
      readerStep = Math.min(3, Math.max(0, readerStep + (el.dataset["ideReader"] === "up" ? 1 : -1)));
      try {
        localStorage.setItem(STEP_KEY, String(readerStep));
      } catch {
        /* ignore */
      }
      applyFont();
    }),
  );
  applyFont();

  // ---- theme writes (POST the same-origin web routes; the api is the store) ----
  function applyAppTheme(pref: string): void {
    const resolved = resolveAppTheme(parseAppTheme(pref), window.matchMedia?.("(prefers-color-scheme: light)").matches ?? false);
    doc.setAttribute("data-app-theme", pref);
    doc.setAttribute("data-theme", resolved);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, pref);
    } catch {
      /* ignore */
    }
  }
  function applyPaper(policy: PaperTheme): void {
    doc.setAttribute("data-paper", policy);
    try {
      localStorage.setItem(`rhema:paper:v1:${slug}`, policy);
    } catch {
      /* ignore */
    }
    for (const b of ide?.querySelectorAll<HTMLElement>("[data-ide-paper]") ?? []) {
      b.setAttribute("aria-checked", String(b.dataset["idePaper"] === policy));
    }
  }
  function post(url: string | undefined, body: Record<string, string>): void {
    if (!url) return;
    void fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    }).catch(() => undefined);
  }
  ide.querySelectorAll<HTMLElement>("[data-ide-theme]").forEach((el) =>
    el.addEventListener("click", () => {
      const pref = el.dataset["ideTheme"] ?? "dark";
      applyAppTheme(pref);
      post(ide.dataset["themeUrl"], { appTheme: pref });
      closeMenus();
    }),
  );
  ide.querySelectorAll<HTMLElement>("[data-ide-paper]").forEach((el) =>
    el.addEventListener("click", () => {
      const p = parsePaperTheme(el.dataset["idePaper"]);
      applyPaper(p);
      post(ide.dataset["paperUrl"], { paperTheme: p });
      closeMenus();
    }),
  );

  // ---- drag handles: live width preview + the collapse-on-violate commit (REQ-IDE-9) ----
  for (const handle of ide.querySelectorAll<HTMLElement>("[data-ide-handle]")) {
    const pane = handle.dataset["ideHandle"] as "files" | "timeline";
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
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
        setState(paneDrag(state, pane, px, window.innerWidth));
      };
      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
    });
  }

  // ---- P1.06 — the ⌘K palette + the `?` cheat sheet (§5.12; REQ-IDE-49, REQ-CHAT-24/28) ----
  // SSR emitted the skeleton + the embedded PaletteData JSON; the island owns open/close, filtering,
  // the /-command structured row, keyboard navigation, and the search-hit section. EVERY activation
  // is a navigation (a sheet GET or a path) — the palette never launches a run.
  const paletteEl = ide.querySelector<HTMLElement>("[data-ide-palette]");
  const paletteInput = paletteEl?.querySelector<HTMLInputElement>("[data-palette-input]");
  const paletteResults = paletteEl?.querySelector<HTMLElement>("[data-palette-results]");
  const paletteEmpty = paletteEl?.querySelector<HTMLElement>("[data-palette-empty]");
  const cheatEl = ide.querySelector<HTMLElement>("[data-ide-cheatsheet]");
  let paletteData: PaletteData = { projectSlug: slug };
  try {
    if (paletteEl?.dataset["palette"]) {
      paletteData = { ...paletteData, ...(JSON.parse(paletteEl.dataset["palette"]) as PaletteData) };
    }
  } catch {
    /* malformed embedded JSON → the bare palette still works */
  }
  let sectionLabels: Record<string, string> = {};
  try {
    sectionLabels = JSON.parse(paletteEl?.dataset["paletteSections"] ?? "{}") as Record<string, string>;
  } catch {
    /* fall back to the model's own labels */
  }
  const paletteSearchUrl = paletteEl?.dataset["paletteSearch"] ?? "";
  let paletteQ = "";
  let paletteActive = 0;
  let searchHits: { label: string; path: string }[] = [];
  let searchTimer: ReturnType<typeof setTimeout> | undefined;

  /** The flat row order ↑/↓ and Enter walk — model sections, then the fetched doc hits. */
  function flatPaletteRows(): PaletteRow[] {
    const model = paletteModel(paletteData, paletteQ);
    const rows = model.sections.flatMap((s) => s.rows);
    return [
      ...rows,
      ...searchHits.map((h, i) => ({
        id: `hit:${i}`,
        label: h.label,
        action: { kind: "navigate", path: h.path } as const,
      })),
    ];
  }

  function renderPalette(): void {
    if (!paletteResults) return;
    const model = paletteModel(paletteData, paletteQ);
    paletteResults.textContent = "";
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
      paletteResults.appendChild(box);
      paletteEmpty?.setAttribute("hidden", "");
      return;
    }
    let i = 0;
    const renderRow = (row: PaletteRow, host: HTMLElement): void => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ide-pal-row";
      if (i === paletteActive) b.dataset["active"] = "";
      b.dataset["paletteIndex"] = String(i);
      b.setAttribute("role", "option");
      const label = document.createElement("span");
      label.textContent = row.label;
      b.appendChild(label);
      if (row.pinned) {
        const pin = document.createElement("span");
        pin.className = "ide-pal-pinned";
        pin.textContent = "next step";
        b.appendChild(pin);
      }
      if (row.action.kind === "disabled") {
        b.dataset["disabled"] = "";
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
      b.addEventListener("click", () => activatePaletteRow(index));
      host.appendChild(b);
      i += 1;
    };
    for (const section of model.sections) {
      const sec = document.createElement("div");
      const cap = document.createElement("p");
      cap.className = "ide-pal-section";
      cap.textContent = sectionLabels[section.key] ?? section.label;
      sec.appendChild(cap);
      for (const row of section.rows) renderRow(row, sec);
      paletteResults.appendChild(sec);
    }
    if (searchHits.length > 0) {
      const sec = document.createElement("div");
      const cap = document.createElement("p");
      cap.className = "ide-pal-section";
      cap.textContent = sectionLabels["goto"] ?? "Go to";
      sec.appendChild(cap);
      for (const h of searchHits) renderRow({ id: "", label: h.label, action: { kind: "navigate", path: h.path } }, sec);
      paletteResults.appendChild(sec);
    }
    const total = flatPaletteRows().length;
    if (paletteActive >= total) paletteActive = Math.max(0, total - 1);
    if (paletteEmpty) paletteEmpty.hidden = total > 0;
    paletteResults.querySelector<HTMLElement>(".ide-pal-row[data-active]")?.scrollIntoView({ block: "nearest" });
  }

  function activatePaletteRow(index: number): void {
    const row = flatPaletteRows()[index];
    if (!row) return;
    if (row.action.kind === "sheet" || row.action.kind === "navigate") {
      window.location.assign(row.action.path); // GET only — the sheet owns the launch POST
    }
    // disabled rows sit inert — their reason is the row's hint
  }

  function openPalette(initial = ""): void {
    if (!paletteEl) return;
    closeCmdMenu();
    paletteQ = initial;
    paletteActive = 0;
    searchHits = [];
    paletteEl.hidden = false;
    if (paletteInput) {
      paletteInput.value = initial;
      paletteInput.focus();
      paletteInput.setSelectionRange(initial.length, initial.length);
    }
    renderPalette();
  }
  function closePalette(): void {
    if (paletteEl) paletteEl.hidden = true;
    paletteInput?.blur();
  }
  const paletteOpen = (): boolean => paletteEl != null && !paletteEl.hidden;

  paletteEl?.addEventListener("click", (e) => {
    if (e.target === paletteEl) closePalette(); // backdrop click closes
  });
  paletteInput?.addEventListener("input", () => {
    paletteQ = paletteInput.value;
    paletteActive = 0;
    renderPalette();
    // free-text (non-command) queries also hit the doc search — debounced, same-origin.
    if (searchTimer) clearTimeout(searchTimer);
    const q = paletteQ.trim();
    if (q && !q.startsWith("/") && paletteSearchUrl) {
      searchTimer = setTimeout(() => {
        fetch(`${paletteSearchUrl}?q=${encodeURIComponent(q)}`, { credentials: "same-origin" })
          .then((r) => (r.ok ? r.json() : { results: [] }))
          .then((body: { results?: { label: string; path: string }[] }) => {
            searchHits = body.results ?? [];
            renderPalette();
          })
          .catch(() => undefined);
      }, 180);
    } else if (searchHits.length > 0) {
      searchHits = [];
      renderPalette();
    }
  });
  paletteInput?.addEventListener("keydown", (e) => {
    const rows = flatPaletteRows();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      paletteActive = Math.min(rows.length - 1, paletteActive + 1);
      renderPalette();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      paletteActive = Math.max(0, paletteActive - 1);
      renderPalette();
    } else if (e.key === "Enter") {
      e.preventDefault();
      const model = paletteModel(paletteData, paletteQ);
      if (model.mode === "command") {
        const r = model.commandRow?.resolution;
        if (r && (r.kind === "sheet" || r.kind === "navigate")) window.location.assign(r.path);
      } else {
        activatePaletteRow(paletteActive);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closePalette();
    }
  });
  ide.querySelector<HTMLElement>("[data-ide-cheatsheet-close]")?.addEventListener("click", () => {
    if (cheatEl) cheatEl.hidden = true;
  });
  cheatEl?.addEventListener("click", (e) => {
    if (e.target === cheatEl) cheatEl.hidden = true;
  });
  const toggleCheat = (): void => {
    if (cheatEl) cheatEl.hidden = !cheatEl.hidden;
  };
  const cheatOpen = (): boolean => cheatEl != null && !cheatEl.hidden;

  // ---- findings focus (§5.12's inert-while-typing chords + §5.7's linked selection): the finding
  // cursor walks the ONE finding list — Margin cards AND Desk rows dedupe by finding id (the Margin
  // card wins the focus since it carries the controls). J/K walk, ⌥J/⌥K hop major-or-blocking, Enter
  // opens, Esc releases, P applies, A D R F E write dispositions — all inert while the caret is in the
  // Page (the dispatcher enforces the zone). ----
  interface FindingEl { id: string; el: HTMLElement }
  const findingEls = (): FindingEl[] => {
    const seen = new Set<string>();
    const out: FindingEl[] = [];
    for (const el of ide.querySelectorAll<HTMLElement>("[data-margin-card], [data-desk-row], .ide-fcard")) {
      const id = el.dataset["findingId"] ?? el.dataset["deskRow"] ?? "";
      if (id === "" || seen.has(id)) continue;
      seen.add(id);
      out.push({ id, el });
    }
    return out;
  };
  const fcards = (): HTMLElement[] => findingEls().map((f) => f.el);
  let findingIx = -1;

  /** §5.7 linked selection — one finding id lights up on every surface at once (Margin card, Desk
   *  row, the Page's underline span) and its passage scrolls into view. */
  function selectFinding(id: string): void {
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
  }

  function focusFinding(ix: number): void {
    const items = findingEls();
    if (items.length === 0) return;
    findingIx = Math.max(0, Math.min(items.length - 1, ix));
    const item = items[findingIx];
    if (!item) return;
    // a card inside a crowded-paragraph chip expands the stack on focus (§5.7 clustering).
    const det = item.el.closest("details");
    if (det instanceof HTMLDetailsElement) det.open = true;
    selectFinding(item.id);
    item.el.tabIndex = -1;
    item.el.focus();
  }

  function findingAction(action: string): void {
    const item = findingEls()[findingIx];
    if (!item) return;
    const card = item.el;
    card.dispatchEvent(new CustomEvent("rhema:finding-action", { bubbles: true, detail: { action, findingId: item.id } }));
    if (action === "apply") {
      // P → the card's Apply form posts (the free verb writes accept·applied through the server).
      card.querySelector<HTMLElement>("[data-apply]")?.click();
      return;
    }
    // the five verbs → the card's disposition form. rebut/escalate need a rationale — focus the note
    // field rather than posting a write the server would bounce (the card explains the rule).
    if (action === "rebut" || action === "escalate") {
      card.querySelector<HTMLElement>("textarea, input[type='text']")?.focus();
      card.querySelector<HTMLElement>(`[data-verb="${action}"]`)?.setAttribute("data-armed", "true");
      return;
    }
    card.querySelector<HTMLElement>(`[data-verb="${action}"]`)?.click();
  }

  function focusZone(): FocusZone {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return "none";
    if (el.closest("[data-ide-palette]") || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName)) return "input";
    if (el.isContentEditable || el.closest(".ProseMirror") || el.closest("[data-page-host]")) return "page";
    if (el.closest("[data-margin-card]") || el.closest(".ide-fcard") || el.closest(".ide-margin")) return "margin";
    if (el.closest("[data-desk-row]") || el.closest("[data-findings-desk]")) return "findings";
    return "none";
  }

  // clicking a finding on ANY surface joins the selection (§5.7) + syncs the cursor for J/K.
  ide.addEventListener("click", (e) => {
    const target = (e.target as HTMLElement | null)?.closest?.("[data-margin-card], [data-desk-row], .ide-fcard") as HTMLElement | null;
    if (!target) return;
    const id = target.dataset["findingId"] ?? target.dataset["deskRow"] ?? "";
    if (id === "") return;
    const ix = findingEls().findIndex((it) => it.id === id);
    if (ix >= 0) findingIx = ix;
    selectFinding(id);
  });

  // ---- the §5.12 keymap dispatcher (⌘K palette · ⌘1/⌘2/⌘J panes · ⌘⇧F/M/L · ⌘⇧R next step ·
  //      ⌘G approval · ⌥[/⌥] versions · j/k + P A D R F E findings · ? cheat sheet · ⌘S restore) ----
  window.addEventListener("keydown", (e) => {
    if (paletteOpen()) {
      // While the palette owns focus, only ⌘K/Escape outside the input close it.
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
        if (cheatEl && !cheatEl.hidden) cheatEl.hidden = true;
      }
      return;
    }
    switch (action.kind) {
      case "palette":
        e.preventDefault();
        // bare "/" opens straight into command mode (the §7.2 grammar); ⌘K opens browse.
        openPalette(e.key === "/" ? "/" : "");
        break;
      case "pane":
        e.preventDefault();
        if (action.pane === "files") setState({ filesOpen: !state.filesOpen });
        else if (action.pane === "timeline") setState({ timelineOpen: !state.timelineOpen });
        else setState({ deskOpen: !state.deskOpen });
        break;
      case "focus-mode":
        e.preventDefault();
        setState({ view: state.view === "focus" ? "write" : "focus" });
        break;
      case "paper-theme": {
        e.preventDefault();
        const next = cyclePaperTheme(parsePaperTheme(doc.getAttribute("data-paper") ?? "light"));
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
        // ⌘⇧D/E/V open the run sheet (GET) for the workflow — the sheet still owns the launch POST.
        e.preventDefault();
        window.location.assign(`/p/${slug}/run?workflow=${action.workflow}`);
        break;
      case "run-next": {
        const href = ide.dataset["runNext"];
        if (href) {
          e.preventDefault();
          window.location.assign(href);
        }
        break;
      }
      case "goto-approval":
        e.preventDefault();
        if (slug) window.location.assign(`/p/${slug}`); // the Needs-you strip owns the gate list
        break;
      case "inbox":
        e.preventDefault();
        window.location.assign("/app/inbox"); // P1.19 — the §5.11 Inbox is the rail's surface
        break;
      case "settings":
        e.preventDefault();
        // P1.20 — ⌘, lands on the §14.7 settings tree (Account is the default section).
        window.location.assign("/app/settings/account");
        break;
      case "version-next":
      case "version-prev": {
        e.preventDefault();
        const m = /\/v\/(\d+)/.exec(window.location.pathname);
        if (m) {
          const n = Number.parseInt(m[1] ?? "1", 10) + (action.kind === "version-next" ? 1 : -1);
          if (n >= 1) window.location.assign(window.location.pathname.replace(/\/v\/\d+/, `/v/${n}`));
        }
        break;
      }
      case "compare-previous": {
        e.preventDefault();
        // P1.08 (§5.8) — on a versioned Page the rail stamps the compare-previous link; follow it
        // (the /v/:prev/diff/:n route). Elsewhere the palette's /compare verb stays the fallback.
        const link = document.querySelector<HTMLAnchorElement>("[data-compare-previous]");
        if (link?.href) window.location.assign(link.href);
        else openPalette("/compare ");
        break;
      }
      case "triage": {
        e.preventDefault();
        // §5.7 triage mode (⌘⇧T): on a dossier the sectioned queue is the server-rendered
        // `?triage=1` view — decisions persist per-verb, so entering/exiting is a navigation.
        // Elsewhere the chord opens the Desk's findings tab and starts the cursor.
        if (/\/p\/[^/]+\/review\/[^/]+/.test(window.location.pathname)) {
          const url = new URL(window.location.href);
          if (url.searchParams.get("triage") === "1") url.searchParams.delete("triage");
          else url.searchParams.set("triage", "1");
          window.location.assign(url.toString());
        } else {
          if (!state.deskOpen) setState({ deskOpen: true, deskTab: "findings" });
          focusFinding(0);
        }
        break;
      }
      case "finding-next":
        e.preventDefault();
        focusFinding(findingIx + 1);
        break;
      case "finding-prev":
        e.preventDefault();
        focusFinding(findingIx - 1);
        break;
      case "finding-anchor-next":
      case "finding-anchor-prev": {
        e.preventDefault();
        // ⌥J/⌥K — the §5.12 severity walk: hop the next/previous MAJOR-OR-BLOCKING finding
        // (wrapping), not every row.
        const items = findingEls();
        const severe = items.filter((it) => {
          const sev = it.el.dataset["severity"];
          return sev === "blocking" || sev === "major";
        });
        if (severe.length === 0) break;
        const curId = items[findingIx]?.id;
        const cur = severe.findIndex((it) => it.id === curId);
        const step = action.kind === "finding-anchor-next" ? 1 : -1;
        const next = severe[(cur + step + severe.length) % severe.length];
        const ix = items.findIndex((it) => it.id === next!.id);
        focusFinding(ix);
        break;
      }
      case "finding-open": {
        e.preventDefault();
        const card = fcards()[findingIx];
        card?.querySelector<HTMLElement>("a, button")?.click();
        break;
      }
      case "finding-escape":
        e.preventDefault();
        findingIx = -1;
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
        // ⌘S names a restore point — the Page island (page.ts) owns the save; the event lets any
        // other surface bind it later.
        ide.dispatchEvent(new CustomEvent("rhema:restore-point", { bubbles: true }));
        break;
      case "cheatsheet":
        e.preventDefault();
        toggleCheat();
        break;
      case "undo":
      case "redo":
        // ⌘Z/⌘⇧Z belong to the focused surface (the editor handles its own); in chrome focus they
        // stay inert rather than hijacking the browser.
        break;
      default:
        break;
    }
    if (cheatOpen() && action.kind !== "cheatsheet" && cheatEl) {
      // any other chord dismisses the cheat sheet (it never swallows input)
      cheatEl.hidden = true;
    }
  });

  // ---- P1.06 — the selection popover + the Timeline context menu (§7.2/§7.4; REQ-CHAT-21/22) ----
  // The third and fourth surfaces over the ONE grammar: `selectionMenuItems`/`contextMenuItems` are
  // the pure models; each item's `command` parses + resolves through the same path as a typed
  // palette command — the byte-identical-sheet invariant. No item ever POSTs — the sheet remains
  // the only launcher (REQ-CHAT-25); 1.x verbs render disabled-with-reason, never guessed.
  let cmdMenu: HTMLElement | null = null;
  const closeCmdMenu = (): void => {
    cmdMenu?.remove();
    cmdMenu = null;
  };
  function openCmdMenu(items: readonly CommandMenuItem[], x: number, y: number, kind: string): void {
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
        b.dataset["disabled"] = "";
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
            // §7.4 — Ask opens the composer (the Desk's chat tab; the anchored-composer prefill is
            // P1.11's seam — it consumes this same grammar).
            setState({ deskOpen: true, deskTab: "chat" });
          } else if (resolution && (resolution.kind === "sheet" || resolution.kind === "navigate")) {
            window.location.assign(resolution.path); // GET only — the sheet owns the launch POST
          }
        });
      }
      menu.appendChild(b);
    }
    document.body.appendChild(menu);
    cmdMenu = menu;
    // clamp inside the viewport so a bottom-edge selection still shows the whole menu
    const w = menu.offsetWidth;
    const h = menu.offsetHeight;
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - w - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - h - 8))}px`;
  }
  document.addEventListener("mousedown", (e) => {
    if (cmdMenu && !cmdMenu.contains(e.target as Node)) closeCmdMenu();
  });

  // the §7.4 selection popover — a non-collapsed selection inside the Page offers
  // Ask · Visualize · Fact-check · Review this section (Line-edit/Cut are 1.x, marked).
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
    }, 120); // let a drag/double-click settle before measuring the range
  };
  document.addEventListener("mouseup", (e) => {
    if (cmdMenu?.contains(e.target as Node)) return; // a click inside the menu isn't a new selection
    if (pagePane?.contains(e.target as Node)) selectionMenu();
    else closeCmdMenu();
  });
  document.addEventListener("keyup", (e) => {
    if (e.shiftKey || e.key === "Shift") selectionMenu(); // shift-selection has no mouseup
  });
  document.addEventListener("selectionchange", () => {
    const sel = window.getSelection();
    if (cmdMenu?.dataset["kind"] === "selection" && (!sel || sel.isCollapsed)) closeCmdMenu();
  });

  // the artifact/Timeline context menu — a right-click on a round scopes the verbs to its subject
  // version (@vN off data-round); outside a round the bare verbs apply to the current head.
  ide.querySelector<HTMLElement>('[data-pane="timeline"]')?.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const round = (e.target as HTMLElement).closest<HTMLElement>("[data-round]");
    const n = round?.dataset["round"];
    openCmdMenu(contextMenuItems(n != null ? Number(n) : undefined), e.clientX, e.clientY, "context");
  });

  // ---- P1.05 — the Desk's Live feed (§5.5; REQ-IDE-14): density tabs + the same-origin SSE tail ----
  // SSR rendered the replayed rows at the default density; the island re-shows/hides rows on the tabs
  // and appends live events through the SAME label maps (data-feed-labels — copy stays server-owned).
  const feedPanel = ide.querySelector<HTMLElement>("[data-feed-run]");
  if (feedPanel) {
    const feedSection = feedPanel.querySelector<HTMLElement>("[data-live-feed]");
    const rowsUl = feedPanel.querySelector<HTMLElement>("[data-feed-rows]");
    let feedDensity: FeedDensityTab =
      (feedSection?.dataset["density"] as FeedDensityTab | undefined) ?? "details";
    let feedMaps: FeedLabelMaps = { t: {}, enums: {} };
    try {
      feedMaps = JSON.parse(feedPanel.dataset["feedLabels"] ?? "{}") as FeedLabelMaps;
    } catch {
      /* a malformed map drops live rows — SSR rows still stand */
    }
    let lastSeq = Number.parseInt(feedPanel.dataset["feedLastSeq"] ?? "0", 10) || 0;

    const setFeedDensity = (d: FeedDensityTab): void => {
      feedDensity = d;
      if (feedSection) feedSection.dataset["density"] = d;
      feedPanel.querySelectorAll<HTMLElement>("[data-feed-density]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b.dataset["feedDensity"] === d)),
      );
      // contract densities summary|normal|verbose map onto the tabs; hidden rows re-show on widen.
      feedPanel.querySelectorAll<HTMLElement>("[data-feed-density-row]").forEach((row) => {
        row.hidden = !feedRowVisible(row.dataset["feedDensityRow"] ?? "summary", d);
      });
    };
    feedPanel.querySelectorAll<HTMLElement>("[data-feed-density]").forEach((el) =>
      el.addEventListener("click", () => setFeedDensity((el.dataset["feedDensity"] as FeedDensityTab) ?? "details")),
    );
    // re-filter once at boot so the SSR rows obey the stored/selected density.
    setFeedDensity(feedDensity);

    const appendRow = (ev: { seq?: number; type?: string; payload?: unknown; density?: string }): void => {
      if (!rowsUl || typeof ev.type !== "string") return;
      if (typeof ev.seq === "number") lastSeq = Math.max(lastSeq, ev.seq);
      const density = typeof ev.density === "string" ? ev.density : "summary";
      if (!feedRowVisible(density, feedDensity)) return;
      // RPT.1 — a provisional usage tick renders its ≈ template (provisional is never ambiguous).
      const key =
        ev.type === "usage.tick" &&
        typeof ev.payload === "object" &&
        ev.payload != null &&
        (ev.payload as Record<string, unknown>)["provisional"] === true
          ? "usage.tick.provisional"
          : ev.type;
      const text = formatFeedRow(key, ev.payload, feedMaps);
      if (!text) return; // fail-closed: no template ⇒ no row
      const li = document.createElement("li");
      li.dataset["feedEvent"] = ev.type;
      li.dataset["feedDensityRow"] = density;
      li.style.display = "flex";
      li.style.gap = "10px";
      li.style.padding = "4px 0";
      li.style.fontSize = "13px";
      const label = document.createElement("span");
      label.textContent = text.label;
      li.appendChild(label);
      if (text.detail) {
        const d = document.createElement("span");
        d.textContent = text.detail;
        li.appendChild(d);
      }
      rowsUl.appendChild(li);
      while (rowsUl.childElementCount > 400) rowsUl.firstElementChild?.remove(); // bound the DOM
    };

    // RPT.1 (REQ-IDE-11 meter half) — the run card moves WITH the feed's events, not just at SSR:
    // `usage.tick`/`cost.final` re-render the meter's text (through the same server-owned
    // `card.meter`/`card.meterProvisional` templates — no client-authored copy) + fill and toggle the
    // provisional marker; `step.started`/`step.finished` flip the phase row's status + glyph. The card
    // is `[data-run-card="<feed run>"]` in the Timeline pane; the glyphs mirror ui's GLYPH map
    // (mechanical symbols, not copy).
    const PHASE_GLYPH: Record<string, string> = { done: "✓", running: "◐", pending: "○", skipped: "○", off: "○" };
    const cardRunId = feedPanel.dataset["feedRun"] ?? "";
    const cardEl = cardRunId !== "" ? ide.querySelector<HTMLElement>(`[data-run-card="${cardRunId}"]`) : null;
    const patchCard = (ev: { type?: string; payload?: unknown }): void => {
      if (cardEl == null || typeof ev.type !== "string") return;
      const p = typeof ev.payload === "object" && ev.payload != null ? (ev.payload as Record<string, unknown>) : {};
      if (ev.type === "usage.tick" || ev.type === "cost.final") {
        const spent = Number(p["spentCredits"]);
        const cap = Number(p["capCredits"]);
        if (!Number.isFinite(spent) || !Number.isFinite(cap)) return;
        const provisional = ev.type === "usage.tick" && p["provisional"] === true;
        const creditsEl = cardEl.querySelector<HTMLElement>("[data-credits]");
        if (creditsEl) {
          const key = provisional ? "card.meterProvisional" : "card.meter";
          const rendered = formatFeedRow(
            key,
            { spentCredits: spent.toLocaleString("en-US"), capCredits: cap.toLocaleString("en-US") },
            feedMaps,
          );
          if (rendered) creditsEl.textContent = rendered.label;
          if (provisional) creditsEl.setAttribute("data-provisional", "true");
          else creditsEl.removeAttribute("data-provisional");
        }
        const meter = cardEl.querySelector<HTMLElement>("[data-credit-meter]");
        if (meter && cap > 0) meter.style.width = `${Math.min(100, Math.max(0, Math.round((spent / cap) * 100)))}%`;
      }
      if (ev.type === "step.started" || ev.type === "step.finished") {
        const phase = typeof p["phase"] === "string" ? p["phase"] : null;
        const li = phase != null ? cardEl.querySelector<HTMLElement>(`[data-phase="${phase}"]`) : null;
        if (li) {
          const status = ev.type === "step.started" ? "running" : "done";
          li.setAttribute("data-phase-status", status);
          const glyph = li.querySelector("span");
          if (glyph) {
            glyph.textContent = PHASE_GLYPH[status] ?? "○";
            glyph.style.color = status === "running" ? "var(--state-running)" : "var(--state-ready)";
          }
        }
      }
    };

    // The SSE tail — the same-origin web route proxies the api's stream (the browser never holds a
    // credential; REQ-ARCH-33). `?after` resumes past the SSR replay; reconnects carry Last-Event-ID.
    const eventsUrl = feedPanel.dataset["feedEvents"];
    if (eventsUrl && typeof EventSource !== "undefined") {
      const src = new EventSource(`${eventsUrl}${eventsUrl.includes("?") ? "&" : "?"}after=${lastSeq}`);
      // The stream's events are NAMED (event: <type>) — EventSource dispatches each to a per-type
      // listener; the label maps' keys are exactly the types worth listening for (fail-closed).
      const onEvent = (m: Event): void => {
        try {
          const ev = JSON.parse((m as MessageEvent).data as string) as { type?: string; payload?: unknown };
          patchCard(ev);
          appendRow(ev);
        } catch {
          /* a malformed frame is dropped */
        }
      };
      for (const type of Object.keys(feedMaps.t)) {
        if (type.startsWith("card.")) continue; // pseudo-keys (RPT.1 meter copy) aren't event types
        src.addEventListener(type, onEvent);
      }
      src.onerror = () => {
        /* EventSource auto-reconnects; Last-Event-ID resumes exactly-once (§12.5) */
      };
    }
  }

  // The app theme menu's "auto" also needs a live OS-change listener — the boot script installs it when
  // the boot pref is auto; when the user switches to auto mid-session we subscribe here.
  if (window.matchMedia) {
    const q = window.matchMedia("(prefers-color-scheme: light)");
    const onChange = (ev: MediaQueryListEvent) => {
      if (doc.getAttribute("data-app-theme") === "auto") {
        doc.setAttribute("data-theme", ev.matches ? "light" : "dark");
      }
    };
    if (q.addEventListener) q.addEventListener("change", onChange);
    else if (q.addListener) q.addListener(onChange);
  }

  // P1.07 — a deep link (`#finding-<id>`) lands with the linked selection lit on every surface.
  const initialHash = /^#finding-(.+)$/.exec(window.location.hash)?.[1];
  if (initialHash) selectFinding(initialHash);

  apply();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
