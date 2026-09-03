// Seat mount filtering (§12.6 mount layer; REQ-DATA-10, REQ-ARCH-16). The mirror materializes ONLY the
// seat's allowlist — "the project root IS the allowlist" — so the Editor↔Drafter wall and the persona
// hold-out are structural, not conventional: an artifact path appears in the Editor's tree only if some
// Editor mount glob matches it, so `agents/author/**`, `preferences.md`, and voice-print/lexicon/exemplars
// are absent by construction, never by a filter that could regress. The authoritative seat table is
// `SEAT_MOUNTS` in @rhema/hooks (P0.05) — this module reuses it verbatim; it is NOT re-derived here.

import type { AgentTypeKey } from "@rhema/contracts";
import { SEAT_MOUNTS, type MountRoot, type MountSpec } from "@rhema/hooks";

/** A seat's mount specs, split by the root the path is relative to. */
export function seatMounts(seat: AgentTypeKey): readonly MountSpec[] {
  return SEAT_MOUNTS[seat] ?? [];
}

/**
 * Match a mirror path (relative to its root) against a §12.6 mount glob. Only two glob forms exist (types.ts):
 * an exact path, or a `prefix/**` subtree — mirroring @rhema/hooks so a path is mounted here iff the same glob
 * would authorize a read there.
 */
export function matchesMountGlob(path: string, glob: string): boolean {
  const p = normalizePath(path);
  if (glob.endsWith("/**")) {
    const prefix = glob.slice(0, -3);
    return p === prefix || p.startsWith(`${prefix}/`);
  }
  return p === normalizePath(glob);
}

/** The mount spec (if any) under `root` whose glob matches `path` — the FIRST match, its `mode` the file's mode. */
export function mountFor(seat: AgentTypeKey, root: MountRoot, path: string): MountSpec | null {
  for (const spec of seatMounts(seat)) {
    if (spec.root === root && matchesMountGlob(path, spec.glob)) return spec;
  }
  return null;
}

/** True when the seat mounts this path (under `root`) at all — the "was it mounted for this seat" predicate. */
export function isMounted(seat: AgentTypeKey, root: MountRoot, path: string): boolean {
  return mountFor(seat, root, path) !== null;
}

/** True when the seat may WRITE this path (a `readwrite` mount matches) — the write-back allowlist (§12.2). */
export function isWritable(seat: AgentTypeKey, root: MountRoot, path: string): boolean {
  return mountFor(seat, root, path)?.mode === "readwrite";
}

/** Strip a leading `./` and any leading slashes so mount matching is anchored at the root. */
export function normalizePath(path: string): string {
  return path.replace(/^\.\//, "").replace(/^\/+/, "");
}
