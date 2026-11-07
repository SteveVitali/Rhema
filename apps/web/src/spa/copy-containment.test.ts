import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { collectCopyStrings } from "../copy.js";

// SPA.8 / REQ-SAFE-10 copy containment (design/28; spec §9). Every user-facing string the SPA
// renders resolves to a shared `COPY` leaf or a server-built label map — ad-hoc inline JSX copy
// is unapproved surface. Two legs:
//
//   1. inline-JSX scan — a `.tsx` source may not contain a JSX text node with letters (`>text<`),
//      nor a string literal for a user-facing attribute (`aria-label`, `placeholder`, `title`,
//      `alt`, `label`). Copy arrives as `{COPY.…}` expressions only. Test files are exempt
//      (assertions legitimately hold strings); `routeTree.gen.ts` is generated, not copy.
//   2. leaf resolution — every `COPY.<dotted.path>` referenced from SPA sources resolves to a
//      real leaf of the shared copy table (the audit seam `collectCopyStrings` — spec §9).
//
// Server label maps (e.g. `FeedLabelMaps` built by the BFF) arrive typed via props/context —
// they are not literals here, so this leg can't see them; their keys are COPY-sourced at the
// server boundary instead.

const SPA_DIR = dirname(fileURLToPath(import.meta.url));

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const spaTsx = [...walk(SPA_DIR)].filter(
  (f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx") && !f.endsWith(".dom.test.tsx"),
);

function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");
}

/**
 * JSX-text candidates: `>` … `<` with letters, no braces — real JSXText is `{`-free (expressions
 * are `{}`-wrapped children and never match). Matches containing code tokens (`;`, `=>`, `==`,
 * `&&`, `||`) are comparisons/generics inside expressions, not copy.
 */
const JSX_TEXT_RE = />[^<>{}]+</g;
const CODE_TOKENS_RE = /;|=>|==|&&|\|\||\bconst\b|\blet\b|\breturn\b/;

/** User-facing attributes whose values must be expressions (`{COPY…}` / label maps), never literals. */
const USER_ATTR_RE = /\b(aria-label|placeholder|title|alt|label)\s*=\s*(["'][^"']*["'])/g;

describe("SPA copy containment — no ad-hoc user-facing strings (REQ-SAFE-10)", () => {
  it("the sweep covers the real SPA surface", () => {
    expect(spaTsx.length).toBeGreaterThanOrEqual(3); // states.tsx + head.tsx + routes/__root.tsx …
    expect(spaTsx.some((f) => f.endsWith("states.tsx"))).toBe(true);
  });

  it.each(spaTsx.map((f) => [f.slice(SPA_DIR.length + 1)] as const))(
    "%s has no inline JSX text or literal user-facing attributes",
    (rel) => {
      const src = stripComments(readFileSync(join(SPA_DIR, rel), "utf8"));
      const hits: string[] = [];
      for (const m of src.matchAll(JSX_TEXT_RE)) {
        const text = m[0].slice(1, -1);
        if (!/[A-Za-z]/.test(text)) continue;
        if (CODE_TOKENS_RE.test(text)) continue;
        hits.push(`JSX text: ${text.trim().slice(0, 60)}`);
      }
      for (const m of src.matchAll(USER_ATTR_RE)) {
        hits.push(`literal ${m[1]}=${m[2]}`);
      }
      expect(hits, `${rel}: inline copy must resolve to COPY leaves or server label maps`).toEqual([]);
    },
  );

  it("a fixture violation is caught — the detector is armed", () => {
    const src = stripComments('export const X = () => <p>Join the beta today</p><button aria-label="Close it" />;');
    const hits: string[] = [];
    for (const m of src.matchAll(JSX_TEXT_RE)) {
      const text = m[0].slice(1, -1);
      if (!/[A-Za-z]/.test(text)) continue;
      if (CODE_TOKENS_RE.test(text)) continue;
      hits.push(`JSX text: ${text.trim()}`);
    }
    for (const m of src.matchAll(USER_ATTR_RE)) hits.push(`literal ${m[1]}`);
    expect(hits.length).toBeGreaterThanOrEqual(2);
  });

  it("every COPY.* reference in SPA sources resolves to a real leaf", () => {
    const leaves = new Map(collectCopyStrings());
    const copyRefRe = /\bCOPY((?:\.[A-Za-z_$][\w$]*)+)/g;
    const missing: string[] = [];
    for (const file of walk(SPA_DIR)) {
      if (!/\.tsx?$/.test(file) || file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
      const src = stripComments(readFileSync(file, "utf8"));
      for (const m of src.matchAll(copyRefRe)) {
        const path = m[1].slice(1);
        // A contiguous String-method chain (`COPY.x.fmt.replace("{n}", …)`) reads as one more
        // path segment to the regex; strip a single trailing segment and re-check so the leaf
        // itself — `editor.forkToastFmt` — is what's verified. A genuinely missing leaf still
        // fails: `COPY.x.nonexistent.replace` strips to `x.nonexistent`, also absent.
        if (!leaves.has(path) && !leaves.has(path.split(".").slice(0, -1).join("."))) {
          missing.push(`${file.slice(SPA_DIR.length + 1)}: COPY.${path}`);
        }
      }
    }
    expect(missing).toEqual([]);
    expect(leaves.size).toBeGreaterThan(100); // the shared table is the real thing, not a stub
  });
});
