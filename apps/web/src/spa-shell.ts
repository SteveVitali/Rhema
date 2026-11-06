// SPA.3 — the SPA shell document (spec §3.1/§4; REQ-BND-4/11/12; design/26 §shell-doc §catch-all;
// design/25 §route-tree). `renderSpaShell` is the pure template; `spaShellDocument` is the
// handler-level serve seam every authenticated GET calls at spec §4's fixed position — AFTER the
// session gate, server-owned redirects, and (Page family only) forced-SSR capability checks.
// SPA.28: the `spaShellResponse` consult seam + `deps.spa` are gone — the shell is the sole
// renderer for every SPA-space document, so nothing on the request path can flip it back.
//
// Parity contract with `renderDocument`: same charset/viewport/favicon enumeration, same
// `docMetaFor` title for the requested path, the same theme boot script + theme/IDE stylesheets,
// `data-theme`/`data-app-theme`/`data-paper`/`data-project` stamping — so a surface's SSR→SPA flip
// is visually identical at first byte. Differences: `data-renderer="spa"` (never `data-mounted` —
// the client flips it after first data paint; `data-route` is the client router's to stamp),
// `data-device`, the `#spa-root` mount node, the honest noscript floor, the `data-spa-boot`
// embed, and the Vite manifest entry tags. Every `<script>` flows through the CSP middleware's
// nonce stamp — the shell never emits an inline Vite modulepreload polyfill (`modulePreload:
// { polyfill: false }` in vite.config.ts is the CSP-by-construction posture).
//
// The boot object is a runtime seed, not an authorization grant: the session principal's public
// fields + the per-route renderer map + the theme/device bootstrap keys. No credentials, keys, or
// per-request secrets — the markup ships to the client bundle's parity anyway, so anything that
// must not reach a browser doesn't belong here either.

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Context } from "hono";
import { themeBootScript, resolveAppTheme, type PaperTheme } from "@rhema/ide";
import {
  DEMO_DOCUMENT_ROUTE_IDS,
  SPA_DOCUMENT_ROUTES,
  SPA_PUBLIC_ROUTES,
  type ReadOnlyProject,
} from "@rhema/contracts";
import { themeCss, ideCss } from "@rhema/tokens";
import { uiCss } from "@rhema/ui";
import { docMetaFor, escapeHtml } from "./render.js";
import { deviceClassFor } from "./device.js";
import type { SpaBoot } from "./spa-boot.js";
import { COPY } from "./copy.js";
import type { DataSource, SessionHeaders } from "./data.js";

const THEME_CSS = themeCss();
const IDE_CSS = ideCss();
// R7KIT.2 (REQ-KIT-2/5; ADR-129) — the component-kit stylesheet, inlined beside theme/ide in every
// shell document (bound ≤ 24 kB raw, asserted).
const UI_CSS = uiCss();
const BOOT = themeBootScript();

/**
 * The seam the route handlers + the catch-all call — a `Pick` of `DataSource` (test stubs carry
 * only the two reads the boot needs) plus the asset-root/log overrides. `WebDeps` satisfies this
 * structurally. SPA.28: the `spa` consult field is gone — no request fact can veto the shell.
 */
export interface SpaShellDeps {
  readonly dataSource: Pick<DataSource, "getSessionPrincipal" | "getTheme" | "getProjectTheme">;
  /** The on-disk dir the Vite SPA build emits into (default: this package's `public/spa/`). */
  readonly spaAssetRoot?: string;
  /** Log seam for the manifest-degrade warn line (default `console.warn`). */
  readonly warn?: (msg: string) => void;
}


/** The `<dir>/.vite/manifest.json` the Vite build emits next to `assets/` (vite.config.ts). */
export const DEFAULT_SPA_ASSET_ROOT = fileURLToPath(new URL("../public/spa/", import.meta.url));

/**
 * REQ-BND-10 — the shell's runtime seed (the `<script type="application/json" data-spa-boot>`).
 * The wire contract lives in `spa-boot.ts` (SPA.4) so the producer and the client decoder share
 * the one shape.
 */
export type SpaBootPayload = SpaBoot;

