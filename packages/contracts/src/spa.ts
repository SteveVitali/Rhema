// SPA surface vocabulary (SPA.2; spec docs/frontend-spa-spec.md §11 + Appendix D; REQ-SEQ-1/2;
// design/29 §flag-mechanism). SPA.28 disposition — STAGE-FACT MIGRATION NOTE: `SPA_SURFACES`
// was a CSV env + `parseSpaSurfaces` + a per-request `deps.spa` consult while the strangler
// migration window was open. The window is closed: all 14 surfaces flipped, the SSR documents
// are deleted (SPA.27), and the override channels (`?ssr=1`, `?renderer=spa`,
// `x-rhema-renderer`, `SPA_OVERRIDES`, `SPA_RENDERER_HEADER`) are removed (REQ-SEQ-4's removal
// leg). What survives is the VOCABULARY alone — the route-map keys, the journey `--surface`
// selector, the surface-gate table — as an always-on fact. Nothing parses it from env and no
// request-path code consults it.
//
// The request-path renderer decision is now a single forced-SSR capability check in the Page
// family's handlers (phone/showcase — REQ-ED-12): the session gate and server-owned redirects
// still run ahead of every document, then phone/showcase rows keep their server-rendered Page;
// every other authenticated document GET serves the shell unconditionally.

/**
 * The surface vocabulary — the 14 surface keys + the `ide-chrome` composite (REQ-SEQ-2; spec
 * Appendix D, verbatim order = the normative flip order, `editor` last). SPA.28: no longer a
 * flag set — it is the static census of record the route map + journey surface gates key off
 * (`ide-chrome` has no route of its own; it is the `p.$project` layout (panes/palette/keymap)
 * the IDE-framed routes mount inside).
 */
export const SPA_SURFACES = [
  "usage",
  "inbox",
  "settings",
  "voices",
  "onboarding",
  "project-home",
  "billing",
  "export",
  "outline",
  "figures",
  "run-sheet",
  "dossier",
  "run-report",
  "editor",
  "ide-chrome",
] as const;
export type SpaSurface = (typeof SPA_SURFACES)[number];

/**
 * The keys whose EVERY route mounts inside the IDE chrome (design/29 §route-map "IDE-framed"
 * column). SPA.28: the AND-gate it fed is gone with the consult — this survives as a
 * documentation fact (which surfaces' routes are chrome-framed); the ROUTE-granular set the
 * client layout actually gates on is `SPA_IDE_FRAMED_ROUTES`. `onboarding` is deliberately
 * absent: only its two `/p/:p/import*` legs are IDE-framed (route-level framing in the map).
 */
export const SPA_IDE_FRAMED_SURFACES: readonly SpaSurface[] = [
  "export",
  "dossier",
  "run-sheet",
  "run-report",
  "editor",
];

/**
 * The routeIds that mount INSIDE the §5.1 IDE chrome (design/29 §route-map "IDE-framed" column +
 * the SSR `ideContext` call sites): every `/p/:p…` document the server wraps in `IdeFrame` today.
 * The `p.$project` layout consults this set — a flipped IDE-framed leaf mounts `<IdeChrome>`; an
 * unframed leaf (`/p/:p/settings`, `/outline`, `/figures`, `/usage`, `/obligations/new`) renders
 * outside the shell even when it flips. Kept at key granularity in `SPA_IDE_FRAMED_SURFACES` for
 * the flag consult, at route granularity here for the layout gate.
 */
export const SPA_IDE_FRAMED_ROUTES: readonly string[] = [
  "/p/$project",
  "/p/$project/import",
  "/p/$project/import/preview",
  "/p/$project/run",
  "/p/$project/review/$runId",
  "/p/$project/r/$runId",
  "/p/$project/revisions/$cid",
  "/p/$project/v/$v",
  "/p/$project/v/$n/diff/$m",
  "/p/$project/a/$artifactId",
  "/p/$project/export",
];

// SPA.28 — REQ-SEQ-4's removal leg: `SPA_RENDERER_HEADER` ("x-rhema-renderer") and
// `parseSpaSurfaces` (the `SPA_SURFACES` env reader) are DELETED with the override machinery.
// The journey harness's `--pin-renderer` retired with them (its `--expect-renderer`/`--surface`
// stay — the `data-renderer` markers remain contractually true).

// ---------------------------------------------------------------------------
// SPA.3 — the path → route-id / surface-key map (REQ-BND-4/11; design/26 §shell-doc §catch-all;
// design/25 §route-tree). `routeId` is the emitted `data-route` value AND the key into the boot
// payload's `surfaces` map; the convention is the TanStack file-route path pattern in `$param`
// form (design/25's naming note: route ids are path-derived, so both renderers emit the same
// string for the same shape). `surfaces` names the surface key(s) the route belongs to —
// SPA.28: no longer a consult input; a non-null set marks the route SPA space (shell-served),
// and the multi-key rows (`/p/:p/import*`: `onboarding` + `ide-chrome`) record the route-level
// IDE framing. `null` ⇒ never SPA space: the path is a public document, a server-owned
// redirect-only GET, or a non-document endpoint.

