#!/usr/bin/env node
/**
 * CI `public-safe` env-leak gate (SPA.8 / REQ-SAFE-8, design/28 F7; spec §9 "Secrets tripwire").
 *
 * Runtime config reaches the browser as server-rendered bootstrap JSON in the nonced shell — never
 * as build-time env inlining — so a client bundle that carries a server env-var NAME is a leak
 * tripwire even before the value is considered. Three legs:
 *
 *   1. SOURCE leg — `apps/web/src/spa` + `apps/web/src/client` must not read `import.meta.env`
 *      (outside the single `env.ts` reader) or `process.env`, and nothing client-adjacent may
 *      name a `VITE_*` variable that looks like a secret (`VITE_API_KEY`, `VITE_AUTH_TOKEN`, …).
 *   2. BUILD-CONFIG leg — `apps/web/vite.config.ts`/`build-client.mjs` must not `define`-inject a
 *      secret-patterned `process.env.*` (a build-time plumbing leak into the bundle).
 *   3. EMITTED leg — every emitted client artifact (`apps/web/public`, `packages/api-client/dist`)
 *      is scanned for (a) each known server env name (word-bounded) and (b) `process.env.<name>`
 *      references whose name isn't a generic platform/tooling variable.
 *
 * The banned-name set is partly DERIVED (server sources' `process.env.*` reads matching the
 * secret pattern self-maintain as new secrets land) and partly CURATED (the Rhema plumbing names
 * that are config rather than secret but still never belong in a browser bundle). A floor on the
 * derived count keeps the tripwire armed — a refactor that emptied it would silently disarm the
 * gate.
 *
 * Usage: `pnpm check:spa-env` · `node scripts/check-spa-env.mjs [--root <dir>]`
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Client source roots — the trees that emit browser bundles. */
const CLIENT_SOURCE_DIRS = ["apps/web/src/spa", "apps/web/src/client"];
/** Build-config files whose `define`/env injection could bake a server env into the bundle. */
const BUILD_CONFIG_FILES = ["apps/web/vite.config.ts", "apps/web/build-client.mjs"];
/** Emitted client artifacts to scan (the islands + the Vite SPA output + the client SDK dist). */
const EMITTED_DIRS = ["apps/web/public", "packages/api-client/dist"];
/** Emitted dirs that must exist — fail closed (the public-safe job builds them first). */
const REQUIRED_EMITTED = ["apps/web/public/spa"];
/** Server-side roots whose `process.env.*` reads feed the derived ban set. */
const SERVER_ENV_SOURCE_DIRS = ["apps", "packages", "infra"];
/** The one module permitted to read `import.meta.env` (REQ-SAFE-8). */
const ENV_READER = "apps/web/src/spa/env.ts";

/** `VITE_*` names matching this pattern are secret-shaped and forbidden in client-facing code. */
const SECRET_NAME_RE = /(KEY|SECRET|TOKEN|PASSWORD|PASSWD|PRIVATE|CREDENTIAL|DSN|SIGNING|WEBHOOK)/i;
/** Derived server env names are banned only when sensitive-shaped or curated — generic platform
 *  names (CI, DEBUG, FORCE_COLOR…) show up legitimately inside bundled third-party deps. */
const SENSITIVE_DERIVED_RE = /(SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE|_KEY\b|\bKEY_|DATABASE_URL|_DSN|WEBHOOK|SIGNING|API_KEY)/i;

/** First-party Rhema plumbing names that must never appear in a browser bundle (curated — the
 *  derived set covers the sensitive class automatically; these are the config/posture names). */
