// SPA.4 (REQ-BND-10; spec §3.2) — the `data-spa-boot` embed's wire contract, shared by the shell's
// producer (`spa-shell.ts` `SpaBootPayload`) and the client's decoder (`spa/boot.ts`
// `readSpaBoot`). One shape, both sides — the embed is a runtime seed, never an authorization
// grant. Browser-safe by construction: type-only imports only, no DOM, no node builtins — this file
// compiles under BOTH tsconfig.json (the server graph) and tsconfig.spa.json (the Vite graph).

import type { PrincipalDto } from "@rhema/api-client";
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
   * The per-route renderer map (REQ-BFF-19): every known document routeId → "spa" | "ssr" — the
   * effective flag set resolved THROUGH the same server consult, so the client's SsrHandoff can
   * never disagree with the server.
   */
  readonly surfaces: Record<string, "spa" | "ssr">;
  readonly project?: { readonly slug: string };
}
