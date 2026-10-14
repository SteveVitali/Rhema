#!/usr/bin/env node
/**
 * `check:dom-contract` — the emitted-DOM contract gate (SPA.7; REQ-VFY-2, REQ-TST-2;
 * design/27 F2; research/04 F4).
 *
 * The committed selector manifest is `apps/web/src/dom-contract.ts` — keyed by surface, one
 * `kind("hook","role","emittedBy","note")` call per line inside the `DOM_CONTRACT` record (the
 * file's FORMAT NOTE pins that parseable shape). This gate is a pure source scan — no build, no
 * browser — and enforces four directions:
 *
 *   1. JOURNEYS ⊆ MANIFEST — every `data-*` attribute, `role=`/`getByRole` name, `name=` field,
 *      and (in the page-driving files) `?param=` URL token referenced by `packages/journeys/src`
 *      resolves to a manifest entry (literal or prefix family). A journey step citing an
 *      unmanifested selector fails the gate.
 *   2. SPA ⊆ MANIFEST — every `data-*`/`role`/`name` hook emitted in `apps/web/src/spa` (non-test)
 *      resolves to a manifest entry: the new renderer may not invent undeclared hooks. (The legacy
 *      SSR markup is deliberately NOT census'd — the manifest is the load-bearing contract, not an
 *      attribute inventory; surface tickets' parity tests extend it.)
 *   3. MANIFEST ⊆ EMITTED — every manifest entry is emitted by ≥1 scanned non-test emitter source
 *      (SSR markup emitters + island clients + the SPA + the shared component/token packages).
 *      `dataset.<camel>` writes count as `data-<kebab>` emissions. Roles may be implicit
 *      (`<button>` ⇒ role button). A dead entry fails the gate.
 *   4. MANIFEST ⊆ ASSERTED — every entry is referenced by ≥1 journey source or `*.test.*` file —
 *      "asserted by ≥1 emission test or journey step" (the ticket's coverage leg).
 *
 * Usage: `pnpm check:dom-contract` · `node scripts/check-dom-contract.mjs [--manifest <file>]`
 * Exports `parseDomContractManifest`, `scanDomContract` for `scripts/check-dom-contract.test.mjs`.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_MANIFEST = "apps/web/src/dom-contract.ts";

/** Sources whose selector usage must resolve to the manifest. */
const JOURNEY_DIR = "packages/journeys/src";
/** Page-URL param extraction is limited to the document-driving journey files — apiFetch/mailbox
 *  params (Gmail API, BFF query grammar) are not the emitted-DOM contract. */
const JOURNEY_PARAM_FILES = new Set(["steps.ts", "stb5a.ts", "registry.ts"]);
const SPA_DIR = "apps/web/src/spa";

/** Non-test sources whose data-attr, role, name, and param tokens prove an entry is emitted. */
const EMIT_DIRS = [
  "apps/web/src",
  "apps/api/src", // flash params the API emits (e.g. the emailed `export/download?token=` link)
  "packages/ui/src",
  "packages/tokens/src",
  "packages/editor/src",
  "packages/ide/src",
  "packages/findings-core/src",
  "packages/run-sheet/src",
  "packages/contracts/src",
];
/** Assertion sources: journey sources + every colocated test. */
const ASSERT_DIRS = ["apps/web/src", "packages", "integration", "scripts", "tools"];

