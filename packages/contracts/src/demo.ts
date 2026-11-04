// R7DEM.4 (REQ-DWEB-1; ADR-126) — the demo serving vocabulary, shared by the web server's
// guard/shell and the SPA's demo detection (220a). The reserved `demo~<essay>` slug namespace is
// collision-free by construction: the api's `slugify` emits only `[a-z0-9-]`, so no tenant
// project can ever hold a `demo~` slug, and every hand-built `/p/${slug}` href stays inside the
// namespace once a demo row resolves (R3 §3 option (b)).
//
// The registry is the single allowlist of served essays — the corpus key (filesystem dir), the
// public slug form, and the title doc-meta needs before any snapshot read. `fixture: true` marks
// the committed synthetic mini-corpus (S-12): it is served so every test exercises the real path,
// and 221a's hub excludes it from the public card list.

import { spaRouteFor } from "./spa.js";

/** The reserved slug prefix — `~` is outside the api slug grammar, so the namespace can never
 *  collide with a tenant slug. */
export const DEMO_SLUG_PREFIX = "demo~";

/** One registered demo essay. */
export interface DemoEssay {
  /** The corpus essay key — the `snapshots/<essay>/` + `corpus/<essay>/` directory name. */
  readonly essay: string;
  /** The project slug form (`demo~<essay>`) the demo twins + paths carry. */
  readonly slug: string;
  /** The essay's display title (doc-meta + cards — the same string projects.json carries). */
  readonly title: string;
  /** The committed synthetic fixture — served, but not a public hub card (221a filters it). */
  readonly fixture?: boolean;
}

/**
 * The essay registry — every essay `demoDataSource` may serve. Ordered for the hub/card surface.
 * A `demo~` slug outside this list is an unknown demo slug: the guard answers a terminal 404,
 * never the shell (REQ-DWEB-2/4).
 */
export const DEMO_ESSAYS: readonly DemoEssay[] = [
  {
    essay: "structure-of-political-difference",
    slug: "demo~structure-of-political-difference",
    title: "The Structure of Political Difference",
  },
  {
    essay: "the-governable-mind",
    slug: "demo~the-governable-mind",
    title: "The Governable Mind",
  },
  {
    essay: "constitution-of-reason",
    slug: "demo~constitution-of-reason",
    title: "The Constitution of Reason",
  },
  {
    essay: "the-politics-of-visibility",
    slug: "demo~the-politics-of-visibility",
    title: "The Politics of Visibility",
  },
  {
    essay: "the-borrowed-commons",
    slug: "demo~the-borrowed-commons",
    title: "The Borrowed Commons: a Grammar of Shared Decay",
    fixture: true,
  },
];

/** `demo~<essay>` AND registered — an unregistered `demo~zzz` is NOT a demo slug (it 404s). */
export function isDemoSlug(slug: string | null | undefined): slug is string {
  return slug != null && DEMO_ESSAYS.some((e) => e.slug === slug);
}

/** A slug that carries the reserved prefix but is not registered — the guard's 404 arm claims it. */
export function isDemoSlugPrefix(slug: string | null | undefined): boolean {
  return slug != null && slug.startsWith(DEMO_SLUG_PREFIX);
}

/** The registry row for a `demo~` slug (null when unregistered). */
export function demoEssayForSlug(slug: string | null | undefined): DemoEssay | null {
  return DEMO_ESSAYS.find((e) => e.slug === slug) ?? null;
}

/** The registry row for a corpus essay key (null when unregistered). */
export function demoEssayFor(essay: string | null | undefined): DemoEssay | null {
  return DEMO_ESSAYS.find((e) => e.essay === essay) ?? null;
}

/** `demo~<essay>` for a registered essay key (null when unregistered). */
export function demoSlugFor(essay: string | null | undefined): string | null {
  return demoEssayFor(essay)?.slug ?? null;
}

/**
 * The demo allowlist (REQ-DWEB-2): the document routeIds whose twins + shells the demo serves,
 * plus the JSON endpoints that ride the same `/p/<slug>` namespace. Shared by the server's guard
 * (the 404/forward decision) and 220a's SPA boot — a path outside this list is a terminal 404,
 * never the shell.
 */
export const DEMO_ROUTE_IDS = [
  "/p/$project",
  "/p/$project/v/$v",
  "/p/$project/v/$n/diff/$m",
  "/p/$project/a/$artifactId",
  "/p/$project/revisions/$cid",
  "/p/$project/review/$runId",
  "/p/$project/r/$runId",
  "/p/$project/figures",
  "/p/$project/figures/$figureId",
  "/p/$project/palette-search",
] as const;

/**
 * The subset that is a DOCUMENT route — its `/p/demo~*` GET serves the outer-app demo shell and
 * its `/bff/p/demo~*` GET forwards to the nested JSON app. `palette-search` is the only demo
 * endpoint: it answers JSON on the `/p/` path itself (no document arm), so it always forwards.
 */
