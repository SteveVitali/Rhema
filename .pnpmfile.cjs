"use strict";

/**
 * pnpm hook that implements private-package resolution BY PATH (REQ-ARCH-37 amended, spec §13.2).
 *
 * When `RHEMA_PROTOCOLS_PATH` / `RHEMA_EVALS_PATH` point at a valid private checkout, every
 * dependency on `@rhema/protocols` / `@rhema/evals` is rewritten to a `link:` against that path, so
 * the private code overrides the in-repo stub without git submodules and without a duplicate
 * workspace member. When the env vars are unset (a public clone, or the `public-safe` CI job), this
 * hook is a no-op and the stubs — `packages/protocols-stub` (@rhema/protocols) and `evals-stub`
 * (@rhema/evals) — satisfy the graph. Read automatically by pnpm on every install.
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
const protocolsLink = linkTargetFor("RHEMA_PROTOCOLS_PATH");
const evalsLink = linkTargetFor("RHEMA_EVALS_PATH");
if (protocolsLink) overrides["@rhema/protocols"] = protocolsLink;
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
