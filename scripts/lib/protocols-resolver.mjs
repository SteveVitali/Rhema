/**
 * Pure private-package resolution logic (REQ-ARCH-37 amended, spec §13.2).
 *
 * Amended 2026-11-03 (operator ruling 2026-11-02, R6OSS.1): `@rhema/protocols` is a committed
 * workspace member that ships PUBLIC — it is no longer path-resolved and its former stub
 * (`packages/protocols-stub`) is a dormant fallback. Only `@rhema/evals` still resolves BY PATH
 * to a separate private checkout when present, falling back to the in-repo `evals-stub`
 * (published as @rhema/evals) otherwise — never git submodules. A public clone therefore builds
 * against the evals stub by default, and the `public-safe` CI job builds exactly that way.
 *
 * This module is the side-effect-free decision function (unit-tested); the `.pnpmfile.cjs` hook and
 * the preinstall logger apply it against the real environment.
 */

/**
 * @param {object} args
 * @param {string | undefined} args.privatePath absolute path to the private checkout, if configured
 * @param {string} args.stubPath absolute path to the in-repo stub
 * @param {(p: string) => boolean} args.exists filesystem-presence probe (injected for testing)
 * @returns {{ source: "private" | "stub", path: string }}
 */
export function resolveProtocols({ privatePath, stubPath, exists }) {
  if (privatePath && exists(privatePath)) {
    return { source: "private", path: privatePath };
  }
  return { source: "stub", path: stubPath };
}
