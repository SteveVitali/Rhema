// The phone-UA reader island (R7RO.2; REQ-RELOAD-7, REQ-MOBILE-3 amended, UXC-7). The forced-SSR
// Page family mounts this bundle on phone requests only — every desktop and tablet surface is the
// SPA (its controller in spa/ide/controller.ts owns the rest). What this reader keeps:
//
//   • the reader stepper + font preset (localStorage-backed --paper-size / data-font),
//   • theme + paper writes (same-origin JSON POSTs the web routes forward to the api — the bundle
//     never sees a credential, and no protocol/eval text may reach it, REQ-ARCH-33),
//   • the §10.1 entry-point disclosures: the phonebar's Timeline/Findings/Chat/Reading anchors are
//     hash links to <details> sections inside the Page; a deep link (#phone-*, #finding-<id>) opens
//     the matching disclosure and scrolls it in — the inputs themselves are server-rendered
//     no-JS-capable forms, and this stays their only enhancement seam,
//   • the OS-theme listener for the "auto" app-theme pref.
//
// Deleted here (SPA-owned since R7PANE.1/R7SHELL.1c): pane toggles and drags, the View/Theme menus,
// the ⌘K palette, the full keymap dispatcher, the selection popover and Timeline context menu, the
// findings J/K cursor, the suggestions preview, the authorship toggle, the cheat sheet, and the
// live-feed SSE tail. Re-adding any of them fails phone-island.test.ts.

import {
  parseAppTheme,
  parsePaperTheme,
  resolveAppTheme,
  THEME_STORAGE_KEY,
  type PaperTheme,
} from "@rhema/ide";

const FONT_KEY = "rhema:font:v1";
const STEP_KEY = "rhema:reader-step:v1";

function main(): void {
  const ide = document.querySelector<HTMLElement>("[data-ide]");
  if (!ide) return;
  const doc = document.documentElement;
  const slug = ide.dataset["project"] ?? "";

  // ---- typography: font preset + reader stepper (localStorage-backed) ----
  let readerStep = 0;
  try {
    readerStep = Math.min(3, Math.max(0, parseInt(localStorage.getItem(STEP_KEY) ?? "0", 10) || 0));
  } catch {
    /* private mode — session-only */
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
    }),
  );
  ide.querySelectorAll<HTMLElement>("[data-ide-paper]").forEach((el) =>
    el.addEventListener("click", () => {
      const p = parsePaperTheme(el.dataset["idePaper"]);
      applyPaper(p);
      post(ide.dataset["paperUrl"], { paperTheme: p });
    }),
  );

  // ---- the §10.1 entry-point disclosures (REQ-MOBILE-3; F4) ----
  // The phonebar links are plain hash anchors — without JS they land on the closed disclosure's
  // summary (never a dead end); the island opens the matching <details> and scrolls it in.
  // `#finding-<id>` deep links (the Page's finding marks + email/notification links) open the
  // findings disclosure and light the row — the reader-scoped echo of §5.7's linked selection.
  function openDisclosure(): void {
    const hash = window.location.hash;
    const sectionMatch = /^#(phone-timeline|phone-findings|phone-chat|phone-reading)$/.exec(hash);
    const findingId = /^#finding-(.+)$/.exec(hash)?.[1];
    let el: HTMLElement | null = null;
    if (sectionMatch) {
      el = ide?.querySelector<HTMLElement>(`#${sectionMatch[1]}`) ?? null;
    }
    if (el == null && findingId != null) {
      const esc =
        typeof CSS !== "undefined" && CSS.escape ? CSS.escape(findingId) : findingId.replace(/"/g, "");
      el = ide?.querySelector<HTMLElement>(`#finding-${esc}, [data-review-finding="${esc}"]`) ?? null;
    }
    if (el == null) return;
    // open the whole disclosure chain (a finding row can sit inside the findings <details>)
    for (let d: HTMLElement | null = el; d != null; d = d.parentElement) {
      if (d instanceof HTMLDetailsElement) d.open = true;
    }
    if (el instanceof HTMLDetailsElement) el.open = true;
    if (findingId != null) {
      for (const other of ide?.querySelectorAll<HTMLElement>("[data-selected='true']") ?? []) {
        other.removeAttribute("data-selected");
      }
      el.setAttribute("data-selected", "true");
    }
    el.scrollIntoView({ block: "start" });
  }
  openDisclosure();
  window.addEventListener("hashchange", openDisclosure);

  // The app theme menu's "auto" also needs a live OS-change listener — the boot script installs it
  // when the boot pref is auto; when the user switches to auto mid-session we subscribe here.
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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", main);
} else {
  main();
}
