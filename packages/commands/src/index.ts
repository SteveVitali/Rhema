// @rhema/commands — the one §7.2 command grammar, shared by the palette, the selection popover, the
// artifact/context menu, and (P1.11) the chat composer. Leaf package: @rhema/contracts only — safe in
// the browser bundle and on the server (REQ-ARCH-33: nothing protocol-adjacent ships to the client).

export * from "./types.js";
export { VERB_TABLE, verbSpec, canonicalVerb, correctVerb, editDistance, type VerbSpec } from "./verbs.js";
export { parseScopeToken, parseScopeRef, parseScopes, serializeScope, serializeScopes, scopeChip } from "./scopes.js";
export { deriveSections, scopedInputs } from "./sections.js";
export type { ScopedSection } from "./sections.js";
export { LEVER_SPECS, APPROVAL_DISPLAY, applyLever, isLeverKey } from "./levers.js";
export { parseCommand, completeVerb } from "./parse.js";
export { resolveCommand, sheetQueryForCommand, type ResolveContext } from "./resolve.js";
