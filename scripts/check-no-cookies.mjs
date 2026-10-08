#!/usr/bin/env node
/**
 * CI `public-safe` never-cookies gate (AC-I-B; REQ-INGEST-5; spec §9.5). No ingestion connector
 * may accept a credential of any kind — no cookie, session token, auth header, API key, or
 * password field/header/form input anywhere on the ingestion surface: the provider package, the
 * api ingest routes, the worker ingest jobs, the web Samples-tab surfaces, the api-client DTOs,
 * the `connections` schema surface, and the OpenAPI document (when one is emitted). Paid/private
 * content only ever arrives via the export-zip path; `auth_ref` stays an unused 1.x pointer.
 *
 * The scan looks for credential-shaped CONSTRUCTS, not the bare words — the app's own viewer
 * session (deps.session / getSession, the platform login) and documentation of the rule itself
 * ("never-cookies", "no credential") are not violations:
 *
 *   - a credential-shaped FIELD:     `sessionToken:`, `api_key:`, `password:`, `bearer:` …
 *     (the value must be a literal/identifier/expression — a minified constant table like
 *     react-dom's `password:!0` input-type map is not a credential construct)
 *   - a credential HEADER literal:   `"cookie"`, `"set-cookie"`, `"authorization"`, `"x-api-key"` …
 *   - a credential FORM INPUT name:  `name="cookie"`, `name="session"`, `name="token"`, and the
 *     JSX brace forms `name={"token"}` / `name={`token`}` (SPA.8 / REQ-SAFE-3)
 *   - a credential-named JSX prop:   `password={"…"}`, `secret="…"` inside a tag or at a JSX
 *     continuation line's start (plain `const secret = …` assignments are not props)
 *   - a credential HEADER write:     `headers.set("cookie", …)`, `setHeader("authorization", …)`
 *
 * Exits non-zero on any hit. Missing files/dirs are skipped (e.g. an unbuilt client bundle).
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Ingestion-surface files + directories (relative to the repo root). Directories walk .ts/.tsx
 *  (including tests — connector fixtures must carry no Cookie header). */
const TARGETS = [
  "packages/ingest/src",
  "apps/api/src/ingest-routes.ts",
  "apps/api/src/ingest-routes.test.ts",
  "apps/worker/src/ingest-jobs.ts",
  "apps/worker/src/ingest-jobs.test.ts",
  // The Samples-tab / connections surfaces in the web app (sources pane, items pane, drawer).
  "apps/web/src/pages.tsx",
  "apps/web/src/copy.ts",
  "apps/web/src/data.ts",
  "apps/web/src/page-data.ts",
  "apps/web/src/server.ts",
  "apps/web/src/voice-surfaces.test.ts",
  // SPA.8 / REQ-SAFE-3 (design/28 F3) — the client source trees that render ingestion surfaces
  // (the landing dropzone lives in src/client; the SPA graph owns every surface post-flip) plus
  // the emitted client bundles themselves (islands + public/spa), and the shared-ui surfaces that
  // render ingestion/connections/samples UI as components migrate there. Directories walk
  // .ts/.tsx/.js — tests included (connector fixtures must carry no Cookie header).
  "apps/web/src/spa",
  "apps/web/src/client",
  "apps/web/public",
  "packages/ui/src",
  // The client bundle: ingestion DTOs + request builders (index.ts only — the package's tests
  // legitimately forward the VIEWER's own platform session cookie through the transport, which
  // is not a connector credential; connector fixtures live in packages/ingest and ARE scanned).
  "packages/api-client/src/index.ts",
  "packages/api-client/dist",
  // The connections schema surface (auth_ref stays an unused 1.x pointer — blessed by the ticket).
  "packages/db/src/schema/personas.ts",
  // The OpenAPI document, wherever a future ticket emits it.
  "docs/openapi.yaml",
  "docs/openapi.json",
  "apps/api/openapi.yaml",
  "apps/api/openapi.json",
  "packages/contracts/openapi.yaml",
  "packages/contracts/openapi.json",
];