/** One known document route shape for the settle/boot vocabulary. */
export interface SpaDocumentRoute {
  /** The emitted route id — the route's path pattern in `$param` form. */
  readonly routeId: string;
  /** The surface key(s) the route belongs to; null ⇒ server-owned (never serves the shell). */
  readonly surfaces: readonly SpaSurface[] | null;
  /**
   * The route mounts the editable/read-only Page (REQ-ED-12 + REQ-VFY-5): phone requests and the
   * `showcase` row flag keep the server-rendered Page — the one remaining request-path renderer
   * decision — and the boot map mirrors it so the SPA never enables collab by asking.
   */
  readonly pageMount?: boolean;
}

/**
 * The public funnel documents — never SPA space (REQ-BND-5), listed so `data-route` resolves a
 * stable id on their SSR documents and the boot map can mark them `"ssr"` explicitly.
 * R6LGL.1 (REQ-LCH-1) added the legal/trust documents — they are public-SSR forever like the
 * rest of the funnel and stay OUT of `SPA_DOCUMENT_ROUTES` (that census's `surfaces: null`
 * rows are server-owned *redirect* GETs registered as `_authenticated` reload stubs; a public
 * page is neither, and an out-of-tree same-origin anchor already doc-navs natively).
 */
export const SPA_PUBLIC_ROUTES = [
  "/",
  "/invite",
  "/pricing",
  "/signup",
  "/login",
  "/showcase",
  "/terms",
  "/privacy",
  "/refunds",
  "/acceptable-use",
  "/contact",
  // R7DEM.4 (REQ-DWEB-9; ADR-126) — the public demo hub: SSR forever like the funnel. `/demo/<essay>`
  // documents are the demo shell's business (the guard serves them), not SPA_PUBLIC rows.
  "/demo",
] as const;

/**
 * The authenticated prefix set (design/26 §catch-all): a GET under any of these with no session
 * gets the same `/login` redirect every authenticated route enforces — a signed-out deep link
 * never sees the shell NOR the public 404. A path under NONE of them is not SPA space (SSR 404).
 */
export const SPA_PREFIXES = ["/app", "/p", "/v", "/voices", "/usage", "/billing", "/settings"] as const;

/**
 * The full authenticated document enumeration (design/29 §route-map applied to design/25's
 * tree). Ordered, but regex-anchored matching makes order informational only — each path shape
 * matches at most one row. `surfaces: null` rows are the registered server-owned GETs
 * (redirect-only targets); they still name a routeId so an unmatched request under them gets an
 * honest `data-route` on the SSR fallback.
 */
export const SPA_DOCUMENT_ROUTES: readonly SpaDocumentRoute[] = [
  { routeId: "/app", surfaces: ["project-home"] },
  { routeId: "/app/new", surfaces: ["onboarding"] },
  { routeId: "/app/new/preview", surfaces: ["onboarding"] },
  { routeId: "/app/inbox", surfaces: ["inbox"] },
  { routeId: "/app/usage/r/$runId", surfaces: null }, // server-owned → API passthrough (REQ-BND-3)
  { routeId: "/usage", surfaces: ["usage"] },
  { routeId: "/billing/return", surfaces: ["billing"] },
  { routeId: "/app/settings", surfaces: null }, // bare → server 302 to /app/settings/account
  { routeId: "/app/settings/account", surfaces: ["settings"] },
  { routeId: "/app/settings/preferences", surfaces: ["settings"] },
  { routeId: "/app/settings/notifications", surfaces: ["settings"] },
  { routeId: "/app/settings/integrations", surfaces: ["settings"] },
  { routeId: "/app/settings/data", surfaces: ["settings"] },
  { routeId: "/app/settings/billing", surfaces: ["billing"] },
  { routeId: "/settings", surfaces: null }, // legacy alias → server 302 (REQ-BND-3)
  { routeId: "/settings/billing", surfaces: ["billing"] },
  { routeId: "/voices", surfaces: ["voices"] },
  { routeId: "/voices/new", surfaces: ["voices"] },
  { routeId: "/v/$persona", surfaces: ["voices"] },
  { routeId: "/p/$project", surfaces: ["editor"], pageMount: true },
  { routeId: "/p/$project/import", surfaces: ["onboarding", "ide-chrome"] },
  { routeId: "/p/$project/import/preview", surfaces: ["onboarding", "ide-chrome"] },
  { routeId: "/p/$project/run", surfaces: ["run-sheet"] },
  { routeId: "/p/$project/review/$runId", surfaces: ["dossier"] },
  { routeId: "/p/$project/r/$runId", surfaces: ["run-report"] },
  { routeId: "/p/$project/revisions/$cid", surfaces: ["editor"], pageMount: true },
  { routeId: "/p/$project/v/$v", surfaces: ["editor"], pageMount: true },
  { routeId: "/p/$project/v/$n/diff/$m", surfaces: ["editor"], pageMount: true },
  { routeId: "/p/$project/a/$artifactId", surfaces: ["editor"], pageMount: true },
  { routeId: "/p/$project/edit/$draftId", surfaces: null }, // canonical redirect (REQ-BND-3)
  { routeId: "/p/$project/f/$fid", surfaces: null }, // the server's blob redirect
  { routeId: "/p/$project/export", surfaces: ["export"] },
  { routeId: "/p/$project/outline", surfaces: ["outline"] },
  { routeId: "/p/$project/outline/promote", surfaces: ["outline"] },
  { routeId: "/p/$project/figures", surfaces: ["figures"] },
  { routeId: "/p/$project/figures/$figureId", surfaces: ["figures"] },
  { routeId: "/p/$project/visualize", surfaces: ["figures"] },
  { routeId: "/p/$project/obligations/new", surfaces: ["dossier"] },
  { routeId: "/p/$project/settings", surfaces: ["settings"] },
  { routeId: "/p/$project/usage", surfaces: ["usage"] },
  { routeId: "/p/$project/voice/reseed", surfaces: ["voices"] },
];