const CURATED_SERVER_ENV = [
  "DATABASE_URL",
  "SYSTEM_DATABASE_URL",
  "JOURNEY_DATABASE_URL",
  "API_BASE_URL",
  "API_PUBLIC_URL",
  "APP_BASE_URL",
  "APP_URL",
  "EGRESS_PROXY_URL",
  "FETCHER_SERVICE_URL",
  "EXPORT_SERVICE_URL",
  "CONVERT_SERVICE_URL",
  "CONVERT_JOB",
  "CONVERT_JOB_ROOT",
  "COLLAB_WS_URL",
  "USER_CONTENT_BUCKET",
  "SKILLS_DIR",
  "IDENTITY_HEADERS",
  "INTERNAL_AUTH_AUDIENCE",
  "INTERNAL_CALLER_SA",
  "RHEMA_OPERATOR_ID",
  "RUN_TOKEN_KEY_ID",
  "ANTHROPIC_ADMIN_KEY_SECRET",
  "SIGNUP_MODE",
  "PURCHASE_MODE",
  "REFUND_WINDOW_MODE",
  "DEBIT_MODE",
  "MAX_USD_PER_RUN",
  "COGS_LEVERS",
  "BETA_PLAN_OFFER_URL",
  "STRIPE_PAYMENT_LINK_URL",
  "STRIPE_API_BASE_URL",
  "STRIPE_AUTOMATIC_TAX",
  "SPA_SURFACES",
  "SPA_OVERRIDES",
  "RHEMA_BUILD_GIT_SHA",
  "TEST_MAILBOX",
  "SSE_IDLE_TIMEOUT_MS",
  "AGENT_UID",
  "AGENT_GID",
  "GOOGLE_CLOUD_PROJECT",
];

/** `import.meta.env.*` names a bundled module may legitimately read (Vite built-ins + VITE_* publics). */
const META_ENV_ALLOWLIST = new Set(["MODE", "DEV", "PROD", "SSR", "BASE_URL"]);

/** Generic platform/tooling env names — allowed anywhere (deps legitimately read them). */
const GENERIC_ENV_ALLOWLIST = new Set([
  "NODE_ENV", "NODE_OPTIONS", "NODE_PATH", "CI", "PORT", "HOST", "HOSTNAME",
  "PATH", "HOME", "PWD", "OLDPWD", "USER", "SHELL", "TERM", "LANG", "TZ",
  "TMPDIR", "TMP", "TEMP", "DEBUG", "LOG", "FORCE_COLOR", "NO_COLOR",
  "COLORTERM", "TERM_PROGRAM", "GITLEAKS_CONFIG", "GITHUB_TOKEN", "GITHUB_SHA",
]);

