// scripts/check-dom-contract.test.mjs — the DOM-contract gate's own tests (SPA.7; the ticket's
// "the lint itself is unit-tested against failing fixtures" leg). Fixture trees are written under
// a temp root; `checkDomContract` accepts root-relative overrides so the real repo is untouched.
//
// Covers the four gate directions:
//   1. journey/test selector literals ⊆ manifest (unmanifested selector → fail);
//   2. src/spa emits ⊆ manifest (an SPA file emitting an undeclared hook → fail);
//   3. manifest ⊆ emitted (a dead entry → fail);
//   4. manifest ⊆ asserted (an emitted-but-never-probed entry → fail);
//   plus the manifest's strict line-wise shape (an unparseable line → fail) and comment noise
//   (`?sort=` inside a comment is NOT a param reference).

import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDomContract, parseDomContractManifest, extractRefs } from "./check-dom-contract.mjs";

const MANIFEST_OK = `// fixture manifest
import type { SpaSurface } from "@rhema/contracts";
export const DOM_CONTRACT = {
  shell: [
    a("data-renderer", "required", "render.tsx"),
  ],
  dossier: [
    a("data-dossier", "conditional", "ui/dossier.tsx"),
  ],
};
`;

function fixture({ manifest = MANIFEST_OK, journeys = [], spa = [], emit = [], tests = [] } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "domc-"));
  const put = (rel, text) => {
    const p = join(dir, rel);
    mkdirSync(join(p, ".."), { recursive: true });
    writeFileSync(p, text);
  };
  put("manifest.ts", manifest);
  for (const [i, t] of journeys.entries()) put(`j/steps-${i}.ts`, t);
  for (const [i, t] of spa.entries()) put(`spa/file-${i}.ts`, t);
  for (const [i, t] of emit.entries()) put(`emit/file-${i}.ts`, t);
  for (const [i, t] of tests.entries()) put(`assert/a-${i}.test.ts`, t);
  return {
    dir,
    opts: {
      manifestPath: join(dir, "manifest.ts"),
      journeyDir: join(dir, "j"),
      spaDir: join(dir, "spa"),
      emitDirs: [join(dir, "emit")],
      assertDirs: [join(dir, "assert"), join(dir, "j")],
    },
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}

// The fixtures live OUTSIDE the repo, so checkDomContract's `resolve(root, …)` won't reach them —
// pass absolute paths (resolve() leaves absolute paths unchanged).

const EMIT = `export const x = <div data-renderer="ssr" data-dossier="1" />;`;

describe("check:dom-contract gate directions", () => {
  it("accepts a consistent manifest + emitted + asserted vocabulary", () => {
    const f = fixture({
      emit: [EMIT],
      tests: [
        `it("x", () => { expect(html).toContain('data-dossier'); expect(html).toContain('data-renderer'); });`,
      ],
      journeys: [`const s = "article, [data-dossier]";`],
    });
    const r = checkDomContract(f.opts);
    try {
      expect(r.violations).toEqual([]);
      expect(r.ok).toBe(true);
    } finally {
      f.cleanup();
    }
  });

  it("fails when a journey file cites an unmanifested selector", () => {
    const f = fixture({
      emit: [EMIT],
      tests: [
        `it("x", () => { expect(html).toContain('data-dossier'); expect(html).toContain('data-renderer'); });`,
      ],
      journeys: [`const s = "[data-bogus-hook]";`],
    });
    const r = checkDomContract(f.opts);
    try {
      expect(r.ok).toBe(false);
      expect(
        r.violations.some((v) => v.includes('"data-bogus-hook"') && v.includes("journeys")),
      ).toBe(true);
    } finally {
      f.cleanup();
    }
  });

  it("fails when src/spa emits an unmanifested hook", () => {
    const f = fixture({
      emit: [EMIT],
      tests: [
        `it("x", () => { expect(html).toContain('data-dossier'); expect(html).toContain('data-renderer'); });`,
      ],
      spa: [`export const el = <main data-new-hook="1" />;`],
    });
    const r = checkDomContract(f.opts);
    try {
      expect(r.ok).toBe(false);
      expect(r.violations.some((v) => v.includes('"data-new-hook"') && v.includes("spa"))).toBe(
        true,
      );
    } finally {
      f.cleanup();
    }
  });

  it("fails when a manifest entry has no emission coverage", () => {
    const f = fixture({
      emit: [`export const x = <div data-renderer="ssr" />;`],
      tests: [
        `it("x", () => { expect(html).toContain('data-dossier'); expect(html).toContain('data-renderer'); });`,
      ],
    });
    const r = checkDomContract(f.opts);
    try {
      expect(r.ok).toBe(false);
      expect(
        r.violations.some((v) => v.includes("data-dossier") && v.includes("not emitted")),
      ).toBe(true);
    } finally {
      f.cleanup();
    }
  });

  it("fails when an emitted manifest entry is never asserted", () => {
    const f = fixture({ emit: [EMIT] });
    const r = checkDomContract(f.opts);
    try {
      expect(r.ok).toBe(false);
      expect(r.violations.some((v) => v.includes("no assertion coverage"))).toBe(true);
    } finally {
      f.cleanup();
    }
  });
});

describe("manifest parsing + extraction edges", () => {
  it("rejects an unparseable line inside the record", () => {
    const { violations } = parseDomContractManifest(
      `export const DOM_CONTRACT = {\n  shell: [\n    a("data-x", "required", "y"),\n    somethingElse entirely,\n  ],\n};\n`,
    );
    expect(violations.some((v) => v.includes("unparseable manifest line"))).toBe(true);
  });

  it("parses every builder kind + both quoted and bare surface keys", () => {
    const { entries, violations } = parseDomContractManifest(
      `export const DOM_CONTRACT = {
  "project-home": [
    a("data-x", "required", "y"),
    f("data-p-", "conditional", "y"),
    r("dialog", "y"),
    n("title", "required", "y"),
    nf("ed.", "conditional", "y"),
    u("saved", "conditional", "y"),
    uf("toggle.", "conditional", "y"),
  ],
};`,
    );
    expect(violations).toEqual([]);
    expect(entries.map((e) => e.kind)).toEqual([
      "attr",
      "attr-prefix",
      "role",
      "field",
      "field-prefix",
      "urlparam",
      "urlparam-prefix",
    ]);
    expect(entries[0].surface).toBe("project-home");
  });

  it("ignores selector/param tokens inside comments", () => {
    const refs = extractRefs(
      `// ?sort=title is a comment, and [data-commented] too
       const a = "x"; /* param: &bogus=1 attr: [data-nope] */
       const s = "[data-real]";`,
      { params: true },
    );
    expect(refs.attr.has("data-real")).toBe(true);
    expect(refs.attr.has("data-commented")).toBe(false);
    expect(refs.attr.has("data-nope")).toBe(false);
    expect(refs.urlparam.has("sort")).toBe(false);
    expect(refs.urlparam.has("bogus")).toBe(false);
  });

  it("resolves dataset.<camel> writes and name={`tpl`} prefixes", () => {
    const emitted = new Set();
    for (const m of `el.dataset.feedRun = "x"; const n = <input name={\`ed.spine.\${i}\`} />;`.matchAll(
      /\bdataset\.([a-zA-Z0-9_]+)|\bname=\{?\s*[`'"]([a-zA-Z0-9_.]+)/g,
    )) {
      emitted.add(
        m[1] ? `data-${m[1].replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase()}` : m[2],
      );
    }
    expect(emitted.has("data-feed-run")).toBe(true);
    expect(emitted.has("ed.spine.")).toBe(true);
  });
});
