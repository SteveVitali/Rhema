// SPA.4 (REQ-BND-10, REQ-FW-7; spec §3.2) — the `data-spa-boot` reader + the document-level boot
// singleton. The wire contract lives in `../spa-boot.ts` (shared with the server producer); the
// payload is a runtime SEED, never an authorization grant — the api remains the auth oracle through
// the refetchable `["session"]` query (spec §3.2).

import type { PrincipalDto } from "@rhema/api-client";
import { readOnlyProjectOf } from "@rhema/contracts";
import type { SpaBoot } from "../spa-boot.js";

export type { SpaBoot } from "../spa-boot.js";

/**
 * Read + minimally validate the `<script type="application/json" data-spa-boot>` embed. A missing or
 * malformed embed yields null — the caller mounts with an empty surface map (every route then answers
 * SsrHandoff → the server re-decides; fail-closed, never a crash).
 */
export function readSpaBoot(doc: Document = document): SpaBoot | null {
  const el = doc.querySelector("script[data-spa-boot]");
  const raw = el?.textContent;
  if (raw == null || raw === "") return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (parsed == null || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  const surfaces =
    o.surfaces != null && typeof o.surfaces === "object" && !Array.isArray(o.surfaces)
      ? (o.surfaces as Record<string, "spa" | "ssr">)
      : {};
  return {
    ...(o.principal != null && typeof o.principal === "object" ? { principal: o.principal as PrincipalDto } : {}),
    theme: o.theme != null && typeof o.theme === "object" ? (o.theme as SpaBoot["theme"]) : {},
    deviceClass: o.deviceClass === "phone" ? "phone" : "desktop",
    surfaces,
    ...(o.project != null && typeof o.project === "object"
      ? { project: o.project as { readonly slug: string } }
      : {}),
    // R7RO.1 (REQ-DWEB-14) — the read-only fact rides the boot verbatim; unknown shapes decode null.
    ...(readOnlyProjectOf(o.readOnlyProject) != null
      ? { readOnlyProject: readOnlyProjectOf(o.readOnlyProject)! }
      : {}),
    // R7DEM.4b (REQ-DWEB-6) — the demo fact decodes field-by-field (a malformed `demo` slot is
    // absent, never a partial truth the boundary predicates could misread).
    ...(demoOf(o.demo) != null ? { demo: demoOf(o.demo)! } : {}),
  };
}

/** A structurally-valid `demo` slot → the typed fact (unknown shapes decode null, fail-closed). */
function demoOf(raw: unknown): SpaBoot["demo"] | null {
  if (raw == null || typeof raw !== "object") return null;
  const d = raw as Record<string, unknown>;
  if (typeof d.essay !== "string" || typeof d.slug !== "string") return null;
  return {
    essay: d.essay,
    slug: d.slug,
    signedIn: d.signedIn === true,
    build: typeof d.build === "string" ? d.build : null,
  };
}

// The document-level boot is a singleton — the embed is stamped once per served shell. `mountSpa` reads
// it once and hands the object to the router context; the singleton exists so leaf components outside
// a provider's reach (the SsrHandoff fallback inside the not-found boundary) can still consult it.
let boot: SpaBoot | null = null;

export function getSpaBoot(): SpaBoot | null {
  return boot;
}

/** Set by `mountSpa` after `readSpaBoot`; tests set a synthetic boot directly. */
export function setSpaBoot(next: SpaBoot | null): void {
  boot = next;
}

/**
 * The effective renderer verdict for a routeId — `surfaces[routeId] === "spa"`. SPA.28: the map
 * is static truth, so "ssr" now means one of the structural server-document cases (phone
 * `pageMount`, server-owned redirect, public funnel) — a routeId absent from the map (unknown
 * route, missing embed) still answers false → SsrHandoff, the fail-closed posture.
 */
export function isSpaEnabled(bootMap: SpaBoot | null, routeId: string | null): boolean {
  return routeId != null && bootMap?.surfaces[routeId] === "spa";
}