const SRC_EXT = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const EMITTED_EXT = new Set([".js", ".mjs", ".cjs", ".html", ".json", ".map", ".css", ".txt"]);
const EXCLUDE_DIRS = new Set(["node_modules", "dist", ".turbo", "vendor", "upstream-pin"]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function* walkExcluding(dir, excludeDirs = EXCLUDE_DIRS) {
  for (const entry of readdirSync(dir)) {
    if (excludeDirs.has(entry)) continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walkExcluding(p, excludeDirs);
    else yield p;
  }
}

const extOf = (f) => f.slice(f.lastIndexOf("."));
const relOf = (rootDir, f) => (f.startsWith(rootDir) ? f.slice(rootDir.length + 1) : f).split("\\").join("/");

/** All `process.env.<NAME>` reads in `text`. */
export function envReadsIn(text) {
  const out = [];
  const re = /process\.env\.([A-Z][A-Z0-9_]*)/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

/** `VITE_*` secret-shaped names in `text`. */
export function viteSecretsIn(text) {
  const out = [];
  const re = /\bVITE_([A-Z0-9_]+)/g;
  let m;
  while ((m = re.exec(text))) {
    if (SECRET_NAME_RE.test(m[1])) out.push(`VITE_${m[1]}`);
  }
  return out;
}

/** `import.meta.env.<NAME>` reads in `text`. */
export function metaEnvReadsIn(text) {
  const out = [];
  const re = /import\.meta\.env\.([A-Z][A-Z0-9_]*)/g;
  let m;
  while ((m = re.exec(text))) out.push(m[1]);
  return out;
}

/**
 * The banned-name set: derived server env reads (sensitive-shaped) ∪ the curated plumbing list.
 * @returns {{ banned: Set<string>, derivedCount: number, floorOk: boolean }}
 */
export function collectBannedEnvNames(rootDir = root, { floor = 10 } = {}) {
  const derived = new Set();
  for (const top of SERVER_ENV_SOURCE_DIRS) {
    const abs = resolve(rootDir, top);
    if (!existsSync(abs)) continue;
    for (const file of walkExcluding(abs)) {
      if (!SRC_EXT.has(extOf(file))) continue;
      const rel = relOf(rootDir, file);
      if (/\.(test|d)\.(ts|tsx)$/.test(rel)) continue;
      if (rel.startsWith("apps/web/src/spa/") || rel.startsWith("apps/web/src/client/")) continue;
      for (const name of envReadsIn(readFileSync(file, "utf8"))) {
        if (name.length >= 3 && SENSITIVE_DERIVED_RE.test(name) && !GENERIC_ENV_ALLOWLIST.has(name)) {
          derived.add(name);
        }
      }
    }
  }
  const banned = new Set([...derived, ...CURATED_SERVER_ENV]);
  return { banned, derivedCount: derived.size, floorOk: derived.size >= floor };
}

/** The full gate — returns { ok, violations, stats } for tests; the CLI prints + exits. */
export function checkSpaEnv(rootDir = root, { floor = 10 } = {}) {
  const violations = [];
  const stats = { clientFiles: 0, emittedFiles: 0, envFiles: 0, derivedNames: 0, bannedNames: 0 };

  const { banned, derivedCount, floorOk } = collectBannedEnvNames(rootDir, { floor });
  stats.derivedNames = derivedCount;
  stats.bannedNames = banned.size;
  if (!floorOk)
    violations.push(
      `derived server-env set too small (${derivedCount} < ${floor}) — the leak tripwire would be unarmed`,
    );

  // Leg 1 — client sources: no import.meta.env outside env.ts, no process.env, no VITE_* secrets.
  for (const dir of CLIENT_SOURCE_DIRS) {
    const abs = resolve(rootDir, dir);
    if (!existsSync(abs)) {
      violations.push(`client source dir missing: ${dir}`);
      continue;
    }
    for (const file of walkExcluding(abs)) {
      if (!SRC_EXT.has(extOf(file))) continue;
      const rel = relOf(rootDir, file);
      stats.clientFiles++;
      const text = readFileSync(file, "utf8");
      if (rel !== ENV_READER && /\bimport\.meta\.env\b/.test(text))
        violations.push(`${rel}: import.meta.env read outside the single ${ENV_READER} reader (REQ-SAFE-8)`);
      for (const name of envReadsIn(text))
        violations.push(`${rel}: process.env.${name} — client code never reads server env (config rides the boot JSON)`);
      for (const name of viteSecretsIn(text))
        violations.push(`${rel}: secret-shaped ${name} — VITE_* secrets are forbidden by construction`);
    }
  }

  // Leg 2 — build config: no secret-patterned process.env.* (a define-injection vector).
  for (const rel of BUILD_CONFIG_FILES) {
    const abs = resolve(rootDir, rel);
    if (!existsSync(abs)) continue;
    for (const name of envReadsIn(readFileSync(abs, "utf8"))) {
      if (SECRET_NAME_RE.test(name) || banned.has(name))
        violations.push(`${rel}: process.env.${name} in the client build config — a build-time env injection is a bundle leak`);
    }
  }

  // Committed .env* files (root + apps/web) — VITE_* secret-shaped names fail here too.
  for (const dir of [".", "apps/web"]) {
    const abs = resolve(rootDir, dir);
    if (!existsSync(abs)) continue;
    for (const entry of readdirSync(abs)) {
      if (!entry.startsWith(".env")) continue;
      const p = join(abs, entry);
      if (!statSync(p).isFile()) continue;
      stats.envFiles++;
      for (const name of viteSecretsIn(readFileSync(p, "utf8")))
        violations.push(`${relOf(rootDir, p)}: secret-shaped ${name} in an env file`);
    }
  }

  // Leg 3 — emitted artifacts. Three tripwires (bare-word matching is deliberately NOT one:
  // shared modules legitimately document env names in comments/export identifiers —
  // `export const SPA_SURFACES` travels in `sourcesContent` and is not a leak):
  //   a) `process.env.<name>` reads whose name isn't a generic platform/tooling var;
  //   b) `import.meta.env.<name>` reads that aren't Vite built-ins or non-secret `VITE_*` publics;
  //   c) a banned name as a QUOTED STRING — the env-lookup plumbing shape (`env["DATABASE_URL"]`,
  //      `getenv('STRIPE_…')`, `define` leftovers) — an identifier or comment never matches this.
  //      Quote class is [\"'] only: backticks are markdown formatting in doc comments
  //      (`` `SPA_SURFACES` `` documents the contract — not a leak).
  const quotedRes = [...banned].map((n) => ({ name: n, re: new RegExp(`["']${n}["']`) }));
  for (const dir of EMITTED_DIRS) {
    const abs = resolve(rootDir, dir);
    if (!existsSync(abs)) {
      if (REQUIRED_EMITTED.includes(dir))
        violations.push(`emitted dir missing: ${dir} (build the client output first — fail-closed)`);
      continue;
    }
    for (const file of walk(abs)) {
      if (!EMITTED_EXT.has(extOf(file))) continue;
      stats.emittedFiles++;
      const rel = relOf(rootDir, file);
      let text = readFileSync(file, "utf8");
      if (file.endsWith(".map")) {
        // Scan source contents, not map metadata: `names[]` quotes every bundled identifier
        // (`"SPA_SURFACES"` in `names` is a legit imported constant, not an env-lookup string).
        try {
          const map = JSON.parse(text);
          text = Array.isArray(map.sourcesContent)
            ? map.sourcesContent.filter((c) => typeof c === "string").join("\n")
            : "";
        } catch {
          /* malformed map — fall back to full-text scan */
        }
      }
      for (const name of envReadsIn(text)) {
        if (!GENERIC_ENV_ALLOWLIST.has(name))
          violations.push(`${rel}: process.env.${name} read inside a client artifact`);
      }
      for (const name of metaEnvReadsIn(text)) {
        if (!META_ENV_ALLOWLIST.has(name) && !name.startsWith("VITE_"))
          violations.push(`${rel}: import.meta.env.${name} inside a client artifact (non-VITE names are server env)`);
        else if (SECRET_NAME_RE.test(name.replace(/^VITE_/, "")))
          violations.push(`${rel}: secret-shaped import.meta.env.${name} inside a client artifact`);
      }
      for (const { name, re } of quotedRes) {
        if (re.test(text)) violations.push(`${rel}: server env name "${name}" as a string in a client artifact`);
      }
      for (const name of viteSecretsIn(text))
        violations.push(`${rel}: secret-shaped ${name} inside a client artifact`);
    }
  }
  // REQUIRED_EMITTED fail-closed check (a nested required dir under an emitted dir must exist).
  for (const req of REQUIRED_EMITTED) {
    if (!existsSync(resolve(rootDir, req)))
      violations.push(`required emitted dir missing: ${req} (fail-closed — the public-safe job builds it before this gate)`);
  }

  return { ok: violations.length === 0, violations, stats };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { ok, violations, stats } = checkSpaEnv(root);
  if (!ok) {
    console.error(`SPA env-leak gate FAILED — ${violations.length} violation(s):`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(
    `SPA env-leak gate OK — ${stats.clientFiles} client source file(s), ${stats.emittedFiles} emitted artifact(s), ${stats.envFiles} env file(s); ${stats.bannedNames} banned server-env names (${stats.derivedNames} derived).`,
  );
}
