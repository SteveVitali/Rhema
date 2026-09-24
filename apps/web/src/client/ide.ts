// The IDE client island (P1.01; REQ-IDE-8/9/38/39). Same convention as the landed editor island
// (editor.ts): the SSR document renders the full §5.1 shell markup with data-* state; this bundle
// enhances it — pane toggles + drags persist to localStorage (per user × project, NEVER the URL), the
// View/theme menus are attribute-driven, ⌘1/⌘2/⌘J/⌘⇧F/⌘⇧M/⌘⇧L bind globally, and theme writes POST to
// the same-origin web routes (the web server forwards the session to the api — the bundle never sees a
// credential, and no protocol/eval text may reach it, REQ-ARCH-33). `?focus=1` is the ONE shareable pane
// URL flag: applied, then stripped from the address bar.

import {
  DEFAULT_PANE_STATE,
  cyclePaperTheme,
  feedRowVisible,
  formatFeedRow,
  paneDrag,
  paneStorageKey,
  parseAppTheme,
  parsePaperTheme,
  parsePaneState,
  resolveAppTheme,
  serializePaneState,
  THEME_STORAGE_KEY,
  type FeedDensityTab,
  type FeedLabelMaps,
  type PaneState,
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

  // ---- keyboard chrome (⌘1 Files · ⌘2 Timeline · ⌘J Desk · ⌘⇧F Focus · ⌘⇧M Advanced · ⌘⇧L paper) ----
  window.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && !e.shiftKey && e.key === "1") {
      e.preventDefault();
      setState({ filesOpen: !state.filesOpen });
    } else if (mod && !e.shiftKey && e.key === "2") {
      e.preventDefault();
      setState({ timelineOpen: !state.timelineOpen });
    } else if (mod && !e.shiftKey && e.key.toLowerCase() === "j") {
      e.preventDefault();
      setState({ deskOpen: !state.deskOpen });
    } else if (mod && e.shiftKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      setState({ view: state.view === "focus" ? "write" : "focus" });
    } else if (mod && e.shiftKey && e.key.toLowerCase() === "m") {
      e.preventDefault();
      setState({ advanced: !state.advanced });
    } else if (mod && e.shiftKey && e.key.toLowerCase() === "l") {
      e.preventDefault();
      const cur = parsePaperTheme(doc.getAttribute("data-paper") ?? "light");
      const next = cyclePaperTheme(cur);
      applyPaper(next);
      post(ide.dataset["paperUrl"], { paperTheme: next });
    } else if (mod && e.shiftKey && e.key.toLowerCase() === "r") {
      // ⌘⇧R — run the next step (§5.5): navigate to the run sheet the next-step card points at.
      const href = ide.dataset["runNext"];
      if (href) {
        e.preventDefault();
        window.location.assign(href);
      }
    } else if (e.key === "Escape") {
      closeMenus();
    }
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
      const text = formatFeedRow(ev.type, ev.payload, feedMaps);
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

    // The SSE tail — the same-origin web route proxies the api's stream (the browser never holds a
    // credential; REQ-ARCH-33). `?after` resumes past the SSR replay; reconnects carry Last-Event-ID.
    const eventsUrl = feedPanel.dataset["feedEvents"];
    if (eventsUrl && typeof EventSource !== "undefined") {
      const src = new EventSource(`${eventsUrl}${eventsUrl.includes("?") ? "&" : "?"}after=${lastSeq}`);
      // The stream's events are NAMED (event: <type>) — EventSource dispatches each to a per-type
      // listener; the label maps' keys are exactly the types worth listening for (fail-closed).
      const onEvent = (m: Event): void => {
        try {
          appendRow(JSON.parse((m as MessageEvent).data as string));
        } catch {
          /* a malformed frame is dropped */
        }
      };
      for (const type of Object.keys(feedMaps.t)) src.addEventListener(type, onEvent);
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

  apply();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
