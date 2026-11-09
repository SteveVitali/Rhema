// REQ-KEYS-1/2 (239) — the literal guard: no chord glyph may be hand-typed into the authored
// label/hint surface. Every shortcut a user sees comes from the keymaps (`shortcutFor` /
// `pageShortcutFor` / the strip's `keys` field / `matchesChord`); a test that scans the authored
// COPY + the strip/menu/bubble emit sites is the recorded guard against a hand-typed "⌘S" or a
// stale "⌘⇧L" drifting back in. String literals in `copy.ts` are user-visible text — a chord
// glyph there is by definition not generated from the table.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..", "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");

describe("REQ-KEYS-1/2 — no hand-typed chord literal in the authored surface", () => {
  it("copy.ts carries NO chord glyph in any label (the {chord} template is the one seam)", () => {
    const src = read("apps/web/src/copy.ts");
    // template placeholders like `{chord}` are fine — the glyph ban is on literal characters.
    const literals = src
      .split("\n")
      .map((l, i) => ({ l: l.trim(), n: i + 1 }))
      .filter(({ l }) => !l.startsWith("//") && !l.startsWith("*") && !l.startsWith("/*"))
      .filter(({ l }) => /"[^"]*[⌘⇧⌥⌃][^"]*"|Ctrl\+|Alt\+|Cmd\+|Shift\+/.test(l))
      .filter(({ l }) => !l.includes("{chord}"));
    expect(literals.map(({ n, l }) => `${n}: ${l}`)).toEqual([]);
  });

  it("the strip + shell + bubble hint surfaces never embed a glyph outside the keymap lookup", () => {
    // every chord these files render must come through shortcutFor/pageShortcutFor/matchesChord.
    for (const f of [
      "apps/web/src/page-chrome.tsx",
      "apps/web/src/spa/app-shell.tsx",
      "packages/ui/src/page-strip.tsx",
      "packages/ui/src/ide-shell.tsx",
      "packages/ide/src/menus.ts",
    ]) {
      const src = read(f);
      const literalHints = src
        .split("\n")
        .map((l, i) => ({ l: l.trim(), n: i + 1 }))
        .filter(({ l }) => !l.startsWith("//") && !/^\s*\*/.test(l) && !l.startsWith("{/*"))
        .filter(({ l }) => /(keys|hint|title)\s*[:=]\s*"[^"]*[⌘⇧⌥⌃][^"]*"/.test(l));
      expect(literalHints.map(({ n }) => `${f}:${n}`), f).toEqual([]);
    }
  });

  it("the retired ⌘⇧*/⌘G/⌘,/⌘I chords appear nowhere outside the reserved table + its docs", () => {
    // these literals may live ONLY in keymap.test.ts, reserved-chords.json, the old→new table
    // comments, and docs — never in an authored key listener or emitted hint.
    const retired = /"mod\+shift\+(m|f|l|t|r|d|e|v|c)"|e\.key\.toLowerCase\(\)\s*[=!]==?\s*"s"/;
    for (const f of [
      "apps/web/src/spa/ide/controller.ts",
      "apps/web/src/client/ide.ts",
      "apps/web/src/client/page.ts",
      "apps/web/src/spa/page-mount.tsx",
      "apps/web/src/spa/app-shell.tsx",
    ]) {
      expect(retired.test(read(f)), f).toBe(false);
    }
    // and the ⌘S island listener must dispatch through the table (matchesChord/ISLAND_CHORDS),
    // not a hand-typed "s" literal.
    for (const f of ["apps/web/src/client/page.ts", "apps/web/src/spa/page-mount.tsx"]) {
      expect(read(f)).toContain("ISLAND_CHORDS");
    }
  });
});
