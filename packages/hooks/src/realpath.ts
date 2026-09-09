// @rhema/hooks — the production realpath resolver.
//
// Path classification (§12.6) must follow symlinks so a symlink pointing out of the sandbox is caught as
// an escape. The classifier takes the resolver as a parameter so its logic is pure and unit-testable
// against a virtual filesystem; this module is the one place that touches the real `node:fs`.

import { realpathSync } from "node:fs";
import { posix } from "node:path";

/**
 * Resolve `p` through symlinks. For a path that does not yet exist (a Write target), resolve the longest
 * existing ancestor and re-append the remainder — so a symlinked *parent* directory is still followed.
 */
export function defaultRealpath(p: string): string {
  let dir = p;
  const tail: string[] = [];
  // Walk up to the nearest existing ancestor, collecting the non-existent tail segments.
  for (;;) {
    try {
      const real = realpathSync(dir);
      return tail.length ? posix.join(real, ...tail.reverse()) : real;
    } catch {
      const parent = posix.dirname(dir);
      if (parent === dir) return p; // reached the root without resolving; hand back the input
      tail.push(posix.basename(dir));
      dir = parent;
    }
  }
}

/** A resolver that never follows symlinks — the identity. Handy default for pure/lexical-only callers. */
export function lexicalRealpath(p: string): string {
  return p;
}

/** The signature the classifier accepts for path resolution. */
export type RealpathResolver = (p: string) => string;