/** One resolved Vite-manifest entry: the module entry tags + preload/css hints, `/assets/spa/`-relative. */
export interface SpaManifestEntry {
  readonly moduleScripts: readonly string[];
  readonly preloads: readonly string[];
  readonly stylesheets: readonly string[];
}

const EMPTY_ENTRY: SpaManifestEntry = { moduleScripts: [], preloads: [], stylesheets: [] };

interface ViteManifestChunk {
  file?: unknown;
  isEntry?: unknown;
  imports?: unknown;
  css?: unknown;
}

/**
 * Resolve the entry chunk's tag set from a parsed Vite manifest (`Record<key, chunk>`): the
 * `isEntry` chunk's `file` becomes the module script; its `imports` graph (transitive) becomes
 * `modulepreload` hints; every chunk's `css` becomes stylesheet links. Malformed ⇒ null — the
 * caller serves the shell WITHOUT entry tags (the "no 500" posture: a missing build degrades the
 * document, it never degrades the endpoint).
 */
export function spaManifestEntry(manifest: unknown): SpaManifestEntry | null {
  if (manifest == null || typeof manifest !== "object") return null;
  const chunks = manifest as Record<string, ViteManifestChunk>;
  const entry = Object.values(chunks).find(
    (ch) => ch != null && typeof ch === "object" && ch.isEntry === true,
  );
  if (entry == null || typeof entry.file !== "string" || entry.file === "") return null;
  const preloads: string[] = [];
  const stylesheets: string[] = [];
  const seen = new Set<string>();
  const listCss = (ch: ViteManifestChunk): void => {
    for (const f of Array.isArray(ch.css) ? ch.css : []) {
      if (typeof f === "string" && f !== "") stylesheets.push(f);
    }
  };
  const visit = (ch: ViteManifestChunk): void => {
    for (const key of Array.isArray(ch.imports) ? ch.imports : []) {
      if (typeof key !== "string" || seen.has(key)) continue;
      seen.add(key);
      const dep = chunks[key];
      if (dep == null || typeof dep !== "object") continue;
      if (typeof dep.file === "string" && dep.file !== "") preloads.push(dep.file);
      listCss(dep);
      visit(dep);
    }
  };
  listCss(entry);
  visit(entry);
  return { moduleScripts: [entry.file], preloads, stylesheets };
}

/**
 * Read + resolve the manifest beside `spaAssetRoot`. A missing/corrupt manifest logs ONE warn
 * line and yields the empty entry — REQ-TL-7's log-and-serve posture (the deploy that forgets the
 * Vite build ships a shell that no-ops client-side, never a 500).
 */
export async function loadSpaManifest(
  root: string,
  warn: (msg: string) => void = (m) => console.warn(m),
): Promise<SpaManifestEntry> {
  const manifestPath = join(root, ".vite", "manifest.json");
  const raw = await readFile(manifestPath, "utf8").catch(() => null);
  let entry: SpaManifestEntry | null = null;
  if (raw != null) {
    try {
      entry = spaManifestEntry(JSON.parse(raw));
    } catch {
      entry = null;
    }
  }
  if (entry == null) {
    warn(`[rhema] SPA manifest missing or corrupt at ${manifestPath} — shell served without entry tags`);
    return EMPTY_ENTRY;
  }
  return entry;
}

/** `/p/<slug>/…` or `/demo/<essay>/…` → `slug` for the boot's `project` key; anything else ⇒
 *  absent. R7DEM.4: the public demo alias maps `/demo/<essay>` → `demo~<essay>` so `data-project`
 *  and the paper resolve before paint on the alias URL too. */
function projectSlugFor(pathname: string): string | null {
  const segs = pathname.split("/").filter((s) => s !== "");
  if (segs[0] === "p" && segs[1] != null) return segs[1];
  if (segs[0] === "demo" && segs[1] != null) return `demo~${segs[1]}`;
  return null;
}

/**
 * Build the boot payload for the request: the session principal + theme best-effort reads
 * (degraded upstream ⇒ the field is omitted, never thrown), the request's device class, the
 * per-route renderer map (static truth — see below), and the project slug for `/p/<slug>` paths.
 */