const DATA_RE = /\bdata-[a-zA-Z0-9_-]+/g;
const DATASET_RE = /\bdataset\.([a-zA-Z0-9_]+)/g;
const ROLE_RE = /\brole=["']([a-z-]+)["']|\[role=([a-z-]+)\]|getByRole\(\s*["']([a-z-]+)["']/g;
const NAME_RE = /\bname(\^|\*|\$)?=["']?([a-zA-Z0-9_.*-]+)["']?/g;
const PARAM_RE = /[?&]([a-zA-Z_][a-zA-Z0-9_.]*)=/g;
const WAITURL_RE = /(?:waitForURL|toHaveURL)\s*\(\s*\/([^)]*)\//g;
const PARAM_NAME_RE = /([a-zA-Z_][a-zA-Z0-9_.]*)=/g;
const PARAM_SET_RE = /\.(?:set|append|get|has|delete)\(\s*["'`]([a-zA-Z_][a-zA-Z0-9_.]*)["'`]/g;

/** Implicit ARIA roles an element supplies without a `role=` literal (design keeps the role probes
 *  meaningful — a bare `<button>` IS the button role). */
const ROLE_IMPLICIT = {
  button: /<button[\s>]/,
  heading: /<h[1-6][\s>]/,
  link: /<a[\s>]/,
  navigation: /<nav[\s>]/,
  list: /<(?:ul|ol)[\s>]/,
  listitem: /<li[\s>]/,
  table: /<table[\s>]/,
  img: /<img[\s>]/,
};

const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  ".turbo",
  ".next",
  "coverage",
  ".git",
  "test-results",
  "playwright-report",
  "public",
]);
function* walk(dir) {
  if (!existsSync(dir)) return;
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e) || e.startsWith(".")) continue;
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

const camelToKebab = (s) => s.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/**
 * Strip // and /* *\/ comments (string-literal aware — `//` inside "…"/'…'/`…` survives) so a
 * selector or param mentioned in a comment ("`?sort=title`", "data-rights legs") is not counted
 * as a live contract reference/emission. String contents are kept.
 */
function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  let mode = null; // null | "line" | "block" | '"' | "'" | '`'
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    if (mode === "line") {
      if (c === "\n") {
        mode = null;
        out += c;
      }
      i++;
      continue;
    }
    if (mode === "block") {
      if (c === "*" && d === "/") {
        mode = null;
        i += 2;
      } else i++;
      continue;
    }
    if (mode) {
      if (c === "\\") {
        out += c + (src[i + 1] ?? "");
        i += 2;
        continue;
      }
      if (c === mode) mode = null;
      out += c;
      i++;
      continue;
    }
    if (c === "/" && d === "/") {
      mode = "line";
      i += 2;
      continue;
    }
    if (c === "/" && d === "*") {
      mode = "block";
      i += 2;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") mode = c;
    out += c;
    i++;
  }
  return out;
}

/**
 * Parse the manifest SOURCE positionally (the file's FORMAT NOTE pins one `kind("hook",…)` call
 * per entry; `// prettier-ignore` keeps it single-line, but a reformatted multi-line call parses
 * identically). Inside the `export const DOM_CONTRACT` record the only legal constructs are a
 * `key: [` surface header, a builder call, a `],`, and comments — anything left over is an
 * "unparseable manifest line" violation, which is what makes a regex parse trustworthy.
 * Returns { entries: [{surface, kind, hook, role, emittedBy, line}], violations: [] }.
 */
