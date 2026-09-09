// @rhema/hooks — the tool layer of the three concentric boundary layers (§12.6).
//
// One `PreToolUse` hook, the same code for every seat and engine (REQ-ARCH-17); policy is per-run DATA.
// It resolves paths (realpath, no symlink/`..` escapes, Bash argv included), classifies them against the
// seat's readable/writable globs, denies out-of-namespace reads and read-only writes, denies recursive
// operations over the root, enforces the run's URL policy (hold-outs, exclusions, calibrator allow-after-
// prediction), rejects `Agent` in judge-class phases, and audits every decision (append-only, 90 days).
// P0.06 wires this into the SDK; P0.07 duplicates the URL policy at the proxy (defense in depth).

export const PACKAGE_NAME = "@rhema/hooks" as const;

export * from "./types.js";
export * from "./seat-tables.js";
export * from "./paths.js";
export * from "./url-policy.js";
export * from "./denials.js";
export * from "./audit.js";
export * from "./subagents.js";
export * from "./hook.js";
export { defaultRealpath, lexicalRealpath } from "./realpath.js";
export type { RealpathResolver } from "./realpath.js";