/** The route map's answer for one pathname — `routeId` + the surface key(s), or null for both. */
export interface SpaRouteMatch {
  /** The route's `$param` id; null when the path isn't a known document route shape. */
  readonly routeId: string | null;
  /**
   * The surface key(s) the path belongs to (SPA.28: informational — no consult reads it);
   * null ⇒ not SPA space — the catch-all must never serve the shell for it (public documents,
   * server-owned redirect GETs, non-document endpoints).
   */
  readonly surfaces: readonly SpaSurface[] | null;
}

/** `/p/$project/v/$v` → `/^\/p\/[^/]+\/v\/[^/]+$/` — `$param` is the only interpolation. */
function routeIdPattern(routeId: string): RegExp {
  // Escape regex metachars FIRST, then unfold the escaped `$param` placeholders.
  const re = routeId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\$[\w]+/g, "[^/]+");
  return new RegExp(`^${re}$`);
}

const RULES = [...SPA_DOCUMENT_ROUTES, ...SPA_PUBLIC_ROUTES.map((routeId) => ({ routeId, surfaces: null }))].map(
  (row) => ({ row, re: routeIdPattern(row.routeId) }),
);

/**
 * The fallback surface owner for an UNKNOWN path under a known SPA prefix — the catch-all's deep
 * links (`/p/acme/future-route`, `/app/whatever`) resolve to the longest-prefix surface so the
 * catch-all hands them to the client router (which renders its own not-found). The returned
 * `routeId` stays null — the path isn't a known document shape.
 */
function fallbackSurfaces(segs: string[]): readonly SpaSurface[] | null {
  const [top, mid] = [segs[0], segs[1]];
  if (top === "app") {
    if (mid === "new") return ["onboarding"];
    if (mid === "inbox") return ["inbox"];
    if (mid === "settings") return segs[2] === "billing" ? ["billing"] : ["settings"];
    if (mid === "usage") return ["usage"];
    return ["project-home"];
  }
  if (top === "p" && segs.length >= 2) {
    switch (segs[2]) {
      case "import":
        return ["onboarding", "ide-chrome"];
      case "export":
        return ["export"];
      case "outline":
        return ["outline"];
      case "figures":
      case "visualize":
        return ["figures"];
      case "review":
      case "obligations":
        return ["dossier"];
      case "run":
        return ["run-sheet"];
      case "r":
        return ["run-report"];
      case "settings":
        return ["settings"];
      case "usage":
        return ["usage"];
      case "voice":
        return ["voices"];
      default:
        return ["editor"];
    }
  }
  if (top === "v" || top === "voices") return ["voices"];
  if (top === "usage") return ["usage"];
  if (top === "billing") return ["billing"];
  if (top === "settings") return mid === "billing" ? ["billing"] : ["settings"];
  return null;
}

/**
 * Resolve a request pathname to its document route id + surface key(s). Normalizes a trailing
 * slash (`/app/` ≡ `/app`) so the catch-all and `data-route` agree on the route shape. Returns
 * `{routeId: null, surfaces: null}` for anything outside the authenticated SPA space — the
 * not-found document then stamps the normalized pathname as its `data-route`.
 */
export function spaRouteFor(pathname: string): SpaRouteMatch {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  for (const { row, re } of RULES) {
    if (re.test(path)) return { routeId: row.routeId, surfaces: row.surfaces };
  }
  const segs = path.split("/").filter((s) => s !== "");
  const surfaces = fallbackSurfaces(segs);
  if (surfaces == null) return { routeId: null, surfaces: null };
  return { routeId: null, surfaces };
}