export function parseDomContractManifest(text) {
  const BUILDER_KIND = {
    a: "attr",
    f: "attr-prefix",
    r: "role",
    n: "field",
    nf: "field-prefix",
    u: "urlparam",
    uf: "urlparam-prefix",
  };
  const entries = [];
  const violations = [];
  const start = text.search(/^export const DOM_CONTRACT\b/m);
  if (start < 0)
    return { entries, violations: ["manifest record `export const DOM_CONTRACT` not found"] };
  // The record's text runs to its closing `};` at column 0.
  const body = text.slice(start);
  const endIdx = body.search(/^\};/m);
  const record = stripComments(endIdx < 0 ? body : body.slice(0, endIdx));
  const lineAt = (pos) => (text.slice(0, start + pos).match(/\n/g)?.length ?? 0) + 1;
  const HEADER = /\s*(?:"([^"]+)"|([a-zA-Z-]+)):\s*\[/y;
  const CALL =
    /\s*(a|f|r|n|nf|uf|u)\(\s*"((?:[^"\\]|\\.)*)"(?:\s*,\s*"(required|conditional)")?\s*,\s*"((?:[^"\\]|\\.)*)"(?:\s*,\s*"((?:[^"\\]|\\.)*)")?\s*,?\s*\)\s*,?/y;
  const CLOSE = /\s*\],?/y;
  const WS = /\s+/y;
  let pos = record.indexOf("{") + 1;
  let surface = null;
  while (pos < record.length) {
    WS.lastIndex = pos;
    const ws = WS.exec(record);
    if (ws) {
      pos += ws[0].length;
      continue;
    }
    HEADER.lastIndex = pos;
    const h = HEADER.exec(record);
    if (h) {
      surface = h[1] ?? h[2];
      pos += h[0].length;
      continue;
    }
    CALL.lastIndex = pos;
    const c = CALL.exec(record);
    if (c) {
      if (!surface)
        violations.push(`entry ${c[2]} (line ${lineAt(pos)}) appears outside a surface block`);
      else
        entries.push({
          surface,
          kind: BUILDER_KIND[c[1]],
          hook: c[2],
          role: c[3] ?? "conditional",
          emittedBy: c[4],
          note: c[5],
          line: lineAt(pos),
        });
      pos += c[0].length;
      continue;
    }
    CLOSE.lastIndex = pos;
    const cl = CLOSE.exec(record);
    if (cl) {
      surface = null;
      pos += cl[0].length;
      continue;
    }
    // Anything else inside the record is unparseable — report the offending line and stop.
    const frag = record
      .slice(pos, pos + 60)
      .split("\n")[0]
      .trim();
    violations.push(`unparseable manifest line ${lineAt(pos)}: ${frag}`);
    break;
  }
  return { entries, violations };
}

/** Does a consumer token resolve to a manifest entry? Mirrors dom-contract.ts domContractMatch. */
function resolves(entries, kind, token) {
  for (const e of entries) {
    if (
      e.kind !== kind &&
      !(kind === "attr" && e.kind === "attr-prefix") &&
      !(kind === "field" && e.kind === "field-prefix") &&
      !(kind === "urlparam" && e.kind === "urlparam-prefix")
    )
      continue;
    if (e.hook === token) return true;
    if (e.kind.endsWith("prefix") && token.startsWith(e.hook)) return true;
  }
  // A consumer token ending in "-" (a comment-truncated or glob-style ref like `data-estimate-`)
  // resolves if any manifest literal/family extends it.
  if (token.endsWith("-") || token.endsWith(".")) {
    for (const e of entries) {
      if (e.kind === kind || e.kind === `${kind}-prefix`) {
        if (e.hook.startsWith(token)) return true;
      }
    }
  }
  return false;
}

/** Extract consumer references from one source text: attrs, roles, fields, params (opt-in). */
export function extractRefs(rawText, { params = false } = {}) {
  const text = stripComments(rawText);
  const refs = { attr: new Set(), role: new Set(), field: new Set(), urlparam: new Set() };
  for (const m of text.matchAll(DATA_RE)) refs.attr.add(m[0]);
  for (const m of text.matchAll(DATASET_RE)) refs.attr.add(`data-${camelToKebab(m[1])}`);
  for (const m of text.matchAll(ROLE_RE)) refs.role.add(m[1] ?? m[2] ?? m[3]);
  for (const m of text.matchAll(NAME_RE)) refs.field.add(m[2]);
  if (params) {
    for (const m of text.matchAll(PARAM_RE)) refs.urlparam.add(m[1]);
    for (const m of text.matchAll(WAITURL_RE))
      for (const mm of m[1].matchAll(PARAM_NAME_RE)) refs.urlparam.add(mm[1]);
  }
  return refs;
}

