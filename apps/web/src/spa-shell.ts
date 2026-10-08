// SPA.3 — the SPA shell document (spec §3.1/§4; REQ-BND-4/11/12; design/26 §shell-doc §catch-all;
// design/25 §route-tree). `renderSpaShell` is the pure template; `spaShellResponse` is the
// handler-level "serve the shell iff this document's surface consult resolves" seam every
// flag-eligible authenticated GET calls at spec §4's fixed position — AFTER the session gate,
// server-owned redirects, and forced-SSR capability checks.
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
import { SPA_DOCUMENT_ROUTES, SPA_PUBLIC_ROUTES, type SpaSurface } from "@rhema/contracts";
import { themeCss, ideCss } from "@rhema/tokens";
import { docMetaFor, escapeHtml } from "./render.js";
import { deviceClassFor } from "./device.js";
import type { SpaBoot } from "./spa-boot.js";
import { COPY } from "./copy.js";
import type { DataSource, SessionHeaders } from "./data.js";

const THEME_CSS = themeCss();
const IDE_CSS = ideCss();
const BOOT = themeBootScript();

/**
 * The seam the route handlers + the catch-all call — a `Pick` of `DataSource` (test stubs carry
 * only the two reads the boot needs) plus the flag consult and the asset-root/log overrides.
 * `WebDeps` satisfies this structurally.
 */
export interface SpaShellDeps {
  readonly dataSource: Pick<DataSource, "getSessionPrincipal" | "getTheme">;
  /** The per-request surface consult (`deps.spa` in server.ts; session-gated, override-aware). */
  spa?(c: Context, surface: SpaSurface): boolean;
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

/** `/p/<slug>/…` → `slug` for the boot's `project` key; anything else ⇒ absent. */
function projectSlugFor(pathname: string): string | null {
  const segs = pathname.split("/").filter((s) => s !== "");
  return segs[0] === "p" && segs[1] != null ? segs[1] : null;
}

/**
 * Build the boot payload for the request: the session principal + theme best-effort reads
 * (degraded upstream ⇒ the field is omitted, never thrown), the request's device class, the
 * per-route renderer map resolved through `deps.spa`, and the project slug for `/p/<slug>` paths.
 */
export async function spaBootPayload(
  c: Context,
  deps: SpaShellDeps,
  session: SessionHeaders,
  opts?: { paperTheme?: PaperTheme },
): Promise<SpaBootPayload> {
  const [principal, theme] = await Promise.all([
    Promise.resolve()
      .then(() => deps.dataSource.getSessionPrincipal?.(session))
      .catch(() => null),
    Promise.resolve()
      .then(() => deps.dataSource.getTheme?.(session))
      .catch(() => null),
  ]);
  const deviceClass = deviceClassFor(c);
  const memo = new Map<SpaSurface, boolean>();
  const consult = (key: SpaSurface): boolean => {
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    const resolved = deps.spa?.(c, key) === true;
    memo.set(key, resolved);
    return resolved;
  };
  const surfaces: Record<string, "spa" | "ssr"> = {};
  for (const doc of SPA_DOCUMENT_ROUTES) {
    // REQ-ED-12/REQ-VFY-5 — a page-mounting route stays "ssr" on phone even when `editor` flips:
    // the forced-SSR posture is a capability decision, mirrored here so the SPA never mounts the
    // editable Page by asking.
    const forcedSsr = deviceClass === "phone" && doc.pageMount === true;
    surfaces[doc.routeId] =
      doc.surfaces != null && !forcedSsr && doc.surfaces.every(consult) ? "spa" : "ssr";
  }
  for (const routeId of SPA_PUBLIC_ROUTES) surfaces[routeId] = "ssr";
  const slug = projectSlugFor(c.req.path);
  return {
    ...(principal != null ? { principal } : {}),
    theme: {
      ...(theme?.appTheme != null ? { appTheme: theme.appTheme } : {}),
      ...(opts?.paperTheme != null ? { paperTheme: opts.paperTheme } : {}),
    },
    deviceClass,
    surfaces,
    ...(slug != null ? { project: { slug } } : {}),
  };
}

/**
 * REQ-BND-4 — the shell document itself. Head parity with `renderDocument` (title via
 * `docMetaFor`, favicon enumeration, viewport, theme boot + both stylesheets); the body is the
 * mount node + the honest noscript floor + the boot embed + the manifest entry tags.
 * `opts.entry` is the caller's manifest resolution — `{ moduleScripts: [] }` degrades to a shell
 * that renders nothing client-side (the noscript + SSR escape still answer the no-JS floor).
 */
export function renderSpaShell(
  c: Context,
  opts: { path: string; boot: SpaBootPayload; entry: SpaManifestEntry },
): string {
  const { path, boot, entry } = opts;
  const doc = docMetaFor(path, {});
  const pref = boot.theme.appTheme;
  const resolved = pref ? resolveAppTheme(pref, false) : "dark";
  const htmlAttrs =
    `lang="en" data-theme="${resolved}"` +
    ` data-renderer="spa" data-device="${boot.deviceClass}"` +
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
    `<style>${THEME_CSS}</style><style>${IDE_CSS}</style>` +
    entry.preloads.map((f) => `<link rel="modulepreload" href="${assetHref(f)}">`).join("") +
    entry.stylesheets.map((f) => `<link rel="stylesheet" href="${assetHref(f)}">`).join("") +
    `</head>`;
  // REQ-BND-12 — the no-JS floor names the surface honestly and links the SSR escape: `?ssr=1`
  // merged into the CURRENT query, so a renderer=spa'd request still lands the same route's
  // server document.
  const ssrUrl = new URL(c.req.url);
  ssrUrl.searchParams.set("ssr", "1");
  const ssrHref = `${ssrUrl.pathname}${ssrUrl.search}`;
  const noscript =
    `<noscript><p>${escapeHtml(COPY.spaShell.noJs)}</p>` +
    `<p><a href="${escapeHtml(ssrHref)}">${escapeHtml(COPY.spaShell.noJsSsr)}</a></p></noscript>`;
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
 * The handler seam — "serve the shell iff every surface key's consult resolves". Returns null
 * (the handler continues its SSR path) when ANY key fails: the session gate, a `?ssr=1` override,
 * flag membership, or the `ide-chrome` AND-gate. The consult re-checks the session itself, so an
 * override can never hand an anonymous request the shell. A non-empty `surfaces` array is an AND
 * composition (the `/p/:p/import*` legs: `["onboarding","ide-chrome"]`).
 */
export async function spaShellResponse(
  c: Context,
  deps: SpaShellDeps,
  surfaces: SpaSurface | readonly SpaSurface[],
  session: SessionHeaders,
  opts?: { paperTheme?: PaperTheme },
): Promise<Response | null> {
  const keys: readonly SpaSurface[] = typeof surfaces === "string" ? [surfaces] : surfaces;
  for (const key of keys) {
    if (deps.spa?.(c, key) !== true) return null;
  }
  const root = deps.spaAssetRoot ?? DEFAULT_SPA_ASSET_ROOT;
  const [boot, entry] = await Promise.all([
    spaBootPayload(c, deps, session, opts),
    loadSpaManifest(root, deps.warn ?? ((m) => console.warn(m))),
  ]);
  return c.html(renderSpaShell(c, { path: c.req.path, boot, entry }));
}