const RULES = [
  {
    what: "credential-shaped header literal",
    re: /["'`](cookie|set-cookie|authorization|proxy-authorization|x-api-key|x-auth-token|x-session[-_]token|x-access[-_]token)["'`]/i,
  },
  {
    // REQ-SAFE-3 (SPA.8): brace-aware — JSX writes `name={"token"}` / `name={`token`}` (the repo's
    // idiom, e.g. `name={`ov_${d.kind}`}`), which the quote-only rule silently missed.
    what: "credential-shaped form-field name",
    re: /\bname\s*=\s*\{?\s*["'`](cookie|cookies|session|session_?token|token|auth|password|secret|api_?key|bearer)["'`]/i,
  },
  {
    // REQ-SAFE-3: a credential-named JSX PROP carrying a value (`<input password={"x"}>` /
    // `secret="…"` at a line-start continuation). The `<`-tag or line-start anchor keeps plain
    // assignments like `const secret = "…"` out of the finding set.
    what: "credential-named JSX prop",
    re: /(?:<[^>]*\b|^[\s{]*)(cookie|cookies|authorization|password|passwd|api_?key|apiKey|secret|bearer|access_?token|accessToken|refresh_?token|refreshToken|session_?token|sessionToken)\s*=\s*[{"'`]/i,
  },
  {
    // REQ-SAFE-3: the value lookahead — a credential FIELD must carry an actual value
    // (literal/identifier/expression), which keeps minified constant tables (react-dom's
    // `password:!0` input-type map in emitted bundles) from tripping the rule.
    what: "credential-shaped field/property",
    re: /\b(cookie|cookies|session_?token|sessionToken|auth_?token|authToken|access_?token|accessToken|refresh_?token|refreshToken|api_?key|apiKey|password|passwd|bearer)\s*:\s*(?=["'`{[\w$])/i,
  },
  {
    what: "credential header write",
    re: /\b(set|append|setHeader)\s*\(\s*["'`](cookie|set-cookie|authorization|proxy-authorization|x-api-key)["'`]/i,
  },
];

/** Lines documenting the invariant (or the app's own non-connector session) are not violations. */
const ALLOW = /never[- ]cookies|no credential|credential-shaped|cookieless|AC-I-B/i;

const SRC_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs", ".json", ".yaml", ".yml", ".html"]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function* targets() {
  for (const rel of TARGETS) {
    const abs = resolve(root, rel);
    if (!existsSync(abs)) continue;
    if (statSync(abs).isDirectory()) yield* walk(abs);
    else yield abs;
  }
}

/** Scan one file's text; returns the credential-construct violations on it (exported for tests). */
export function scanText(text) {
  const hits = [];
  text.split("\n").forEach((line, i) => {
    if (ALLOW.test(line)) return;
    for (const rule of RULES) {
      if (rule.re.test(line)) {
        hits.push({ line: i + 1, what: rule.what, text: line.trim().slice(0, 140) });
        break;
      }
    }
  });
  return hits;
}

function main() {
  const violations = [];
  let scanned = 0;
  for (const file of targets()) {
    const ext = file.slice(file.lastIndexOf("."));
    if (!SRC_EXT.has(ext)) continue;
    scanned++;
    for (const hit of scanText(readFileSync(file, "utf8"))) {
      violations.push({ file, ...hit });
    }
  }

  if (violations.length > 0) {
    console.error(`Never-cookies gate FAILED (AC-I-B) — ${violations.length} credential-shaped construct(s):`);
    for (const v of violations) console.error(`  - ${v.file}:${v.line} [${v.what}] ${v.text}`);
    process.exit(1);
  }
  console.log(`Never-cookies gate OK (AC-I-B) — ${scanned} ingestion-surface file(s) scanned, no credential field/header/input.`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
