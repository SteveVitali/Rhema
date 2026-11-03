// SPA.4 (REQ-BND-10; spec §3.2) — the `data-spa-boot` embed's wire contract, shared by the shell's
// producer (`spa-shell.ts` `SpaBootPayload`) and the client's decoder (`spa/boot.ts`
// `readSpaBoot`). One shape, both sides — the embed is a runtime seed, never an authorization
// grant. Browser-safe by construction: type-only imports only, no DOM, no node builtins — this file
// compiles under BOTH tsconfig.json (the server graph) and tsconfig.spa.json (the Vite graph).

import type { PrincipalDto } from "@rhema/api-client";
import type { ReadOnlyProject } from "@rhema/contracts";
import type { AppTheme, PaperTheme } from "@rhema/ide";

/** REQ-BND-10 — the shell's runtime seed (the `<script type="application/json" data-spa-boot>`). */
export interface SpaBoot {
  /** The session principal's public fields — absent when the upstream read degraded. */
  readonly principal?: PrincipalDto;
  readonly theme: { readonly appTheme?: AppTheme; readonly paperTheme?: PaperTheme };
  /** The `data-device` vocabulary — mirrors `DeviceClass` in `./device.ts` (kept structural so the
   *  browser graph never type-loads the hono-facing device module). */
  readonly deviceClass: "phone" | "desktop";
  /**
   * The per-route renderer map (REQ-BFF-19): every known document routeId → "spa" | "ssr". SPA.28:
   * this is STATIC truth, not a flag set — the producer no longer consults anything per-request.
   * "ssr" survives only for the structural cases the client still hands to the server: phone
   * `pageMount` routes (REQ-ED-12's forced-SSR Page), server-owned `surfaces:null` routes, and
   * the public funnel — so the client's SsrHandoff can never disagree with the server.
   */
  readonly surfaces: Record<string, "spa" | "ssr">;
  readonly project?: { readonly slug: string };
  /**
   * R7RO.1 (REQ-DWEB-14) — the document-level read-only fact (S-3): the server stamps
   * `{reason:"showcase"}` on a showcase row's shell; the `demo` slot is 220's payload. Row-facts
   * the request-scoped boot cannot see (a `run_lock`) still arrive on the Page-family twin —
   * `readOnlyProjectFor` merges both carriers.
   */
  readonly readOnlyProject?: ReadOnlyProject;
}