export async function spaBootPayload(
  c: Context,
  deps: SpaShellDeps,
  session: SessionHeaders,
  opts?: {
    paperTheme?: PaperTheme;
    readOnlyProject?: ReadOnlyProject;
    /** R7DEM.4 (REQ-DWEB-6; ADR-126) — the demo boot: no principal/theme read (zero DataSource
     *  calls on the demo path), `theme:{}`, and every in-scope demo routeId "spa" on every
     *  device class (the ADR-126 REQ-ED-12 amendment — a phone UA gets the read-only SPA Page,
     *  never an SsrHandoff loop). */
    demo?: { essay: string; slug: string; signedIn: boolean; build: string | null };
  },
): Promise<SpaBootPayload> {
  const [principal, theme] = opts?.demo
    ? [null, null]
    : await Promise.all([
        Promise.resolve()
          .then(() => deps.dataSource.getSessionPrincipal?.(session))
          .catch(() => null),
        Promise.resolve()
          .then(() => deps.dataSource.getTheme?.(session))
          .catch(() => null),
      ]);
  const deviceClass = deviceClassFor(c);
  const slug = projectSlugFor(c.req.path);
  // REQ-WRITE-8 (239; B15) — the per-project paper policy is stamped into the FIRST document
  // bytes on hard loads into a project (never the boot-script's light default with a stored
  // dark/follow pin behind it). One best-effort read beside the session/theme reads.
  const projectTheme =
    opts?.paperTheme != null
      ? opts.paperTheme
      : slug != null && !opts?.demo
        ? await Promise.resolve()
            .then(() => deps.dataSource.getProjectTheme?.(session, slug))
            .then((r) => r?.paperTheme)
            .catch(() => undefined)
        : undefined;
  // SPA.28 — the renderer map is STATIC truth: every surface-keyed document route serves the
  // shell unconditionally (the SSR documents + the flag consult are gone), so the map is a
  // capability fact, not a flag set — a leaf's SsrHandoff still needs it so a phone-served
  // forced-SSR Page or a server-owned redirect document isn't mistaken for a shell mount. The
  // surviving "ssr" marks are structural: `pageMount` routes on phone keep the forced-SSR Page
  // (REQ-ED-12/REQ-VFY-5), `surfaces:null` rows are server-owned, and the public funnel is SSR
  // forever (REQ-BND-5).
  const surfaces: Record<string, "spa" | "ssr"> = {};
  for (const doc of SPA_DOCUMENT_ROUTES) {
    // R7DEM.4 — an in-scope demo routeId serves "spa" on EVERY device class (ADR-126's REQ-ED-12
    // amendment): the phone forced-SSR arm would SsrHandoff into a document that does not exist.
    // Outside a demo boot the arm is unchanged — a tenant Page on a phone still serves SSR.
    const demoInScope = opts?.demo != null && DEMO_DOCUMENT_ROUTE_IDS.includes(doc.routeId);
    const forcedSsr = deviceClass === "phone" && doc.pageMount === true && !demoInScope;
    surfaces[doc.routeId] = doc.surfaces != null && !forcedSsr ? "spa" : "ssr";
  }
  for (const routeId of SPA_PUBLIC_ROUTES) surfaces[routeId] = "ssr";
  return {
    ...(principal != null ? { principal } : {}),
    theme: {
      ...(theme?.appTheme != null ? { appTheme: theme.appTheme } : {}),
      ...(projectTheme != null ? { paperTheme: projectTheme } : {}),
    },
    deviceClass,
    surfaces,
    ...(slug != null ? { project: { slug } } : {}),
    // R7RO.1 (REQ-DWEB-14) — the document-level read-only fact the Page routes stamp for a
    // showcase row (the `demo` slot is 220's payload); a `run_lock` lives on the twin instead.
    ...(opts?.readOnlyProject != null ? { readOnlyProject: opts.readOnlyProject } : {}),
    ...(opts?.demo != null ? { demo: opts.demo } : {}),
  };
}

/**
 * REQ-BND-4 — the shell document itself. Head parity with `renderDocument` (title via
 * `docMetaFor`, favicon enumeration, viewport, theme boot + both stylesheets); the body is the
 * mount node + the honest noscript floor + the boot embed + the manifest entry tags.
 * `opts.entry` is the caller's manifest resolution — `{ moduleScripts: [] }` degrades to a shell
 * that renders nothing client-side (the noscript message still answers the no-JS floor).
 */
