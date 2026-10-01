"use strict";

/**
 * SEC.1 (REQ-SPEC-30; ADR-017) — the system-pool boundary. The elevated seams (`systemExec`,
 * `systemTxRunner`, `systemPool`, `systemDatabaseUrl`, `SYSTEM_DATABASE_URL`) reach the BYPASSRLS
 * role; a user-facing module touching them silently escapes tenant isolation. Only the audited
 * paths pinned in tools/system-pool-boundary.json may reference these names — a new file touching
 * the seam must be added to that file in the same commit (a deliberate, reviewed act), and
 * packages/security-checks' allowlist pin test independently verifies the set.
 *
 * Detection is lexical: any Identifier whose name is a seam name, or any string literal containing
 * `SYSTEM_DATABASE_URL`. Test files (`*.test.ts`) are exempt — they construct fake seams.
 */

const fs = require("node:fs");
const path = require("node:path");

const SEAM_IDENTIFIERS = new Set([
  "systemExec",
  "systemTxRunner",
  "systemPool",
  "systemDatabaseUrl",
  "SYSTEM_DATABASE_URL", // the `process.env.SYSTEM_DATABASE_URL` member access is an Identifier
]);
const SEAM_ENV = /\bSYSTEM_DATABASE_URL\b/;
const BOUNDARY_FILENAME = path.join("tools", "system-pool-boundary.json");

/** Walk up from `startDir` to the repo root — the dir that holds tools/system-pool-boundary.json. */
function loadAllowlist(startDir) {
  let dir = startDir;
  for (let i = 0; i < 40; i++) {
    const candidate = path.join(dir, BOUNDARY_FILENAME);
    if (fs.existsSync(candidate)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"));
        return { root: dir, files: new Set(Object.keys(parsed.files ?? {})) };
      } catch {
        return { root: dir, files: new Set() };
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: "problem",
    docs: {
      description:
        "disallow system-pool bindings (systemExec/systemTxRunner/systemPool/systemDatabaseUrl/SYSTEM_DATABASE_URL) outside the audited allowlist in tools/system-pool-boundary.json",
    },
    schema: [],
    messages: {
      systemPool:
        "System-pool binding '{{name}}' used outside the audited allowlist (REQ-SPEC-30). Only files pinned in tools/system-pool-boundary.json may touch the elevated pool — add an entry with a reason in the same commit, or move the work behind the audited seams.",
      boundaryMissing:
        "tools/system-pool-boundary.json not found above {{file}} — the system-pool boundary cannot be enforced.",
    },
  },
  create(context) {
    const filename = context.physicalFilename ?? context.filename ?? "";
    if (!filename || filename === "<input>" || filename === "<text>") return {};
    if (/\.test\.[cm]?[jt]s$/.test(filename)) return {}; // tests build fake seams — exempt
    const allow = loadAllowlist(path.dirname(filename));
    if (!allow) {
      return {
        Program(node) {
          context.report({ node, messageId: "boundaryMissing", data: { file: filename } });
        },
      };
    }
    const rel = path.relative(allow.root, filename).split(path.sep).join("/");
    if (allow.files.has(rel)) return {}; // audited path

    return {
      Identifier(node) {
        if (SEAM_IDENTIFIERS.has(node.name)) {
          context.report({ node, messageId: "systemPool", data: { name: node.name } });
        }
      },
      Literal(node) {
        if (typeof node.value === "string" && SEAM_ENV.test(node.value)) {
          context.report({ node, messageId: "systemPool", data: { name: "SYSTEM_DATABASE_URL" } });
        }
      },
      TemplateElement(node) {
        const cooked = node.value && node.value.cooked;
        if (typeof cooked === "string" && SEAM_ENV.test(cooked)) {
          context.report({ node, messageId: "systemPool", data: { name: "SYSTEM_DATABASE_URL" } });
        }
      },
    };
  },
};
