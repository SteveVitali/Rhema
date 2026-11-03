"use strict";

/**
 * pnpm hook that implements private-package resolution BY PATH for `@rhema/evals` (REQ-ARCH-37, §13.2).
 *
 * When `RHEMA_EVALS_PATH` points at a valid private checkout, every dependency on `@rhema/evals` is
 * rewritten to a `link:` against that path, so the private eval code overrides the in-repo `evals-stub`
 * without a git submodule. When it is unset (a public clone, or the `public-safe` CI job), this hook is
 * a no-op and `evals-stub` (`@rhema/evals`) satisfies the graph.
 *
 * NOTE (2026-09-01, amended 2026-11-03): `@rhema/protocols` is a COMMITTED workspace member
 * (`packages/protocols`) that ships PUBLIC with the repository (operator ruling 2026-11-02,
 * R6OSS.1) — the former export-time swap to `packages/protocols-stub` is retired and the stub is a
 * dormant fallback. This hook deliberately does NOT rewrite `@rhema/protocols`.
 * Read automatically by pnpm on every install.
 */

const fs = require("node:fs");
const path = require("node:path");

function linkTargetFor(envVar) {
  const p = process.env[envVar];
  if (!p) return null;
  const abs = path.resolve(p);
  if (!fs.existsSync(path.join(abs, "package.json"))) return null;
  return `link:${abs}`;
}

const overrides = {};
const evalsLink = linkTargetFor("RHEMA_EVALS_PATH");
if (evalsLink) overrides["@rhema/evals"] = evalsLink;

function rewrite(deps) {
  if (!deps) return;
  for (const name of Object.keys(overrides)) {
    if (name in deps) deps[name] = overrides[name];
  }
}

function readPackage(pkg) {
  if (Object.keys(overrides).length === 0) return pkg;
  rewrite(pkg.dependencies);
  rewrite(pkg.devDependencies);
  return pkg;
}

module.exports = { hooks: { readPackage } };
