// SPA.2 — the strangler flag consult `deps.spa(c, surface)` (spec §4 fixed handler order;
// REQ-SEQ-1/4, REQ-BND-11; design/29 §flag-mechanism pseudocode applied verbatim).
//
// Call order on every authenticated document GET (the handler owns the first three steps — the
// consult is only reached AFTER them, and re-checks the session inside so no override can
// bypass the gate):
//
//   1. session gate (!session → 302 /login)                 — route handler, existing
//   2. server-owned redirects/precedence (/app, /p/:slug)   — route handler, existing (REQ-BND-11)
//   3. forced-SSR capability checks (phone/showcase, REQ-ED-12) — route handler, existing
//   4. THIS CONSULT:                                        — deps.spa(c, surface)
//        a. `?ssr=1` or `x-rhema-renderer: ssr`  ⇒ false    (ALL stages — the escape hatch)
//        b. `?renderer=spa` or `x-rhema-renderer: spa` ⇒ true (SPA_OVERRIDES=1 stages only —
//           a non-prod force-render for dev legs; ignored entirely on prod)
//        c. flag membership: surfaces.has(surface) AND, for an IDE-framed key
//           (SPA_IDE_FRAMED_SURFACES), surfaces.has("ide-chrome") too — the composite AND-gate
//           (REQ-SEQ-2). Routes whose framing is finer than key-level (the two IDE-framed
//           `/p/:p/import*` legs under the `onboarding` key) compose it at the call site:
//           `deps.spa(c, "onboarding") && deps.spa(c, "ide-chrome")`.
//
// `ssr` wins when both signals arrive — the force-SSR form is the incident/debug escape hatch.
// No route consults the flag yet (the shell document is SPA.3) — this lands deployable-dark.

import type { Context } from "hono";
import {
  SPA_IDE_FRAMED_SURFACES,
  SPA_RENDERER_HEADER,
  type SpaSurface,
} from "@rhema/contracts";
import type { SessionHeaders } from "./data.js";

/** The flag consult signature — `deps.spa(c, surface)` in every auth'd document handler. */
export type SpaConsult = (c: Context, surface: SpaSurface) => boolean;

export interface SpaFlagDeps {
  /**
   * The stage's flagged surface set (env `SPA_SURFACES` → `parseSpaSurfaces`; unset ⇒ ∅ —
   * fail-closed, every document stays SSR).
   */
  readonly surfaces?: ReadonlySet<SpaSurface>;
  /**
   * Whether the force-SPA override forms are honored (env `SPA_OVERRIDES=1`, set iff the stage
   * kind is non-prod). The force-SSR forms (`?ssr=1`, `x-rhema-renderer: ssr`) are honored on
   * every stage regardless.
   */
  readonly overrides?: boolean;
  /** The app's session resolver — the consult's own session gate (overrides never bypass it). */
  session(c: Context): SessionHeaders | null;
}

const IDE_FRAMED: ReadonlySet<SpaSurface> = new Set(SPA_IDE_FRAMED_SURFACES);

/** Build `deps.spa` from the deploy facts. Order inside is normative — do not reorder. */
export function createSpaConsult(deps: SpaFlagDeps): SpaConsult {
  const surfaces = deps.surfaces ?? new Set<SpaSurface>();
  const overrides = deps.overrides === true;
  return (c, surface) => {
    // Session gate FIRST — inside the consult too, so a force-spa override on a signed-out
    // request can never reach the shell (REQ-SEQ-4's "never bypass" clause made structural).
    if (!deps.session(c)) return false;
    const rendererHeader = c.req.header(SPA_RENDERER_HEADER)?.trim().toLowerCase();
    if (c.req.query("ssr") === "1" || rendererHeader === "ssr") return false;
    if (overrides && (c.req.query("renderer") === "spa" || rendererHeader === "spa")) {
      return true;
    }
    return (
      surfaces.has(surface) && (!IDE_FRAMED.has(surface) || surfaces.has("ide-chrome"))
    );
  };
}
