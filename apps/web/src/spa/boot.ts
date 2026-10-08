// SPA.4 (REQ-BND-10, REQ-FW-7; spec §3.2) — the `data-spa-boot` reader + the document-level boot
// singleton. The wire contract lives in `../spa-boot.ts` (shared with the server producer); the
// payload is a runtime SEED, never an authorization grant — the api remains the auth oracle through
// the refetchable `["session"]` query (spec §3.2).

import type { PrincipalDto } from "@rhema/api-client";
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
 * The effective renderer verdict for a routeId — `surfaces[routeId] === "spa"`. A routeId absent
 * from the map (unknown route, missing embed) answers false → SsrHandoff; the flag set can only be
 * shrunk client-side, never grown (REQ-SEQ-2 fail-closed posture).
 */
export function isSpaEnabled(bootMap: SpaBoot | null, routeId: string | null): boolean {
  return routeId != null && bootMap?.surfaces[routeId] === "spa";
}
