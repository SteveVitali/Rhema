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
    `<body>${body}</body></html>`
  );
}
