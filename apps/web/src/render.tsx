import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { themeCss, ideCss } from "@rhema/tokens";
import { themeBootScript, resolveAppTheme } from "@rhema/ide";
import { PageDataContext, type PageData } from "./page-data.js";

// SSR: render a page element (inside the React Router static context + the per-request data provider) into a
// full HTML document carrying the §5.9 theme stylesheet. The shell is Dark by default; P1.01 adds the
// no-wrong-theme-flash contract (REQ-IDE-38 amended): a synchronous inline boot script resolves
// dark|light|auto BEFORE first paint (SSR-stamped data-app-theme when the server knows the pref, else the
// localStorage mirror, else dark) and stamps the per-project data-paper policy. The flat beta shell stays
// progressive-enhancement HTML; /p/:project… documents additionally carry the IDE stylesheet + the
// deferred ide.js island.

const DOC_TITLE = "Rhēma";

/** The theme stylesheet, computed once. */
const THEME_CSS = themeCss();
/** The IDE chrome stylesheet (§5.1 panes), computed once; only IDE documents carry it. */
const IDE_CSS = ideCss();
/** The inline pre-paint theme boot (dark|light|auto + per-project paper + font preset + reader step). */
const BOOT = themeBootScript();

/**
 * The REQ-BETA-10 dwell heartbeat (PRB.12): when a page names its `dwellSurface`, the document carries a
 * ~20-line beacon that posts `surface.dwell{surface, ms}` to `/a/dwell` every 30 s while the tab is visible
 * and once on hide. The documented blindness (the PR's AC5 text): the beta has NO chat half — dwell here
 * measures only the dossier/editor/settings surfaces; the interview + paste-back loop is the recovery plan
 * for the half the heartbeat cannot see.
 */
function dwellBeacon(surface: string): string {
  const s = JSON.stringify(surface);
  return (
    `<script>(function(){var s=${s},t0=Date.now();` +
    `function beat(){var ms=Date.now()-t0;if(ms<4000)return;t0=Date.now();` +
    `var b=JSON.stringify({surface:s,ms:ms});` +
    `if(navigator.sendBeacon){navigator.sendBeacon("/a/dwell",new Blob([b],{type:"application/json"}));}` +
    `else{fetch("/a/dwell",{method:"POST",headers:{"content-type":"application/json"},body:b,keepalive:true});}}` +
    `setInterval(function(){if(document.visibilityState==="visible")beat();},30000);` +
    `document.addEventListener("visibilitychange",function(){if(document.visibilityState==="hidden")beat();});})();</script>`
  );
}

export function renderDocument(url: string, element: ReactNode, data: PageData = {}): string {
  const body = renderToStaticMarkup(
    <PageDataContext.Provider value={data}>
      <StaticRouter location={url}>{element}</StaticRouter>
    </PageDataContext.Provider>,
  );
  // PRB.21 — a pending page carries a meta-refresh so it re-polls itself on a timer (the import
  // preview's converting state); the URL is app-generated (the quarantine-key poll path), not user input.
  const refresh = data.autoRefresh
    ? `<meta http-equiv="refresh" content="${data.autoRefresh.seconds};url=${escapeHtml(data.autoRefresh.url)}">`
    : "";
  // Theme stamping (REQ-IDE-38): `data-app-theme` carries the stored PREF (dark|light|auto) only when the
  // server actually knows it — the boot script prefers it, else the localStorage mirror, else dark.
  // `data-theme` carries the RESOLVED theme; `auto` resolves dark server-side and the boot script
  // re-resolves against matchMedia before paint (no wrong-theme flash either way).
  const pref = data.theme?.pref;
  const resolved = pref ? resolveAppTheme(pref, false) : "dark";
  const htmlAttrs =
    `lang="en" data-theme="${resolved}"` +
    (pref ? ` data-app-theme="${escapeHtml(pref)}"` : "") +
    (data.paperTheme ? ` data-paper="${escapeHtml(data.paperTheme)}"` : "") +
    (data.project?.slug ? ` data-project="${escapeHtml(data.project.slug)}"` : "");
  // IDE documents (the /p/:project… routes) carry the pane stylesheet + the ide.js island; the editor
  // page's own bundle (editor.js) is emitted by the editor element itself.
  const island = data.ide ? `<script src="/assets/ide.js" defer></script>` : "";
  return (
    `<!doctype html><html ${htmlAttrs}>` +
    `<head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` +
    `${refresh}<title>${DOC_TITLE}</title>` +
    `<script>${BOOT}</script>` +
    `<style>${THEME_CSS}</style>${data.ide ? `<style>${IDE_CSS}</style>` : ""}</head>` +
    `<body>${body}${island}${data.dwellSurface ? dwellBeacon(data.dwellSurface) : ""}</body></html>`
  );
}

/** Minimal escaping for interpolating an app-built URL into a `<meta>` attribute. */
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
