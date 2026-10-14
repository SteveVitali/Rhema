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