export function renderSpaShell(
  c: Context,
  opts: { path: string; boot: SpaBootPayload; entry: SpaManifestEntry },
): string {
  const { path, boot, entry } = opts;
  const doc = docMetaFor(path, {});
  const pref = boot.theme.appTheme;
  const resolved = pref ? resolveAppTheme(pref, false) : "dark";
  // NAVC.2 (REQ-NAVT-1, O2-F18) — `data-nav-count="0"` rides the shell too: the count is the
  // committed-transition tally HeadManager increments in-document, and the NEXT document load
  // resetting it to "0" is itself the nav-mechanism detector.
  const htmlAttrs =
    `lang="en" data-theme="${resolved}"` +
    ` data-renderer="spa" data-device="${boot.deviceClass}"` +
    ` data-nav-count="0"` +
    (pref ? ` data-app-theme="${escapeHtml(pref)}"` : "") +
    (boot.theme.paperTheme != null ? ` data-paper="${escapeHtml(boot.theme.paperTheme)}"` : "") +
    (boot.project != null ? ` data-project="${escapeHtml(boot.project.slug)}"` : "");
  const assetHref = (file: string) => `/assets/spa/${escapeHtml(file)}`;
  const head =
    `<head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">` +
    `<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="icon" href="/favicon.ico" sizes="any">` +
    `<title>${escapeHtml(doc.title)}</title>` +
    `<script>${BOOT}</script>` +
    `<style>${THEME_CSS}</style><style>${IDE_CSS}</style><style>${UI_CSS}</style>` +
    entry.preloads.map((f) => `<link rel="modulepreload" href="${assetHref(f)}">`).join("") +
    entry.stylesheets.map((f) => `<link rel="stylesheet" href="${assetHref(f)}">`).join("") +
    `</head>`;
  // REQ-BND-12 — the no-JS floor names the surface honestly. SPA.28: the `?ssr=1` escape link is
  // gone — no SSR document exists to land on any more, so the floor is the honest message alone
  // (a dead link to a shell-serving URL would lie about the floor it claims to be).
  const noscript = `<noscript><p>${escapeHtml(COPY.spaShell.noJs)}</p></noscript>`;
  // `<` → `<` inside the JSON embed so a `<\/script>`-shaped string can't close the element.
  const bootJson = JSON.stringify(boot).replace(/</g, "\\u003c");
  return (
    `<!doctype html><html ${htmlAttrs}>${head}` +
    `<body><div id="spa-root" data-spa-root></div>${noscript}` +
    `<script type="application/json" data-spa-boot>${bootJson}</script>` +
    entry.moduleScripts
      .map((f) => `<script type="module" src="${assetHref(f)}"></script>`)
      .join("") +
    `</body></html>`
  );
}

/**
 * SPA.28 — THE shell serve seam: every authenticated document handler calls this at spec §4's
 * fixed position and the catch-all calls it for session'd SPA-space GETs. There is no consult —
 * the flipped surfaces' SSR documents are deleted (spec §12.3's "once-only" posture) and no
 * request signal (`?ssr=1`, `?renderer=spa`, `x-rhema-renderer`) is read anywhere on this path.
 * The boot map's static truth (`spaBootPayload`) keeps a leaf mounting on its own route.
 */
export async function spaShellDocument(
  c: Context,
  deps: SpaShellDeps,
  session: SessionHeaders,
  opts?: {
    paperTheme?: PaperTheme;
    readOnlyProject?: ReadOnlyProject;
    /** R7DEM.4 (REQ-DWEB-6; ADR-126) — the demo shell's boot fact; see `spaBootPayload`. */
    demo?: { essay: string; slug: string; signedIn: boolean; build: string | null };
  },
): Promise<Response> {
  const root = deps.spaAssetRoot ?? DEFAULT_SPA_ASSET_ROOT;
  const [boot, entry] = await Promise.all([
    spaBootPayload(c, deps, session, opts),
    loadSpaManifest(root, deps.warn ?? ((m) => console.warn(m))),
  ]);
  return c.html(renderSpaShell(c, { path: c.req.path, boot, entry }));
}

// SPA.28 — `spaShellResponse` (the per-request flag-consult seam) is deleted with the machinery it
// wrapped: nothing on the request path may veto the shell any more.
