import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { themeCss, ideCss } from "@rhema/tokens";
import { themeBootScript, resolveAppTheme } from "@rhema/ide";
import { spaRouteFor } from "@rhema/contracts";
import { PageDataContext, type PageData } from "./page-data.js";
import { docMetaFor, SITE } from "./doc-meta.js";

// SSR: render a page element (inside the React Router static context + the per-request data provider) into a
// full HTML document carrying the §5.9 theme stylesheet. The shell is Dark by default; P1.01 adds the
// no-wrong-theme-flash contract (REQ-IDE-38 amended): a synchronous inline boot script resolves
// dark|light|auto BEFORE first paint (SSR-stamped data-app-theme when the server knows the pref, else the
// localStorage mirror, else dark) and stamps the per-project data-paper policy. The flat beta shell stays
// progressive-enhancement HTML; /p/:project… documents additionally carry the IDE stylesheet + the
// deferred ide.js island.

// UX.1 — route-aware document meta: `docMetaFor` lives in doc-meta.ts (SPA.4 — the browser-safe leaf the
// SPA's client head manager and this SSR document share; REQ-BND-8). Re-exported so existing import
// sites (spa-shell.ts, server.ts) stay untouched.
export { docMetaFor } from "./doc-meta.js";

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

export function renderDocument(
  url: string,
  element: ReactNode,
  data: PageData = {},
  meta?: { origin?: string },
): string {
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
  // SPA.3 (REQ-SEQ-8 + REQ-VFY-3/7; design/27 §settle) — every HTML document carries the settle
  // vocabulary: `data-renderer` says which pipeline produced it, `data-route` is the route-shape
  // id (the `$param` pattern both renderers emit; the raw path when the shape is unknown), and a
  // served SSR document is complete so `data-mounted` lands statically — the SPA flips the same
  // attr on `<html>` after its first data paint.
  const pathname = url.split("?")[0] || "/";
  const routeId = spaRouteFor(pathname).routeId ?? pathname;
  const htmlAttrs =
    `lang="en" data-theme="${resolved}"` +
    ` data-renderer="ssr" data-route="${escapeHtml(routeId)}" data-mounted` +
    (pref ? ` data-app-theme="${escapeHtml(pref)}"` : "") +
    (data.paperTheme ? ` data-paper="${escapeHtml(data.paperTheme)}"` : "") +
    (data.project?.slug ? ` data-project="${escapeHtml(data.project.slug)}"` : "");
  // IDE documents (the /p/:project… routes) carry the pane stylesheet + the ide.js island; the Page's
  // own bundle (page.js) is emitted by the PageEditor element itself (the retired editor.js island
  // dropped at SPA.24).
  // UX.2 (ADR-065) — belt-and-braces: rendered markup carrying `data-ide="1"` is an IDE document
  // whether or not the handler remembered `data.ide` (the /app/new defect was IdeFrame markup with
  // the flag unset — an unstyled shell). The markup is ground truth: a frame without its stylesheet
  // can never ship again; a route that forgets `ide` renders styled-but-inert and the route
  // enumeration test (ide-surfaces.test.ts) still flags the missing data block.
  const isIde = data.ide != null || body.includes('data-ide="1"');
  const island = isIde ? `<script src="/assets/ide.js" defer></script>` : "";
  // UX.1 — route-aware head: distinct title everywhere; description + OG + Twitter only on routes
  // that carry a description (the public set); favicon on every page. Every interpolated value is
  // attribute-escaped (`escapeHtml`) — titles/descriptions come from COPY or bounded DTO strings.
  const doc = docMetaFor(url, data);
  const origin = meta?.origin?.replace(/\/+$/, "");
  const canonical = origin ? `${origin}${url.split("?")[0]}` : "";
  const social =
    doc.description != null
      ? `<meta name="description" content="${escapeHtml(doc.description)}">` +
        `<meta property="og:type" content="website">` +
        `<meta property="og:site_name" content="${SITE}">` +
        `<meta property="og:title" content="${escapeHtml(doc.title)}">` +
        `<meta property="og:description" content="${escapeHtml(doc.description)}">` +
        `<meta name="twitter:card" content="summary">` +
        `<meta name="twitter:title" content="${escapeHtml(doc.title)}">` +
        `<meta name="twitter:description" content="${escapeHtml(doc.description)}">` +
        (canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}"><meta property="og:url" content="${escapeHtml(canonical)}">` : "")
      : "";
  return (
    `<!doctype html><html ${htmlAttrs}>` +
    `<head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` +
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="any">` +
    `${refresh}<title>${escapeHtml(doc.title)}</title>${social}` +
    `<script>${BOOT}</script>` +
    `<style>${THEME_CSS}</style>${isIde ? `<style>${IDE_CSS}</style>` : ""}</head>` +
    `<body>${body}${island}${data.dwellSurface ? dwellBeacon(data.dwellSurface) : ""}</body></html>`
  );
}

/**
 * Minimal escaping for interpolating an app-built URL into a `<meta>` attribute (exported for
 * SPA.3's shell, which shares the interpolation discipline).
 */
export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