export const DEMO_DOCUMENT_ROUTE_IDS: readonly string[] = DEMO_ROUTE_IDS.filter(
  (id) => id !== "/p/$project/palette-search",
);

// ---- 220a (REQ-DWEB-9/11/16; S-1, S-14) — the public↔internal path mapping + the boundary
// predicate. The SPA's TanStack `rewrite` and the click interceptor share these: the public
// form `/demo/<essay>/…` is what documents + address bars carry; the internal form
// `/p/demo~<essay>/…` is what the route tree + every hand-built `/p/${slug}` href carries.

/** `/demo/<essay>/rest` → `/p/demo~<essay>/rest` for a REGISTERED essay; null otherwise
 *  (`/demo` alone is the SSR hub — no client route — and an unregistered essay must reach the
 *  server's terminal 404, never a fuzzy SPA match). */
export function demoInternalPath(pathname: string): string | null {
  const m = /^\/demo\/([^/]+)(\/.*)?$/.exec(pathname);
  if (m == null) return null;
  const slug = `${DEMO_SLUG_PREFIX}${m[1]}`;
  if (!isDemoSlug(slug)) return null;
  return `/p/${slug}${m[2] ?? ""}`;
}

/** `/p/demo~<essay>/rest` → `/demo/<essay>/rest` for a REGISTERED essay; null otherwise. */
export function demoPublicPath(pathname: string): string | null {
  const m = /^\/p\/demo~([^/]+)(\/.*)?$/.exec(pathname);
  if (m == null) return null;
  const slug = `${DEMO_SLUG_PREFIX}${m[1]}`;
  if (!isDemoSlug(slug)) return null;
  return `/demo/${m[1]}${m[2] ?? ""}`;
}

/**
 * The S-14 boundary predicate: is `pathname` inside the demo namespace — the `/demo` hub, a
 * `/demo/<essay>/…` document, or a `/p/demo~…` internal-form path? PREFIX-scoped on purpose:
 * an unregistered `demo~zzz` still counts as demo-space so a non-demo boot document-navigates
 * it to the server's terminal 404 instead of fuzzy-matching `/p/$project` client-side.
 */
export function isDemoNamespacePath(pathname: string | null | undefined): boolean {
  if (pathname == null) return false;
  return (
    pathname === "/demo" ||
    pathname.startsWith("/demo/") ||
    /^\/p\/demo~/.test(pathname)
  );
}

// ---- 221a R7DEM.5b (REQ-TOUR-1/8) — the hub's card order, the stable deep-link builder, and
// the tour-entry href 222 consumes.

/**
 * The hub's card order: SPD (the hero — it carries the tour CTA), GM, POV, CoR. Every row is a
 * non-fixture `DEMO_ESSAYS` member; the synthetic fixture never renders a public card.
 */
export const DEMO_HUB_ESSAYS = [
  "structure-of-political-difference",
  "the-governable-mind",
  "the-politics-of-visibility",
  "constitution-of-reason",
] as const;

/**
 * A stable deep link into a demo essay (REQ-TOUR-8): the public `/demo/<essay>…` form with the
 * DOM-contract hook as the `#fragment` — `#data-demo-escalation` names the same hook the tours
 * and legs resolve to a `[data-demo-escalation]` selector. `route` is the essay-relative path
 * (`""` = the essay root, `/v/1`, `/review/<runId>`, `/a/<flattened-artifactId>`…).
 *
 * Fail-closed: an unregistered essay or a `route` whose mapped `/p/demo~…` path resolves to no
 * `DEMO_ROUTE_IDS` member throws — a card bullet can never deep-link outside the allowlist.
 */
export function demoDeepLink(essay: string, route = "", hook?: string): string {
  const row = demoEssayFor(essay);
  if (row == null) throw new Error(`demoDeepLink: unregistered essay ${essay}`);
  const inner = route === "" ? "" : route.startsWith("/") ? route : `/${route}`;
  const routeId = spaRouteFor(`/p/${row.slug}${inner}`).routeId;
  if (routeId == null || !(DEMO_ROUTE_IDS as readonly string[]).includes(routeId)) {
    throw new Error(`demoDeepLink: /demo/${essay}${inner} resolves to ${routeId ?? "no route"} — outside DEMO_ROUTE_IDS`);
  }
  return `/demo/${essay}${inner}${hook ? `#${hook}` : ""}`;
}

/** The tour-entry href the hub's hero CTA carries and 222_R7DEM.6a consumes (REQ-TOUR-2's
 *  tour opens on SPD's essay root — the Published card). */
export const DEMO_TOUR_ENTRY_HREF = demoDeepLink("structure-of-political-difference");
