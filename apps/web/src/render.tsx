import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { themeCss } from "@rhema/tokens";
import { PageDataContext, type PageData } from "./page-data.js";

// SSR: render a page element (inside the React Router static context + the per-request data provider) into a
// full HTML document carrying the §5.9 theme stylesheet. The shell is Dark by default (data-theme="dark").
// No client bundle — the flat beta shell is progressive-enhancement HTML (REQ-BETA-21 stopgap #2).

const DOC_TITLE = "Rhēma";

/** The theme stylesheet, computed once. */
const THEME_CSS = themeCss();

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
  return (
    `<!doctype html><html lang="en" data-theme="dark">` +
    `<head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` +
    `<title>${DOC_TITLE}</title><style>${THEME_CSS}</style></head>` +
    `<body>${body}${data.dwellSurface ? dwellBeacon(data.dwellSurface) : ""}</body></html>`
  );
}
