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
//
// SPA.27 (the SSR deletion wave) — leg (c)'s flag membership is now the COMPLETE auth'd document
// surface set: every flipped surface's SSR document is deleted and its handler serves the shell
// unconditionally, so the consult's membership check resolves true for any surface key (REQ-SEQ-2's
// AND-gate is vacuous — the whole framed set is on). The consult's only remaining consumer is the
// catch-all, where legs (a)/(b) still decide whether an SPA-prefixed deep link (or a `?ssr=1`
// request) lands the shell or the SSR 404. The machinery — session gate, renderer overrides,
// the `surfaces`/`overrides` deploy plumbing — stays exactly as spec §4 ordered it; SPA.28 owns
// its removal.

import type { Context } from "hono";
import {
  SPA_RENDERER_HEADER,
  type SpaSurface,
} from "@rhema/contracts";
import type { SessionHeaders } from "./data.js";

/** The flag consult signature — `deps.spa(c, surface)` in every auth'd document handler. */
export type SpaConsult = (c: Context, surface: SpaSurface) => boolean;

export interface SpaFlagDeps {
  /**
   * The stage's flagged surface set (env `SPA_SURFACES` → `parseSpaSurfaces`). SPA.27: unread by
   * the consult — the flag-on set IS the whole auth'd document set now (the deploy fact stays
   * plumbed for the roll-forward record; SPA.28 removes the machinery).
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

/**
 * SPA.27 — the force-SSR override signals (`?ssr=1`, `x-rhema-renderer: ssr`), factored out of
 * the consult so the Page family's forced-SSR arm can honor the SAME signals against its
 * surviving server render: the flipped surfaces deleted their SSR documents, but the Page
 * render is the one SSR arm that stays forever (phone/showcase — REQ-ED-12), so it is also the
 * one place the escape hatch still has a real SSR document to land on. The consult runs this
 * same check as its leg (a); SPA.28 retires both.
 */
export function ssrOverrideRequested(c: Context): boolean {
  const rendererHeader = c.req.header(SPA_RENDERER_HEADER)?.trim().toLowerCase();
  return c.req.query("ssr") === "1" || rendererHeader === "ssr";
}

/** Build `deps.spa` from the deploy facts. Order inside is normative — do not reorder. */
export function createSpaConsult(deps: SpaFlagDeps): SpaConsult {
  const overrides = deps.overrides === true;
  return (c, _surface) => {
    // Session gate FIRST — inside the consult too, so a force-spa override on a signed-out
    // request can never reach the shell (REQ-SEQ-4's "never bypass" clause made structural).
    if (!deps.session(c)) return false;
    if (ssrOverrideRequested(c)) return false;
    if (overrides && (c.req.query("renderer") === "spa" || c.req.header(SPA_RENDERER_HEADER)?.trim().toLowerCase() === "spa")) {
      return true;
    }
    // SPA.27 — leg (c) is unconditional: the flag-on set IS every auth'd document surface (the SSR
    // documents are deleted), and REQ-SEQ-2's IDE-framed AND-gate is vacuously satisfied. The
    // `surface` key stays on the signature — SPA.28 retires the consult itself.
    return true;
  };
}
