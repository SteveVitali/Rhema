// SPA surface flags (SPA.2; spec docs/frontend-spa-spec.md §11 + Appendix D; REQ-SEQ-1/2;
// design/29 §flag-mechanism — the strangler consult's shared vocabulary). `SPA_SURFACES` is a
// CSV MODE STRING env (never a secret — same class as `SIGNUP_MODE`): it names which
// authenticated document GETs serve the SPA shell instead of the SSR document. Unset ⇒ ∅ —
// every surface stays SSR, so a deploy typo can never silently flip a surface (the
// `parseSignupMode` fail-closed precedent end-to-end).
//
// The per-request consult (`deps.spa(c, surface)` in apps/web) applies spec §4's fixed handler
// order: the session gate, server-owned redirects, and forced-SSR capability checks all run in
// the route handler BEFORE the consult; inside the consult the renderer override
// (`?ssr=1`/`x-rhema-renderer`, honored per REQ-SEQ-4) precedes flag membership, and the
// `ide-chrome` AND-gate applies last.

/**
 * The flag vocabulary — the 14 surface keys + the `ide-chrome` composite (REQ-SEQ-2; spec
 * Appendix D, verbatim order = the normative flip order, `editor` last). `ide-chrome` has no
 * route of its own: it is the `p.$project` layout (panes/palette/keymap) and exists as a key so
 * a chrome-wide rollback is a one-line flag removal (design/29 F12 Q6).
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
 * column): an IDE-framed route serves SPA iff its surface key AND `ide-chrome` are both flagged
 * (REQ-SEQ-2 — the AND-gate, last in the consult). `onboarding` is deliberately absent: only
 * its two `/p/:p/import*` legs are IDE-framed, so those handlers compose the gate at route
 * level (`deps.spa(c, "onboarding") && deps.spa(c, "ide-chrome")`) — key-level framing would
 * wrongly hold `/app/new` hostage to the chrome flag.
 */
export const SPA_IDE_FRAMED_SURFACES: readonly SpaSurface[] = [
  "export",
  "dossier",
  "run-sheet",
  "run-report",
  "editor",
];

/**
 * REQ-SEQ-4 (spec Appendix D) — the request-level renderer override channel:
 * `x-rhema-renderer: ssr|spa`. The `ssr` half (with `?ssr=1`) is honored on EVERY stage during
 * the migration window — it is the journey leg-A pin + the incident/debug escape hatch; the
 * `spa` half (with `?renderer=spa`) is honored only where the deploy sets `SPA_OVERRIDES=1`
 * (non-prod kinds only). Overrides never bypass the session gate, server redirects, or the
 * forced-SSR capability checks — those run ahead of the flag consult.
 */
export const SPA_RENDERER_HEADER = "x-rhema-renderer";

const KNOWN: ReadonlySet<string> = new Set(SPA_SURFACES);

/**
 * Parse the `SPA_SURFACES` CSV. Fail-closed: unset/empty ⇒ ∅; unknown tokens are dropped and
 * reported in ONE warn line (never thrown, never fail open — the signupMode precedent).
 * `warn` defaults to `console.warn`; tests inject a collector.
 */
export function parseSpaSurfaces(
  raw: string | undefined | null,
  warn: (msg: string) => void = (m) => console.warn(m),
): ReadonlySet<SpaSurface> {
  const out = new Set<SpaSurface>();
  const dropped: string[] = [];
  for (const token of (raw ?? "").split(",")) {
    const t = token.trim();
    if (t === "") continue;
    if (KNOWN.has(t)) out.add(t as SpaSurface);
    else dropped.push(t);
  }
  if (dropped.length > 0) {
    warn(`[rhema] SPA_SURFACES: dropping unknown surface token(s): ${dropped.join(", ")}`);
  }
  return out;
}

// ---------------------------------------------------------------------------
// SPA.3 — the path → route-id / surface-key map (REQ-BND-4/11; design/26 §shell-doc §catch-all;
// design/25 §route-tree). `routeId` is the emitted `data-route` value AND the key into the boot
// payload's `surfaces` map; the convention is the TanStack file-route path pattern in `$param`
// form (design/25's naming note: route ids are path-derived, so both renderers emit the same
// string for the same shape). `surfaces` is the flag key(s) the document's consult ANDs — the
// two `/p/:p/import*` legs consult `onboarding` AND `ide-chrome` (their IDE framing is per-route,
// not per-key). `null` ⇒ never SPA space: the path is a public document, a server-owned
// redirect-only GET, or a non-document endpoint.

/** One known document route shape for the settle/boot vocabulary. */
export interface SpaDocumentRoute {
  /** The emitted route id — the route's path pattern in `$param` form. */
  readonly routeId: string;
  /** The surface key(s) the consult ANDs; null ⇒ server-owned (never serves the shell). */
  readonly surfaces: readonly SpaSurface[] | null;
  /**
   * The route mounts the editable/read-only Page (REQ-ED-12 + REQ-VFY-5): phone requests and the
   * `showcase` row flag keep the server-rendered Page even when `editor` flips — the consult's
   * forced-SSR step is a document decision and the boot map mirrors it so the SPA never enables
   * collab by asking.
   */
  readonly pageMount?: boolean;
}

/**
 * The public funnel documents — never SPA space (REQ-BND-5), listed so `data-route` resolves a
 * stable id on their SSR documents and the boot map can mark them `"ssr"` explicitly.
 */
export const SPA_PUBLIC_ROUTES = ["/", "/invite", "/pricing", "/signup", "/login", "/showcase"] as const;

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

/** The consult's answer for one pathname — `routeId` + the surface key(s), or null for both. */
export interface SpaRouteMatch {
  /** The route's `$param` id; null when the path isn't a known document route shape. */
  readonly routeId: string | null;
  /**
   * The surface key(s) to consult (ANDed); null ⇒ not SPA space — the catch-all must never serve
   * the shell for it (public documents, server-owned redirect GETs, non-document endpoints).
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
 * flag consult can still hand them to the client router (which renders its own not-found). The
 * returned `routeId` stays null — the path isn't a known document shape.
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
