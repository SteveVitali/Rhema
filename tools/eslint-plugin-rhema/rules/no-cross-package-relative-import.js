"use strict";

const path = require("node:path");

/**
 * Bazel-compatible invariant (spec §13.2): a package may not reach into another package with a
 * relative import. Cross-package code is consumed only through the `@rhema/*` package graph, so the
 * dependency edges stay explicit and the build graph is sound. A relative import that resolves
 * outside the importing file's package root is the violation this rule forbids.
 *
 * The package root is derived from the path layout, not the filesystem, so the rule is pure and
 * unit-testable: the workspace lays every package under a known container segment.
 */

// Workspace containers from pnpm-workspace.yaml. `infra`/`evals-stub` are single-package dirs
// (the package root IS that segment); the rest hold one package per child segment.
const MULTI_PACKAGE_CONTAINERS = new Set(["packages", "apps", "tools"]);
const SINGLE_PACKAGE_DIRS = new Set(["infra", "evals-stub"]);

/**
 * Given an absolute POSIX-ish file path, return the absolute package-root directory, or null when
 * the path is not inside a recognized workspace container.
 */
function packageRootOf(absFile) {
  const segments = absFile.split(path.sep).filter(Boolean);
  // Scan from the deepest container so nested tools/ inside a package resolve to the inner package.
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (MULTI_PACKAGE_CONTAINERS.has(seg) && i + 1 < segments.length) {
      return path.sep + segments.slice(0, i + 2).join(path.sep);
    }
    if (SINGLE_PACKAGE_DIRS.has(seg)) {
      return path.sep + segments.slice(0, i + 1).join(path.sep);
    }
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow relative imports that escape the importing file's package (use the @rhema/* graph instead)",
    },
    schema: [],
    messages: {
      crossPackage:
        "Relative import '{{source}}' escapes package '{{pkg}}'. Import across packages through the @rhema/* dependency graph, not a relative path.",
    },
  },
  create(context) {
    const filename = context.filename ?? context.getFilename();
    if (!filename || !path.isAbsolute(filename)) return {};
    const pkgRoot = packageRootOf(filename);
    if (!pkgRoot) return {};

    function check(node) {
      const source = node.source && node.source.value;
      if (typeof source !== "string") return;
      if (!source.startsWith(".")) return; // bare specifier (@rhema/*, node:*, deps) — fine
      const resolved = path.resolve(path.dirname(filename), source);
      const rel = path.relative(pkgRoot, resolved);
      if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
        context.report({
          node: node.source,
          messageId: "crossPackage",
          data: { source, pkg: path.basename(pkgRoot) },
        });
      }
    }

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};

module.exports.packageRootOf = packageRootOf;