/** The union of emitted tokens across the emit scan set (per kind). */
export function extractEmitted(rawText) {
  const text = stripComments(rawText);
  const out = extractRefs(text, { params: true });
  // Emitted/READ param names — the flash-param contract is written by redirects AND read by
  // handlers, so count `?x=`/`&x=`/`}x=` (ternary separators), `name=value` runs, URLSearchParams
  // calls, `c.req.query("x")`, form-decoder helpers `str("x")`, and `query["x"]`/`[`x${…}`]`.
  for (const m of text.matchAll(PARAM_SET_RE)) out.urlparam.add(m[1]);
  for (const m of text.matchAll(/[?&}"']([a-zA-Z_][a-zA-Z0-9_.]*)=/g)) out.urlparam.add(m[1]);
  for (const m of text.matchAll(/\.query\(\s*["'`]([\w.]+)/g)) out.urlparam.add(m[1]);
  for (const m of text.matchAll(/\bquery\.([a-zA-Z_]\w*)/g)) out.urlparam.add(m[1]);
  for (const m of text.matchAll(/\b(?:str|param|field)\(\s*["'`]([\w.]+)/g)) out.urlparam.add(m[1]);
  for (const m of text.matchAll(/\[\s*[`'"]([\w.]+)/g)) out.urlparam.add(m[1]);
  // Emitted field names via name="x", name='x', name={`x…`} (template prefixes like `ed.spine.`).
  for (const m of text.matchAll(/\bname=\{?\s*[`'"]([a-zA-Z0-9_.]+)/g)) out.field.add(m[1]);
  return out;
}

function emittedCovers(emitted, entry) {
  const { kind, hook } = entry;
  if (kind === "role") {
    if (emitted.role.has(hook)) return true;
    const re = ROLE_IMPLICIT[hook];
    return re ? emitted.implicitRole?.has(hook) === true : false;
  }
  const set =
    emitted[
      kind === "attr"
        ? "attr"
        : kind === "attr-prefix"
          ? "attr"
          : kind === "field"
            ? "field"
            : kind === "field-prefix"
              ? "field"
              : "urlparam"
    ];
  if (kind === "attr-prefix" || kind === "field-prefix" || kind === "urlparam-prefix")
    return [...set].some((t) => t.startsWith(hook) || hook.startsWith(t));
  return set.has(hook);
}

/**
 * Run the gate. `opts` overrides root-relative scan sets for fixture tests.
 * Returns { ok, violations, report }.
 */
export function checkDomContract(opts = {}) {
  const manifestPath = resolve(root, opts.manifestPath ?? DEFAULT_MANIFEST);
  const violations = [];
  const report = [];
  if (!existsSync(manifestPath)) {
    return { ok: false, violations: [`manifest not found: ${manifestPath}`], report };
  }
  const { entries, violations: parseViolations } = parseDomContractManifest(
    readFileSync(manifestPath, "utf8"),
  );
  violations.push(...parseViolations);
  if (entries.length === 0) violations.push("manifest parsed to zero entries — fail-closed");

  const journeyDir = resolve(root, opts.journeyDir ?? JOURNEY_DIR);
  const spaDir = resolve(root, opts.spaDir ?? SPA_DIR);
  const emitDirs = (opts.emitDirs ?? EMIT_DIRS).map((d) => resolve(root, d));
  const assertDirs = (opts.assertDirs ?? ASSERT_DIRS).map((d) => resolve(root, d));

  const emitted = {
    attr: new Set(),
    role: new Set(),
    field: new Set(),
    urlparam: new Set(),
    implicitRole: new Set(),
  };
  for (const dir of emitDirs) {
    for (const f of walk(dir)) {
      if (!/\.(ts|tsx)$/.test(f) || /\.test\.(ts|tsx)$/.test(f)) continue;
      if (resolve(f) === manifestPath) continue; // the manifest must not certify its own entries
      const text = readFileSync(f, "utf8");
      const e = extractEmitted(text);
      for (const k of ["attr", "role", "field", "urlparam"])
        for (const t of e[k]) emitted[k].add(t);
      for (const [role, re] of Object.entries(ROLE_IMPLICIT))
        if (re.test(text)) emitted.implicitRole.add(role);
    }
  }

  const asserted = { attr: new Set(), role: new Set(), field: new Set(), urlparam: new Set() };
  const assertFile = (f) =>
    /\.(test\.(ts|tsx|mjs))$/.test(f) || f.includes(`${join("", "journeys", "src")}`);
  for (const dir of assertDirs) {
    for (const f of walk(dir)) {
      if (!assertFile(f)) continue;
      const text = readFileSync(f, "utf8");
      const e = extractRefs(text, { params: true });
      for (const k of ["attr", "role", "field", "urlparam"])
        for (const t of e[k]) asserted[k].add(t);
    }
  }

  // Direction 1+2 — consumer scans.
  const consumerScan = (dir, { paramsFor, label }) => {
    for (const f of walk(dir)) {
      if (!/\.(ts|tsx)$/.test(f) || /\.test\.(ts|tsx)$/.test(f)) continue;
      const params = paramsFor ? paramsFor(f) : false;
      const refs = extractRefs(readFileSync(f, "utf8"), { params });
      const rel = f.slice(root.length + 1);
      for (const kind of ["attr", "role", "field", "urlparam"]) {
        for (const tok of refs[kind]) {
          if (!resolves(entries, kind, tok))
            violations.push(`${label}: ${rel} references unmanifested ${kind} "${tok}"`);
        }
      }
    }
  };
  consumerScan(journeyDir, {
    label: "journeys",
    paramsFor: (f) => JOURNEY_PARAM_FILES.has(f.split("/").pop()),
  });
  consumerScan(spaDir, { label: "spa", paramsFor: () => true });

  // Directions 3+4 — manifest coverage.
  const perSurface = new Map();
  for (const e of entries) {
    if (!perSurface.has(e.surface))
      perSurface.set(e.surface, { total: 0, emitted: 0, asserted: 0 });
    const row = perSurface.get(e.surface);
    row.total += 1;
    if (emittedCovers(emitted, e)) row.emitted += 1;
    else
      violations.push(
        `manifest: ${e.hook} (${e.surface}, ${e.kind}, line ${e.line}) is not emitted by any scanned source`,
      );
    const set =
      asserted[
        e.kind === "attr-prefix"
          ? "attr"
          : e.kind === "field-prefix"
            ? "field"
            : e.kind === "urlparam-prefix"
              ? "urlparam"
              : e.kind
      ];
    const hit =
      set.has(e.hook) ||
      (e.kind.endsWith("prefix") && [...set].some((t) => t.startsWith(e.hook))) ||
      (e.kind === "role" && asserted.role.has(e.hook));
    if (hit) row.asserted += 1;
    else
      violations.push(
        `manifest: ${e.hook} (${e.surface}) has no assertion coverage (no journey step or test references it)`,
      );
  }
  for (const [surface, row] of [...perSurface.entries()].sort()) {
    report.push(
      `  ${surface}: ${row.total} hooks — ${row.emitted} emitted, ${row.asserted} asserted`,
    );
  }
  report.unshift(
    `  ${entries.length} manifest entr${entries.length === 1 ? "y" : "ies"} across ${perSurface.size} surfaces`,
  );
  return { ok: violations.length === 0, violations, report };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (flag, dflt) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const { ok, violations, report } = checkDomContract({
    manifestPath: opt("--manifest", DEFAULT_MANIFEST),
  });
  for (const line of report) console.log(line);
  if (!ok) {
    console.error(`check:dom-contract FAILED — ${violations.length} violation(s):`);
    for (const v of violations.slice(0, 60)) console.error(`  - ${v}`);
    if (violations.length > 60) console.error(`  … +${violations.length - 60} more`);
    process.exit(1);
  }
  console.log("check:dom-contract OK — journey selectors ⊆ manifest ⊆ emitted+asserted.");
}
